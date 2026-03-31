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
	}

	// ============================================
	// 记忆操作
	// ============================================

	/**
	 * 存储记忆
	 */
	async storeMemory(memory: Memory): Promise<void> {
		await this.init()
		this.db.run(
			`INSERT OR REPLACE INTO memories 
       (id, type, category, title, content, summary, importance, created_at, updated_at, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
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
			]
		)
		await this.save()
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
		}
	): Promise<Memory[]> {
		await this.init()
		const limit = options?.limit || 10
		const threshold = options?.threshold || 0.3

		// 简单文本搜索
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

		// 全文搜索
		sql += ` AND (content LIKE ? OR title LIKE ? OR summary LIKE ?)`
		const searchPattern = `%${query}%`
		params.push(searchPattern, searchPattern, searchPattern)

		sql += ` ORDER BY importance DESC, last_accessed DESC LIMIT ?`
		params.push(limit)

		const result = this.db.exec(sql, params)
		if (result.length === 0) return []

		return result[0].values.map((row: any[]) =>
			this.rowToMemory(row, result[0].columns)
		)
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
	 * 更新记忆访问统计
	 */
	async touchMemory(id: string): Promise<void> {
		await this.init()
		this.db.run(
			`UPDATE memories 
       SET access_count = access_count + 1, 
           last_accessed = datetime('now')
       WHERE id = ?`,
			[id]
		)
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
	}> {
		await this.init()

		const memories = this.db.exec("SELECT COUNT(*) FROM memories")
		const tasks = this.db.exec("SELECT COUNT(*) FROM tasks")
		const entities = this.db.exec("SELECT COUNT(*) FROM entities")
		const activeTasks = this.db.exec(
			"SELECT COUNT(*) FROM tasks WHERE status IN ('pending', 'in_progress')"
		)

		return {
			totalMemories: (memories[0]?.values[0]?.[0] as number) || 0,
			totalTasks: (tasks[0]?.values[0]?.[0] as number) || 0,
			totalEntities: (entities[0]?.values[0]?.[0] as number) || 0,
			activeTasks: (activeTasks[0]?.values[0]?.[0] as number) || 0,
		}
	}

	/**
	 * 执行记忆衰减
	 */
	async decayMemories(): Promise<void> {
		await this.init()
		// 更新衰减后的重要性
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
      )
      WHERE id IN (SELECT memory_id FROM memory_decay)
    `)

		await this.save()
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

		return {
			id: get("id") as string,
			type: get("type") as Memory["type"],
			category: get("category") as string | undefined,
			title: get("title") as string | undefined,
			content: get("content") as string,
			summary: get("summary") as string | undefined,
			importance: get("importance") as number | undefined,
			createdAt: get("created_at") as string,
			updatedAt: get("updated_at") as string,
			metadata: get("metadata") ? JSON.parse(get("metadata") as string) : undefined,
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
