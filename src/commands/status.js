/**
 * @module commands/status
 * Report memory system health: file existence, sizes, token estimates,
 * staleness, budget checks, and active project/sprint detection.
 *
 * Output: Human-readable report to stdout. Uses safeReaddir for directory
 * reads; on failure logs a warning and treats as empty (no throw).
 */

import { join } from 'node:path';
import { readdirSync } from 'node:fs';

import { findProjectRoot } from '../utils/paths.js';
import { fileExists, dirExists, checkTier1Budget, checkLogHealth } from '../utils/validation.js';

/**
 * Staleness thresholds in milliseconds.
 */
const STALE_GENERAL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const STALE_WAITING_MS = 2 * 24 * 60 * 60 * 1000;    // 2 days

/**
 * Run the status command. Prints a formatted health report to stdout.
 *
 * @param {object} [options] - Command options
 * @param {boolean} [options.json=false] - If true, output JSON instead of formatted text
 * @returns {Promise<void>}
 * @throws {TypeError} From findProjectRoot, checkTier1Budget, checkLogHealth if invalid input
 */
export async function run(options = {}) {
  const json = options.json ?? false;
  const cwd = process.cwd();
  const projectInfo = findProjectRoot(cwd);

  if (!projectInfo) {
    console.log(
      'Warning: No .git or package.json found. Checking current directory.\n'
    );
  }

  const projectRoot = projectInfo ? projectInfo.root : cwd;
  const memoryDir = join(projectRoot, 'memory');

  if (!dirExists(memoryDir)) {
    console.log(
      'No memory system found. Run "ai-memory init" to set one up.'
    );
    return;
  }

  // --- Tier 1 ---
  const tier1 = checkTier1Budget(projectRoot);

  if (json) {
    const logHealth = checkLogHealth(projectRoot);
    const rules = [
      { path: '.cursor/rules/memory.mdc', label: 'always-on' },
      { path: '.cursor/rules/memory-ops.mdc', label: 'agent-requested' },
      { path: '.cursor/rules/memory-logs.mdc', label: 'on-demand' },
    ];
    const projects = listSubdirectories(join(projectRoot, 'memory', 'projects'));
    const sprints = findSprintFiles(join(projectRoot, 'memory', 'workflows'));
    const warnings = collectWarnings(tier1, logHealth, rules, projectRoot);

    const tier1Json = {
      files: tier1.files.map((f) => ({
        relativePath: f.relativePath,
        exists: f.stats.exists,
        lines: f.stats.lines,
        estimatedTokens: f.stats.estimatedTokens,
        age: f.stats.age,
        lastModified: f.stats.lastModified
          ? f.stats.lastModified.toISOString()
          : null,
        warning: f.stats.warning ?? null,
      })),
      totalTokens: tier1.totalTokens,
      overBudget: tier1.overBudget,
      budget: tier1.budget,
    };

    const rulesJson = rules.map((r) => ({
      path: r.path,
      label: r.label,
      exists: fileExists(join(projectRoot, r.path)),
    }));

    const output = {
      tier1: tier1Json,
      logHealth: {
        exists: logHealth.exists,
        lines: logHealth.lines,
        estimatedTokens: logHealth.estimatedTokens,
        needsArchive: logHealth.needsArchive,
        warnLines: logHealth.warnLines,
        age: logHealth.age,
        warning: logHealth.warning ?? null,
      },
      rules: rulesJson,
      projects,
      sprints,
      warnings,
    };
    console.log(JSON.stringify(output, null, 2));
    return;
  }

  console.log('ai-memory status report');
  console.log('========================\n');

  console.log('Tier 1 (Always-On):');

  for (const file of tier1.files) {
    const s = file.stats;
    if (s.exists) {
      const staleWarning = isStale(file.relativePath, s.lastModified);
      const mark = staleWarning ? '⚠' : '✓';
      const staleText = staleWarning ? `  ⚠ ${staleWarning}` : '';
      const linesDisplay = s.lines === -1 ? 'File too large' : s.lines + ' lines';
      console.log(
        `  ${mark} ${padRight(file.relativePath, 35)} ` +
        `${padLeft(linesDisplay, 10)}   ` +
        `${padLeft('~' + s.estimatedTokens + ' tokens', 12)}   ` +
        `Modified: ${s.age}${staleText}`
      );
    } else {
      console.log(`  ✗ ${padRight(file.relativePath, 35)} MISSING`);
    }
  }

  const budgetStatus = tier1.overBudget ? '⚠ OVER BUDGET' : '✓ OK';
  console.log(
    `  ${'─'.repeat(60)}\n` +
    `  Tier 1 total: ~${tier1.totalTokens} tokens (budget: ${tier1.budget})  ${budgetStatus}\n`
  );

  // --- Tier 2 ---
  const logHealth = checkLogHealth(projectRoot);
  console.log('Tier 2 (On-Demand):');

  if (logHealth.exists) {
    const mark = logHealth.needsArchive ? '⚠' : '✓';
    const linesDisplay = logHealth.lines === -1 ? 'File too large' : logHealth.lines + ' lines';
    console.log(
      `  ${mark} ${padRight('memory/GLOBAL_DAILY_LOG.md', 35)} ` +
      `${padLeft(linesDisplay, 10)}   ` +
      `${padLeft('~' + logHealth.estimatedTokens + ' tokens', 12)}   ` +
      `Modified: ${logHealth.age}`
    );
    if (logHealth.needsArchive) {
      console.log(
        `  ⚠ Log exceeds ${logHealth.warnLines} lines. Run 'ai-memory archive' to clean up.`
      );
    }
  } else {
    console.log(`  ✗ ${padRight('memory/GLOBAL_DAILY_LOG.md', 35)} MISSING`);
  }
  console.log();

  // --- Rules ---
  console.log('Cursor Rules:');
  const rules = [
    { path: '.cursor/rules/memory.mdc', label: 'always-on' },
    { path: '.cursor/rules/memory-ops.mdc', label: 'agent-requested' },
    { path: '.cursor/rules/memory-logs.mdc', label: 'on-demand' },
  ];
  for (const rule of rules) {
    const exists = fileExists(join(projectRoot, rule.path));
    const mark = exists ? '✓' : '✗';
    const status = exists ? `(${rule.label})` : 'MISSING';
    console.log(`  ${mark} ${padRight(rule.path, 35)} ${status}`);
  }
  console.log();

  // --- Projects ---
  const projectsDir = join(projectRoot, 'memory', 'projects');
  const projects = listSubdirectories(projectsDir);
  console.log(`Projects: ${projects.length} detected`);
  for (const proj of projects) {
    console.log(`  memory/projects/${proj}/`);
  }
  if (projects.length === 0) {
    console.log('  (none)');
  }
  console.log();

  // --- Active Sprints ---
  const workflowsDir = join(projectRoot, 'memory', 'workflows');
  const sprints = findSprintFiles(workflowsDir);
  console.log(`Active Sprints: ${sprints.length}`);
  for (const sprint of sprints) {
    console.log(`  ${sprint}`);
  }
  if (sprints.length === 0) {
    console.log('  (none)');
  }
  console.log();

  // --- Warnings ---
  const warnings = collectWarnings(tier1, logHealth, rules, projectRoot);
  if (warnings.length > 0) {
    console.log('Warnings:');
    for (const w of warnings) {
      console.log(`  ⚠ ${w}`);
    }
  }
}

/**
 * Check if a file is stale based on its path and last modified date.
 *
 * @param {string} relativePath
 * @param {Date | null} lastModified
 * @returns {string | null} Warning message, or null if not stale
 */
function isStale(relativePath, lastModified) {
  if (!lastModified) return null;

  const ageMs = Date.now() - lastModified.getTime();

  // WAITING_ON.md has a tighter staleness threshold
  if (relativePath.includes('WAITING_ON') && ageMs > STALE_WAITING_MS) {
    return 'may be outdated (>2d)';
  }

  if (ageMs > STALE_GENERAL_MS) {
    const days = Math.floor(ageMs / (24 * 60 * 60 * 1000));
    return `stale (${days}d ago)`;
  }

  return null;
}

/**
 * Read directory contents, returning empty array on error.
 * Logs a warning when read fails (e.g. permission denied).
 *
 * @param {string} dirPath - Absolute path to directory
 * @returns {import('fs').Dirent[]}
 */
function safeReaddir(dirPath) {
  try {
    return readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    console.warn(`Could not read directory: ${dirPath}: ${err.message}`);
    return [];
  }
}

/**
 * List immediate subdirectories of a path.
 *
 * @param {string} dirPath
 * @returns {string[]}
 */
function listSubdirectories(dirPath) {
  if (!dirExists(dirPath)) return [];

  return safeReaddir(dirPath)
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
}

/**
 * Find sprint memory files under the workflows directory.
 *
 * @param {string} workflowsDir
 * @returns {string[]} Relative paths like "memory/workflows/project/role_sprint_id.md"
 */
function findSprintFiles(workflowsDir) {
  if (!dirExists(workflowsDir)) return [];

  const results = [];
  const projects = safeReaddir(workflowsDir).filter((d) => d.isDirectory());

  for (const proj of projects) {
    const projDir = join(workflowsDir, proj.name);
    const files = safeReaddir(projDir)
      .filter((f) => f.isFile() && f.name.includes('_sprint_') && f.name.endsWith('.md'));
    for (const f of files) {
      results.push(`memory/workflows/${proj.name}/${f.name}`);
    }
  }

  return results.sort();
}

/**
 * Collect all warnings for the summary section.
 *
 * @param {object} tier1
 * @param {object} logHealth
 * @param {Array<{ path: string }>} rules
 * @param {string} projectRoot
 * @returns {string[]}
 */
function collectWarnings(tier1, logHealth, rules, projectRoot) {
  const warnings = [];

  if (tier1.overBudget) {
    warnings.push(
      `Tier 1 exceeds token budget: ~${tier1.totalTokens} tokens (budget: ${tier1.budget}). ` +
      `Trim memory/USER.md or memory/ai/COMMON_MISTAKES.md to reduce.`
    );
  }

  if (logHealth.needsArchive) {
    warnings.push(
      `GLOBAL_DAILY_LOG.md exceeds ${logHealth.warnLines} lines. ` +
      `Run 'ai-memory archive' to clean up.`
    );
  }

  for (const file of tier1.files) {
    if (!file.stats.exists) {
      warnings.push(`Missing Tier 1 file: ${file.relativePath}`);
    } else if (file.stats.warning) {
      warnings.push(`${file.relativePath}: ${file.stats.warning}`);
    }
  }

  if (logHealth.warning) {
    warnings.push(`GLOBAL_DAILY_LOG.md: ${logHealth.warning}`);
  }

  for (const rule of rules) {
    if (!fileExists(join(projectRoot, rule.path))) {
      warnings.push(`Missing Cursor rule: ${rule.path}`);
    }
  }

  // Check for stale WAITING_ON.md
  const waitingFile = tier1.files.find((f) => f.relativePath.includes('WAITING_ON'));
  if (waitingFile && waitingFile.stats.exists && waitingFile.stats.lastModified) {
    const ageMs = Date.now() - waitingFile.stats.lastModified.getTime();
    if (ageMs > STALE_WAITING_MS) {
      warnings.push('WAITING_ON.md has not been updated in over 2 days.');
    }
  }

  return warnings;
}

/**
 * Pad a string to the right with spaces.
 *
 * @param {string} str
 * @param {number} len
 * @returns {string}
 */
function padRight(str, len) {
  return String(str).padEnd(len);
}

/**
 * Pad a string to the left with spaces.
 *
 * @param {string} str
 * @param {number} len
 * @returns {string}
 */
function padLeft(str, len) {
  return String(str).padStart(len);
}
