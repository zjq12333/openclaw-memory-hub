import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { Type } from "@sinclair/typebox"
import type { MemoryStorage } from "../storage-sqlite.js"
import type { MemoryHubConfig } from "../config.js"
import { getMemoryStats, calculateDecayScore, classifyMemoryTier } from "../lifecycle.js"
import { checkOllamaAvailable, getAvailableModels } from "../embedding.js"

export function registerStatsTool(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	config: MemoryHubConfig
) {
	api.registerTool(
		{
			name: "memory_stats",
			label: "Memory Stats",
			description: "Get memory system statistics including tier distribution, decay scores, and Ollama status",
			parameters: Type.Object({}),
			async execute() {
				// Get storage stats
				const stats = await storage.getStats()

				// Get all memories for detailed analysis
				const allMemories = await storage.listMemories()

				// Calculate lifecycle stats
				const lifecycleStats = getMemoryStats(allMemories)

				// Check Ollama status
				const ollamaAvailable = await checkOllamaAvailable({
					baseUrl: config.ollamaBaseUrl || "http://localhost:11434",
				})

				let availableModels: string[] = []
				if (ollamaAvailable) {
					availableModels = await getAvailableModels({
						baseUrl: config.ollamaBaseUrl || "http://localhost:11434",
					})
				}

				// Format output
				const text = `
## 📊 Memory Hub Statistics

### Storage
- **Total Memories**: ${stats.totalMemories}
- **Active Tasks**: ${stats.activeTasks}
- **Total Entities**: ${stats.totalEntities}

### Memory Tiers
- ⭐ **Core**: ${lifecycleStats.core} (high importance, frequently accessed)
- 📝 **Working**: ${lifecycleStats.working} (active, moderate importance)
- 📄 **Peripheral**: ${lifecycleStats.peripheral} (low priority, may decay)

### Lifecycle
- **Average Decay Score**: ${(lifecycleStats.avgDecayScore * 100).toFixed(1)}%

### Vector Search
- **Ollama Status**: ${ollamaAvailable ? "✅ Available" : "❌ Not available"}
- **Embedding Model**: ${config.ollamaModel || "nomic-embed-text"}
- **Available Models**: ${availableModels.length > 0 ? availableModels.join(", ") : "None"}

### Configuration
- **Auto-Capture**: ${config.autoCapture ? "✅" : "❌"}
- **Auto-Recall**: ${config.autoRecall ? "✅" : "❌"}
- **Vector Search**: ${config.vectorSearch ? "✅" : "❌"}
- **Decay Enabled**: ${config.decayEnabled ? "✅" : "❌"}
- **Capture Interval**: Every ${config.captureInterval} turns
`.trim()

				return {
					content: [{ type: "text" as const, text }],
					details: {
						storage: stats,
						lifecycle: lifecycleStats,
						ollama: {
							available: ollamaAvailable,
							models: availableModels,
						},
						config: {
							autoCapture: config.autoCapture,
							autoRecall: config.autoRecall,
							vectorSearch: config.vectorSearch,
							decayEnabled: config.decayEnabled,
							captureInterval: config.captureInterval,
						},
					},
				}
			},
		},
		{ name: "memory_stats" }
	)
}
