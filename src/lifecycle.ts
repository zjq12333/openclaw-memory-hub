/**
 * 记忆生命周期管理
 * 自动衰减 + 三层分层（Core/Working/Peripheral）
 */

import type { Memory } from "./storage-sqlite.js"
import type { MemoryHubConfig } from "./config.js"

export type MemoryTier = "core" | "working" | "peripheral"

export interface MemoryLifecycle {
	tier: MemoryTier
	decayScore: number
	accessBoost: number
	ageInDays: number
	lastAccessedDays: number
}

// 默认衰减配置
const DEFAULT_DECAY_CONFIG = {
	// 半衰期（天）
	halfLifeDays: 30,
	
	// 访问频率加成
	accessBoostFactor: 0.1,
	maxAccessBoost: 0.3,
	
	// 分层阈值
	coreImportanceThreshold: 0.8,
	coreAccessThreshold: 10,
	workingImportanceThreshold: 0.5,
	workingAccessThreshold: 3,
}

// 当前衰减配置
let currentDecayConfig = { ...DEFAULT_DECAY_CONFIG }

// 计算衰减系数（基于半衰期动态更新）
function updateDecayLambda() {
	// @ts-ignore
	currentDecayConfig.decayLambda = Math.LN2 / currentDecayConfig.halfLifeDays
}

// 初始化衰减系数
updateDecayLambda()

/**
 * 计算记忆衰减分数
 * 基于时间衰减 + 访问频率加成
 */
export function calculateDecayScore(memory: Memory): number {
	const now = Date.now()
	const createdAt = new Date(memory.createdAt).getTime()
	const ageInDays = (now - createdAt) / (1000 * 60 * 60 * 24)
	
	// 基础衰减：指数衰减
	// @ts-ignore
	const baseDecay = Math.exp(-currentDecayConfig.decayLambda * ageInDays)
	
	// 访问频率加成
	const accessCount = (memory as any).accessCount || 0
	const accessBoost = Math.min(
		currentDecayConfig.maxAccessBoost,
		Math.log10(accessCount + 1) * currentDecayConfig.accessBoostFactor
	)
	
	// 重要性加成
	const importance = memory.importance || 0.5
	const importanceBoost = (importance - 0.5) * 0.2
	
	// 最终分数
	const finalScore = Math.min(1, Math.max(0, baseDecay + accessBoost + importanceBoost))
	
	return finalScore
}

/**
 * 判断记忆分层
 */
export function classifyMemoryTier(memory: Memory): MemoryTier {
	const importance = memory.importance || 0.5
	const accessCount = (memory as any).accessCount || 0
	const decayScore = calculateDecayScore(memory)
	
	// Core: 高重要性 + 高访问
	if (
		importance >= currentDecayConfig.coreImportanceThreshold &&
		accessCount >= currentDecayConfig.coreAccessThreshold
	) {
		return "core"
	}
	
	// Core: 高衰减分数（长期保持重要）
	if (decayScore >= 0.8) {
		return "core"
	}
	
	// Working: 中等重要性或中等访问
	if (
		importance >= currentDecayConfig.workingImportanceThreshold ||
		accessCount >= currentDecayConfig.workingAccessThreshold
	) {
		return "working"
	}
	
	// Peripheral: 其他
	return "peripheral"
}

/**
 * 获取完整的记忆生命周期信息
 */
export function getMemoryLifecycle(memory: Memory): MemoryLifecycle {
	const now = Date.now()
	const createdAt = new Date(memory.createdAt).getTime()
	const lastAccessed = ((memory as any).lastAccessed as string)
		? new Date((memory as any).lastAccessed as string).getTime()
		: createdAt
	
	const ageInDays = (now - createdAt) / (1000 * 60 * 60 * 24)
	const lastAccessedDays = (now - lastAccessed) / (1000 * 60 * 60 * 24)
	
	const accessCount = (memory as any).accessCount || 0
	const accessBoost = Math.min(
		currentDecayConfig.maxAccessBoost,
		Math.log10(accessCount + 1) * currentDecayConfig.accessBoostFactor
	)
	
	return {
		tier: classifyMemoryTier(memory),
		decayScore: calculateDecayScore(memory),
		accessBoost,
		ageInDays,
		lastAccessedDays,
	}
}

/**
 * 批量更新记忆衰减分数
 */
export function updateDecayScores(memories: Memory[]): Map<string, number> {
	const scores = new Map<string, number>()
	
	for (const memory of memories) {
		scores.set(memory.id, calculateDecayScore(memory))
	}
	
	return scores
}

/**
 * 过滤应该保留的记忆
 */
export function filterMemoriesToKeep(
	memories: Memory[],
	threshold = 0.2
): Memory[] {
	return memories.filter((memory) => {
		const decayScore = calculateDecayScore(memory)
		
		// Core 记忆永远保留
		if (classifyMemoryTier(memory) === "core") {
			return true
		}
		
		// 衰减分数低于阈值的记忆可以删除
		return decayScore >= threshold
	})
}

/**
 * 获取记忆统计
 */
export function getMemoryStats(memories: Memory[]): {
	total: number
	core: number
	working: number
	peripheral: number
	avgDecayScore: number
} {
	let core = 0
	let working = 0
	let peripheral = 0
	let totalDecay = 0
	
	for (const memory of memories) {
		const tier = classifyMemoryTier(memory)
		if (tier === "core") core++
		else if (tier === "working") working++
		else peripheral++
		
		totalDecay += calculateDecayScore(memory)
	}
	
	return {
		total: memories.length,
		core,
		working,
		peripheral,
		avgDecayScore: memories.length > 0 ? totalDecay / memories.length : 0,
	}
}

/**
 * 清理过期记忆
 * 移除衰减分数低于阈值的非Core记忆
 */
export function cleanupExpiredMemories(
	memories: Memory[],
	threshold = 0.2
): string[] {
	const toRemove: string[] = []
	
	for (const memory of memories) {
		const tier = classifyMemoryTier(memory)
		
		// Core 记忆永远保留
		if (tier === "core") continue
		
		const decayScore = calculateDecayScore(memory)
		if (decayScore < threshold) {
			toRemove.push(memory.id)
		}
	}
	
	return toRemove
}

/**
 * 初始化衰减配置
 */
export function initDecayConfig(config: MemoryHubConfig) {
	if (config.decayHalfLifeDays) {
		currentDecayConfig.halfLifeDays = config.decayHalfLifeDays
		updateDecayLambda()
	}
}

/**
 * 导出配置（可自定义）
 */
export function getDecayConfig() {
	return { ...currentDecayConfig }
}

export function setDecayConfig(config: Partial<typeof DEFAULT_DECAY_CONFIG>) {
	Object.assign(currentDecayConfig, config)
	updateDecayLambda()
}
