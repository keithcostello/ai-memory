/**
 * @module commands/archive
 * Archive old log entries and completed sprint files.
 *
 * - Parses GLOBAL_DAILY_LOG.md by date headings (## YYYY-MM-DD)
 * - Moves entries older than retention period to memory/archive/
 * - Archives completed sprint files
 * - Uses atomic writes to prevent data loss
 */

import { readFileSync, readdirSync, existsSync, unlinkSync } from 'node:fs';
import { join, basename } from 'node:path';

import { findProjectRoot } from '../utils/paths.js';
import { fileExists, dirExists, getFileStats } from '../utils/validation.js';
import { safeWrite, ensureDir } from '../utils/files.js';

/**
 * Default retention period in days.
 */
const DEFAULT_RETENTION_DAYS = 14;

/**
 * Run the archive command. Archives old log entries and completed sprints.
 *
 * Options: Uses memory-strategies.json for retention; falls back to defaults
 * on parse error (logs warning). Sprint processing errors are logged per
 * file/directory; does not abort the full run.
 *
 * @returns {Promise<void>}
 * @throws {TypeError} From findProjectRoot if cwd is invalid
 * @throws {Error} From safeWrite, ensureDir on FS failure
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

  // Load retention config
  const config = loadConfig(projectRoot);
  const retentionDays = config.log_retention_days || DEFAULT_RETENTION_DAYS;
  const archiveSprintsEnabled = config.archive_completed_sprints !== false;

  console.log(`ai-memory archive`);
  console.log(`Retention: ${retentionDays} days\n`);

  let logResult = { archived: 0, beforeLines: 0, afterLines: 0 };
  let sprintResult = { archived: 0 };

  // Archive log entries
  const logPath = join(projectRoot, 'memory', 'GLOBAL_DAILY_LOG.md');
  if (fileExists(logPath)) {
    logResult = archiveLogEntries(logPath, projectRoot, retentionDays);
  } else {
    console.log('No GLOBAL_DAILY_LOG.md found — skipping log archive.\n');
  }

  // Archive completed sprints
  if (archiveSprintsEnabled) {
    sprintResult = archiveCompletedSprints(projectRoot);
  }

  // Print summary
  console.log(`\n${'='.repeat(50)}`);
  console.log('Archive complete\n');

  if (logResult.archived > 0) {
    console.log(
      `  Log entries archived: ${logResult.archived} ` +
      `(before ${getCutoffDate(retentionDays).toISOString().slice(0, 10)})`
    );
    console.log(
      `  GLOBAL_DAILY_LOG.md: ${logResult.beforeLines} → ${logResult.afterLines} lines`
    );
  } else {
    console.log('  No log entries old enough to archive.');
  }

  if (sprintResult.archived > 0) {
    console.log(`  Completed sprints archived: ${sprintResult.archived}`);
  } else if (archiveSprintsEnabled) {
    console.log('  No completed sprints to archive.');
  }
}

/**
 * Parse the log file into header + dated sections, archive old sections.
 *
 * @param {string} logPath - Absolute path to GLOBAL_DAILY_LOG.md
 * @param {string} projectRoot - Absolute path to project root
 * @param {number} retentionDays - Number of days to retain
 * @returns {{ archived: number, beforeLines: number, afterLines: number }}
 */
function archiveLogEntries(logPath, projectRoot, retentionDays) {
  const content = readFileSync(logPath, 'utf8');
  const beforeLines = content.split('\n').length;
  const cutoff = getCutoffDate(retentionDays);

  // Parse into sections
  const { header, sections } = parseLogSections(content);

  const keep = [];
  const archiveByDate = new Map();
  let archivedCount = 0;

  for (const section of sections) {
    const sectionDate = parseDateFromHeading(section.heading);

    if (sectionDate && sectionDate < cutoff) {
      // Archive this section
      const dateStr = sectionDate.toISOString().slice(0, 10);
      if (!archiveByDate.has(dateStr)) {
        archiveByDate.set(dateStr, []);
      }
      archiveByDate.get(dateStr).push(section.content);
      archivedCount++;
    } else {
      // Keep this section
      keep.push(section.content);
    }
  }

  if (archivedCount === 0) {
    return { archived: 0, beforeLines, afterLines: beforeLines };
  }

  // Write archived entries to memory/archive/YYYY-MM-DD/
  for (const [dateStr, entries] of archiveByDate) {
    const archiveDir = join(projectRoot, 'memory', 'archive', dateStr);
    ensureDir(archiveDir);

    const archivePath = join(archiveDir, 'GLOBAL_DAILY_LOG.md');
    let existingArchive = '';
    if (existsSync(archivePath)) {
      existingArchive = readFileSync(archivePath, 'utf8');
    }

    const archiveContent = entries.join('\n\n') +
      (existingArchive ? '\n\n' + existingArchive : '');
    safeWrite(archivePath, archiveContent);
    console.log(`  → memory/archive/${dateStr}/GLOBAL_DAILY_LOG.md`);
  }

  // Rewrite the log file with only kept entries
  const newContent = keep.length > 0
    ? header + '\n\n' + keep.join('\n\n') + '\n'
    : header + '\n';
  safeWrite(logPath, newContent);

  const afterLines = newContent.split('\n').length;
  return { archived: archivedCount, beforeLines, afterLines };
}

/**
 * Parse log content into a header and dated sections.
 *
 * @param {string} content
 * @returns {{ header: string, sections: Array<{ heading: string, content: string }> }}
 */
function parseLogSections(content) {
  const lines = content.split('\n');
  let headerEnd = -1;

  // Header is everything up to and including the first `---`
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      headerEnd = i;
      break;
    }
  }

  const header = headerEnd >= 0
    ? lines.slice(0, headerEnd + 1).join('\n')
    : '';

  const bodyLines = headerEnd >= 0
    ? lines.slice(headerEnd + 1)
    : lines;

  // Split body into sections by ## headings
  const sections = [];
  let current = null;

  for (const line of bodyLines) {
    if (line.startsWith('## ')) {
      if (current) {
        sections.push({
          heading: current.heading,
          content: current.lines.join('\n').trim(),
        });
      }
      current = { heading: line, lines: [line] };
    } else if (current) {
      current.lines.push(line);
    }
    // Lines before first heading are part of header padding — ignore
  }

  if (current) {
    sections.push({
      heading: current.heading,
      content: current.lines.join('\n').trim(),
    });
  }

  return { header, sections };
}

/**
 * Extract a Date from a `## YYYY-MM-DD` heading.
 *
 * @param {string} heading
 * @returns {Date | null}
 */
function parseDateFromHeading(heading) {
  const match = heading.match(/^##\s+(\d{4}-\d{2}-\d{2})/);
  if (!match) return null;

  const date = new Date(match[1] + 'T00:00:00Z');
  if (isNaN(date.getTime())) return null;

  return date;
}

/**
 * Get the cutoff date: entries before this date should be archived.
 *
 * @param {number} retentionDays
 * @returns {Date}
 */
function getCutoffDate(retentionDays) {
  const now = new Date();
  return new Date(now.getTime() - retentionDays * 24 * 60 * 60 * 1000);
}

/**
 * Archive sprint files that are marked as completed.
 *
 * @param {string} projectRoot
 * @returns {{ archived: number }}
 */
function archiveCompletedSprints(projectRoot) {
  const workflowsDir = join(projectRoot, 'memory', 'workflows');
  if (!dirExists(workflowsDir)) return { archived: 0 };

  let archived = 0;

  try {
    const projects = readdirSync(workflowsDir, { withFileTypes: true })
      .filter((d) => d.isDirectory());

    for (const proj of projects) {
      const projDir = join(workflowsDir, proj.name);
      try {
        const files = readdirSync(projDir, { withFileTypes: true })
          .filter((f) => f.isFile() && f.name.includes('_sprint_') && f.name.endsWith('.md'));

        for (const file of files) {
          const filePath = join(projDir, file.name);
          try {
            const content = readFileSync(filePath, 'utf8');

            if (isSprintCompleted(content)) {
              const dateStr = new Date().toISOString().slice(0, 10);
              const archiveDir = join(
                projectRoot, 'memory', 'archive', dateStr, 'workflows', proj.name
              );
              ensureDir(archiveDir);

              const archivePath = join(archiveDir, file.name);
              safeWrite(archivePath, content);

              try {
                unlinkSync(filePath);
              } catch (unlinkErr) {
                console.warn(
                  `  ⚠ Archived but could not delete original: ${filePath} (${unlinkErr.message})`
                );
              }

              console.log(
                `  → Archived: memory/workflows/${proj.name}/${file.name}`
              );
              archived++;
            }
          } catch (err) {
            console.warn(`  Warning: could not process ${basename(filePath)}: ${err.message}`);
          }
        }
      } catch (err) {
        console.warn(`  Warning: could not read project directory ${proj.name}: ${err.message}`);
      }
    }
  } catch (err) {
    console.warn(`  Warning: could not read workflows directory: ${err.message}`);
  }

  return { archived };
}

/**
 * Check if a sprint file's content indicates completion.
 *
 * Looks for `## Status: COMPLETED` or `## Status: ARCHIVED` in the content.
 *
 * @param {string} content
 * @returns {boolean}
 */
function isSprintCompleted(content) {
  const statusPattern = /^##\s+Status:\s*(COMPLETED|ARCHIVED)\s*$/im;
  return statusPattern.test(content);
}

/**
 * Load memory-strategies.json, falling back to defaults if missing.
 *
 * @param {string} projectRoot
 * @returns {object}
 */
function loadConfig(projectRoot) {
  const configPath = join(projectRoot, 'memory-strategies.json');

  if (!fileExists(configPath)) {
    return {
      log_retention_days: DEFAULT_RETENTION_DAYS,
      archive_completed_sprints: true,
      warn_tier1_tokens: 4000,
      warn_log_lines: 500,
    };
  }

  try {
    const raw = readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);

    // Validate and pick only known fields to prevent unexpected properties
    const retentionDays = (typeof parsed.log_retention_days === 'number' &&
      parsed.log_retention_days >= 1 &&
      parsed.log_retention_days <= 365 &&
      Number.isFinite(parsed.log_retention_days))
      ? Math.floor(parsed.log_retention_days)
      : DEFAULT_RETENTION_DAYS;

    return {
      log_retention_days: retentionDays,
      archive_completed_sprints: parsed.archive_completed_sprints === true,
      warn_tier1_tokens: (typeof parsed.warn_tier1_tokens === 'number' && parsed.warn_tier1_tokens > 0)
        ? parsed.warn_tier1_tokens
        : 4000,
      warn_log_lines: (typeof parsed.warn_log_lines === 'number' && parsed.warn_log_lines > 0)
        ? parsed.warn_log_lines
        : 500,
    };
  } catch (err) {
    console.warn(
      `Warning: Could not parse memory-strategies.json: ${err.message}\n` +
      `Using default settings.`
    );
    return {
      log_retention_days: DEFAULT_RETENTION_DAYS,
      archive_completed_sprints: true,
      warn_tier1_tokens: 4000,
      warn_log_lines: 500,
    };
  }
}
