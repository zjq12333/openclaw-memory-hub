/**
 * 本地向量嵌入服务
 * 使用 Ollama nomic-embed-text 模型
 * 零 Token 消耗，完全本地运行
 */

export interface EmbeddingResult {
	embedding: number[]
	dimensions: number
	model: string
}

export interface OllamaEmbedConfig {
	baseUrl: string
	model: string
	timeout: number
}

const DEFAULT_CONFIG: OllamaEmbedConfig = {
	baseUrl: "http://localhost:11434",
	model: "nomic-embed-text",
	timeout: 30000,
}

/**
 * 调用 Ollama API 生成向量嵌入
 */
export async function generateEmbedding(
	text: string,
	config: Partial<OllamaEmbedConfig> = {}
): Promise<EmbeddingResult | null> {
	const { baseUrl, model, timeout } = { ...DEFAULT_CONFIG, ...config }

	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), timeout)

		const response = await fetch(`${baseUrl}/api/embeddings`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model,
				prompt: text,
			}),
			signal: controller.signal,
		})

		clearTimeout(timeoutId)

		if (!response.ok) {
			console.error(`[Embedding] Ollama API error: ${response.status}`)
			return null
		}

		const data = await response.json() as { embedding?: number[] }
		
		if (!data.embedding) {
			console.error("[Embedding] No embedding in response")
			return null
		}
		
		return {
			embedding: data.embedding,
			dimensions: data.embedding.length,
			model,
		}
	} catch (error) {
		if ((error as Error).name === "AbortError") {
			console.error("[Embedding] Ollama timeout")
		} else {
			console.error("[Embedding] Error:", error)
		}
		return null
	}
}

/**
 * 批量生成向量嵌入
 */
export async function generateEmbeddings(
	texts: string[],
	config: Partial<OllamaEmbedConfig> = {}
): Promise<(EmbeddingResult | null)[]> {
	return Promise.all(texts.map((text) => generateEmbedding(text, config)))
}

/**
 * 计算余弦相似度
 */
export function cosineSimilarity(a: number[], b: number[]): number {
	if (a.length !== b.length) return 0

	let dotProduct = 0
	let normA = 0
	let normB = 0

	for (let i = 0; i < a.length; i++) {
		dotProduct += a[i] * b[i]
		normA += a[i] * a[i]
		normB += b[i] * b[i]
	}

	if (normA === 0 || normB === 0) return 0
	return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB))
}

/**
 * 检查 Ollama 是否可用
 */
export async function checkOllamaAvailable(
	config: Partial<OllamaEmbedConfig> = {}
): Promise<boolean> {
	const { baseUrl } = { ...DEFAULT_CONFIG, ...config }

	try {
		const response = await fetch(`${baseUrl}/api/tags`, {
			method: "GET",
			signal: AbortSignal.timeout(5000),
		})
		return response.ok
	} catch {
		return false
	}
}

/**
 * 获取可用的嵌入模型列表
 */
export async function getAvailableModels(
	config: Partial<OllamaEmbedConfig> = {}
): Promise<string[]> {
	const { baseUrl } = { ...DEFAULT_CONFIG, ...config }

	try {
		const response = await fetch(`${baseUrl}/api/tags`, {
			method: "GET",
			signal: AbortSignal.timeout(5000),
		})

		if (!response.ok) return []

		const data = await response.json() as { models?: Array<{ name: string }> }
		return (data.models || []).map((m) => m.name)
	} catch {
		return []
	}
}
