# ai-memory

Scaffold a persistent AI memory system into any [Cursor IDE](https://cursor.com) workspace. The AI reads your preferences, picks up where it left off, and avoids repeating past mistakes — across every session.

**Zero dependencies.** Uses only Cursor's native `.mdc` rule system and standard markdown files.

## Quick Start

```bash
# Install from GitHub
npm install github:keithcostello/ai-memory

# Scaffold the memory system into your workspace
npx ai-memory init

# Edit your preferences
# (open memory/USER.md and fill in your details)

# Restart Cursor to load the new rules
```

That's it. The AI now has persistent memory.

## How It Works

Cursor's `.mdc` rule files can reference other files using the `[name](mdc:path)` link syntax. When a rule has `alwaysApply: true`, its contents (and referenced files) are injected into every AI prompt.

`ai-memory` scaffolds three small markdown files and a Cursor rule that references them. Every time you start a conversation, the AI automatically receives:

- **Your preferences** — coding style, tech stack, conventions
- **Current state** — what you were working on, what's blocked, what's next
- **Learned corrections** — mistakes the AI has made before and how to avoid them

The AI updates these files as you work, creating continuity across sessions.

## Memory Tiers

| Tier | Files | Loading | Purpose |
|------|-------|---------|---------|
| **1: Always-On** | `memory/USER.md`, `memory/WAITING_ON.md`, `memory/ai/COMMON_MISTAKES.md` | Every prompt (via `memory.mdc`) | Core context — preferences, state, corrections |
| **2: On-Demand** | `memory/GLOBAL_DAILY_LOG.md` | When reviewing history | Session-by-session work log |
| **3: Project-Scoped** | `memory/projects/[name]/WAITING_ON.md` | When working on a specific project | Per-project state (overrides global WAITING_ON) |
| **4: Agent-Scoped** | `memory/workflows/[project]/[role]_sprint_[id].md` | During sprint/workflow execution | Per-agent, per-sprint isolated context |

**Token budget:** Tier 1 files should stay under ~4,000 tokens combined (~16,000 characters). The `status` command tracks this for you.

## Commands

### `ai-memory init`

Scaffold the memory system into the current workspace.

```bash
npx ai-memory init          # Create files (skip existing)
npx ai-memory init --force  # Overwrite existing files
```

Creates:
- `memory/` directory with template files
- `.cursor/rules/` with three rule files
- `AGENTS.md` for cross-tool compatibility
- `memory-strategies.json` for retention configuration
- Entries in `.gitignore` and `.cursorignore` for the archive directory

### `ai-memory status`

Check memory system health.

```bash
npx ai-memory status        # Human-readable report
npx ai-memory status --json # JSON output for scripting
```

Reports:
- Tier 1 file sizes and estimated token usage
- Token budget status (warns if over 4,000)
- Log file health and archive recommendations
- Cursor rule file existence
- Detected projects and active sprints
- Staleness warnings (files not updated recently)

Example output:
```
ai-memory status report
========================

Tier 1 (Always-On):
  ✓ memory/USER.md              142 lines   ~1,200 tokens   Modified: 2h ago
  ✓ memory/WAITING_ON.md         38 lines     ~320 tokens   Modified: 15m ago
  ✓ memory/ai/COMMON_MISTAKES.md 12 lines     ~100 tokens   Modified: 1d ago
  ──────────────────────────────────────────────────────────
  Tier 1 total: ~1,620 tokens (budget: 4,000)  ✓ OK
```

### `ai-memory archive`

Archive old log entries and completed sprint files.

```bash
npx ai-memory archive           # Archive old entries
npx ai-memory archive --dry-run # Preview what would be archived (no files changed)
```

- Moves log entries older than the retention period (default: 14 days) to `memory/archive/YYYY-MM-DD/`
- Archives sprint files marked with `## Status: COMPLETED` or `## Status: ARCHIVED`
- Uses atomic writes to prevent data loss

### `ai-memory completions`

Output shell completion scripts for bash, zsh, or fish.

```bash
npx ai-memory completions bash >> ~/.bashrc
npx ai-memory completions zsh  >> ~/.zshrc
npx ai-memory completions fish >> ~/.config/fish/completions/ai-memory.fish
```

### Other Commands

```bash
npx ai-memory help       # Show usage information
npx ai-memory version    # Show package version
```

## Configuration

### `memory/USER.md`

Edit this file with your actual preferences. This is the most important file to customize:

```markdown
# User Configuration

## Identity
- **Name**: Jane Developer
- **Role**: Full-stack developer

## Tech Stack
- **Languages**: TypeScript, Python
- **Frameworks**: React, FastAPI
- **Tools**: Cursor, Git, Docker

## Communication Preferences
- **Verbosity**: Terse code, detailed explanations
- **Style**: Direct, no fluff

## Project Conventions
- **Git**: Conventional commits, feature branches
- **Error handling**: Fail-closed, explicit error types

## Boundaries
- Never commit directly to main
- Always run tests before declaring work complete
```

### `memory-strategies.json`

Controls archive behavior:

```json
{
  "log_retention_days": 14,
  "archive_completed_sprints": true,
  "warn_tier1_tokens": 4000,
  "warn_log_lines": 500
}
```

## Cursor Rules

Three `.mdc` rule files are created in `.cursor/rules/`:

| File | Type | Purpose |
|------|------|---------|
| `memory.mdc` | Always-on | Injects Tier 1 memory into every prompt |
| `memory-ops.mdc` | Agent-requested | Memory write protocols (loaded when AI needs to update files) |
| `memory-logs.mdc` | On-demand | Log access (loaded when reviewing history) |

### Known Cursor Quirks

- **File injection syntax:** Uses `[name](mdc:path)` links, which work reliably. Also includes `@path` fallbacks and a manual-read directive in case both fail.
- **alwaysApply bug (issue #3253):** All always-on rules include `globs: "*"` as a workaround.
- **Cursor Memories coexistence:** The system is designed to complement (not replace) Cursor's built-in Memories feature (v0.51+).

## Cross-Tool Compatibility

An `AGENTS.md` file is created at the project root following the [AGENTS.md open standard](https://github.com/anthropics/agents-md). This provides basic memory instructions for any AI coding tool that supports the standard (Claude Code, Codex, etc.).

## FAQ

**Does this work with Cursor's native memories?**
Yes. Cursor's auto-generated memories capture conversational patterns. This system tracks explicit state, blockers, and corrections. They're complementary — the rule file includes a directive to prefer structured memory over auto-generated memories when they conflict.

**What if I use Claude Code or Codex?**
The `AGENTS.md` file at the project root provides basic compatibility. Those tools won't get the automatic `.mdc` rule injection, but they can read the memory files when following AGENTS.md instructions.

**How do I reset the memory system?**
Delete the `memory/` directory and `.cursor/rules/memory*.mdc` files, then run `npx ai-memory init` again.

**Should I commit memory files to git?**
Yes — memory files are designed to be version-controlled. The `memory/archive/` directory is excluded via `.gitignore` since archived data is historical and can be large.

**How do I add a new project?**
Create `memory/projects/<project-name>/WAITING_ON.md`. When you tell the AI you're working on that project, it will load the project-specific state.

## Development

```bash
npm test              # Run tests
npm run lint          # ESLint
npm run test:coverage # Run tests with coverage (requires Node 22+)
```

## Requirements

- Node.js 18 or later
- Cursor IDE (for `.mdc` rule injection)

## License

MIT
