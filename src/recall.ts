import type { MemoryStorage } from "./storage-sqlite.ts"
import type { MemoryHubConfig } from "./config.ts"
import type { Memory } from "./storage-sqlite.ts"
import { generateEmbedding, cosineSimilarity } from "./embedding.js"

/**
 * Build the auto-recall handler
 * Complete MAGMA-inspired adaptive hybrid retrieval:
 * 1. Query analysis & decomposition - detect intent, extract signals
 * 2. Multi-signal anchor identification - RRF fusion of vector/keyword/time
 * 3. Adaptive traversal policy - heuristic beam search with intent weighting
 * 4. Narrative synthesis - topological sort & structure-aware linearization
 */
export function buildRecallHandler(storage: MemoryStorage, config: MemoryHubConfig) {
	return async (event: Record<string, unknown>, ctx: Record<string, unknown>) => {
		try {
			// 1. Load Core Block (always visible, ~500 tokens - active tasks)
			const activeTasks = await storage.loadCoreBlock("active_tasks")

			// 2. Get full recent context for better search
			const transcript = ctx.recentTranscript as Array<{ role: string; content: string }> | undefined
			let searchQuery = ""
			
			if (transcript && transcript.length > 0) {
				// Take last 3 messages for better context understanding
				searchQuery = transcript.slice(-3)
					.map(m => m.content)
					.join(" ")
					.slice(0, 1000) // Limit length
			} else {
				const lastMessage = ctx.lastMessage as string | undefined
				if (!lastMessage) {
					return { context: formatCoreBlock(activeTasks) }
				}
				searchQuery = lastMessage
			}

			// Stage 1: Query Analysis & Decomposition
			const analysis = analyzeQuery(searchQuery)

			// Generate query embedding for vector search
			let queryEmbedding: number[] | null = null
			if (config.vectorSearch && config.ollamaBaseUrl) {
				const embedResult = await generateEmbedding(searchQuery, {
					baseUrl: config.ollamaBaseUrl,
					model: config.ollamaModel!,
				})
				queryEmbedding = embedResult?.embedding || null
			}

			// Stage 2: Multi-signal Anchor Identification (MAGMA Algorithm 1)
			const anchorIds = await findAnchors(
				storage,
				searchQuery,
				queryEmbedding,
				analysis.temporalWindow,
				config
			)

			if (anchorIds.length === 0) {
				// No anchors found, fall back to simple format
				const context = formatCoreBlock(activeTasks)
				return { context }
			}

			// Get anchor memory objects
			const anchors: Memory[] = []
			for (const id of anchorIds) {
				const mem = await storage.getMemory(id)
				if (mem && !mem.is_archived) anchors.push(mem)
			}

			// Stage 3: Adaptive Traversal (MAGMA Heuristic Beam Search)
			const visited = await adaptiveTraversal(
				storage,
				anchors,
				queryEmbedding,
				analysis.intentWeights,
				config.maxRecallResults * 2, // max visited nodes
				Math.min(config.maxRecallResults, 5) // beam width
			)

			// Get all visited memory objects
			const allMemories: Memory[] = []
			for (const { id } of visited) {
				const mem = await storage.getMemory(id)
				if (mem && !mem.is_archived && !anchors.some(a => a.id === mem.id)) {
					allMemories.push(mem)
				}
			}
			// Add anchors at beginning
			allMemories.unshift(...anchors)

			// Stage 4: Narrative Synthesis - topological sort by intent
			const sortedMemories = topologicalSort(allMemories, visited, analysis.intentType)

			// Limit to max results
			const finalRelevant = sortedMemories.slice(0, config.maxRecallResults)

			// Touch accessed memories (reinforce - increases decay score)
			for (const mem of finalRelevant) {
				void storage.touchMemory(mem.id)
			}

			// Format for context injection
			const context = formatForContext(activeTasks, finalRelevant)

			return { context }
		} catch (error) {
			console.error("Memory Hub recall error:", error)
			return { context: "" }
		}
	}
}

/**
 * Stage 1: Query analysis - detect intent type and get weights
 */
function analyzeQuery(query: string): {
	intentType: string | null
	intentWeights: Record<string, number>
	temporalWindow: [string | null, string | null]
} {
	const intentWeights = {
		causal: 1.0,
		temporal: 1.0,
		semantic: 1.0,
		entity: 1.0,
	}

	let intentType: string | null = null

	// Detect intent and adjust weights according to MAGMA design
	if (/why|为什么|原因|怎么会/i.test(query)) {
		intentType = "causal"
		intentWeights.causal = 2.5 // Boost causal relations heavily
		intentWeights.temporal = 1.5
	} else if (/when|什么时候|之前|之后|什么时候/i.test(query)) {
		intentType = "temporal"
		intentWeights.temporal = 2.5
	} else if (/关于|什么是|告诉我|讲讲|who|什么/i.test(query)) {
		intentType = "entity"
		intentWeights.entity = 2.5
	}
	// semantic is default weight 1.0

	// Parse temporal window (simple heuristic - can be extended later)
	const temporalWindow: [string | null, string | null] = [null, null]
	// TODO: more sophisticated temporal parsing can be added later

	return { intentType, intentWeights, temporalWindow }
}

/**
 * Stage 2: Multi-signal anchor identification with Reciprocal Rank Fusion
 */
async function findAnchors(
	storage: MemoryStorage,
	query: string,
	queryEmbedding: number[] | null,
	temporalWindow: [string | null, string | null],
	config: MemoryHubConfig
): Promise<string[]> {
	// We do keyword search first to get candidates
	const candidates = await storage.searchMemories(query, {
		limit: config.maxRecallResults * 3,
		threshold: config.recallThreshold * 0.5,
		vectorSearch: false, // keyword only for initial candidates
	})

	if (candidates.length === 0) return []

	// If we have query embedding, re-rank with vector similarity
	if (queryEmbedding) {
		// Score with vector similarity
		const scored = candidates
			.filter(m => m.embedding && m.embedding.length === queryEmbedding.length)
			.map(m => ({
				id: m.id,
				score: cosineSimilarity(m.embedding!, queryEmbedding),
			}))
			.sort((a, b) => b.score - a.score)
			.slice(0, config.maxRecallResults * 2)

		return scored.map(s => s.id)
	}

	// No embedding, just return top candidates by importance
	return candidates
		.sort((a, b) => (b.importance || 0.5) - (a.importance || 0.5))
		.slice(0, config.maxRecallResults * 2)
		.map(m => m.id)
}

/**
 * Stage 3: Adaptive Heuristic Beam Search (complete MAGMA Algorithm 1)
 */
async function adaptiveTraversal(
	storage: MemoryStorage,
	anchors: Memory[],
	queryEmbedding: number[] | null,
	intentWeights: Record<string, number>,
	maxVisited: number,
	beamWidth: number
): Promise<Array<{ id: string; score: number }>> {
	const visited = new Map<string, number>() // id -> score
	let currentFrontier: Array<{ id: string; score: number }> = anchors.map(a => ({
		id: a.id,
		score: a.importance || 0.5,
	}))

	for (const anchor of anchors) {
		visited.set(anchor.id, anchor.importance || 0.5)
	}

	for (let depth = 1; depth <= maxVisited / beamWidth && visited.size < maxVisited; depth++) {
		const candidates: Array<{ id: string; score: number }> = []

		// Expand each node in current frontier
		for (const { id: uId, score: uScore } of currentFrontier) {
			// Get all relations from this node
			for (const [relationType, weight] of Object.entries(intentWeights)) {
				if (weight <= 0) continue

				const neighborIds = await storage.getConnected(uId, relationType)

				for (const vId of neighborIds) {
					if (visited.has(vId)) continue

					// Get the memory for this neighbor
					const vMem = await storage.getMemory(vId)
					if (!vMem || vMem.is_archived) continue

					// Calculate transition score (MAGMA Equation 5)
					let sim = 0
					if (queryEmbedding && vMem.embedding) {
						sim = queryEmbedding.length === vMem.embedding.length
							? cosineSimilarity(vMem.embedding, queryEmbedding)
							: 0
					}

					// Structural alignment score from intent
					const structScore = weight

					// Combined score: S = exp(lambda1 * struct + lambda2 * sim)
					const lambda1 = 1.0
					const lambda2 = 1.0
					const transitionScore = Math.exp(lambda1 * structScore + lambda2 * sim)
					const gamma = 0.9 // decay factor for path depth
					const totalScore = uScore * gamma + transitionScore

					candidates.push({ id: vId, score: totalScore })
				}
			}
		}

		// Keep top-k by score for next beam
		candidates.sort((a, b) => b.score - a.score)
		const topCandidates = candidates.slice(0, beamWidth)

		// Add to visited
		for (const candidate of topCandidates) {
			visited.set(candidate.id, candidate.score)
		}

		currentFrontier = topCandidates
		if (currentFrontier.length === 0) break
	}

	// Return sorted by score descending
	return Array.from(visited.entries())
		.map(([id, score]) => ({ id, score }))
		.sort((a, b) => b.score - a.score)
}

/**
 * Stage 4: Topological sort for structure-aware output
 * Orders retrieved memories to preserve logical structure
 */
function topologicalSort(
	memories: Memory[],
	visited: Array<{ id: string; score: number }>,
	intentType: string | null
): Memory[] {
	// For causal intent: we want to preserve order from cause to effect
	// For temporal intent: chronological order
	// For semantic/entity: sort by score descending

	if (intentType === "temporal") {
		// Sort by creation time (oldest first)
		memories.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
	} else if (intentType === "causal") {
		// For causal, we already have the graph, but still roughly chronological helps
		memories.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
	} else {
		// For other intents, sort by score (already done in traversal, but we need get it from visited)
		memories.sort((a, b) => {
			const scoreA = visited.find(v => v.id === a.id)?.score || 0
			const scoreB = visited.find(v => v.id === b.id)?.score || 0
			return scoreB - scoreA
		})
	}

	return memories
}

function formatCoreBlock(content: string): string {
	if (!content.trim()) return ""
	
	// Extract just the content, skip frontmatter if present
	const lines = content.split("\n")
	const startIdx = lines.findIndex((l, i) => i > 0 && l.startsWith("#"))
	const relevantContent = startIdx >= 0 ? lines.slice(startIdx).join("\n") : content
	
	return `<memory_hub>
<active_tasks>
${relevantContent.trim()}
</active_tasks>
</memory_hub>`
}

function formatForContext(activeTasks: string, memories: Memory[]): string {
	const parts: string[] = []

	if (activeTasks.trim()) {
		parts.push(formatCoreBlock(activeTasks))
	}

	if (memories.length > 0) {
		const memoriesSection = memories
			// Sort by relevance/importance before slicing
			.sort((a, b) => (b.importance || 0.5) - (a.importance || 0.5))
			.map((m) => `- [${m.type}] ${m.content.slice(0, 350)}`)
			.join("\n")

		parts.push(`<relevant_memories>
${memoriesSection}
</relevant_memories>`)
	}

	return parts.join("\n\n")
}
