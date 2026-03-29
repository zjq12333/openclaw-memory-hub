import { homedir } from "os"
import { join } from "path"

export interface MemoryHubConfig {
	storagePath: string
	autoRecall: boolean
	autoCapture: boolean
	captureInterval: number
	obsidianSync: boolean
	obsidianVault?: string
	vectorSearch: boolean
	maxRecallResults: number
	recallThreshold: number
}

const DEFAULTS: MemoryHubConfig = {
	storagePath: "~/memory",
	autoRecall: true,
	autoCapture: true,
	captureInterval: 5,
	obsidianSync: false,
	vectorSearch: false,
	maxRecallResults: 3,
	recallThreshold: 0.7,
}

export function parseConfig(raw: Record<string, unknown>): MemoryHubConfig {
	const config = { ...DEFAULTS, ...raw }

	// Expand ~ to home directory
	if (config.storagePath.startsWith("~/")) {
		config.storagePath = join(homedir(), config.storagePath.slice(2))
	}

	if (config.obsidianVault?.startsWith("~/")) {
		config.obsidianVault = join(homedir(), config.obsidianVault.slice(2))
	}

	return config
}
