// 初始化 Memory Hub SQLite 数据库（使用 sql.js）
import { readFile, writeFile, access } from "fs/promises"
import { join, dirname } from "path"
import { homedir } from "os"
import { fileURLToPath } from "url"

const __dirname = dirname(fileURLToPath(import.meta.url))

const DB_PATH = "D:\\openclaw-workspace\\memory\\memory.db"
const SQL_PATH = join(__dirname, "..", "memory.db.sql")

async function initDatabase() {
  console.log("Initializing Memory Hub database...")
  console.log("Database path:", DB_PATH)

  // 动态导入 sql.js
  const initSqlJs = (await import("sql.js")).default
  const SQL = await initSqlJs()

  // 尝试加载现有数据库
  let db: Awaited<ReturnType<typeof initSqlJs>>["Database"]["prototype"]
  try {
    const buffer = await readFile(DB_PATH)
    db = new SQL.Database(buffer)
    console.log("Loaded existing database")
  } catch {
    db = new SQL.Database()
    console.log("Created new database")
  }

  // 读取 SQL 文件
  const sql = await readFile(SQL_PATH, "utf-8")

  // 执行 SQL（分割成多个语句）
  const statements = sql
    .split(";")
    .map((s) => s.trim())
    .filter((s) => s.length > 0)

  for (const statement of statements) {
    try {
      db.run(statement + ";")
    } catch (err) {
      // 忽略 "already exists" 错误
      if (!String(err).includes("already exists")) {
        console.error("SQL Error:", String(err).slice(0, 100))
      }
    }
  }

  // 验证表是否创建成功
  const tables = db.exec(
    "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
  )
  if (tables.length > 0) {
    console.log(
      "\nCreated tables:",
      tables[0].values.map((v) => v[0]).join(", ")
    )
  }

  // 插入初始数据
  const now = new Date().toISOString()

  // 插入当前任务
  db.run(
    `INSERT OR REPLACE INTO memories (id, type, category, title, content, importance, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "task-feishu-ceo-render",
      "task",
      "tasks",
      "飞书CEO视频渲染",
      "执行飞书CEO机器人宣传视频渲染，项目路径: D:\\RemotionProjects\\feishu-ceo-promotion",
      0.9,
      now,
      now,
    ]
  )

  db.run(
    `INSERT OR REPLACE INTO tasks (id, title, description, status, priority, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      "task-feishu-ceo-render",
      "飞书CEO视频渲染",
      "执行 npx remotion render src/index.ts feishu-ceo-promo out/feishu-ceo-promo.mp4",
      "pending",
      3,
      now,
    ]
  )

  // 插入用户偏好
  db.run(
    `INSERT OR REPLACE INTO user_preferences (preference_type, preference_key, preference_value, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ["communication_style", "language", "chinese", 0.9, now, now]
  )
  db.run(
    `INSERT OR REPLACE INTO user_preferences (preference_type, preference_key, preference_value, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ["communication_style", "tone", "concise", 0.8, now, now]
  )
  db.run(
    `INSERT OR REPLACE INTO user_preferences (preference_type, preference_key, preference_value, confidence, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    ["response_length", "preferred", "medium", 0.7, now, now]
  )

  // 插入实体
  db.run(
    `INSERT OR REPLACE INTO entities (id, name, type, description, mention_count)
     VALUES (?, ?, ?, ?, ?)`,
    ["entity-feishu", "飞书", "organization", "字节跳动旗下企业协作平台", 1]
  )
  db.run(
    `INSERT OR REPLACE INTO entities (id, name, type, description, mention_count)
     VALUES (?, ?, ?, ?, ?)`,
    ["entity-remotion", "Remotion", "technology", "React 视频制作框架", 1]
  )
  db.run(
    `INSERT OR REPLACE INTO entities (id, name, type, description, mention_count)
     VALUES (?, ?, ?, ?, ?)`,
    ["entity-openclaw", "OpenClaw", "technology", "AI Agent 框架", 1]
  )

  // 更新统计
  db.run(
    "UPDATE plugin_state SET value = datetime('now') WHERE key = 'last_maintenance'"
  )

  const memoryCount = db.exec("SELECT COUNT(*) as count FROM memories")
  const count = memoryCount[0]?.values[0]?.[0] || 0
  db.run(
    "UPDATE plugin_state SET value = ? WHERE key = 'total_memories'",
    [String(count)]
  )

  // 保存数据库
  const data = db.export()
  const buffer = Buffer.from(data)
  await writeFile(DB_PATH, buffer)

  console.log("\n✅ Database initialized successfully!")
  console.log("Total memories:", count)
  console.log("Database saved to:", DB_PATH)

  db.close()
}

initDatabase().catch(console.error)
