import type { MemoryStorage } from "./storage-sqlite.js"
import { join, dirname } from "path"
import { mkdir, writeFile } from "fs/promises"

/**
 * Sync memories to Obsidian vault
 */
export async function syncToObsidian(
	storage: MemoryStorage,
	vaultPath: string,
	event: Record<string, unknown>
): Promise<void> {
	const openclawDir = join(vaultPath, "OpenClaw")
	const memoryHubDir = join(openclawDir, "记忆中心")

	// Ensure directory exists
	await mkdir(memoryHubDir, { recursive: true })

	// Sync active tasks
	const activeTasks = await storage.loadCoreBlock("active_tasks")
	if (activeTasks) {
		await writeFile(join(memoryHubDir, "当前活跃任务.md"), activeTasks)
	}

	// Sync archived memories
	const memories = await storage.listMemories()
	const archiveDir = join(memoryHubDir, "归档")
	await mkdir(archiveDir, { recursive: true })

	for (const memory of memories) {
		const categoryDir = join(archiveDir, memory.type === "decision" ? "决策" : memory.type === "project" ? "项目" : "知识")
		await mkdir(categoryDir, { recursive: true })
		await writeFile(join(categoryDir, `${memory.id}.md`), memory.content)
	}
}
