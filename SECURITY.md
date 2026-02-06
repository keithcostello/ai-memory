# Security

## Threat Model

ai-memory is a **local development CLI** that scaffolds and manages a persistent AI memory system in Cursor IDE workspaces. It:

- Operates only on the local filesystem
- Does not make network requests
- Does not store or read credentials, API keys, or tokens
- Is intended for use by developers in their own workspaces

## Security Controls

### Path Traversal Protection

- **`resolveMemoryPath`** (paths.js) validates that resolved paths stay within the project root. Paths like `../../etc/passwd` throw an error.
- **`ensureDir`** (files.js) accepts an optional `projectRoot` parameter; when provided, validates that the directory path is contained within the project root before creating.
- All command modules construct paths using `path.join(projectRoot, ...)` with the detected project root. User input is not used directly as filesystem paths.

### Symlink Handling

- **`safeWrite`** (files.js) refuses to write through symlinks. If the target path exists and is a symlink, it throws.
- A **TOCTOU (time-of-check to time-of-use) race** exists: an attacker could create a symlink at the target path between the check and the rename. This is documented as an **acceptable risk** for a local dev CLI. Full mitigation would require platform-specific flags (e.g. `O_NOFOLLOW`) not readily exposed in Node.js.

### Input Sanitization

- **CLI command** (cli.js): User-provided command strings are sanitized with `replace(/[^\x20-\x7E]/g, '')` before display to prevent terminal injection.
- **All public functions** validate argument types (string, number, etc.) and reject empty/invalid values with `TypeError`.

### Atomic Writes

- **`safeWrite`** writes to a temporary file first, then renames. This prevents partial writes from corrupting existing files if the process is interrupted.

### No Secrets

- The tool never stores or reads credentials, API keys, or tokens. This is enforced in AGENTS.md and the codebase.

## Security Review (Phase 0c)

Verified: All command modules use `path.join(projectRoot, ...)` for filesystem paths. No user-controlled input is used directly as a path. Path traversal, symlink handling, and input sanitization are implemented as documented above. File size guard (10 MB limit before full-file read) is implemented in `getFileStats`. `ensureDir` path containment is implemented via optional `projectRoot` parameter (archive and init pass it).

## Reporting

To report a security vulnerability, please open an issue on GitHub or contact the maintainer directly.
