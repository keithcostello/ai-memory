/**
 * @module paths
 * Cross-platform path resolution and project root detection.
 *
 * All path operations use Node.js path.join() to ensure
 * consistent behavior across Windows, macOS, and Linux.
 */

import { existsSync, statSync } from 'node:fs';
import { join, resolve, dirname, sep } from 'node:path';

/**
 * Maximum number of parent directories to traverse when
 * searching for the project root. Prevents runaway traversal
 * into system directories.
 */
const MAX_TRAVERSAL_DEPTH = 5;

/**
 * Markers that indicate a project root directory.
 * Checked in order — first match wins.
 */
const ROOT_MARKERS = ['.git', 'package.json'];

/**
 * Walk up from `startDir` looking for a project root indicator
 * (.git/ directory or package.json file). Returns the directory
 * path containing the marker, or null if not found within
 * MAX_TRAVERSAL_DEPTH levels.
 *
 * @param {string} startDir - Absolute path to start searching from
 * @returns {{ root: string, marker: string } | null}
 *   The project root path and which marker was found, or null
 *
 * @example
 *   const result = findProjectRoot('/home/user/project/src/lib');
 *   // => { root: '/home/user/project', marker: '.git' }
 *
 * @throws {TypeError} If startDir is not a non-empty string
 */
export function findProjectRoot(startDir) {
  if (typeof startDir !== 'string' || startDir.trim() === '') {
    throw new TypeError('findProjectRoot: startDir must be a non-empty string');
  }

  let current = resolve(startDir);
  let depth = 0;

  while (depth < MAX_TRAVERSAL_DEPTH) {
    for (const marker of ROOT_MARKERS) {
      const candidate = join(current, marker);
      try {
        if (existsSync(candidate)) {
          // Verify .git is a directory, package.json is a file
          const stat = statSync(candidate);
          if (marker === '.git' && (stat.isDirectory() || stat.isFile())) {
            // .git can be a file in worktrees and submodules
            return { root: current, marker };
          }
          if (marker === 'package.json' && stat.isFile()) {
            return { root: current, marker };
          }
        }
      } catch {
        // Permission denied or other FS error — skip this marker
        continue;
      }
    }

    const parent = dirname(current);
    if (parent === current) {
      // Reached filesystem root
      break;
    }
    current = parent;
    depth++;
  }

  return null;
}

/**
 * Resolve a relative memory path against the project root.
 * Uses path.join() for cross-platform compatibility.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {string} relativePath - Path relative to project root (e.g., 'memory/USER.md')
 * @returns {string} Absolute path
 *
 * @throws {TypeError} If either argument is not a non-empty string
 */
export function resolveMemoryPath(projectRoot, relativePath) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new TypeError('resolveMemoryPath: projectRoot must be a non-empty string');
  }
  if (typeof relativePath !== 'string' || relativePath.trim() === '') {
    throw new TypeError('resolveMemoryPath: relativePath must be a non-empty string');
  }

  // Security: prevent directory traversal attacks
  const resolved = resolve(projectRoot, relativePath);
  const normalizedRoot = resolve(projectRoot);
  const rootWithSep = normalizedRoot.endsWith(sep) ? normalizedRoot : normalizedRoot + sep;

  // Case-insensitive comparison on Windows where paths are case-insensitive
  const isContained = process.platform === 'win32'
    ? resolved.toLowerCase().startsWith(rootWithSep.toLowerCase()) ||
      resolved.toLowerCase() === normalizedRoot.toLowerCase()
    : resolved.startsWith(rootWithSep) || resolved === normalizedRoot;

  if (!isContained) {
    throw new Error(
      `resolveMemoryPath: path "${relativePath}" escapes project root "${projectRoot}"`
    );
  }

  return resolved;
}

/**
 * Standard directory structure created by `ai-memory init`.
 * Relative paths from project root.
 */
export const MEMORY_DIRS = [
  'memory',
  'memory/ai',
  'memory/projects',
  'memory/workflows',
  'memory/archive',
  '.cursor/rules',
];

/**
 * Mapping of template source paths (relative to templates dir)
 * to target paths (relative to project root).
 */
export const TEMPLATE_MAP = {
  'rules/memory.mdc': '.cursor/rules/memory.mdc',
  'rules/memory-ops.mdc': '.cursor/rules/memory-ops.mdc',
  'rules/memory-logs.mdc': '.cursor/rules/memory-logs.mdc',
  'memory/USER.md': 'memory/USER.md',
  'memory/WAITING_ON.md': 'memory/WAITING_ON.md',
  'memory/ai/COMMON_MISTAKES.md': 'memory/ai/COMMON_MISTAKES.md',
  'memory/GLOBAL_DAILY_LOG.md': 'memory/GLOBAL_DAILY_LOG.md',
  'agents-md.md': 'AGENTS.md',
  'memory-strategies.json': 'memory-strategies.json',
};
