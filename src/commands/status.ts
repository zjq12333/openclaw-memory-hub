import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { MemoryStorage } from "../storage.ts"
import type { MemoryHubConfig } from "../config.ts"

export function registerStatusCommand(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	config: MemoryHubConfig
) {
	api.registerSlashCommand({
		name: "memory",
		description: "Memory Hub commands",
		handler: async (args: string) => {
			const subCommand = args.trim().split(/\s+/)[0]

			if (subCommand === "status") {
				const memories = await storage.listMemories()
				const activeTasks = await storage.loadCoreBlock("active_tasks")

				return `🧠 Memory Hub Status

Storage: ${storage.getBasePath()}
Auto-Recall: ${config.autoRecall ? "✅" : "❌"}
Auto-Capture: ${config.autoCapture ? "✅" : "❌"}
Capture Interval: Every ${config.captureInterval} turns

Core Block (active_tasks): ${activeTasks.length} chars
Archived Memories: ${memories.length} total
- Decisions: ${memories.filter((m) => m.type === "decision").length}
- Projects: ${memories.filter((m) => m.type === "project").length}
- Knowledge: ${memories.filter((m) => m.type === "fact" || m.type === "preference").length}

Config:
- Max Recall Results: ${config.maxRecallResults}
- Recall Threshold: ${config.recallThreshold}
- Vector Search: ${config.vectorSearch ? "✅" : "❌"}
- Obsidian Sync: ${config.obsidianSync ? "✅" : "❌"}`
			}

			if (subCommand === "export") {
				const memories = await storage.listMemories()
				const activeTasks = await storage.loadCoreBlock("active_tasks")

				return `# Memory Hub Export

## Active Tasks
${activeTasks}

## Archived Memories
${memories.map((m) => `### [${m.type}] ${m.id}\n${m.content}`).join("\n\n")}
`
			}

			return `Memory Hub Commands:
/memory status - Show memory status
/memory export - Export all memories`
		},
	})
}
