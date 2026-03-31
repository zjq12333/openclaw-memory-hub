import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { Type } from "@sinclair/typebox"
import type { MemoryStorage } from "../storage-sqlite.js"
import type { MemoryHubConfig } from "../config.js"

export function registerForgetTool(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	_config: MemoryHubConfig
) {
	api.registerTool(
		{
			name: "memory_forget",
			label: "Memory Forget",
			description: "Delete a memory by ID",
			parameters: Type.Object({
				id: Type.String({ description: "Memory ID to delete" }),
				category: Type.Union([
					Type.Literal("decisions"),
					Type.Literal("projects"),
					Type.Literal("knowledge"),
				], { description: "Category to delete from" }),
			}),
			async execute(_toolCallId: string, params: { id: string; category: string }) {
				const success = await storage.deleteMemory(params.category, params.id)
				if (success) {
					return {
						content: [{ type: "text" as const, text: `Memory ${params.id} deleted from ${params.category}.` }],
						details: { id: params.id, deleted: true },
					}
				}
				return {
					content: [{ type: "text" as const, text: `Memory ${params.id} not found in ${params.category}.` }],
					details: { id: params.id, deleted: false },
				}
			},
		},
		{ name: "memory_forget" }
	)
}
