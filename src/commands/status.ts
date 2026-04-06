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
${memories.map((m) => `### [${m.type}] ${m.id}
${m.content}`).join("\n\n")}`,
				}
			}

			if (subCommand === "maintenance") {
				const result = await storage.maintenance()

				return {
					text: `🧠 Memory Hub Maintenance Completed

Decay: ✅ Done
Compaction:
- Removed duplicates: ${result.compactResult.removedDuplicates}
- Removed low-value archived: ${result.compactResult.removedLowValue}
- Total before: ${result.compactResult.totalBefore}
- Total after: ${result.compactResult.totalAfter}

📊 Current Statistics:
- Total Memories: ${result.stats.totalMemories}
- Total Tasks: ${result.stats.totalTasks}
- Active Tasks: ${result.stats.activeTasks}
- Archived Memories: ${result.stats.archivedMemories}
- Entities: ${result.stats.totalEntities}`,
				}
			}

			if (subCommand === "importance") {
				const id = args[1]
				const newImp = parseFloat(args[2])

				if (!id || isNaN(newImp) || newImp < 0 || newImp > 1) {
					return {
						text: `❌ Invalid arguments

Usage: /memory importance <memory-id> <0-1>
- memory-id: ID of the memory
- 0-1: new importance value (0 = low importance, 1 = maximum importance)
`,
					}
				}

				const mem = await storage.getMemory(id)
				if (!mem) {
					return {
						text: `❌ Memory not found: ${id}`,
					}
				}

				// Update importance
				mem.importance = newImp
				mem.updatedAt = new Date().toISOString()

				// Re-calculate tier
				mem.tier = storage.calculateTier(newImp, mem.accessCount || 0)

				await storage.storeMemory(mem)
				const stats = await storage.getStats()

				return {
					text: `✅ Memory importance updated

Memory: ${id}
New importance: ${newImp}
New tier: ${mem.tier}

📊 Current statistics:
- Total memories: ${stats.totalMemories}`,
				}
			}

			return {
				text: `Memory Hub Commands:
/memory status - Show memory status
/memory importance <id> <0-1> - Adjust memory importance
/memory maintenance - Run decay + compaction maintenance
/memory export - Export all memories`,
			}
		}
	})
}
