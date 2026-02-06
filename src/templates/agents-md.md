# AI Agent Instructions

This project uses the `ai-memory` structured memory system for persistent AI context.

## Memory System

- `memory/USER.md` — User preferences and project conventions (always read)
- `memory/WAITING_ON.md` — Current state, blockers, next actions (always read)
- `memory/ai/COMMON_MISTAKES.md` — Learned error patterns to avoid (always read)
- `memory/GLOBAL_DAILY_LOG.md` — Session history (read on demand)

## For Any AI Agent

1. Read `memory/WAITING_ON.md` before starting work to understand current state
2. Read `memory/USER.md` to understand conventions and preferences
3. Read `memory/ai/COMMON_MISTAKES.md` to avoid known pitfalls
4. After completing work, update `WAITING_ON.md` and append to `GLOBAL_DAILY_LOG.md`

## Memory Commands

- `npx ai-memory status` — Check memory system health
- `npx ai-memory archive` — Archive old logs
