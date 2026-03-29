# 发布到 GitHub

## 已完成
- ✅ 项目代码已创建
- ✅ Git 仓库已初始化
- ✅ 首次提交已完成

## 下一步：推送到 GitHub

### 方法 1：使用 GitHub CLI（推荐）

```bash
# 安装 GitHub CLI
winget install GitHub.cli

# 登录
gh auth login

# 创建仓库并推送
cd D:\openclaw\workspace\openclaw-memory-hub
gh repo create openclaw-memory-hub --public --description "Lightweight, token-optimized memory system for OpenClaw" --push
```

### 方法 2：手动创建仓库

1. 打开 https://github.com/new
2. 创建新仓库：
   - Repository name: `openclaw-memory-hub`
   - Description: `Lightweight, token-optimized memory system for OpenClaw`
   - Public
   - **不要**勾选 "Add a README file"

3. 创建后，运行以下命令：

```bash
cd D:\openclaw\workspace\openclaw-memory-hub

# 添加远程仓库（替换 YOUR_USERNAME）
git remote add origin https://github.com/YOUR_USERNAME/openclaw-memory-hub.git

# 推送
git branch -M main
git push -u origin main
```

## 项目结构

```
openclaw-memory-hub/
├── README.md              # 完整文档
├── LICENSE                # MIT License
├── CONTRIBUTING.md        # 贡献指南
├── package.json           # NPM 配置
├── tsconfig.json          # TypeScript 配置
├── openclaw.plugin.json   # OpenClaw Plugin 配置
├── src/
│   ├── index.ts           # Plugin 入口
│   ├── config.ts          # 配置解析
│   ├── storage.ts         # 存储层
│   ├── recall.ts          # Auto-Recall
│   ├── capture.ts         # Auto-Capture
│   ├── obsidian.ts        # Obsidian 同步
│   ├── tools/             # 记忆工具
│   │   ├── recall.ts
│   │   ├── store.ts
│   │   ├── forget.ts
│   │   └── list.ts
│   └── commands/          # Slash 命令
│       └── status.ts
└── .gitignore
```

## Token 优化亮点

| 特性 | 说明 |
|------|------|
| Core Block 精简 | 只加载 active_tasks（~500 tokens） |
| 智能召回阈值 | 相关性 < 0.7 不召回 |
| 批量捕获 | 每 5 轮对话提取一次 |
| 最大召回数 | 默认 3 条 |

**预计每轮额外 Token：300-800**（相比 Supermemory 节省 60-80%）
