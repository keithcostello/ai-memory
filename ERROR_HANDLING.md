# Error Handling Conventions

## Principles

1. **No silent failures.** Every `catch` block must either rethrow, log to stderr, or return a documented fallback.
2. **Throw for invalid input and unrecoverable failures.** Use `TypeError` for bad arguments, `Error` for operational failures.
3. **Log and continue when the caller can proceed.** Use `console.warn` when an operation fails but the overall flow can continue (e.g. skip a file, return empty).

## Channels

- **stdout** — User-facing output (status report, help, version, init summary)
- **stderr** — Warnings (`console.warn`), errors (`console.error`), and fatal messages

## When to Throw

- Invalid arguments: `TypeError` (e.g. empty string, wrong type)
- Unrecoverable failures: `Error` (e.g. template not found, write failed)
- Path escapes project root: `Error` from `resolveMemoryPath`

## When to Log and Fallback

- File/directory read fails (permission denied): `console.warn`, return `false` or `[]`
- Package.json unreadable: `console.warn`, return `'unknown'`
- Config parse fails: `console.warn`, use defaults
- Sprint file unreadable: `console.warn`, skip and continue
- Temp file cleanup fails: `console.warn`, continue (original error is still thrown)

## Never

- Bare `catch {}` with no log or rethrow
- Swallowing errors without any trace

## DEBUG Mode

When `process.env.DEBUG` is set, additional diagnostic output (e.g. stack traces, marker-skip details) may be emitted to stderr.
