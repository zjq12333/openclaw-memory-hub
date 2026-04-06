// SQLite 存储层
import { readFile, writeFile, access } from "fs/promises"
import { join, dirname } from "path"
import { homedir } from "os"
import { fileURLToPath } from "url"
import type { MemoryHubConfig } from "./config.js"

const __dirname = dirname(fileURLToPath(import.meta.url))

export interface Memory {
	id: string
	type: "task" | "decision" | "project" | "preference" | "fact" | "conversation" | "team"
	category?: string
	title?: string
	content: string
	summary?: string
	importance?: number
	createdAt: string
	updatedAt: string
	metadata?: Record<string, unknown>
	// 新增：向量相关字段
	embedding?: number[]
	embeddingModel?: string
	// 新增：生命周期相关字段
	accessCount?: number
	lastAccessed?: string
	tier?: "core" | "working" | "peripheral"
	decayScore?: number
}

export interface Task {
	id: string
	title: string
	description?: string
	status: "pending" | "in_progress" | "completed" | "cancelled"
	priority: number
	dueDate?: string
	createdAt: string
	startedAt?: string
	completedAt?: string
	parentTaskId?: string
	tags?: string[]
	metadata?: Record<string, unknown>
}

export interface Entity {
	id: string
	name: string
	type: "person" | "project" | "technology" | "concept" | "location" | "organization"
	aliases?: string[]
	description?: string
	mentionCount: number
}

export class MemoryStorage {
	private basePath: string
	private dbPath: string
	private SQL: any = null
	private db: any = null

	constructor(basePath: string) {
		this.basePath = basePath
		this.dbPath = join(basePath, "memory.db")
	}

	/**
	 * 初始化数据库连接
	 */
	async init(): Promise<void> {
		if (!this.SQL) {
			const initSqlJs = (await import("sql.js")).default
			this.SQL = await initSqlJs()
		}

		try {
			const buffer = await readFile(this.dbPath)
			this.db = new this.SQL.Database(buffer)
		} catch {
			this.db = new this.SQL.Database()
			await this.save()
		}
	}

	/**
	 * 保存数据库到文件
	 */
	async save(): Promise<void> {
		if (!this.db) return
		const data = this.db.export()
		const buffer = Buffer.from(data)
		await writeFile(this.dbPath, buffer)
	}

	/**
	 * 确保目录结构存在
	 */
	async ensureStructure(): Promise<void> {
		const { mkdir } = await import("fs/promises")
		const dirs = [
			this.basePath,
			join(this.basePath, "core"),
			join(this.basePath, "archive"),
			join(this.basePath, "archive", "decisions"),
			join(this.basePath, "archive", "projects"),
			join(this.basePath, "archive", "knowledge"),
			join(this.basePath, "archive", "conversations"),
		]

		for (const dir of dirs) {
			await mkdir(dir, { recursive: true })
		}

		// 初始化数据库
		await this.init()
		// 创建表结构（如果不存在）
		await this.createTables()
		await this.save()
	}

	/**
	 * 创建数据库表结构
	 */
	async createTables(): Promise<void> {
		if (!this.db) return

		// 记忆表
		this.db.run(`
			CREATE TABLE IF NOT EXISTS memories (
				id TEXT PRIMARY KEY,
				type TEXT NOT NULL,
				category TEXT,
				title TEXT,
				content TEXT NOT NULL,
				summary TEXT,
				importance REAL DEFAULT 0.5,
				created_at TEXT NOT NULL,
				updated_at TEXT NOT NULL,
				metadata TEXT,
				embedding TEXT,
				embedding_model TEXT,
				access_count INTEGER DEFAULT 0,
				last_accessed TEXT,
				tier TEXT CHECK(tier IN ('core', 'working', 'peripheral')) DEFAULT 'working',
				decay_score REAL DEFAULT 1.0,
				is_archived INTEGER DEFAULT 0
			)
		)`);

		// 任务表
		this.db.run(`
			CREATE TABLE IF NOT EXISTS tasks (
				id TEXT PRIMARY KEY,
				title TEXT NOT NULL,
				description TEXT,
				status TEXT NOT NULL CHECK(status IN ('pending', 'in_progress', 'completed', 'cancelled')),
				priority INTEGER DEFAULT 0,
				due_date TEXT,
				created_at TEXT NOT NULL,
				started_at TEXT,
				completed_at TEXT,
				parent_task_id TEXT,
				tags TEXT,
				metadata TEXT
			)
		)`);

		// 任务历史表
		this.db.run(`
			CREATE TABLE IF NOT EXISTS task_history (
				id INTEGER PRIMARY KEY AUTOINCREMENT,
				task_id TEXT NOT NULL,
				action TEXT NOT NULL,
				details TEXT,
				timestamp TEXT NOT NULL
			)
		)`);

		// 实体表
		this.db.run(`
			CREATE TABLE IF NOT EXISTS entities (
				id TEXT PRIMARY KEY,
				name TEXT NOT NULL,
				type TEXT NOT NULL,
				aliases TEXT,
				description TEXT,
				mention_count INTEGER DEFAULT 0
			)
		)`);

		// 记忆衰减表
		this.db.run(`
			CREATE TABLE IF NOT EXISTS memory_decay (
				memory_id TEXT PRIMARY KEY,
				initial_importance REAL NOT NULL,
				decay_rate REAL NOT NULL,
				current_importance REAL NOT NULL,
				last_reinforced TEXT NOT NULL
			)
		)`);

		// 用户偏好表
		this.db.run(`
			CREATE TABLE IF NOT EXISTS user_preferences (
				preference_type TEXT NOT NULL,
				preference_key TEXT NOT NULL,
				preference_value TEXT NOT NULL,
				confidence REAL NOT NULL,
				evidence_count INTEGER DEFAULT 1,
				last_updated TEXT NOT NULL,
				PRIMARY KEY (preference_type, preference_key)
			)
		)`);
	}

	// ============================================
	// 记忆操作
	// ============================================

	/**
	 * 存储记忆
	 */
	async storeMemory(memory: Memory): Promise<void> {
		await this.init()

		// 自动计算 tier
		let tier: Memory["tier"] = memory.tier || this.calculateTier(memory.importance || 0.5, memory.accessCount || 0)

		let embeddingJson: string | null = null
		if (memory.embedding) {
			embeddingJson = JSON.stringify(memory.embedding)
		}

		this.db.run(
			`INSERT OR REPLACE INTO memories 
       (id, type, category, title, content, summary, importance, created_at, updated_at, metadata, 
        embedding, embedding_model, access_count, last_accessed, tier, decay_score, is_archived)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 
               ?, ?, ?, ?, ?, ?, ?)`,
			[
				memory.id,
				memory.type,
				memory.category || null,
				memory.title || null,
				memory.content,
				memory.summary || null,
				memory.importance || 0.5,
				memory.createdAt,
				memory.updatedAt,
				memory.metadata ? JSON.stringify(memory.metadata) : null,
				embeddingJson,
				memory.embeddingModel || null,
				memory.accessCount || 0,
				memory.lastAccessed || new Date().toISOString(),
				tier,
				memory.decayScore || 1.0,
				0,
			]
		)

		// 记录衰减信息
		this.db.run(`
			INSERT OR REPLACE INTO memory_decay (memory_id, initial_importance, decay_rate, current_importance, last_reinforced)
			VALUES (?, ?, ?, ?, ?)
		`, [
			memory.id,
			memory.importance || 0.5,
			this.calculateDecayRate(tier),
			memory.importance || 0.5,
			new Date().toISOString()
		]);

		await this.save()
	}

	/**
	 * 根据重要性和访问次数自动计算层级
	 */
	private calculateTier(importance: number, accessCount: number): "core" | "working" | "peripheral" {
		if (importance > 0.8 && accessCount > 10) {
			return "core"
		} else if (importance > 0.5 || accessCount > 3) {
			return "working"
		} else {
			return "peripheral"
		}
	}

	/**
	 * 根据层级计算衰减率
	 */
	public calculateDecayRate(tier: "core" | "working" | "peripheral"): number {
		switch (tier) {
			case "core": return 0.005 // 半衰期 ~138 天
			case "working": return 0.023 // 半衰期 ~30 天
			case "peripheral": return 0.069 // 半衰期 ~10 天
			default: return 0.023
		}
	}

	/**
	 * 获取记忆
	 */
	async getMemory(id: string): Promise<Memory | null> {
		await this.init()
		const result = this.db.exec(
			"SELECT * FROM memories WHERE id = ?",
			[id]
		)
		if (result.length === 0 || result[0].values.length === 0) return null

		const row = result[0].values[0]
		const columns = result[0].columns
		return this.rowToMemory(row, columns)
	}

	/**
	 * 搜索记忆
	 */
	async searchMemories(
		query: string,
		options?: {
			type?: string
			category?: string
			limit?: number
			threshold?: number
			vectorSearch?: boolean
			generateEmbedding?: (text: string) => Promise<number[] | null>
		}
	): Promise<Memory[]> {
		await this.init()
		const limit = options?.limit || 10
		const threshold = options?.threshold || 0.3

		// 第一步：关键词粗筛
		let sql = `SELECT * FROM memories WHERE is_archived = 0`
		const params: any[] = []

		if (options?.type) {
			sql += ` AND type = ?`
			params.push(options.type)
		}

		if (options?.category) {
			sql += ` AND category = ?`
			params.push(options.category)
		}

		// 全文搜索找候选
		sql += ` AND (content LIKE ? OR title LIKE ? OR summary LIKE ?)`
		const searchPattern = `%${query}%`
		params.push(searchPattern, searchPattern, searchPattern)
		// 先拿多一点候选给向量排序
		sql += ` ORDER BY importance DESC, last_accessed DESC LIMIT 50`

		const result = this.db.exec(sql, params)
		if (result.length === 0) return []

		let candidates = result[0].values.map((row: any[]) =>
			this.rowToMemory(row, result[0].columns)
		)

		// 第二步：如果启用向量搜索，重新排序
		if (options?.vectorSearch && options?.generateEmbedding) {
			const queryEmbedding = await options.generateEmbedding(query)
			if (queryEmbedding) {
				const { cosineSimilarity } = await import("./embedding.js")
				// 计算相似度并重排序
				candidates = candidates
					.map((m: Memory) => ({
						...m,
						similarity: m.embedding ? cosineSimilarity(queryEmbedding, m.embedding) : 0
					}))
					.filter((m: {similarity: number}) => m.similarity >= threshold)
					.sort((a: {similarity: number}, b: {similarity: number}) => b.similarity - a.similarity)
					.slice(0, limit)
			} else {
				// 生成失败，回退到关键词排序
				candidates = candidates.slice(0, limit)
			}
		} else {
			// 不启用向量搜索，直接截断
			candidates = candidates.slice(0, limit)
		}

		return candidates
	}

	/**
	 * 列出所有记忆
	 */
	async listMemories(options?: { type?: string; category?: string }): Promise<Memory[]> {
		await this.init()
		let sql = "SELECT * FROM memories WHERE is_archived = 0"
		const params: any[] = []

		if (options?.type) {
			sql += " AND type = ?"
			params.push(options.type)
		}

		if (options?.category) {
			sql += " AND category = ?"
			params.push(options.category)
		}

		sql += " ORDER BY created_at DESC"

		const result = this.db.exec(sql, params)
		if (result.length === 0) return []

		return result[0].values.map((row: any[]) =>
			this.rowToMemory(row, result[0].columns)
		)
	}

	/**
	 * 删除记忆
	 */
	async deleteMemory(id: string): Promise<boolean> {
		await this.init()
		this.db.run("DELETE FROM memories WHERE id = ?", [id])
		await this.save()
		return true
	}

	/**
	 * 更新记忆访问统计（强化记忆，重置衰减）
	 */
	async touchMemory(id: string): Promise<void> {
		await this.init()
		const now = new Date().toISOString()
		
		this.db.run(
			`UPDATE memories 
       SET access_count = access_count + 1, 
           last_accessed = ?
       WHERE id = ?`,
			[now, id]
		)

		// 强化衰减：重新计算当前重要性，延长记忆生命
		this.db.run(
			`UPDATE memory_decay
			SET last_reinforced = ?,
			    current_importance = initial_importance
			WHERE memory_id = ?`,
			[now, id]
		);

		// 重新计算层级
		const mem = await this.getMemory(id)
		if (mem) {
			const newTier = this.calculateTier(mem.importance || 0.5, (mem.accessCount || 0) + 1)
			if (newTier !== mem.tier) {
				this.db.run(`UPDATE memories SET tier = ? WHERE id = ?`, [newTier, id])
				this.db.run(`UPDATE memory_decay SET decay_rate = ? WHERE memory_id = ?`, [this.calculateDecayRate(newTier), id])
			}
		}

		await this.save()
	}

	// ============================================
	// 任务操作
	// ============================================

	/**
	 * 存储任务
	 */
	async storeTask(task: Task): Promise<void> {
		await this.init()
		this.db.run(
			`INSERT OR REPLACE INTO tasks 
       (id, title, description, status, priority, due_date, created_at, started_at, completed_at, parent_task_id, tags, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			[
				task.id,
				task.title,
				task.description || null,
				task.status,
				task.priority,
				task.dueDate || null,
				task.createdAt,
				task.startedAt || null,
				task.completedAt || null,
				task.parentTaskId || null,
				task.tags ? JSON.stringify(task.tags) : null,
				task.metadata ? JSON.stringify(task.metadata) : null,
			]
		)
		await this.save()
	}

	/**
	 * 获取活跃任务
	 */
	async getActiveTasks(): Promise<Task[]> {
		await this.init()
		const result = this.db.exec(
			`SELECT * FROM tasks 
       WHERE status IN ('pending', 'in_progress')
       ORDER BY priority DESC, created_at ASC`
		)
		if (result.length === 0) return []

		return result[0].values.map((row: any[]) =>
			this.rowToTask(row, result[0].columns)
		)
	}

	/**
	 * 更新任务状态
	 */
	async updateTaskStatus(
		id: string,
		status: Task["status"]
	): Promise<void> {
		await this.init()
		const now = new Date().toISOString()

		let sql = "UPDATE tasks SET status = ?"
		const params: any[] = [status]

		if (status === "in_progress") {
			sql += ", started_at = ?"
			params.push(now)
		} else if (status === "completed" || status === "cancelled") {
			sql += ", completed_at = ?"
			params.push(now)
		}

		sql += " WHERE id = ?"
		params.push(id)

		this.db.run(sql, params)

		// 记录历史
		this.db.run(
			`INSERT INTO task_history (task_id, action, details, timestamp)
       VALUES (?, ?, ?, ?)`,
			[id, status, null, now]
		)

		await this.save()
	}

	// ============================================
	// 实体操作
	// ============================================

	/**
	 * 存储实体
	 */
	async storeEntity(entity: Entity): Promise<void> {
		await this.init()
		this.db.run(
			`INSERT OR REPLACE INTO entities (id, name, type, aliases, description, mention_count)
       VALUES (?, ?, ?, ?, ?, ?)`,
			[
				entity.id,
				entity.name,
				entity.type,
				entity.aliases ? JSON.stringify(entity.aliases) : null,
				entity.description || null,
				entity.mentionCount,
			]
		)
		await this.save()
	}

	/**
	 * 搜索实体
	 */
	async searchEntities(query: string, limit = 10): Promise<Entity[]> {
		await this.init()
		const result = this.db.exec(
			`SELECT * FROM entities 
       WHERE name LIKE ? OR description LIKE ?
       ORDER BY mention_count DESC
       LIMIT ?`,
			[`%${query}%`, `%${query}%`, limit]
		)
		if (result.length === 0) return []

		return result[0].values.map((row: any[]) =>
			this.rowToEntity(row, result[0].columns)
		)
	}

	// ============================================
	// 用户偏好
	// ============================================

	/**
	 * 获取用户偏好
	 */
	async getUserPreferences(): Promise<Record<string, Record<string, { value: string; confidence: number }>>> {
		await this.init()
		const result = this.db.exec("SELECT * FROM user_preferences ORDER BY confidence DESC")
		if (result.length === 0) return {}

		const prefs: Record<string, Record<string, { value: string; confidence: number }>> = {}

		for (const row of result[0].values) {
			const columns = result[0].columns
			const typeIdx = columns.indexOf("preference_type")
			const keyIdx = columns.indexOf("preference_key")
			const valueIdx = columns.indexOf("preference_value")
			const confIdx = columns.indexOf("confidence")

			const type = row[typeIdx] as string
			const key = row[keyIdx] as string
			const value = row[valueIdx] as string
			const confidence = row[confIdx] as number

			if (!prefs[type]) prefs[type] = {}
			prefs[type][key] = { value, confidence }
		}

		return prefs
	}

	/**
	 * 更新用户偏好
	 */
	async updateUserPreference(
		type: string,
		key: string,
		value: string,
		confidence = 0.5
	): Promise<void> {
		await this.init()
		this.db.run(
			`INSERT OR REPLACE INTO user_preferences 
       (preference_type, preference_key, preference_value, confidence, evidence_count, last_updated)
       VALUES (?, ?, ?, ?, 
         COALESCE((SELECT evidence_count FROM user_preferences WHERE preference_type = ? AND preference_key = ?), 0) + 1,
         datetime('now')
       )`,
			[type, key, value, confidence, type, key]
		)
		await this.save()
	}

	// ============================================
	// 统计与维护
	// ============================================

	/**
	 * 获取统计信息
	 */
	async getStats(): Promise<{
		totalMemories: number
		totalTasks: number
		totalEntities: number
		activeTasks: number
		archivedMemories: number
	}> {
		await this.init()

		const memories = this.db.exec("SELECT COUNT(*) FROM memories")
		const tasks = this.db.exec("SELECT COUNT(*) FROM tasks")
		const entities = this.db.exec("SELECT COUNT(*) FROM entities")
		const activeTasks = this.db.exec(
			"SELECT COUNT(*) FROM tasks WHERE status IN ('pending', 'in_progress')"
		)
		const archivedMemories = this.db.exec(
			"SELECT COUNT(*) FROM memories WHERE is_archived = 1"
		)

		return {
			totalMemories: (memories[0]?.values[0]?.[0] as number) || 0,
			totalTasks: (tasks[0]?.values[0]?.[0] as number) || 0,
			totalEntities: (entities[0]?.values[0]?.[0] as number) || 0,
			activeTasks: (activeTasks[0]?.values[0]?.[0] as number) || 0,
			archivedMemories: (archivedMemories[0]?.values[0]?.[0] as number) || 0,
		}
	}

	/**
	 * 执行记忆衰减
	 */
	async decayMemories(): Promise<void> {
		await this.init()
		// 更新衰减后的重要性：使用 SQLite 的 julianday 计算天数
		this.db.run(`
      UPDATE memory_decay
      SET current_importance = initial_importance * exp(-decay_rate * (julianday('now') - julianday(last_reinforced)))
    `)

		// 更新记忆表中的重要性
		this.db.run(`
      UPDATE memories
      SET importance = (
        SELECT current_importance 
        FROM memory_decay 
        WHERE memory_id = memories.id
      ),
      tier = (
        SELECT CASE
          WHEN current_importance > 0.8 THEN 'core'
          WHEN current_importance > 0.5 THEN 'working'
          ELSE 'peripheral'
        END
        FROM memory_decay 
        WHERE memory_id = memories.id
      )
      WHERE id IN (SELECT memory_id FROM memory_decay)
    `)

		// 归档过期记忆（重要性低于阈值）
		this.db.run(`
      UPDATE memories
      SET is_archived = 1
      WHERE importance < 0.2 AND is_archived = 0
    `)

		await this.save()
	}

	/**
	 * 压缩记忆：合并重复，清理低价值归档
	 */
	async compactMemories(): Promise<{
		removedDuplicates: number
		removedLowValue: number
		totalBefore: number
		totalAfter: number
	}> {
		await this.init()
		let removedDuplicates = 0
		let removedLowValue = 0

		// 1. 找出重复标题/类型的记忆，保留重要性最高的
		const duplicatesResult = this.db.exec(`
			SELECT title, type, COUNT(*) as cnt
			FROM memories 
			WHERE title IS NOT NULL AND is_archived = 0
			GROUP BY title, type
			HAVING COUNT(*) > 1
		`)

		if (duplicatesResult.length > 0 && duplicatesResult[0].values) {
			for (const row of duplicatesResult[0].values) {
				const title = row[0] as string
				const type = row[1] as string
				// 找出重要性最高的，保留它，删除其他
				const toKeep = this.db.exec(`
					SELECT id, importance FROM memories WHERE title = ? AND type = ? AND is_archived = 0 ORDER BY importance DESC LIMIT 1
				`, [title, type])
				if (toKeep.length > 0 && toKeep[0].values && toKeep[0].values.length > 0) {
					const keepId = toKeep[0].values[0][0] as string
					const toDelete = this.db.exec(`
						SELECT id FROM memories WHERE title = ? AND type = ? AND id != ? AND is_archived = 0
					`, [title, type, keepId])
					if (toDelete.length > 0 && toDelete[0].values) {
						removedDuplicates += toDelete[0].values.length
						for (const delRow of toDelete[0].values) {
							this.db.run(`DELETE FROM memories WHERE id = ?`, [delRow[0] as string])
							this.db.run(`DELETE FROM memory_decay WHERE memory_id = ?`, [delRow[0] as string])
						}
					}
				}
			}
		}

		// 2. 永久删除已经归档很久且重要性极低的记忆
		const lowValueResult = this.db.exec(`
			SELECT id FROM memories 
			WHERE is_archived = 1 AND importance < 0.1
		`)

		if (lowValueResult.length > 0 && lowValueResult[0].values) {
			removedLowValue = lowValueResult[0].values.length
			for (const row of lowValueResult[0].values) {
				this.db.run(`DELETE FROM memories WHERE id = ?`, [row[0] as string])
				this.db.run(`DELETE FROM memory_decay WHERE memory_id = ?`, [row[0] as string])
		}
		}

		// 3. Vacuum 数据库，回收空间
		this.db.run(`VACUUM`)

		const statsBefore = await this.getStats()
		const totalBefore = statsBefore.totalMemories

		await this.save()

		const statsAfter = await this.getStats()
		const totalAfter = statsAfter.totalMemories

		return {
			removedDuplicates,
			removedLowValue,
			totalBefore,
			totalAfter,
		}
	}

	/**
	 * 完整维护：衰减 + 压缩 + 统计
	 */
	async maintenance(): Promise<{
		decayDone: boolean
		compactResult: {
			removedDuplicates: number
			removedLowValue: number
			totalBefore: number
			totalAfter: number
		}
		stats: Awaited<ReturnType<MemoryStorage["getStats"]>>
	}> {
		await this.decayMemories()
		const compactResult = await this.compactMemories()
		const stats = await this.getStats()
		await this.save()
		return {
			decayDone: true,
			compactResult,
			stats,
		}
	}

	// ============================================
	// Core Block 操作（保持兼容）
	// ============================================

	async loadCoreBlock(name: string): Promise<string> {
		const { readFile } = await import("fs/promises")
		const file = join(this.basePath, "core", `${name}.md`)
		try {
			return await readFile(file, "utf-8")
		} catch {
			return ""
		}
	}

	async updateCoreBlock(name: string, content: string): Promise<void> {
		const { writeFile } = await import("fs/promises")
		const file = join(this.basePath, "core", `${name}.md`)
		await writeFile(file, content)
	}

	getBasePath(): string {
		return this.basePath
	}

	// ============================================
	// 辅助方法
	// ============================================

	private rowToMemory(row: any[], columns: string[]): Memory {
		const get = (name: string) => row[columns.indexOf(name)]

		let embedding: number[] | undefined
		if (get("embedding")) {
			try {
				embedding = JSON.parse(get("embedding") as string) as number[]
			} catch {}
		}

		return {
			id: get("id") as string,
			type: get("type") as Memory["type"],
			category: get("category") as string | undefined,
			title: get("title") as string | undefined,
			content: get("content") as string,
			summary: get("summary") as string | undefined,
			importance: parseFloat(get("importance") as string) || 0.5,
			createdAt: get("created_at") as string,
			updatedAt: get("updated_at") as string,
			metadata: get("metadata") ? JSON.parse(get("metadata") as string) : undefined,
			embedding,
			embeddingModel: get("embedding_model") as string | undefined,
			accessCount: parseInt(get("access_count") as string) || 0,
			lastAccessed: get("last_accessed") as string | undefined,
			tier: (get("tier") as Memory["tier"]) || "working",
			decayScore: parseFloat(get("decay_score") as string) || 1.0,
		}
	}

	private rowToTask(row: any[], columns: string[]): Task {
		const get = (name: string) => row[columns.indexOf(name)]

		return {
			id: get("id") as string,
			title: get("title") as string,
			description: get("description") as string | undefined,
			status: get("status") as Task["status"],
			priority: get("priority") as number,
			dueDate: get("due_date") as string | undefined,
			createdAt: get("created_at") as string,
			startedAt: get("started_at") as string | undefined,
			completedAt: get("completed_at") as string | undefined,
			parentTaskId: get("parent_task_id") as string | undefined,
			tags: get("tags") ? JSON.parse(get("tags") as string) : undefined,
			metadata: get("metadata") ? JSON.parse(get("metadata") as string) : undefined,
		}
	}

	private rowToEntity(row: any[], columns: string[]): Entity {
		const get = (name: string) => row[columns.indexOf(name)]

		return {
			id: get("id") as string,
			name: get("name") as string,
			type: get("type") as Entity["type"],
			aliases: get("aliases") ? JSON.parse(get("aliases") as string) : undefined,
			description: get("description") as string | undefined,
			mentionCount: get("mention_count") as number,
		}
	}
}
