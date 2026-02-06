# AI Agent Instructions — ai-memory Package

This repository contains the `ai-memory` npm package: a CLI tool that scaffolds
a persistent memory system into any Cursor IDE workspace.

## Architecture

- `bin/cli.js` — CLI entry point, manual argv parsing, zero dependencies
- `src/commands/` — One module per command (init, status, archive)
- `src/templates/` — Template files copied into target workspaces during init
- `src/utils/` — Shared utilities (paths, validation, file operations)
- `tests/` — Node.js built-in test runner (`node:test`)

## Constraints

- **Zero runtime dependencies.** Use only Node.js built-ins (`fs`, `path`, `os`).
- **ES modules.** All files use `import`/`export`, not `require()`.
- **Node 18+.** Use only APIs available in Node.js 18 LTS.
- **Cross-platform.** Always use `path.join()` for file paths. Test on Windows.
- **Atomic writes.** Use `.tmp` + `rename` pattern for safe file writes.
- **No secrets.** Never store or read credentials, API keys, or tokens.

## Testing

Run tests with `npm test`. Tests use `node:test` and operate on temp directories.
Each test creates its own isolated temp dir and cleans up after itself.
