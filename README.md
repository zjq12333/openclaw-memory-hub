# openclaw-memory-hub

> Lightweight token-optimized memory system for OpenClaw | Local vector search with Ollama | Zero API cost | MAGMA multi-graph architecture supported

**轻量级、Token优化的OpenClaw记忆系统 | 本地Ollama向量搜索 | 零API成本 | 支持MAGMA多图架构**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![OpenClaw Plugin](https://img.shields.io/badge/OpenClaw-Plugin-blue.svg)](https://openclaw.ai)
[![Version](https://img.shields.io/badge/version-0.3.0-green.svg)](https://github.com/zjq12333/openclaw-memory-hub/releases)

---

## 📖 简介 / Introduction

**中文**：

这是OpenClaw的本地记忆系统插件，设计理念是**本地负责所有记忆工作（存储/嵌入/提取/进化），远端大模型负责最终输出和项目执行**，节省大量Token，完全私密，不需要云服务。

基于最新论文 **MAGMA: A Multi-Graph based Agentic Memory Architecture** 改进，支持意图导向的结构化记忆检索，比纯向量搜索更准确，尤其擅长长程推理。

**English**：

A lightweight local memory system plugin for OpenClaw. Design philosophy: **local does all memory work (storage/embedding/extraction/evolution), online LLM does final output and project execution**. Saves a lot of tokens, fully private, no cloud required.

Improved based on the latest paper **MAGMA: A Multi-Graph based Agentic Memory Architecture**, supports intent-guided structured memory retrieval, more accurate than pure vector search, especially good at long-horizon reasoning.

## ✨ 特性 / Features

- ✅ **分层记忆** - Core/Working/Peripheral 三层记忆，自动衰减进化，越用越清晰  
- ✅ **MAGMA 架构** - 四张正交关系图 (时间/因果/语义/实体) + 意图自适应beam search遍历  
- ✅ **AAAK 全文压缩** - 集成AAAK结构化压缩，保留完整信息，节省 4-5x Token  
- ✅ **意图感知检索** - 为什么/什么时候/关于 不同查询不同检索路径，结果对齐更好  
- ✅ **双流水线写入** - 快速响应用户，后台异步提取关系，不阻塞  
- ✅ **多模态视觉支持** - 集成qwen-vl，图片转文字存入记忆可搜索  
- ✅ **Obsidian 自动同步** - 自动同步记忆到你的 Obsidian 仓库，结构化分类  
- ✅ **自动模型检测** - 本地自动检测最优嵌入/提取/视觉模型，不需要手动配置  
- ✅ **零Token成本** - 所有嵌入提取都本地Ollama完成，不消耗远端API Token  

## 🚀 快速开始 / Quick Start

### 前置要求 / Prerequisites

- 安装 [Ollama](https://ollama.com/)  
- 拉取嵌入模型：`ollama pull nomic-embed-text-v2-moe`  
- （可选）拉取视觉模型：`ollama pull qwen3-vl:4b`  

### 安装 / Install

```bash
git clone https://github.com/zjq12333/openclaw-memory-hub
cd openclaw-memory-hub
npm install
npm run build
```

### 配置 / Configuration

Add to your `openclaw.json`:

```json
  "plugins": {
    "openclaw-memory-hub": {
      "enabled": true,
      "config": {
        "storagePath": "D:/openclaw-workspace/memory-hub-data",
        "autoRecall": true,
        "autoCapture": true,
        "captureInterval": 5,
        "vectorSearch": true,
        "ollamaBaseUrl": "http://localhost:11434",
        "ollamaModel": "nomic-embed-text-v2-moe",
        "decayEnabled": true,
        "decayHalfLifeDays": 30,
        "maxRecallResults": 5,
        "recallThreshold": 0.5,
        "autoMaintenance": true,
        "smartExtraction": true,
        "visionEnabled": true,
        "visionModel": "qwen3-vl:4b",
        "visionBaseUrl": "http://localhost:11434"
      }
    }
  }
```

## ⚙️ 配置选项 / Configuration Options

| 选项 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `storagePath` | `string` | `~/memory` | 记忆数据库存储位置 |
| `autoRecall` | `boolean` | `true` | 每次对话前自动注入相关记忆 |
| `autoCapture` | `boolean` | `true` | 自动从对话捕获重要信息 |
| `captureInterval` | `number` | `5` | 没检测到重要内容时，间隔多少轮捕获 |
| `vectorSearch` | `boolean` | `true` | 启用向量语义搜索 |
| `ollamaBaseUrl` | `string` | `http://localhost:11434` | Ollama服务地址 |
| `ollamaModel` | `string` | `nomic-embed-text-v2-moe` | 嵌入模型名称（不配置自动检测） |
| `decayEnabled` | `boolean` | `true` | 启用自动重要性衰减 |
| `decayHalfLifeDays` | `number` | `30` | 衰减半衰期（天） |
| `maxRecallResults` | `number` | `5` | 召回最大记忆数 |
| `recallThreshold` | `number` | `0.5` | 召回最小语义相似度阈值 |
| `autoMaintenance` | `boolean` | `true` | 启动时自动维护 |
| `smartExtraction` | `boolean` | `false` | 启用大模型智能关键点提取 |
| `visionEnabled` | `boolean` | `true` | 启用视觉支持，提取图片文字描述 |
| `visionModel` | `string` | `qwen3-vl:4b` | 视觉语言模型名称 |
| `visionBaseUrl` | `string` | `http://localhost:11434` | 视觉Ollama地址 |

## 🔧 命令 / Commands

| 命令 | 说明 |
|------|------|
| `/memory status` | 显示记忆系统统计 |
| `/memory list` | 列出所有未归档记忆 |
| `/memory export` | 导出所有记忆到Markdown |
| `/memory importance <id> <0-1>` | 调整记忆重要性 |

## 🔥 MAGMA 改进 / MAGMA Improvements

本项目完整实现了论文 [MAGMA: A Multi-Graph based Agentic Memory Architecture](https://arxiv.org/html/2601.03236v1) 的核心创新：

- **四张正交关系图** - 分离存储时间/因果/语义/实体四种关系  
- **意图自适应检索** - 启发式Beam Search，根据查询意图导向遍历  
- **结构感知输出** - 拓扑排序保留逻辑结构  
- **双流水线进化** - 快速路径响应，慢速路径后台异步关系 Consolidation  

## 📊 对比 / Comparison

|  | 传统记忆 | memory-hub (MAGMA) |
|------|--------------|------------------|
| 关系混在一起 | ❌ | ✅ 四张图分离 |
| 意图对齐 | ❌ | ✅ 意图导向检索 |
| 图片支持 | ❌ | ✅ qwen-vl 图片描述可搜索 |
| Token 消耗 | 高 | 低（本地完成所有计算） |

## 📝 更新日志 / Changelog

- **v0.4.0** (2026-04-08) - 整合AAAK压缩算法，支持full-text压缩，适配Obsidian中文结构化目录，默认开启smartExtraction  
- **v0.3.0** (2026-04-07) - 完整实现MAGMA多图架构，新增意图导向检索，双流水线，视觉支持  
- **v0.2.0** (2026-04-06) - 新增向量搜索，衰减配置，自动捕获  
- **v0.1.0** (2026-04-06) - 初始发布  

## 💡 参考 / Credits

- [milla-jovovich/mempalace](https://github.com/milla-jovovich/mempalace) - AAAK压缩算法来源  
- [MAGMA: A Multi-Graph based Agentic Memory Architecture](https://arxiv.org/abs/2601.03236) - 架构灵感来源  
- [OpenClaw](https://openclaw.ai) - 框架支持  

## 🙏 致谢

- [MAGMA: A Multi-Graph based Agentic Memory Architecture](https://arxiv.org/abs/2601.03236) - 架构灵感来源  
- [OpenClaw](https://openclaw.ai) - 框架支持  

## 🙏 致谢

感谢 渣南（zjq12333）发起项目和指导开发 🙌

## 📄 许可证 / License

[MIT](./LICENSE) © [zjq12333](https://github.com/zjq12333) 2026

---

*Made with ❤️ on OpenClaw*
