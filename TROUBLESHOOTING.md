# Troubleshooting — Phase 6 & Common Issues

## Cursor Internal Error

**Symptom:** "An unexpected error occurred on our servers. Please try again, or contact support if the issue persists." (Request ID shown)

**Causes:** Server-side Cursor issues, often transient. Can be triggered by HTTP/2, large context, or network hiccups.

**Steps:**

1. **Retry** — Often resolves on its own.
2. **Restart Cursor** — Fully quit and reopen.
3. **Disable HTTP/2** — Add to `.vscode/settings.json`:
   ```json
   {
     "cursor.general.disableHttp2": true
   }
   ```
4. **Reduce context** — Close large files, collapse folders. Large memory files or logs can contribute.
5. **Contact support** — If it persists, include the Request ID from the error.

---

## Terminal: "path should be a path.relative()'d string"

**Symptom:** `Error: Command failed to spawn: path should be a path.relative()d string, but got "c:/PROJECTS/..."`

**Cause:** Cursor's integrated terminal sometimes rejects absolute Windows paths when spawning commands (e.g. `cd c:\PROJECTS\ai-memory-uat`).

**Steps:**

1. **Use relative paths** — From project root:
   ```powershell
   cd ..\ai-memory-uat
   npx ..\ai-memory_v1\bin\cli.js init
   ```
2. **Run in external terminal** — Use PowerShell, CMD, or Windows Terminal outside Cursor.
3. **Use short paths** — If in a worktree, `cd` to the worktree root first, then use relative paths.

---

## Husky Pre-Commit Fails on Windows

**Symptom:** `npm test && npm run lint` fails on commit, or `sh` not found.

**Cause:** Husky uses `#!/bin/sh`; Git for Windows provides it, but PATH or Git config can break it.

**Steps:**

1. **Verify Git Bash** — Ensure Git is installed and `sh` is available:
   ```powershell
   where sh
   ```
   Should resolve to Git's `usr\bin\sh.exe` or similar.

2. **Husky install** — Reinstall hooks:
   ```powershell
   npm run prepare
   ```
   Or: `npx husky init` (if needed).

3. **Run hooks manually** — From project root:
   ```powershell
   npm test
   npm run lint
   ```
   Fix any failures before committing.

4. **Bypass (temporary)** — `git commit --no-verify` skips hooks. Use only for emergencies.

---

## Tests Pass Locally, Fail in CI

**Symptom:** `npm test` works on your machine, fails in GitHub Actions.

**Steps:**

1. **Node version** — CI uses Node from `actions/setup-node`. Ensure `package.json` `engines` matches (e.g. `>=18.0.0`).
2. **Path separators** — Tests use `path.join()`; CI runs on Linux. Check for hardcoded `\` or `c:`.
3. **Temp directories** — Tests use `fs.mkdtempSync`. Ensure no leftover state; each test should use a fresh temp dir.

---

## UAT: Init in External Folder

**Symptom:** `npx c:\PROJECTS\ai-memory_v1 init` fails or uses wrong project.

**Steps:**

1. **Create UAT folder outside repo** — e.g. `c:\PROJECTS\ai-memory-uat` (no `.git` from ai-memory).
2. **Use node directly** — Avoid path issues:
   ```powershell
   cd c:\PROJECTS\ai-memory-uat
   node c:\PROJECTS\ai-memory_v1\bin\cli.js init
   ```
3. **Or link locally** — `npm link` in ai-memory_v1, then `npx ai-memory init` in UAT folder.

---

## Quick Reference

| Issue              | First step                    |
|--------------------|------------------------------|
| Cursor internal    | Retry → Restart → disableHttp2 |
| Terminal path      | Use relative paths or external terminal |
| Pre-commit fails   | Run `npm test && npm run lint` manually |
| UAT init fails     | Use `node .../bin/cli.js` or `npm link` |
