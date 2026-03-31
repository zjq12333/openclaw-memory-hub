import type { MemoryStorage, Memory } from "./storage-sqlite.ts"
import type { MemoryHubConfig } from "./config.ts"

// Track turn count per session
const sessionTurnCounts = new Map<string, number>()

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
			const memories = await extractMemories(transcript)

			// Store extracted memories
			for (const memory of memories) {
				await storeMemoryByType(storage, memory)
			}
		} catch (error) {
			console.error("Memory Hub capture error:", error)
		}
	}
}

/**
 * Extract memories from transcript
 * Uses simple heuristics for now (no LLM call to save tokens)
 */
async function extractMemories(
	transcript: Array<{ role: string; content: string }>
): Promise<Memory[]> {
	const memories: Memory[] = []
	const now = new Date().toISOString()

	for (const msg of transcript) {
		if (msg.role !== "user") continue

		const content = msg.content.toLowerCase()

		// Detect task mentions
		if (/\b(待办|todo|任务|需要|pending|task)\b/i.test(content)) {
			memories.push({
				id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				type: "task",
				content: msg.content,
				createdAt: now,
				updatedAt: now,
			})
		}

		// Detect decision mentions
		if (/\b(决定|选择|decision|chose|selected)\b/i.test(content)) {
			memories.push({
				id: `decision-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				type: "decision",
				content: msg.content,
				createdAt: now,
				updatedAt: now,
			})
		}

		// Detect preference mentions
		if (/\b(喜欢|偏好|prefer|like|want|习惯)\b/i.test(content)) {
			memories.push({
				id: `pref-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				type: "preference",
				content: msg.content,
				createdAt: now,
				updatedAt: now,
			})
		}
	}

	return memories
}

async function storeMemoryByType(storage: MemoryStorage, memory: Memory): Promise<void> {
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
			break

		case "project":
			await storage.storeMemory({ ...memory, category: "projects" })
			break

		case "preference":
		case "fact":
			await storage.storeMemory({ ...memory, category: "knowledge" })
			break
	}
}

function updateActiveTasks(current: string, memory: Memory): string {
	const lines = current.split("\n")
	
	// Find "## Pending" or "## In Progress" section
	const pendingIdx = lines.findIndex((l) => l.startsWith("## Pending"))
	const inProgressIdx = lines.findIndex((l) => l.startsWith("## In Progress"))

	if (pendingIdx >= 0) {
		// Insert after the section header
		const newTask = `- ${memory.content.slice(0, 100)}`
		lines.splice(pendingIdx + 1, 0, newTask)
	}

	return lines.join("\n")
}
