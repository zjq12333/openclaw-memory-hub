import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { MemoryStorage } from "../storage.ts"
import type { MemoryHubConfig } from "../config.ts"

export function registerListTool(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	config: MemoryHubConfig
) {
	api.registerTool({
		name: "memory_list",
		description: "List all memories or memories in a specific category",
		inputSchema: {
			type: "object",
			properties: {
				category: {
					type: "string",
					enum: ["decisions", "projects", "knowledge"],
					description: "Category to list (optional, lists all if not specified)",
				},
			},
		},
		handler: async (args: { category?: string }) => {
			const memories = await storage.listMemories(args.category)

			if (memories.length === 0) {
				return "No memories found."
			}

			return memories
				.map((m, i) => `${i + 1}. [${m.type}] ${m.id}: ${m.content.slice(0, 100)}...`)
				.join("\n")
		},
	})
}
