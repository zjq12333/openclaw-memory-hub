import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { Type } from "@sinclair/typebox"
import type { MemoryStorage } from "../storage-sqlite.js"
import type { MemoryHubConfig } from "../config.js"

export function registerRecallTool(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	config: MemoryHubConfig
) {
	api.registerTool(
		{
			name: "memory_recall",
			label: "Memory Recall",
			description: "Search archived memories by query",
			parameters: Type.Object({
				query: Type.String({ description: "Search query" }),
				limit: Type.Optional(
					Type.Number({ description: "Maximum results to return", default: config.maxRecallResults })
				),
			}),
			async execute(_toolCallId: string, params: { query: string; limit?: number }) {
				const results = await storage.searchArchive(params.query, {
					limit: params.limit ?? config.maxRecallResults,
					threshold: config.recallThreshold,
				})

				if (results.length === 0) {
					return {
						content: [{ type: "text" as const, text: "No matching memories found." }],
						details: { count: 0 },
					}
				}

				const text = results
					.map((m, i) => `${i + 1}. [${m.type}] ${m.content.slice(0, 300)}`)
					.join("\n")

				return {
					content: [{ type: "text" as const, text: `Found ${results.length} memories:\n\n${text}` }],
					details: { count: results.length },
				}
			},
		},
		{ name: "memory_recall" }
	)
}
