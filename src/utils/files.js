/**
 * @module files
 * Safe file operations: atomic writes, directory creation,
 * template copying, and append-with-header for log files.
 */

import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync, unlinkSync, lstatSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';

/**
 * Write content to a file atomically.
 *
 * Writes to `filePath + '.tmp'` first, then renames to the final path.
 * This prevents partial writes from corrupting existing files.
 * Creates parent directories if they don't exist.
 *
 * @param {string} filePath - Absolute path to write to
 * @param {string} content - File content to write
 * @throws {TypeError} If arguments are invalid
 * @throws {Error} If the write or rename fails
 */
export function safeWrite(filePath, content) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError('safeWrite: filePath must be a non-empty string');
  }
  if (typeof content !== 'string') {
    throw new TypeError('safeWrite: content must be a string');
  }

  const dir = dirname(filePath);
  ensureDir(dir);

  // Security: refuse to write through symlinks
  if (existsSync(filePath) && lstatSync(filePath).isSymbolicLink()) {
    throw new Error(`safeWrite: refusing to write through symlink: "${filePath}"`);
  }

  // Randomized temp file name to prevent symlink attacks
  const suffix = randomBytes(4).toString('hex');
  const tmpPath = filePath + '.' + suffix + '.tmp';

  try {
    writeFileSync(tmpPath, content, 'utf8');
    renameSync(tmpPath, filePath);
  } catch (err) {
    // Clean up temp file on failure
    try {
      if (existsSync(tmpPath)) {
        unlinkSync(tmpPath);
      }
    } catch {
      // Best-effort cleanup
    }
    throw new Error(`safeWrite: failed to write "${filePath}": ${err.message}`);
  }
}

/**
 * Append content to a log file, inserting new content after the header.
 *
 * For GLOBAL_DAILY_LOG.md, the "header" is everything up to and including
 * the first `---` separator line. New content is inserted after this header,
 * before existing entries (newest-first order).
 *
 * @param {string} filePath - Absolute path to the log file
 * @param {string} content - Content to prepend after the header
 * @throws {TypeError} If arguments are invalid
 * @throws {Error} If the file doesn't exist or write fails
 */
export function safeAppend(filePath, content) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError('safeAppend: filePath must be a non-empty string');
  }
  if (typeof content !== 'string') {
    throw new TypeError('safeAppend: content must be a string');
  }

  if (!existsSync(filePath)) {
    throw new Error(`safeAppend: file does not exist: "${filePath}"`);
  }

  const existing = readFileSync(filePath, 'utf8');
  const lines = existing.split('\n');

  // Find the header separator (first line that is exactly '---')
  let headerEndIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      headerEndIndex = i;
      break;
    }
  }

  let updated;
  if (headerEndIndex >= 0) {
    // Insert after header, trimming leading whitespace from body to prevent
    // blank line accumulation on repeated appends
    const header = lines.slice(0, headerEndIndex + 1).join('\n');
    const body = lines.slice(headerEndIndex + 1).join('\n').trimStart();
    updated = header + '\n\n' + content.trim() + '\n\n' + (body || '');
  } else {
    // No header found — prepend to file
    updated = content.trim() + '\n\n' + existing;
  }

  safeWrite(filePath, updated);
}

/**
 * Copy a template file to a target location.
 *
 * @param {string} templatePath - Absolute path to the template source
 * @param {string} targetPath - Absolute path to the target destination
 * @param {boolean} [overwrite=false] - Whether to overwrite existing files
 * @returns {'created' | 'skipped' | 'overwritten'} What action was taken
 * @throws {TypeError} If arguments are invalid
 * @throws {Error} If the template file doesn't exist
 */
export function copyTemplate(templatePath, targetPath, overwrite = false) {
  if (typeof templatePath !== 'string' || templatePath.trim() === '') {
    throw new TypeError('copyTemplate: templatePath must be a non-empty string');
  }
  if (typeof targetPath !== 'string' || targetPath.trim() === '') {
    throw new TypeError('copyTemplate: targetPath must be a non-empty string');
  }

  if (!existsSync(templatePath)) {
    throw new Error(`copyTemplate: template not found: "${templatePath}"`);
  }

  const targetExists = existsSync(targetPath);

  if (targetExists && !overwrite) {
    return 'skipped';
  }

  const content = readFileSync(templatePath, 'utf8');
  safeWrite(targetPath, content);

  return targetExists ? 'overwritten' : 'created';
}

/**
 * Ensure a directory exists, creating it recursively if needed.
 *
 * @param {string} dirPath - Absolute path to the directory
 */
export function ensureDir(dirPath) {
  if (typeof dirPath !== 'string' || dirPath.trim() === '') {
    throw new TypeError('ensureDir: dirPath must be a non-empty string');
  }

  if (!existsSync(dirPath)) {
    mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Append a line to a file if that line is not already present.
 * Used for .gitignore and .cursorignore management.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {string} line - Line to ensure is present
 * @returns {boolean} Whether the line was added (false if already present)
 */
export function ensureLineInFile(filePath, line) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    throw new TypeError('ensureLineInFile: filePath must be a non-empty string');
  }
  if (typeof line !== 'string') {
    throw new TypeError('ensureLineInFile: line must be a string');
  }

  let existing = '';
  if (existsSync(filePath)) {
    existing = readFileSync(filePath, 'utf8');
  }

  const trimmedLine = line.trim();
  const lines = existing.split('\n').map((l) => l.trim());

  if (lines.includes(trimmedLine)) {
    return false;
  }

  // Ensure file ends with newline before appending
  const separator = existing.length > 0 && !existing.endsWith('\n') ? '\n' : '';
  const newContent = existing + separator + trimmedLine + '\n';

  ensureDir(dirname(filePath));
  safeWrite(filePath, newContent);
  return true;
}
