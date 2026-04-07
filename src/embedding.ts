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

/**
 * 图片描述结果
 */
export interface ImageDescriptionResult {
	description: string
	model: string
	success: boolean
}

/**
 * 使用多模态VLM模型生成图片描述
 * 用于将图片内容转换为文本，存入记忆以便搜索
 */
export async function generateImageDescription(
	base64Image: string,
	prompt: string = "请详细描述这张图片的内容，包括文字、图表、界面、物体等所有可见信息。",
	config: {
		baseUrl: string
		model: string
		timeout?: number
	}
): Promise<ImageDescriptionResult> {
	const { baseUrl, model, timeout = 60000 } = config

	try {
		const controller = new AbortController()
		const timeoutId = setTimeout(() => controller.abort(), timeout)

		// Ollama generate API for vision models
		const response = await fetch(`${baseUrl}/api/generate`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				model,
				prompt,
				images: [base64Image],
				stream: false,
			}),
			signal: controller.signal,
		})

		clearTimeout(timeoutId)

		if (!response.ok) {
			console.error(`[Vision] Ollama API error: ${response.status}`)
			return { description: "", model, success: false }
		}

		const data = await response.json() as { response?: string }
		
		if (!data.response) {
			console.error("[Vision] No response in output")
			return { description: "", model, success: false }
		}
		
		return {
			description: data.response.trim(),
			model,
			success: true,
		}
	} catch (error) {
		if ((error as Error).name === "AbortError") {
			console.error("[Vision] Ollama timeout")
		} else {
			console.error("[Vision] Error:", error)
		}
		return { description: "", model, success: false }
	}
}
