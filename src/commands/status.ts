import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { MemoryStorage } from "../storage-sqlite.js"
import type { MemoryHubConfig } from "../config.js"

export function registerCommands(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	config: MemoryHubConfig
) {
	api.registerCommand({
		name: "memory",
		description: "Memory Hub commands",
		acceptsArgs: true,
		requireAuth: true,
		handler: async (ctx: { args?: string }) => {
			const args = ctx.args?.trim().split(/\s+/) || []
			const subCommand = args[0]

			if (subCommand === "status") {
				const stats = await storage.getStats()
				const activeTasks = await storage.loadCoreBlock("active_tasks")
				const prefs = await storage.getUserPreferences()

				return {
					text: `🧠 Memory Hub Status

Storage: ${storage.getBasePath()}
Database: ${storage.getBasePath()}/memory.db

Auto-Recall: ${config.autoRecall ? "✅" : "❌"}
Auto-Capture: ${config.autoCapture ? "✅" : "❌"}
Capture Interval: Every ${config.captureInterval} turns

📊 Statistics:
- Total Memories: ${stats.totalMemories}
- Total Tasks: ${stats.totalTasks}
- Active Tasks: ${stats.activeTasks}
- Entities: ${stats.totalEntities}

Core Block (active_tasks): ${activeTasks.length} chars

👤 User Preferences:
${Object.entries(prefs).map(([type, keys]) => 
  `  ${type}: ${Object.entries(keys).map(([k, v]) => `${k}=${v.value} (${(v.confidence * 100).toFixed(0)}%)`).join(", ")}`
).join("\n")}

Config:
- Max Recall Results: ${config.maxRecallResults}
- Recall Threshold: ${config.recallThreshold}
- Vector Search: ${config.vectorSearch ? "✅" : "❌"}
- Obsidian Sync: ${config.obsidianSync ? "✅" : "❌"}`,
				}
			}

			if (subCommand === "export") {
				const memories = await storage.listMemories()
				const activeTasks = await storage.loadCoreBlock("active_tasks")

				return {
					text: `# Memory Hub Export

## Active Tasks
${activeTasks}

## Archived Memories
${memories.map((m) => `### [${m.type}] ${m.id}\n${m.content}`).join("\n\n")}
`,
				}
			}

			return {
				text: `Memory Hub Commands:
/memory status - Show memory status
/memory export - Export all memories`,
			}
		},
	})
}
