/**
 * @module validation
 * File existence checks, size validation, token estimation,
 * and memory system health checks.
 */

import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Check whether a file exists at the given path.
 * Returns false on any error (e.g. permission denied); logs a warning.
 *
 * @param {string} filePath - Absolute path to check
 * @returns {boolean}
 */
export function fileExists(filePath) {
  if (typeof filePath !== 'string' || filePath.trim() === '') {
    return false;
  }
  try {
    return existsSync(filePath) && statSync(filePath).isFile();
  } catch (err) {
    console.warn(`fileExists failed: ${filePath}: ${err.message}`);
    return false;
  }
}

/**
 * Check whether a directory exists at the given path.
 * Returns false on any error (e.g. permission denied); logs a warning.
 *
 * @param {string} dirPath - Absolute path to check
 * @returns {boolean}
 */
export function dirExists(dirPath) {
  if (typeof dirPath !== 'string' || dirPath.trim() === '') {
    return false;
  }
  try {
    return existsSync(dirPath) && statSync(dirPath).isDirectory();
  } catch (err) {
    console.warn(`dirExists failed: ${dirPath}: ${err.message}`);
    return false;
  }
}

/**
 * Get detailed statistics about a file.
 *
 * Token estimation uses `Math.ceil(characters / 4)` as a rough heuristic.
 * This is imprecise but directionally correct for English text with markdown.
 *
 * On read error (e.g. permission denied), logs a warning and returns
 * empty stats (exists: false, lines: 0, etc.).
 *
 * @param {string} filePath - Absolute path to the file
 * @returns {{
 *   exists: boolean,
 *   lines: number,
 *   characters: number,
 *   estimatedTokens: number,
 *   lastModified: Date | null,
 *   age: string
 * }}
 */
export function getFileStats(filePath) {
  const empty = {
    exists: false,
    lines: 0,
    characters: 0,
    estimatedTokens: 0,
    lastModified: null,
    age: 'n/a',
  };

  if (!fileExists(filePath)) {
    return empty;
  }

  try {
    const content = readFileSync(filePath, 'utf8');
    const stat = statSync(filePath);
    const lines = content.split('\n').length;
    const characters = content.length;
    const estimatedTokens = Math.ceil(characters / 4);
    const lastModified = stat.mtime;
    const age = formatAge(lastModified);

    return { exists: true, lines, characters, estimatedTokens, lastModified, age };
  } catch (err) {
    console.warn(`getFileStats failed: ${filePath}: ${err.message}`);
    return empty;
  }
}

/**
 * Check the Tier 1 token budget across all always-on memory files.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {number} [budget=4000] - Maximum allowed tokens for Tier 1
 * @returns {{
 *   files: Array<{ path: string, relativePath: string, stats: object }>,
 *   totalTokens: number,
 *   overBudget: boolean,
 *   budget: number
 * }}
 */
export function checkTier1Budget(projectRoot, budget = 4000) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new TypeError('checkTier1Budget: projectRoot must be a non-empty string');
  }
  if (typeof budget !== 'number' || budget <= 0 || !Number.isFinite(budget)) {
    throw new TypeError('checkTier1Budget: budget must be a positive finite number');
  }

  const tier1Files = [
    'memory/USER.md',
    'memory/WAITING_ON.md',
    'memory/ai/COMMON_MISTAKES.md',
  ];

  const files = tier1Files.map((relativePath) => {
    const fullPath = join(projectRoot, relativePath);
    const stats = getFileStats(fullPath);
    return { path: fullPath, relativePath, stats };
  });

  const totalTokens = files.reduce((sum, f) => sum + f.stats.estimatedTokens, 0);

  return {
    files,
    totalTokens,
    overBudget: totalTokens > budget,
    budget,
  };
}

/**
 * Check health of the global daily log.
 *
 * @param {string} projectRoot - Absolute path to the project root
 * @param {number} [warnLines=500] - Line count threshold for warnings
 * @returns {{
 *   exists: boolean,
 *   lines: number,
 *   estimatedTokens: number,
 *   needsArchive: boolean,
 *   warnLines: number,
 *   age: string
 * }}
 */
export function checkLogHealth(projectRoot, warnLines = 500) {
  if (typeof projectRoot !== 'string' || projectRoot.trim() === '') {
    throw new TypeError('checkLogHealth: projectRoot must be a non-empty string');
  }

  const logPath = join(projectRoot, 'memory', 'GLOBAL_DAILY_LOG.md');
  const stats = getFileStats(logPath);

  return {
    exists: stats.exists,
    lines: stats.lines,
    estimatedTokens: stats.estimatedTokens,
    needsArchive: stats.lines > warnLines,
    warnLines,
    age: stats.age,
  };
}

/**
 * Format a Date as a human-readable age string.
 *
 * @param {Date} date
 * @returns {string} e.g., "2m ago", "3h ago", "5d ago"
 */
export function formatAge(date) {
  if (!(date instanceof Date) || isNaN(date.getTime())) {
    return 'n/a';
  }

  const now = Date.now();
  const diffMs = now - date.getTime();

  if (diffMs < 0) {
    return 'just now';
  }

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
}
