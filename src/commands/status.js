/**
 * @module commands/status
 * Report memory system health: file existence, sizes, token estimates,
 * staleness, budget checks, and active project/sprint detection.
 */

import { join } from 'node:path';
import { readdirSync, existsSync } from 'node:fs';

import { findProjectRoot } from '../utils/paths.js';
import { fileExists, dirExists, getFileStats, checkTier1Budget, checkLogHealth } from '../utils/validation.js';

/**
 * Staleness thresholds in milliseconds.
 */
const STALE_GENERAL_MS = 7 * 24 * 60 * 60 * 1000;   // 7 days
const STALE_WAITING_MS = 2 * 24 * 60 * 60 * 1000;    // 2 days

/**
 * Run the status command.
 */
export async function run() {
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

  console.log('ai-memory status report');
  console.log('========================\n');

  // --- Tier 1 ---
  const tier1 = checkTier1Budget(projectRoot);
  console.log('Tier 1 (Always-On):');

  for (const file of tier1.files) {
    const s = file.stats;
    if (s.exists) {
      const staleWarning = isStale(file.relativePath, s.lastModified);
      const mark = staleWarning ? '⚠' : '✓';
      const staleText = staleWarning ? `  ⚠ ${staleWarning}` : '';
      console.log(
        `  ${mark} ${padRight(file.relativePath, 35)} ` +
        `${padLeft(s.lines + ' lines', 10)}   ` +
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
    console.log(
      `  ${mark} ${padRight('memory/GLOBAL_DAILY_LOG.md', 35)} ` +
      `${padLeft(logHealth.lines + ' lines', 10)}   ` +
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
 * List immediate subdirectories of a path.
 *
 * @param {string} dirPath
 * @returns {string[]}
 */
function listSubdirectories(dirPath) {
  if (!dirExists(dirPath)) return [];

  try {
    return readdirSync(dirPath, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name)
      .sort();
  } catch {
    return [];
  }
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
  try {
    const projects = readdirSync(workflowsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const proj of projects) {
      const projDir = join(workflowsDir, proj.name);
      try {
        const files = readdirSync(projDir, { withFileTypes: true })
          .filter((f) => f.isFile() && f.name.includes('_sprint_') && f.name.endsWith('.md'));
        for (const f of files) {
          results.push(`memory/workflows/${proj.name}/${f.name}`);
        }
      } catch {
        // Skip unreadable project directories
      }
    }
  } catch {
    // Skip unreadable workflows directory
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
    }
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
