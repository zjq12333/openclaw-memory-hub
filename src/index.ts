import type { OpenClawPluginApi } from "openclaw/plugin-sdk"
import { parseConfig, type MemoryHubConfig } from "./config.ts"
import { MemoryStorage } from "./storage.ts"
import { buildRecallHandler } from "./recall.ts"
import { buildCaptureHandler } from "./capture.ts"
import { registerRecallTool } from "./tools/recall.ts"
import { registerStoreTool } from "./tools/store.ts"
import { registerForgetTool } from "./tools/forget.ts"
import { registerListTool } from "./tools/list.ts"
import { registerStatusCommand } from "./commands/status.ts"

export type { MemoryHubConfig }

export default {
	id: "openclaw-memory-hub",
	name: "Memory Hub",
	description: "Lightweight, token-optimized memory system",
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
			vectorSearch: { type: "boolean", default: false },
			maxRecallResults: { type: "number", default: 3 },
			recallThreshold: { type: "number", default: 0.7 },
		},
		required: [],
	},

	register(api: OpenClawPluginApi) {
		const config = parseConfig(api.pluginConfig)
		const storage = new MemoryStorage(config.storagePath)

		// Register memory tools
		registerRecallTool(api, storage, config)
		registerStoreTool(api, storage, config)
		registerForgetTool(api, storage, config)
		registerListTool(api, storage, config)

		// Register CLI commands
		registerStatusCommand(api, storage, config)

		// Auto-Recall: before each AI turn
		if (config.autoRecall) {
			const recallHandler = buildRecallHandler(storage, config)
			api.on("before_agent_start", recallHandler)
		}

		// Auto-Capture: after AI turn (batched)
		if (config.autoCapture) {
			const captureHandler = buildCaptureHandler(storage, config)
			api.on("agent_end", captureHandler)
		}

		// Obsidian sync (optional)
		if (config.obsidianSync && config.obsidianVault) {
			api.on("agent_end", async (event, ctx) => {
				const { syncToObsidian } = await import("./obsidian.ts")
				return syncToObsidian(storage, config.obsidianVault!, event)
			})
		}

		api.registerService({
			id: "openclaw-memory-hub",
			start: () => {
				api.logger.info("memory-hub: initialized")
				storage.ensureStructure()
			},
			stop: () => {
				api.logger.info("memory-hub: stopped")
			},
		})
	},
}
