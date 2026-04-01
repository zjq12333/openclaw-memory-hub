/**
 * 向量搜索服务
 * 使用本地 Ollama 进行语义搜索
 */

import { generateEmbedding, cosineSimilarity, checkOllamaAvailable } from "./embedding.js"
import type { Memory } from "./storage-sqlite.js"
import { calculateDecayScore, classifyMemoryTier } from "./lifecycle.js"

export interface SearchResult {
	memory: Memory
	score: number
	vectorScore: number
	decayBoost: number
	tier: string
}

export interface VectorSearchConfig {
	ollamaBaseUrl: string
	ollamaModel: string
	minScore: number
	maxResults: number
	useDecayBoost: boolean
	tierPriority: Record<string, number>
}

const DEFAULT_SEARCH_CONFIG: VectorSearchConfig = {
	ollamaBaseUrl: "http://localhost:11434",
	ollamaModel: "nomic-embed-text",
	minScore: 0.3,
	maxResults: 10,
	useDecayBoost: true,
	tierPriority: {
		core: 1.2,
		working: 1.0,
		peripheral: 0.8,
	},
}

/**
 * 向量搜索类
 */
export class VectorSearch {
	private config: VectorSearchConfig
	private embeddingCache: Map<string, number[]> = new Map()
	private isAvailable: boolean | null = null

	constructor(config: Partial<VectorSearchConfig> = {}) {
		this.config = { ...DEFAULT_SEARCH_CONFIG, ...config }
	}

	/**
	 * 检查服务是否可用
	 */
	async checkAvailable(): Promise<boolean> {
		if (this.isAvailable !== null) return this.isAvailable
		
		this.isAvailable = await checkOllamaAvailable({
			baseUrl: this.config.ollamaBaseUrl,
		})
		
		return this.isAvailable
	}

	/**
	 * 搜索记忆
	 */
	async search(
		query: string,
		memories: Memory[],
		options: Partial<VectorSearchConfig> = {}
	): Promise<SearchResult[]> {
		const config = { ...this.config, ...options }

		// 检查 Ollama 是否可用
		if (!(await this.checkAvailable())) {
			console.warn("[VectorSearch] Ollama not available, falling back to keyword search")
			return this.keywordSearch(query, memories, config)
		}

		// 生成查询向量
		const queryEmbedding = await generateEmbedding(query, {
			baseUrl: config.ollamaBaseUrl,
			model: config.ollamaModel,
		})

		if (!queryEmbedding) {
			return this.keywordSearch(query, memories, config)
		}

		// 计算每个记忆的相似度
		const results: SearchResult[] = []

		for (const memory of memories) {
			// 获取或生成记忆向量
			const memoryEmbedding = await this.getMemoryEmbedding(memory, config)
			
			if (!memoryEmbedding) continue

			// 计算向量相似度
			const vectorScore = cosineSimilarity(queryEmbedding.embedding, memoryEmbedding)

			// 应用衰减加成
			let decayBoost = 0
			if (config.useDecayBoost) {
				const decayScore = calculateDecayScore(memory)
				decayBoost = (decayScore - 0.5) * 0.2 // -0.1 to +0.1
			}

			// 应用分层优先级
			const tier = classifyMemoryTier(memory)
			const tierBoost = config.tierPriority[tier] || 1.0

			// 最终分数
			const finalScore = (vectorScore + decayBoost) * tierBoost

			if (finalScore >= config.minScore) {
				results.push({
					memory,
					score: finalScore,
					vectorScore,
					decayBoost,
					tier,
				})
			}
		}

		// 按分数排序
		results.sort((a, b) => b.score - a.score)

		// 返回前 N 个结果
		return results.slice(0, config.maxResults)
	}

	/**
	 * 关键词搜索（降级方案）
	 */
	private keywordSearch(
		query: string,
		memories: Memory[],
		config: VectorSearchConfig
	): SearchResult[] {
		const queryLower = query.toLowerCase()
		const queryTerms = queryLower.split(/\s+/).filter((t) => t.length > 1)

		const results: SearchResult[] = []

		for (const memory of memories) {
			const contentLower = memory.content.toLowerCase()
			const titleLower = (memory.title || "").toLowerCase()

			// 计算关键词匹配分数
			let matchCount = 0
			for (const term of queryTerms) {
				if (contentLower.includes(term) || titleLower.includes(term)) {
					matchCount++
				}
			}

			if (matchCount === 0) continue

			const vectorScore = matchCount / queryTerms.length

			// 应用衰减加成
			let decayBoost = 0
			if (config.useDecayBoost) {
				const decayScore = calculateDecayScore(memory)
				decayBoost = (decayScore - 0.5) * 0.2
			}

			// 应用分层优先级
			const tier = classifyMemoryTier(memory)
			const tierBoost = config.tierPriority[tier] || 1.0

			const finalScore = (vectorScore + decayBoost) * tierBoost

			if (finalScore >= config.minScore) {
				results.push({
					memory,
					score: finalScore,
					vectorScore,
					decayBoost,
					tier,
				})
			}
		}

		results.sort((a, b) => b.score - a.score)
		return results.slice(0, config.maxResults)
	}

	/**
	 * 获取记忆的向量（带缓存）
	 */
	private async getMemoryEmbedding(
		memory: Memory,
		config: VectorSearchConfig
	): Promise<number[] | null> {
		// 检查缓存
		if (this.embeddingCache.has(memory.id)) {
			return this.embeddingCache.get(memory.id)!
		}

		// 生成向量
		const text = `${memory.title || ""}\n${memory.content}`
		const result = await generateEmbedding(text, {
			baseUrl: config.ollamaBaseUrl,
			model: config.ollamaModel,
		})

		if (!result) return null

		// 缓存结果
		this.embeddingCache.set(memory.id, result.embedding)

		return result.embedding
	}

	/**
	 * 预加载记忆向量（批量）
	 */
	async preloadEmbeddings(
		memories: Memory[],
		config: Partial<VectorSearchConfig> = {}
	): Promise<number> {
		const finalConfig = { ...this.config, ...config }
		let loaded = 0

		for (const memory of memories) {
			if (this.embeddingCache.has(memory.id)) continue

			const embedding = await this.getMemoryEmbedding(memory, finalConfig)
			if (embedding) loaded++
		}

		return loaded
	}

	/**
	 * 清除向量缓存
	 */
	clearCache(): void {
		this.embeddingCache.clear()
	}

	/**
	 * 获取缓存大小
	 */
	getCacheSize(): number {
		return this.embeddingCache.size
	}
}
