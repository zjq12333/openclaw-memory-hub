import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { Type } from "@sinclair/typebox"
import { parseConfig, type MemoryHubConfig } from "./config.js"
import { MemoryStorage } from "./storage-sqlite.js"
import { buildRecallHandler } from "./recall.js"
import { buildCaptureHandler } from "./capture.js"
import { registerRecallTool } from "./tools/recall.js"
import { registerStoreTool } from "./tools/store.js"
import { registerForgetTool } from "./tools/forget.js"
import { registerListTool } from "./tools/list.js"
import { registerStatsTool } from "./tools/stats.js"
import { registerCommands } from "./commands/status.js"
import { checkOllamaAvailable, getAvailableModels } from "./embedding.js"

export type { MemoryHubConfig }

export default {
	id: "openclaw-memory-hub",
	name: "Memory Hub",
	description: "Lightweight, token-optimized memory system with local vector search (Ollama)",
	kind: "memory" as const,
	configSchema: {
		type: "object",
		properties: {
			storagePath: { type: "string", default: "~/memory" },
			autoRecall: { type: "boolean", default: true },
			autoCapture: { type: "boolean", default: true },
			captureInterval: { type: "number", default: 5 },
			obsidianSync: { type: "boolean", default: false },
			obsidianVault: { type: "string" },
			vectorSearch: { type: "boolean", default: true },
			maxRecallResults: { type: "number", default: 5 },
			recallThreshold: { type: "number", default: 0.5 },
			// 新增：Ollama 配置
			ollamaBaseUrl: { type: "string", default: "http://localhost:11434" },
			ollamaModel: { type: "string", default: "nomic-embed-text" },
			// 新增：生命周期配置
			decayEnabled: { type: "boolean", default: true },
			decayHalfLifeDays: { type: "number", default: 30 },
			// 新增：智能提取配置
			smartExtraction: { type: "boolean", default: false },
			smartExtractionModel: { type: "string" },
			smartExtractionBaseUrl: { type: "string" },
			smartExtractionApiKey: { type: "string" },
		},
		required: [],
	},

	register(api: OpenClawPluginApi) {
		const config = parseConfig(api.pluginConfig || {})
		const storage = new MemoryStorage(config.storagePath)

		// Register memory tools
		registerRecallTool(api, storage, config)
		registerStoreTool(api, storage, config)
		registerForgetTool(api, storage, config)
		registerListTool(api, storage, config)
		registerStatsTool(api, storage, config)

		// Register CLI commands
		registerCommands(api, storage, config)

		// Auto-Recall: before each AI turn
		if (config.autoRecall) {
			const recallHandler = buildRecallHandler(storage, config)
			api.on("before_agent_start", (event, ctx) => {
				void recallHandler(event, ctx)
			})
		}

		// Auto-Capture: after AI turn (batched)
		if (config.autoCapture) {
			const captureHandler = buildCaptureHandler(storage, config)
			api.on("agent_end", captureHandler)
		}

		// Obsidian sync (optional)
		if (config.obsidianSync && config.obsidianVault) {
			api.on("agent_end", async (event) => {
				const { syncToObsidian } = await import("./obsidian.js")
				return syncToObsidian(storage, config.obsidianVault!, event)
			})
		}

		api.registerService({
			id: "openclaw-memory-hub",
			start: async () => {
				api.logger.info("memory-hub: initializing...")
				await storage.ensureStructure()

			// Auto-detect Ollama models if not explicitly configured
			if (config.vectorSearch) {
				const available = await checkOllamaAvailable({
					baseUrl: config.ollamaBaseUrl || "http://localhost:11434",
				})
				if (available) {
					// Get available models
				const models = await getAvailableModels({
						baseUrl: config.ollamaBaseUrl || "http://localhost:11434",
					})

				// Auto-select embedding model if not explicitly configured well
				if (!config.ollamaModel || config.ollamaModel === "nomic-embed-text") {
					// Check if nomic-embed-text is available
					const hasNomic = models.some(m => m.includes("nomic-embed"))
					if (hasNomic) {
						config.ollamaModel = "nomic-embed-text"
						api.logger.info("memory-hub: auto-detected nomic-embed-text for embedding")
					} else if (models.length > 0) {
						// Use the first available embedding-capable model
					config.ollamaModel = models[0]
						api.logger.info(`memory-hub: auto-selected embedding model: ${config.ollamaModel}`)
					}
				}

				// Auto-select smart extraction model if enabled but not configured
				if (config.smartExtraction && !config.smartExtractionModel) {
				// Preference order: qwen3 > qwen2 > llama3 > mistral > any 7B/8B > embedding model
				const preferredOrder = [/qwen.*3/i, /qwen.*2/i, /llama.*3/i, /mistral/i, /.*:?[78]b/i]
				let found = false
				for (const pattern of preferredOrder) {
					const match = models.find(m => pattern.test(m))
					if (match) {
						config.smartExtractionModel = match
						found = true
						break
					}
				}
				if (!found && models.length > 0) {
					// Fall back to embedding model
					config.smartExtractionModel = config.ollamaModel
				}
				config.smartExtractionBaseUrl = config.smartExtractionBaseUrl || config.ollamaBaseUrl
				api.logger.info(`memory-hub: auto-selected extraction model: ${config.smartExtractionModel}`)
			}

				api.logger.info(`memory-hub: Ollama vector search available (embedding: ${config.ollamaModel}, extraction: ${config.smartExtractionModel || "disabled"})`)
			} else {
				api.logger.warn("memory-hub: Ollama not available, falling back to keyword search")
			}
		}

				api.logger.info("memory-hub: initialized successfully")
			},
			stop: () => {
				api.logger.info("memory-hub: stopped")
			},
		})
	},
}
