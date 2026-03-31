import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { Type } from "@sinclair/typebox"
import type { MemoryStorage } from "../storage-sqlite.js"
import type { MemoryHubConfig } from "../config.js"

export function registerListTool(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	_config: MemoryHubConfig
) {
	api.registerTool(
		{
			name: "memory_list",
			label: "Memory List",
			description: "List all memories or memories in a specific category",
			parameters: Type.Object({
				category: Type.Optional(
					Type.Union([
						Type.Literal("decisions"),
						Type.Literal("projects"),
						Type.Literal("knowledge"),
					], { description: "Category to list (optional, lists all if not specified)" })
				),
			}),
			async execute(_toolCallId: string, params: { category?: string }) {
				const memories = await storage.listMemories(params.category ? { category: params.category } : undefined)

				if (memories.length === 0) {
					return {
						content: [{ type: "text" as const, text: "No memories found." }],
						details: { count: 0 },
					}
				}

				const text = memories
					.map((m, i) => `${i + 1}. [${m.type}] ${m.id}: ${m.content.slice(0, 100)}...`)
					.join("\n")

				return {
					content: [{ type: "text" as const, text: `Found ${memories.length} memories:\n\n${text}` }],
					details: { count: memories.length },
				}
			},
		},
		{ name: "memory_list" }
	)
}
