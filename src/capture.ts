import type { MemoryStorage, Memory } from "./storage-sqlite.ts"
import type { MemoryHubConfig } from "./config.ts"
import { generateEmbedding } from "./embedding.js"
import { calculateDecayScore, classifyMemoryTier } from "./lifecycle.js"

// Track turn count per session
const sessionTurnCounts = new Map<string, number>()

// Track pending consolidation for async processing
let pendingConsolidation: Memory[] = []
const consolidationLock = { isProcessing: false }

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
 * Improved: Dynamic capture - capture immediately when important content is found
 * Falls back to interval capture for general context
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

			// Get recent transcript
			const transcript = ctx.recentTranscript as Array<{ role: string; content: string }> | undefined
			if (!transcript || transcript.length === 0) return

			// Extract memories from transcript
			const memories = await extractMemories(transcript, config)

			// Improved dynamic capture logic:
			// 1. If any important memories found, capture immediately (don't wait for interval)
			// 2. If no important memories, still capture on interval for general context
			const shouldCapture = memories.length > 0 || (newCount % config.captureInterval === 0)
			
			if (!shouldCapture) {
				return
			}

			// Store extracted memories - FAST PATH (quick response)
			let storedCount = 0
			for (const memory of memories) {
				await storeMemoryByType(storage, memory, config)
				storedCount++
				// Add to pending consolidation for SLOW PATH (async relation extraction)
			pendingConsolidation.push(memory)
			}

			// Trigger async consolidation in background
			if (pendingConsolidation.length > 0 && !consolidationLock.isProcessing) {
				// Don't await - let it run in background
			void consolidateRelationsAsync(storage, config, pendingConsolidation, consolidationLock)
				pendingConsolidation = []
			}

			// If interval capture but no memories found, don't log
			if (storedCount > 0) {
				console.log(`[Memory Hub] Captured ${storedCount} memories at turn ${newCount} (${memories.length > 0 ? "dynamic" : "interval"})`)
			}
		} catch (error) {
			console.error("Memory Hub capture error:", error)
		}
	}
}

/**
 * Extract memories from transcript using intelligent pattern matching
 * Improved: Checks all messages for important content, extracts immediately when found
 */
async function extractMemories(
	transcript: Array<{ role: string; content: string }>,
	config: MemoryHubConfig
): Promise<Memory[]> {
	const memories: Memory[] = []
	const now = new Date().toISOString()
	const processedContent = new Set<string>()

	for (const msg of transcript) {
		// Process both user and assistant messages - AI can generate important content too
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

/**
 * Async consolidation (SLOW PATH - MAGMA dual-stream architecture)
 * Extract relations after memory is stored, doesn't block user response
 */
async function consolidateRelationsAsync(
	storage: MemoryStorage,
	config: MemoryHubConfig,
	pending: Memory[],
	lock: { isProcessing: boolean }
) {
	try {
		lock.isProcessing = true
		console.log(`[Memory Hub] Starting async consolidation for ${pending.length} memories`)

		// 1. Extract temporal relations - based on creation time
		const sorted = pending.sort((a, b) => 
			new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
		)

		// Connect consecutive memories in temporal order
		for (let i = 0; i < sorted.length - 1; i++) {
			const from = sorted[i]
			const to = sorted[i + 1]
			// Temporal relation: from happens before to
			await storage.addRelation(from.id, to.id, 'temporal', 1.0)
		}

		// 2. Extract semantic relations - connect memories with similar content
		// For each memory, connect to other memories with high similarity
		for (const memory of pending) {
			if (!memory.embedding) continue

			// Find other recent memories and connect if similar
			for (const other of pending) {
				if (memory.id === other.id || !other.embedding) continue

				// Simple cosine similarity check
			let dot = 0
			let normA = 0
			let normB = 0
			for (let i = 0; i < memory.embedding.length; i++) {
				dot += memory.embedding[i] * other.embedding[i]
				normA += memory.embedding[i] ** 2
				normB += other.embedding[i] ** 2
			}
			const similarity = normA > 0 && normB > 0 ? dot / (Math.sqrt(normA) * Math.sqrt(normB)) : 0

			// Connect if similarity above threshold
			if (similarity > 0.7) {
				await storage.addRelation(memory.id, other.id, 'semantic', similarity)
				await storage.addRelation(other.id, memory.id, 'semantic', similarity)
			}
		}
		}

		// 3. Extract causal relations - simple heuristic based on content keywords
		const causalPatterns = [
			/because|所以|因此|导致|原因|结果|as a result|therefore/i,
			/改进|修复|解决|fix|解决了/i
		]

		for (const [fromIdx, from] of pending.entries()) {
			const hasCausal = causalPatterns.some(p => p.test(from.content))
			if (hasCausal && fromIdx < pending.length - 1) {
				// This memory caused the next one
				const to = pending[fromIdx + 1]
				await storage.addRelation(from.id, to.id, 'causal', 0.8)
			}
		}

		console.log(`[Memory Hub] Async consolidation completed for ${pending.length} memories`)
	} catch (error) {
		console.error("[Memory Hub] Async consolidation error:", error)
	} finally {
		lock.isProcessing = false
	}
}
