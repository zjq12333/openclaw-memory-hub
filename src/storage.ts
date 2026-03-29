import { mkdir, readFile, writeFile, readdir, stat } from "fs/promises"
import { join, dirname } from "path"
import { homedir } from "os"
import type { MemoryHubConfig } from "./config.ts"

export interface Memory {
	id: string
	type: "task" | "decision" | "project" | "preference" | "fact"
	content: string
	createdAt: string
	updatedAt: string
	metadata?: Record<string, unknown>
}

export class MemoryStorage {
	private basePath: string

	constructor(basePath: string) {
		this.basePath = basePath
	}

	async ensureStructure(): Promise<void> {
		const dirs = [
			this.basePath,
			join(this.basePath, "core"),
			join(this.basePath, "archive"),
			join(this.basePath, "archive", "decisions"),
			join(this.basePath, "archive", "projects"),
			join(this.basePath, "archive", "knowledge"),
			join(this.basePath, "archive", "conversations"),
		]

		for (const dir of dirs) {
			await mkdir(dir, { recursive: true })
		}

		// Create default files if not exist
		const coreBlock = join(this.basePath, "core", "active_tasks.md")
		try {
			await readFile(coreBlock, "utf-8")
		} catch {
			await writeFile(
				coreBlock,
				`# Active Tasks

<!-- This file is auto-updated by Memory Hub -->
<!-- Keep it concise (~500 tokens max) -->

## Pending
- (no active tasks)

## In Progress
- (no tasks in progress)
`
			)
		}

		// Create INDEX.md if not exist
		const indexFile = join(this.basePath, "INDEX.md")
		try {
			await readFile(indexFile, "utf-8")
		} catch {
			await writeFile(
				indexFile,
				`# Memory Hub Index

## Core Blocks
| Block | Purpose | File |
|-------|---------|------|
| active_tasks | Tasks in progress | core/active_tasks.md |

## Archive
| Category | Items | File |
|----------|-------|------|
| decisions | 0 | archive/decisions/INDEX.md |
| projects | 0 | archive/projects/INDEX.md |
| knowledge | 0 | archive/knowledge/INDEX.md |

Last updated: ${new Date().toISOString().split("T")[0]}
`
			)
		}
	}

	// Core Block operations
	async loadCoreBlock(name: string): Promise<string> {
		const file = join(this.basePath, "core", `${name}.md`)
		try {
			return await readFile(file, "utf-8")
		} catch {
			return ""
		}
	}

	async updateCoreBlock(name: string, content: string): Promise<void> {
		const file = join(this.basePath, "core", `${name}.md`)
		await writeFile(file, content)
	}

	// Archive operations
	async storeMemory(
		category: "decisions" | "projects" | "knowledge" | "conversations",
		memory: Memory
	): Promise<void> {
		const dir = join(this.basePath, "archive", category)
		const file = join(dir, `${memory.id}.md`)

		const frontmatter = `---
id: ${memory.id}
type: ${memory.type}
created: ${memory.createdAt}
updated: ${memory.updatedAt}
${memory.metadata ? `metadata: ${JSON.stringify(memory.metadata)}` : ""}
---

`
		await writeFile(file, frontmatter + memory.content)
	}

	async searchArchive(
		query: string,
		options?: { limit?: number; threshold?: number }
	): Promise<Memory[]> {
		// Simple text search for now
		// TODO: Implement vector search when enabled
		const results: Memory[] = []
		const limit = options?.limit ?? 3
		const threshold = options?.threshold ?? 0.7

		const categories = ["decisions", "projects", "knowledge"] as const
		const queryLower = query.toLowerCase()

		for (const category of categories) {
			const dir = join(this.basePath, "archive", category)
			try {
				const files = await readdir(dir)
				for (const file of files) {
					if (!file.endsWith(".md") || file === "INDEX.md") continue

					const content = await readFile(join(dir, file), "utf-8")
					const contentLower = content.toLowerCase()

					// Simple relevance scoring
					const keywords = queryLower.split(/\s+/)
					let score = 0
					for (const kw of keywords) {
						if (contentLower.includes(kw)) score += 0.2
					}

					if (score >= threshold) {
						results.push({
							id: file.replace(".md", ""),
							type: category === "decisions" ? "decision" : category === "projects" ? "project" : "fact",
							content: content.slice(0, 500),
							createdAt: new Date().toISOString(),
							updatedAt: new Date().toISOString(),
							metadata: { score },
						})
					}

					if (results.length >= limit) break
				}
			} catch {
				// Directory doesn't exist yet
			}
		}

		return results.sort((a, b) => (b.metadata?.score as number) - (a.metadata?.score as number)).slice(0, limit)
	}

	async listMemories(category?: string): Promise<Memory[]> {
		const results: Memory[] = []
		const categories = category ? [category] : ["decisions", "projects", "knowledge"]

		for (const cat of categories) {
			const dir = join(this.basePath, "archive", cat)
			try {
				const files = await readdir(dir)
				for (const file of files) {
					if (!file.endsWith(".md") || file === "INDEX.md") continue
					const content = await readFile(join(dir, file), "utf-8")
					results.push({
						id: file.replace(".md", ""),
						type: cat === "decisions" ? "decision" : cat === "projects" ? "project" : "fact",
						content: content.slice(0, 200),
						createdAt: new Date().toISOString(),
						updatedAt: new Date().toISOString(),
					})
				}
			} catch {
				// Directory doesn't exist
			}
		}

		return results
	}

	async deleteMemory(category: string, id: string): Promise<boolean> {
		const file = join(this.basePath, "archive", category, `${id}.md`)
		try {
			const { unlink } = await import("fs/promises")
			await unlink(file)
			return true
		} catch {
			return false
		}
	}

	getBasePath(): string {
		return this.basePath
	}
}
