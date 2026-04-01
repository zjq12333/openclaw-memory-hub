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
	// 新增：向量搜索配置
	ollamaBaseUrl?: string
	ollamaModel?: string
	// 新增：生命周期配置
	decayEnabled?: boolean
	decayHalfLifeDays?: number
	// 新增：智能提取配置
	smartExtraction?: boolean
	smartExtractionModel?: string
	smartExtractionBaseUrl?: string
	smartExtractionApiKey?: string
}

const DEFAULTS: MemoryHubConfig = {
	storagePath: "~/memory",
	autoRecall: true,
	autoCapture: true,
	captureInterval: 5,
	obsidianSync: false,
	vectorSearch: true,
	maxRecallResults: 5,
	recallThreshold: 0.5,
	// 新增默认值
	ollamaBaseUrl: "http://localhost:11434",
	ollamaModel: "nomic-embed-text",
	decayEnabled: true,
	decayHalfLifeDays: 30,
	smartExtraction: false, // 默认关闭，使用关键词检测
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
