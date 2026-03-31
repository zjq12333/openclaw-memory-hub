import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { Type } from "@sinclair/typebox"
import type { MemoryStorage, Memory } from "../storage-sqlite.js"
import type { MemoryHubConfig } from "../config.js"

export function registerStoreTool(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	config: MemoryHubConfig
) {
	api.registerTool(
		{
			name: "memory_store",
			label: "Memory Store",
			description: "Manually store a memory",
			parameters: Type.Object({
				type: Type.Union([
					Type.Literal("task"),
					Type.Literal("decision"),
					Type.Literal("project"),
					Type.Literal("preference"),
					Type.Literal("fact"),
				], { description: "Type of memory" }),
				content: Type.String({ description: "Memory content" }),
				category: Type.Optional(
					Type.Union([
						Type.Literal("decisions"),
						Type.Literal("projects"),
						Type.Literal("knowledge"),
					], { description: "Archive category (for non-task memories)" })
				),
			}),
			async execute(_toolCallId: string, params: {
				type: Memory["type"]
				content: string
				category?: "decisions" | "projects" | "knowledge"
			}) {
				const now = new Date().toISOString()
				const memory: Memory = {
					id: `${params.type}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
					type: params.type,
					content: params.content,
					createdAt: now,
					updatedAt: now,
				}

				if (params.type === "task") {
					const current = await storage.loadCoreBlock("active_tasks")
					const lines = current.split("\n")
					const pendingIdx = lines.findIndex((l) => l.startsWith("## Pending"))
					if (pendingIdx >= 0) {
						lines.splice(pendingIdx + 1, 0, `- ${params.content.slice(0, 100)}`)
						await storage.updateCoreBlock("active_tasks", lines.join("\n"))
					}
					// Also store in SQLite
					await storage.storeMemory({ ...memory, category: "tasks" })
					return {
						content: [{ type: "text" as const, text: `Task stored: ${params.content.slice(0, 100)}` }],
						details: { type: "task" },
					}
				}

				const category = params.category ?? "knowledge"
				await storage.storeMemory({ ...memory, category })
				return {
					content: [{ type: "text" as const, text: `Memory stored in ${category}: ${params.content.slice(0, 100)}` }],
					details: { type: params.type, category },
				}
			},
		},
		{ name: "memory_store" }
	)
}
