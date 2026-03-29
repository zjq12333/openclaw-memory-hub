import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import type { MemoryStorage, Memory } from "../storage.ts"
import type { MemoryHubConfig } from "../config.ts"

export function registerStoreTool(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	config: MemoryHubConfig
) {
	api.registerTool({
		name: "memory_store",
		description: "Manually store a memory",
		inputSchema: {
			type: "object",
			properties: {
				type: {
					type: "string",
					enum: ["task", "decision", "project", "preference", "fact"],
					description: "Type of memory",
				},
				content: {
					type: "string",
					description: "Memory content",
				},
				category: {
					type: "string",
					enum: ["decisions", "projects", "knowledge"],
					description: "Archive category (for non-task memories)",
				},
			},
			required: ["type", "content"],
		},
		handler: async (args: {
			type: Memory["type"]
			content: string
			category?: "decisions" | "projects" | "knowledge"
		}) => {
			const now = new Date().toISOString()
			const memory: Memory = {
				id: `${args.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
				type: args.type,
				content: args.content,
				createdAt: now,
				updatedAt: now,
			}

			if (args.type === "task") {
				const current = await storage.loadCoreBlock("active_tasks")
				const lines = current.split("\n")
				const pendingIdx = lines.findIndex((l) => l.startsWith("## Pending"))
				if (pendingIdx >= 0) {
					lines.splice(pendingIdx + 1, 0, `- ${args.content.slice(0, 100)}`)
					await storage.updateCoreBlock("active_tasks", lines.join("\n"))
				}
				return `Task stored: ${args.content.slice(0, 100)}`
			}

			const category = args.category ?? "knowledge"
			await storage.storeMemory(category, memory)
			return `Memory stored in ${category}: ${args.content.slice(0, 100)}`
		},
	})
}
