import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { MemoryStorage } from "../storage.ts"
import type { MemoryHubConfig } from "../config.ts"

export function registerForgetTool(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	config: MemoryHubConfig
) {
	api.registerTool({
		name: "memory_forget",
		description: "Delete a memory by ID or search query",
		inputSchema: {
			type: "object",
			properties: {
				id: {
					type: "string",
					description: "Memory ID to delete",
				},
				category: {
					type: "string",
					enum: ["decisions", "projects", "knowledge"],
					description: "Category to delete from",
				},
			},
			required: ["id", "category"],
		},
		handler: async (args: { id: string; category: string }) => {
			const success = await storage.deleteMemory(args.category, args.id)
			if (success) {
				return `Memory ${args.id} deleted from ${args.category}.`
			}
			return `Memory ${args.id} not found in ${args.category}.`
		},
	})
}
