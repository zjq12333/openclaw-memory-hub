import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { MemoryStorage } from "../storage.ts"
import type { MemoryHubConfig } from "../config.ts"

export function registerRecallTool(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	config: MemoryHubConfig
) {
	api.registerTool({
		name: "memory_recall",
		description: "Search archived memories by query",
		inputSchema: {
			type: "object",
			properties: {
				query: {
					type: "string",
					description: "Search query",
				},
				limit: {
					type: "number",
					description: "Maximum results to return",
					default: config.maxRecallResults,
				},
			},
			required: ["query"],
		},
		handler: async (args: { query: string; limit?: number }) => {
			const results = await storage.searchArchive(args.query, {
				limit: args.limit ?? config.maxRecallResults,
				threshold: config.recallThreshold,
			})

			if (results.length === 0) {
				return "No matching memories found."
			}

			return results
				.map((m, i) => `${i + 1}. [${m.type}] ${m.content.slice(0, 300)}`)
				.join("\n")
		},
	})
}
