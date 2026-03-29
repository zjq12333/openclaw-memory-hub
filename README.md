# OpenClaw Memory Hub

**轻量级、Token 优化的 AI 记忆系统**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-blue.svg)](https://openclaw.ai)

## 为什么需要这个？

AI Agent 每次会话都会"失忆"——忘记之前说过的话、做过的决策、进行中的任务。

现有解决方案的问题：
- **Supermemory** — 收费，Token 消耗大（+1500-3000/轮）
- **Letta** — 复杂，需要独立服务器
- **本地文件** — 需要手动管理，无智能召回

**OpenClaw Memory Hub** 的目标：**用最少的 Token 实现有效的记忆**

## 核心特性

| 特性 | 说明 |
|------|------|
| 🧠 **智能记忆** | 自动捕获重要信息，按需召回 |
| 💡 **Token 优化** | 每轮仅增加 300-800 tokens（节省 60-80%） |
| 📁 **本地存储** | 数据在你自己手里，零云端费用 |
| 🔍 **语义搜索** | 按需检索相关记忆（可选向量搜索） |
| 📝 **Obsidian 同步** | 双向同步到你的知识库 |
| ⚡ **零配置** | 开箱即用，无需 API Key |

## 架构设计

### Token 优化策略

```
┌─────────────────────────────────────────────────────────────┐
│                    Token 优化核心原则                         │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. 精简 Core Block                                          │
│     - 只加载 active_tasks（~500 tokens）                     │
│     - 其他 blocks 按需检索，不常驻上下文                       │
│                                                              │
│  2. 智能召回阈值                                              │
│     - 相关性 < 0.7 不召回                                    │
│     - 最多召回 3 条记忆                                       │
│                                                              │
│  3. 记忆压缩                                                 │
│     - 旧对话 → 摘要（1句话代替100句）                         │
│     - 项目历史 → 关键决策列表                                 │
│                                                              │
│  4. 批量捕获                                                 │
│     - 每 5 轮对话提取一次记忆                                 │
│     - 减少 LLM 调用次数                                       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 三层记忆结构

```
┌─────────────────────────────────────────────────────────────┐
│                     Layer 1: Core Block                      │
│                     （始终可见，~500 tokens）                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ active_tasks: 进行中的任务、待办事项                  │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    Layer 2: Archive Memory                   │
│                    （按需检索，无限容量）                      │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ decisions/  │  │ projects/   │  │ knowledge/  │         │
│  │ 决策记录     │  │ 项目历史     │  │ 知识库      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   Layer 3: Obsidian Sync                     │
│                   （可选，双向同步）                           │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ Obsidian Vault/🧠 Memory/ → 可视化管理记忆           │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

## 存储结构

```
~/memory/
├── core/
│   └── active_tasks.md      # 核心块：进行中的任务（~500 tokens）
│
├── archive/
│   ├── decisions/           # 决策记录
│   │   ├── 2026-Q1.md
│   │   └── INDEX.md
│   ├── projects/            # 项目历史
│   │   ├── feishu-ceo-video.md
│   │   └── INDEX.md
│   ├── knowledge/           # 知识库
│   │   └── INDEX.md
│   └── conversations/       # 对话摘要
│       └── 2026-03-30.md
│
├── config.json              # 配置文件
└── INDEX.md                 # 总索引
```

## 工作流程

### Auto-Recall（自动召回）

```typescript
// 每次 AI 回复前
async function autoRecall(context: SessionContext) {
  // 1. 加载 Core Block（始终可见，~500 tokens）
  const activeTasks = await loadCoreBlock('active_tasks')
  
  // 2. 智能检索相关归档记忆
  const query = context.lastMessage
  const relevant = await searchArchive(query, {
    threshold: 0.7,    // 相关性阈值
    limit: 3           // 最多 3 条
  })
  
  // 3. 注入到上下文（总计 ~300-800 tokens）
  return formatForContext(activeTasks, relevant)
}
```

### Auto-Capture（自动捕获）

```typescript
// 每 5 轮对话后批量提取
async function autoCapture(session: Session) {
  if (session.turnCount % 5 !== 0) return
  
  // 1. 提取重要信息（单次 LLM 调用）
  const extracted = await extractMemories(session.recentTranscript)
  
  // 2. 分类存储
  for (const memory of extracted) {
    switch (memory.type) {
      case 'task':
        await updateCoreBlock('active_tasks', memory)
        break
      case 'decision':
        await archiveMemory('decisions', memory)
        break
      case 'project':
        await archiveMemory('projects', memory)
        break
    }
  }
  
  // 3. 同步到 Obsidian（可选）
  if (config.obsidianSync) {
    await syncToObsidian(extracted)
  }
}
```

## 记忆类型

| 类型 | 存储位置 | 示例 |
|------|---------|------|
| `task` | Core Block | "飞书CEO视频待渲染" |
| `decision` | archive/decisions/ | "选择 Remotion 做视频制作" |
| `project` | archive/projects/ | "耐克广告项目完成" |
| `preference` | archive/knowledge/ | "用户喜欢简洁回复" |
| `fact` | archive/knowledge/ | "用户时区是 Asia/Shanghai" |

## Token 消耗对比

| 方案 | 每轮额外 Token | 月费用估算 |
|------|---------------|-----------|
| 无记忆系统 | 0 | $0 |
| Supermemory（默认） | +1500-3000 | $10-30 |
| Letta（full mode） | +2000-4000 | $15-40 |
| Letta（whisper mode） | +500-1000 | $5-15 |
| **Memory Hub（本方案）** | **+300-800** | **$0（本地）** |

## 安装

```bash
# 安装 OpenClaw Plugin
openclaw plugins install openclaw-memory-hub

# 或从源码安装
git clone https://github.com/yourusername/openclaw-memory-hub.git
cd openclaw-memory-hub
npm install
npm run build
openclaw plugins enable .
```

## 配置

```json
// ~/.openclaw/openclaw.json
{
  "plugins": {
    "entries": {
      "openclaw-memory-hub": {
        "enabled": true,
        "config": {
          "storagePath": "~/memory",
          "autoRecall": true,
          "autoCapture": true,
          "captureInterval": 5,
          "obsidianSync": false,
          "obsidianVault": "~/Documents/Obsidian/Main",
          "vectorSearch": false,
          "maxRecallResults": 3,
          "recallThreshold": 0.7
        }
      }
    }
  }
}
```

### 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `storagePath` | string | `~/memory` | 记忆存储路径 |
| `autoRecall` | boolean | `true` | 自动召回相关记忆 |
| `autoCapture` | boolean | `true` | 自动捕获重要信息 |
| `captureInterval` | number | `5` | 每 N 轮对话捕获一次 |
| `obsidianSync` | boolean | `false` | 启用 Obsidian 同步 |
| `obsidianVault` | string | - | Obsidian Vault 路径 |
| `vectorSearch` | boolean | `false` | 启用向量搜索（需额外依赖） |
| `maxRecallResults` | number | `3` | 最大召回结果数 |
| `recallThreshold` | number | `0.7` | 召回相关性阈值 |

## 记忆工具

Agent 可使用以下工具管理记忆：

| Tool | 用途 |
|------|------|
| `memory_recall` | 搜索归档记忆 |
| `memory_store` | 手动存储记忆 |
| `memory_forget` | 删除记忆 |
| `memory_list` | 列出记忆 |
| `memory_update_task` | 更新任务状态 |
| `memory_export` | 导出记忆 |

## Slash 命令

| 命令 | 用途 |
|------|------|
| `/remember <text>` | 手动存储记忆 |
| `/recall <query>` | 搜索记忆 |
| `/forget <query>` | 删除记忆 |
| `/memory status` | 查看记忆状态 |
| `/memory export` | 导出所有记忆 |

## 与现有系统集成

| 系统 | 集成方式 |
|------|---------|
| `~/memory/` | 直接读写 |
| Obsidian | 双向同步 |
| MEMORY.md | 作为 Core Block 来源 |
| memory/YYYY-MM-DD.md | 归档到 archive/conversations/ |

## 开发路线

- [x] Phase 1: 设计方案
- [ ] Phase 2: 基础 Plugin 框架
- [ ] Phase 3: Core Block 管理
- [ ] Phase 4: Auto-Recall 实现
- [ ] Phase 5: Auto-Capture 实现
- [ ] Phase 6: Obsidian 同步
- [ ] Phase 7: 向量搜索（可选）

## 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT License - 详见 [LICENSE](LICENSE)

## 致谢

灵感来源：
- [Letta Claude Subconscious](https://github.com/letta-ai/claude-subconscious) - Memory Blocks 架构
- [Supermemory](https://supermemory.ai) - Auto-Recall/Capture 模式
- [OpenClaw](https://openclaw.ai) - Plugin 系统
