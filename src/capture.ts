import type { MemoryStorage, Memory } from "./storage-sqlite.ts"
import type { MemoryHubConfig } from "./config.ts"
import { generateEmbedding } from "./embedding.js"
import { calculateDecayScore, classifyMemoryTier } from "./lifecycle.js"

// Track turn count per session
const sessionTurnCounts = new Map<string, number>()

// Memory patterns for intelligent extraction
const MEMORY_PATTERNS = {
	// 任务相关
	task: [
		/\b(待办|todo|任务|需要|pending|task|要做|完成|执行|处理)\b/i,
		/\b(下一步|接下来|计划|安排)\b/i,
		/\b(创建|开发|实现|构建|设计)\b/i,
		/\b(修复|更新|改进|优化)\b/i,
	],
	// 决策相关
	decision: [
		/\b(决定|选择|decision|chose|selected|确定|敲定)\b/i,
		/\b(采用|使用|方案|策略)\b/i,
		/\b(同意|批准|通过|确认)\b/i,
		/\b(放弃|拒绝|否决)\b/i,
	],
	// 项目相关
	project: [
		/\b(项目|project|系统|平台|产品)\b/i,
		/\b(启动|开始|开展|启动)\b/i,
		/\b(交付|完成|上线|发布)\b/i,
	],
	// 偏好相关
	preference: [
		/\b(喜欢|偏好|prefer|like|want|习惯|倾向于)\b/i,
		/\b(默认|优先|首选)\b/i,
		/\b(规则|约束|限制)\b/i,
	],
	// 重要事实
	fact: [
		/\b(记住|记得|记住这个|重要)\b/i,
		/\b(这是|这就是|本质|核心|关键)\b/i,
		/\b(灵魂|根本|基础|根基)\b/i,
		/\b(仓库|GitHub|路径|地址)\b/i,
	],
	// 团队/角色
	team: [
		/\b(员工|角色|团队|CEO|程序员|设计师)\b/i,
		/\b(招聘|培训|技能|SKILL)\b/i,
		/\b(审查|监督|协调)\b/i,
	],
}

/**
 * Build the auto-capture handler
 * Called after each AI turn to extract and store memories
 * Only runs every N turns (config.captureInterval)
 */
export function buildCaptureHandler(storage: MemoryStorage, config: MemoryHubConfig) {
	return async (event: Record<string, unknown>, ctx: Record<string, unknown>) => {
		try {
			const sessionKey = ctx.sessionKey as string | undefined
			if (!sessionKey) return

			// Increment turn count
			const currentCount = sessionTurnCounts.get(sessionKey) ?? 0
			const newCount = currentCount + 1
			sessionTurnCounts.set(sessionKey, newCount)

			// Only capture every N turns
			if (newCount % config.captureInterval !== 0) {
				return
			}

			// Get recent transcript
			const transcript = ctx.recentTranscript as Array<{ role: string; content: string }> | undefined
			if (!transcript || transcript.length === 0) return

			// Extract memories from transcript
			const memories = await extractMemories(transcript, config)

			// Store extracted memories
			for (const memory of memories) {
				await storeMemoryByType(storage, memory, config)
			}

			console.log(`[Memory Hub] Captured ${memories.length} memories at turn ${newCount}`)
		} catch (error) {
			console.error("Memory Hub capture error:", error)
		}
	}
}

/**
 * Extract memories from transcript using intelligent pattern matching
 */
async function extractMemories(
	transcript: Array<{ role: string; content: string }>,
	config: MemoryHubConfig
): Promise<Memory[]> {
	const memories: Memory[] = []
	const now = new Date().toISOString()
	const processedContent = new Set<string>()

	for (const msg of transcript) {
		if (msg.role !== "user") continue

		const content = msg.content.trim()
		if (content.length < 10) continue // Skip very short messages

		// Skip duplicate content
		const contentHash = content.slice(0, 50)
		if (processedContent.has(contentHash)) continue
		processedContent.add(contentHash)

		// Extract title from content (first line or first 50 chars)
		const title = content.split('\n')[0].slice(0, 50)

		// Check each memory type
		for (const [type, patterns] of Object.entries(MEMORY_PATTERNS)) {
			for (const pattern of patterns) {
				if (pattern.test(content)) {
					// Determine category based on type
					let category = "knowledge"
					if (type === "task") category = "tasks"
					else if (type === "decision") category = "decisions"
					else if (type === "project") category = "projects"
					else if (type === "team") category = "team"

					// Calculate importance
					const importance = calculateImportance(content, type)

					// Create memory object
					const memory: Memory = {
						id: `${type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
						type: type as Memory["type"],
						category,
						title,
						content,
						importance,
						createdAt: now,
						updatedAt: now,
						accessCount: 0,
					}

					// Generate embedding if vector search is enabled
					if (config.vectorSearch && config.ollamaBaseUrl) {
						try {
							const embeddingResult = await generateEmbedding(
								`${title}\n${content}`,
								{
									baseUrl: config.ollamaBaseUrl,
									model: config.ollamaModel || "nomic-embed-text",
								}
							)
							if (embeddingResult) {
								memory.embedding = embeddingResult.embedding
								memory.embeddingModel = embeddingResult.model
							}
						} catch (error) {
							console.warn("[Memory Hub] Failed to generate embedding:", error)
						}
					}

					// Calculate decay score and tier
					if (config.decayEnabled) {
						memory.decayScore = calculateDecayScore(memory)
						memory.tier = classifyMemoryTier(memory)
					}

					memories.push(memory)
					break // Only one memory per type per message
				}
			}
		}
	}

	// Deduplicate by type and similar content
	return deduplicateMemories(memories)
}

/**
 * Calculate importance score based on content and type
 */
function calculateImportance(content: string, type: string): number {
	let score = 0.5 // Base score

	// Boost for certain keywords
	if (/\b(重要|关键|核心|本质|灵魂|永久|必须)\b/i.test(content)) score += 0.3
	if (/\b(GitHub|仓库|系统|项目)\b/i.test(content)) score += 0.2
	if (/\b(规则|约束|决策|决定)\b/i.test(content)) score += 0.2

	// Boost by type
	if (type === "decision") score += 0.2
	if (type === "fact") score += 0.15
	if (type === "project") score += 0.1

	// Cap at 1.0
	return Math.min(score, 1.0)
}

/**
 * Deduplicate similar memories
 */
function deduplicateMemories(memories: Memory[]): Memory[] {
	const seen = new Map<string, Memory>()

	for (const memory of memories) {
		const key = `${memory.type}-${memory.title}`
		const existing = seen.get(key)

		if (!existing || (memory.importance || 0.5) > (existing.importance || 0.5)) {
			seen.set(key, memory)
		}
	}

	return Array.from(seen.values())
}

async function storeMemoryByType(
	storage: MemoryStorage,
	memory: Memory,
	config: MemoryHubConfig
): Promise<void> {
	switch (memory.type) {
		case "task":
			// Update active_tasks core block
			const current = await storage.loadCoreBlock("active_tasks")
			const updated = updateActiveTasks(current, memory)
			await storage.updateCoreBlock("active_tasks", updated)
			// Also store in SQLite
			await storage.storeMemory({ ...memory, category: "tasks" })
			break

		case "decision":
			await storage.storeMemory({ ...memory, category: "decisions" })
			// Also write to decisions file
			await appendToDecisionsFile(storage, memory)
			break

		case "project":
			await storage.storeMemory({ ...memory, category: "projects" })
			break

		case "team":
			await storage.storeMemory({ ...memory, category: "team" })
			break

		case "preference":
		case "fact":
			await storage.storeMemory({ ...memory, category: "knowledge" })
			break
	}
}

function updateActiveTasks(current: string, memory: Memory): string {
	const lines = current.split("\n")
	
	// Find "## Pending" section
	const pendingIdx = lines.findIndex((l) => l.startsWith("## Pending"))

	if (pendingIdx >= 0) {
		// Insert after the section header
		const newTask = `- ${memory.title || memory.content.slice(0, 100)}`
		lines.splice(pendingIdx + 1, 0, newTask)
	}

	return lines.join("\n")
}

/**
 * Append decision to decisions file for persistence
 */
async function appendToDecisionsFile(storage: MemoryStorage, memory: Memory): Promise<void> {
	try {
		const fs = await import("fs/promises")
		const path = await import("path")
		
		const storagePath = (storage as unknown as { getBasePath: () => string }).getBasePath?.() || 
			require("os").homedir() + "/memory"
		const decisionsDir = path.join(storagePath, "decisions")
		const today = new Date().toISOString().split("T")[0]
		const decisionsFile = path.join(decisionsDir, `${today}-decisions.md`)

		// Ensure directory exists
		await fs.mkdir(decisionsDir, { recursive: true })

		// Append decision
		const entry = `\n## ${new Date().toLocaleTimeString()}\n${memory.content}\n`
		await fs.appendFile(decisionsFile, entry)
	} catch (error) {
		console.error("Failed to append to decisions file:", error)
	}
}
