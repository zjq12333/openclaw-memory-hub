import type { MemoryStorage } from "./storage-sqlite.ts"
import type { MemoryHubConfig } from "./config.ts"
import { generateEmbedding } from "./embedding.js"

/**
 * Build the auto-recall handler
 * Called before each AI turn to inject relevant memories
 */
export function buildRecallHandler(storage: MemoryStorage, config: MemoryHubConfig) {
	return async (event: Record<string, unknown>, ctx: Record<string, unknown>) => {
		try {
			// 1. Load Core Block (always visible, ~500 tokens)
			const activeTasks = await storage.loadCoreBlock("active_tasks")

			// 2. Get last message for context
			const lastMessage = ctx.lastMessage as string | undefined
			if (!lastMessage) {
				return { context: formatCoreBlock(activeTasks) }
			}

			// 3. Search archive for relevant memories
			const relevant = await storage.searchMemories(lastMessage, {
				limit: config.maxRecallResults,
				threshold: config.recallThreshold,
				vectorSearch: config.vectorSearch,
				generateEmbedding: async (text: string) => {
					const result = await generateEmbedding(text, {
						baseUrl: config.ollamaBaseUrl,
						model: config.ollamaModel,
					})
					return result?.embedding || null
				}
			})

			// 4. Touch accessed memories (reinforce)
			for (const mem of relevant) {
				void storage.touchMemory(mem.id)
			}

			// 5. Format for context injection
			const context = formatForContext(activeTasks, relevant)

			return { context }
		} catch (error) {
			console.error("Memory Hub recall error:", error)
			return { context: "" }
		}
	}
}

function formatCoreBlock(content: string): string {
	if (!content.trim()) return ""
	
	// Extract just the content, skip frontmatter if present
	const lines = content.split("\n")
	const startIdx = lines.findIndex((l, i) => i > 0 && l.startsWith("#"))
	const relevantContent = startIdx >= 0 ? lines.slice(startIdx).join("\n") : content
	
	return `<memory_hub>
<active_tasks>
${relevantContent.trim()}
</active_tasks>
</memory_hub>`
}

function formatForContext(activeTasks: string, memories: unknown[]): string {
	const parts: string[] = []

	if (activeTasks.trim()) {
		parts.push(formatCoreBlock(activeTasks))
	}

	if (memories.length > 0) {
		const memoriesSection = (memories as Array<{ content: string; type: string }>)
			.map((m) => `- [${m.type}] ${m.content.slice(0, 300)}`)
			.join("\n")

		parts.push(`<relevant_memories>
${memoriesSection}
</relevant_memories>`)
	}

	return parts.join("\n\n")
}
