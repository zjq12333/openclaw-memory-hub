# OpenClaw Memory Hub

**轻量级、Token 优化的 AI 记忆系统 | 本地向量搜索 | 零 API 成本**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-blue.svg)](https://openclaw.ai)
[![Version](https://img.shields.io/badge/version-0.2.0-green.svg)](https://github.com/zjq12333/openclaw-memory-hub)

## ✨ v0.2.0 重大更新

### 🚀 本地向量搜索（零 Token 消耗）

```
┌─────────────────────────────────────────────────────────────┐
│              双模型架构（Token 节省 60-80%）                  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  网络大模型 (maas API)                                       │
│  ├── 对话推理、项目工作                                       │
│  └── 记忆智能提取（可选）                                     │
│                                                              │
│  本地模型 (Ollama)                                           │
│  ├── 记忆向量嵌入 ← nomic-embed-text (274MB)                │
│  └── 语义搜索 ← 零 Token、零延迟、零费用                      │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 🧠 记忆生命周期管理

| 功能 | 说明 |
|------|------|
| **自动衰减** | 基于时间 + 访问频率的 Weibull 衰减算法 |
| **三层分层** | Core（核心）→ Working（工作）→ Peripheral（外围） |
| **智能保留** | 重要记忆永久保留，低价值记忆自动衰减 |

---

## 为什么选择 Memory Hub？

| 对比项 | Memory Hub | memory-lancedb-pro | Supermemory |
|--------|-----------|-------------------|-------------|
| **Token 消耗** | 300-800/轮 | 500-1500/轮 | 1500-3000/轮 |
| **向量搜索** | ✅ 本地免费 | ✅ 需要 API | ✅ 收费 |
| **语义理解** | ✅ Ollama 本地 | ✅ 需要 API | ✅ 收费 |
| **记忆衰减** | ✅ 自动 | ✅ 自动 | ❌ 无 |
| **记忆分层** | ✅ 三层 | ✅ 三层 | ❌ 无 |
| **月费用** | **$0** | $5-20 | $10-30 |

---

## 核心特性

### 1. 本地向量搜索（零成本）

```typescript
// 使用 Ollama nomic-embed-text 进行向量嵌入
// 完全本地运行，零 API 调用，零费用

const results = await memory_recall({
  query: "上次那个项目",  // 支持自然语言
  limit: 5
})

// 返回语义相关的记忆，而非关键词匹配
```

### 2. 记忆生命周期管理

```
┌─────────────────────────────────────────────────────────────┐
│                    记忆分层架构                              │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ⭐ Core（核心记忆）                                         │
│  ├── 重要性 > 0.8 且访问 > 10 次                            │
│  ├── 永久保留，永不衰减                                      │
│  └── 示例：核心决策、重要项目、用户偏好                       │
│                                                              │
│  📝 Working（工作记忆）                                      │
│  ├── 重要性 > 0.5 或访问 > 3 次                             │
│  ├── 中等衰减速度                                            │
│  └── 示例：近期任务、活跃项目                                │
│                                                              │
│  📄 Peripheral（外围记忆）                                   │
│  ├── 低重要性、低访问                                        │
│  ├── 快速衰减，可能被清理                                    │
│  └── 示例：临时对话、一般信息                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### 3. 自动衰减算法

```typescript
// Weibull 衰减模型
decayScore = exp(-λ × ageInDays) + accessBoost + importanceBoost

// 半衰期 30 天（可配置）
// 访问频率加成：log10(accessCount + 1) × 0.1
// 重要性加成：(importance - 0.5) × 0.2
```

---

## 快速开始

### 1. 安装 Ollama（向量搜索必需）

```bash
# 下载安装 Ollama
# https://ollama.ai

# 拉取向量嵌入模型
ollama pull nomic-embed-text
```

### 2. 安装 Memory Hub

```bash
# 从源码安装
git clone https://github.com/zjq12333/openclaw-memory-hub.git
cd openclaw-memory-hub
npm install
npm run build
openclaw plugins enable .
```

### 3. 配置

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
          "vectorSearch": true,
          "ollamaBaseUrl": "http://localhost:11434",
          "ollamaModel": "nomic-embed-text",
          "decayEnabled": true,
          "decayHalfLifeDays": 30,
          "maxRecallResults": 5,
          "recallThreshold": 0.5
        }
      }
    }
  }
}
```

---

## 配置选项

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `storagePath` | string | `~/memory` | 记忆存储路径 |
| `autoRecall` | boolean | `true` | 自动召回相关记忆 |
| `autoCapture` | boolean | `true` | 自动捕获重要信息 |
| `captureInterval` | number | `5` | 每 N 轮对话捕获一次 |
| `vectorSearch` | boolean | `true` | 启用向量搜索 |
| `ollamaBaseUrl` | string | `http://localhost:11434` | Ollama 服务地址 |
| `ollamaModel` | string | `nomic-embed-text` | 嵌入模型 |
| `decayEnabled` | boolean | `true` | 启用自动衰减 |
| `decayHalfLifeDays` | number | `30` | 衰减半衰期（天） |
| `maxRecallResults` | number | `5` | 最大召回结果数 |
| `recallThreshold` | number | `0.5` | 召回相关性阈值 |

---

## 记忆工具

| Tool | 用途 |
|------|------|
| `memory_recall` | 语义搜索记忆（支持自然语言） |
| `memory_store` | 手动存储记忆 |
| `memory_forget` | 删除记忆 |
| `memory_list` | 列出记忆 |
| `memory_stats` | 查看系统状态（分层、衰减、Ollama） |

---

## Token 节省对比

假设每天 50 轮对话：

| 功能 | 传统方案 | Memory Hub | 节省 |
|------|---------|-----------|------|
| 记忆嵌入 | 50次 × 500 tokens | **0** (本地) | 25,000/天 |
| 记忆搜索 | 50次 × 300 tokens | **0** (本地) | 15,000/天 |
| 记忆提取 | 10次 × 500 tokens | 10次 × 500 tokens | 0 |
| **总计** | - | - | **40,000 tokens/天** |

**每月节省：约 120 万 tokens！**

---

## 存储结构

```
~/memory/
├── memory.db              # SQLite 数据库
├── core/
│   └── active_tasks.md    # 核心块：进行中的任务
├── decisions/             # 决策记录
├── projects/              # 项目历史
├── tasks/                 # 任务状态
├── videos/                # 视频项目
└── INDEX.md               # 总索引
```

---

## 开发路线

- [x] Phase 1: 基础 Plugin 框架
- [x] Phase 2: Core Block 管理
- [x] Phase 3: Auto-Recall 实现
- [x] Phase 4: Auto-Capture 实现
- [x] Phase 5: Obsidian 同步
- [x] Phase 6: **本地向量搜索（Ollama）**
- [x] Phase 7: **记忆生命周期管理**
- [ ] Phase 8: 智能提取（可选 LLM）
- [ ] Phase 9: API 服务（开放收费）

---

## 贡献

欢迎贡献！请查看 [CONTRIBUTING.md](CONTRIBUTING.md)

## License

MIT License - 详见 [LICENSE](LICENSE)

## 致谢

- [Ollama](https://ollama.ai) - 本地 LLM 运行时
- [nomic-embed-text](https://nomic.ai) - 高质量向量嵌入模型
- [OpenClaw](https://openclaw.ai) - Plugin 系统
