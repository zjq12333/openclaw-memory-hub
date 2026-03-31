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
	const memoryDir = join(vaultPath, "🧠 Memory")

	// Ensure directory exists
	await mkdir(memoryDir, { recursive: true })

	// Sync active tasks
	const activeTasks = await storage.loadCoreBlock("active_tasks")
	if (activeTasks) {
		await writeFile(join(memoryDir, "Active Tasks.md"), activeTasks)
	}

	// Sync archived memories
	const memories = await storage.listMemories()
	const archiveDir = join(memoryDir, "Archive")
	await mkdir(archiveDir, { recursive: true })

	for (const memory of memories) {
		const categoryDir = join(archiveDir, memory.type === "decision" ? "Decisions" : memory.type === "project" ? "Projects" : "Knowledge")
		await mkdir(categoryDir, { recursive: true })
		await writeFile(join(categoryDir, `${memory.id}.md`), memory.content)
	}
}
