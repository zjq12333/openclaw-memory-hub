import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { Type } from "@sinclair/typebox"
import type { MemoryStorage, Memory } from "../storage-sqlite.js"
import type { MemoryHubConfig } from "../config.js"
import { VectorSearch } from "../vector-search.js"

export function registerRecallTool(
	api: OpenClawPluginApi,
	storage: MemoryStorage,
	config: MemoryHubConfig
) {
	// Initialize vector search
	const vectorSearch = new VectorSearch({
		ollamaBaseUrl: config.ollamaBaseUrl || "http://localhost:11434",
		ollamaModel: config.ollamaModel || "nomic-embed-text",
		minScore: config.recallThreshold,
		maxResults: config.maxRecallResults,
		useDecayBoost: config.decayEnabled,
	})

	api.registerTool(
		{
			name: "memory_recall",
			label: "Memory Recall",
			description: "Search memories using semantic vector search (Ollama) or keyword fallback",
			parameters: Type.Object({
				query: Type.String({ description: "Search query (supports natural language)" }),
				limit: Type.Optional(
					Type.Number({ description: "Maximum results to return", default: config.maxRecallResults })
				),
				type: Type.Optional(
					Type.String({ description: "Filter by memory type: task, decision, project, fact, preference, team" })
				),
			}),
			async execute(_toolCallId: string, params: { query: string; limit?: number; type?: string }) {
				// Get all memories from storage
				const allMemories = await storage.listMemories(
					params.type ? { type: params.type } : undefined
				)

				if (allMemories.length === 0) {
					return {
						content: [{ type: "text" as const, text: "No memories found in storage." }],
						details: { count: 0 },
					}
				}

				// Use vector search
				const results = await vectorSearch.search(params.query, allMemories, {
					maxResults: params.limit ?? config.maxRecallResults,
					minScore: config.recallThreshold,
				})

				if (results.length === 0) {
					return {
						content: [{ type: "text" as const, text: `No memories matching "${params.query}" (threshold: ${config.recallThreshold})` }],
						details: { count: 0, query: params.query },
					}
				}

				// Format results
				const text = results
					.map((r, i) => {
						const tierEmoji = r.tier === "core" ? "⭐" : r.tier === "working" ? "📝" : "📄"
						return `${i + 1}. ${tierEmoji} [${r.memory.type}] (${(r.score * 100).toFixed(0)}%) ${r.memory.title || r.memory.content.slice(0, 100)}`
					})
					.join("\n")

				// Update access count for recalled memories
				for (const result of results) {
					await storage.touchMemory(result.memory.id)
				}

				return {
					content: [{ type: "text" as const, text: `Found ${results.length} memories:\n\n${text}` }],
					details: {
						count: results.length,
						query: params.query,
						results: results.map((r) => ({
							id: r.memory.id,
							type: r.memory.type,
							score: r.score,
							tier: r.tier,
						})),
					},
				}
			},
		},
		{ name: "memory_recall" }
	)
}
