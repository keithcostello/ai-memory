# ai-memory — Deep Dive Analysis & Actionable Feedback

## What This Project Is

ai-memory is a zero-dependency CLI tool that scaffolds a persistent AI memory system into Cursor IDE workspaces. It creates a structured directory of markdown files (`.cursor/rules/*.mdc` and `memory/**/*.md`) so that the AI assistant remembers user preferences, project state, mistakes, and session logs across conversations.

**Core commands:** `init` (scaffold), `status` (health report), `archive` (rotate old entries)

**Key design choices:** zero runtime dependencies, Node.js 18+ built-ins only, atomic file I/O, cross-tool compatibility via AGENTS.md standard.

---

## What's Done Well

### 1. Zero-Dependency Philosophy
The entire tool runs on Node.js built-ins (`fs`, `path`, `os`, `crypto`, `node:test`). This eliminates supply-chain risk, keeps installs instant, and means zero maintenance burden from upstream breaking changes. This is a strong, deliberate choice.

### 2. Security Posture
- **Path traversal protection** in `src/utils/paths.js:101-115` — normalizes and validates containment
- **Symlink write refusal** in `src/utils/files.js:35` — prevents write-through-symlink attacks
- **Atomic file writes** in `src/utils/files.js:40-54` — write to temp, rename, cleanup on failure
- **Input sanitization** in `bin/cli.js:139` — strips non-printable chars from user input
- **No secrets stored or read** — explicitly prohibited in AGENTS.md

### 3. Testing Approach
~500 lines across 4 test files using `node:test`. Tests run against the real file system with proper temp directory isolation and cleanup. No mocking means the tests exercise actual I/O paths. CI runs against Node 18, 20, and 22.

### 4. Clean Architecture
The layered design (CLI → Commands → Utilities → FS) follows single-responsibility well. Each command module is independently testable. Utilities are pure functions or thin I/O wrappers with no shared state.

### 5. Documentation
The README covers quick start, architecture, all commands, configuration, and known Cursor quirks. JSDoc comments on all public functions provide type info. Template files include inline instructions for users.

---

## Actionable Feedback

### Priority 1: Bugs & Data Integrity

#### 1.1 Off-by-one in line counting (affects status + archive display)

**Files:** `src/utils/validation.js:77`, `src/commands/archive.js:103,157`

```javascript
const lines = content.split('\n').length;
```

`'line1\nline2\n'.split('\n')` returns `['line1', 'line2', '']` — length 3, not 2. An empty file returns 1 instead of 0. This inflates every line count displayed in `status` and `archive`.

**Fix:** Filter trailing empty element or use a helper:
```javascript
function countLines(content) {
  if (content === '') return 0;
  const count = content.split('\n').length;
  return content.endsWith('\n') ? count - 1 : count;
}
```

#### 1.2 Falsy-value config bug

**File:** `src/commands/archive.js:48`

```javascript
const retentionDays = config.log_retention_days || DEFAULT_RETENTION_DAYS;
```

If `loadConfig()` ever returns `0` (falsy), this silently falls back to the default. Use nullish coalescing instead:

```javascript
const retentionDays = config.log_retention_days ?? DEFAULT_RETENTION_DAYS;
```

Same issue applies to `config.archive_completed_sprints` if it were ever `false` — `||` would override it.

---

### Priority 2: Security Hardening

#### 2.1 TOCTOU race in symlink check

**File:** `src/utils/files.js:34-45`

The symlink check (`lstatSync`) and the actual write (`renameSync`) are separated by several operations. An attacker could create a symlink at the target path between the check and the rename.

**Fix:** Use `O_NOFOLLOW` or write directly to the target using `openSync` with `O_CREAT | O_WRONLY | O_TRUNC` flags and check the fd's lstat after opening. Alternatively, use `renameat2` semantics if available, or accept this as an acceptable risk for a dev-tool CLI and document it.

#### 2.2 `ensureDir()` has no path containment check

**File:** `src/utils/files.js:155`

```javascript
mkdirSync(dirPath, { recursive: true });
```

Unlike `safeWrite()`, this doesn't validate that `dirPath` is within the project root. If a caller passes an unvalidated path, directories could be created anywhere.

**Fix:** Add a `resolveMemoryPath()` check or accept a `projectRoot` parameter:
```javascript
function ensureDir(dirPath, projectRoot) {
  if (projectRoot) resolveMemoryPath(projectRoot, path.relative(projectRoot, dirPath));
  mkdirSync(dirPath, { recursive: true });
}
```

---

### Priority 3: Reliability & Error Handling

#### 3.1 Silent error swallowing in archive sprint processing

**File:** `src/commands/archive.js:293-303`

Multiple bare `catch {}` blocks silently discard errors during sprint file processing. If a file fails to read, move, or delete, the user gets no feedback.

**Fix:** Log at minimum with `console.warn()`:
```javascript
} catch (err) {
  console.warn(`  Warning: could not process ${path.basename(filePath)}: ${err.message}`);
}
```

#### 3.2 Inconsistent warning output channel

**File:** `src/commands/archive.js:362`

Uses `console.log()` for a config parsing warning. Elsewhere (`archive.js:283-285`), `console.warn()` is used correctly.

**Fix:** Change to `console.warn()` for consistency, and consider defining a simple logging convention (e.g., all warnings go through `console.warn()`).

#### 3.3 No file size guard before full-file reads

**File:** `src/utils/validation.js:75-77`

```javascript
const content = readFileSync(filePath, 'utf8');
```

If a user accidentally symlinks a large file or if a log grows unchecked, this reads the entire file into memory. For a status-checking tool that should be lightweight, this could be surprising.

**Fix:** Check `statSync(filePath).size` first and bail with a warning above a threshold (e.g., 10 MB):
```javascript
const stat = statSync(filePath);
if (stat.size > 10 * 1024 * 1024) {
  return { exists: true, lines: -1, warning: 'File too large to analyze' };
}
```

---

### Priority 4: Architecture & Design Improvements

#### 4.1 Add a proper linter to CI

The `npm run lint` script only does `node --check` (syntax validation). This catches parse errors but not:
- Unused variables
- Unreachable code
- Missing `await` on promises
- Style inconsistencies

**Recommendation:** Add ESLint with a minimal config. Since the project avoids dependencies in production, ESLint can be a devDependency:
```json
"devDependencies": { "eslint": "^9.0.0" }
```
Even the default recommended rules would catch real bugs.

#### 4.2 Add code coverage tracking

The tests are solid but there's no visibility into what's covered. Node.js 18+ supports `--experimental-test-coverage` natively:
```json
"scripts": {
  "test": "node --test tests/*.test.js",
  "test:coverage": "node --test --experimental-test-coverage tests/*.test.js"
}
```
This requires zero additional dependencies and would give immediate coverage visibility in CI.

#### 4.3 Consider TypeScript or JSDoc type-checking

The codebase has good JSDoc annotations already. Adding `// @ts-check` at the top of each file and a `jsconfig.json` would enable TypeScript's type checker on plain JS files at zero migration cost:

```json
// jsconfig.json
{
  "compilerOptions": {
    "checkJs": true,
    "strict": true,
    "moduleResolution": "node16"
  },
  "include": ["src/**/*.js", "bin/**/*.js"]
}
```

This catches type mismatches, null dereferences, and incorrect function calls — all without converting to TypeScript.

#### 4.4 Extract duplicated defaults into a shared constant

**File:** `src/commands/archive.js:331-336` and `366-371`

The same default config object is defined twice. Extract to a module-level constant:
```javascript
const DEFAULT_CONFIG = Object.freeze({
  log_retention_days: DEFAULT_RETENTION_DAYS,
  archive_completed_sprints: true,
});
```

---

### Priority 5: UX & Usability

#### 5.1 Add a `--dry-run` flag to `archive`

The archive command moves and deletes files. A `--dry-run` flag that prints what *would* happen without making changes would build user confidence and aid debugging.

#### 5.2 Add `--json` output to `status`

For CI integration or scripting, a `--json` flag on `status` that outputs structured data instead of formatted text would make the tool composable:
```bash
ai-memory status --json | jq '.tier1.total_tokens'
```

#### 5.3 Improve the empty-sanitized-command UX

**File:** `bin/cli.js:138-140`

If a user passes a command consisting entirely of non-printable characters, `safeCommand` becomes an empty string and the error message reads `Unknown command: ""`. Handle this case:
```javascript
const safeCommand = command.replace(/[^\x20-\x7E]/g, '');
const display = safeCommand || '(unrecognizable input)';
console.error(`Unknown command: "${display}"\n`);
```

#### 5.4 Add shell completions

A `ai-memory completions` command that outputs bash/zsh/fish completions would improve discoverability. With only 4 commands and 2 flags, this is trivial to implement.

---

### Priority 6: Maintainability

#### 6.1 Consolidate error-suppression patterns

**File:** `src/commands/status.js` (lines 177-184, 197-211, 213-214)

Three identical try-catch-suppress patterns for directory reading. Extract:
```javascript
function safeReaddir(dirPath) {
  try {
    return readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }
}
```

#### 6.2 Add a CHANGELOG

The project is at v1.0.0 with no changelog. Before publishing the next version, start a `CHANGELOG.md` following [Keep a Changelog](https://keepachangelog.com/) conventions so users know what changed between versions.

#### 6.3 Consider pre-commit hooks

A `.husky` or simple git hook running `npm test && npm run lint` before commits would prevent broken code from reaching the repo. This matters more as contributors increase.

---

## Summary Matrix

| # | Issue | Severity | Effort | Impact |
|---|-------|----------|--------|--------|
| 1.1 | Off-by-one line counts | Medium | Low | Fixes incorrect display data |
| 1.2 | Falsy config override | Medium | Trivial | Prevents silent config bugs |
| 2.1 | TOCTOU symlink race | Low-Med | Medium | Hardens file write security |
| 2.2 | `ensureDir` unvalidated path | Low-Med | Low | Prevents directory creation outside project |
| 3.1 | Silent error swallowing | Medium | Low | Makes failures visible |
| 3.2 | Inconsistent warn channel | Low | Trivial | Consistency |
| 3.3 | No file size guard | Low-Med | Low | Prevents OOM on large files |
| 4.1 | Add ESLint | Medium | Low | Catches real bugs |
| 4.2 | Add coverage tracking | Low | Trivial | Visibility into test gaps |
| 4.3 | Enable JS type-checking | Medium | Low | Catch type errors at zero cost |
| 4.4 | Extract duplicated defaults | Low | Trivial | DRY |
| 5.1 | `--dry-run` for archive | Medium | Medium | Safer UX |
| 5.2 | `--json` for status | Low | Medium | Composability |
| 5.3 | Empty sanitized command | Low | Trivial | Better error message |
| 5.4 | Shell completions | Low | Low | Discoverability |
| 6.1 | Consolidate try-catch | Low | Low | Less duplication |
| 6.2 | Add CHANGELOG | Low | Low | Version tracking |
| 6.3 | Pre-commit hooks | Low | Low | Quality gate |

**Recommended first pass:** Items 1.1, 1.2, 3.1, 3.2, 4.1, 4.2 — all low-effort, medium-to-high impact fixes that improve correctness and developer experience without changing architecture.
