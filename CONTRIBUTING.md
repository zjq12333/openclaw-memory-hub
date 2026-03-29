# Contributing to OpenClaw Memory Hub

Thank you for your interest in contributing!

## Development Setup

```bash
# Clone the repository
git clone https://github.com/yourusername/openclaw-memory-hub.git
cd openclaw-memory-hub

# Install dependencies
npm install

# Build
npm run build

# Run tests
npm test
```

## Project Structure

```
openclaw-memory-hub/
├── src/
│   ├── index.ts           # Plugin entry point
│   ├── config.ts          # Configuration schema
│   ├── storage.ts         # Memory storage layer
│   ├── recall.ts          # Auto-recall handler
│   ├── capture.ts         # Auto-capture handler
│   ├── tools/             # Memory tools
│   │   ├── recall.ts
│   │   ├── store.ts
│   │   ├── forget.ts
│   │   └── list.ts
│   └── obsidian.ts        # Obsidian sync
├── dist/                  # Compiled output
├── tests/                 # Test files
└── package.json
```

## Coding Guidelines

1. **TypeScript strict mode** - All code must pass strict type checking
2. **ES Modules** - Use ESM syntax (import/export)
3. **Async/await** - Prefer async/await over Promises
4. **Error handling** - Always handle errors gracefully
5. **Token efficiency** - Keep memory operations lightweight

## Commit Convention

Follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` New features
- `fix:` Bug fixes
- `docs:` Documentation changes
- `refactor:` Code refactoring
- `test:` Test changes
- `chore:` Build/tooling changes

## Pull Request Process

1. Fork the repository
2. Create a feature branch (`git checkout -b feat/amazing-feature`)
3. Make your changes
4. Run tests (`npm test`)
5. Commit your changes (`git commit -m 'feat: add amazing feature'`)
6. Push to your fork (`git push origin feat/amazing-feature`)
7. Open a Pull Request

## Questions?

Open an issue or join the [OpenClaw Discord](https://discord.com/invite/clawd)
