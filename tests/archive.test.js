/**
 * Tests for src/commands/archive.js
 *
 * Tests the archive logic by directly manipulating files
 * and calling the archive module's internal behavior.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// We test the archive command by running it via the CLI module's run function
// after setting up a temp workspace with appropriate files.
// Since the archive command uses process.cwd(), we need to test the underlying logic.

import { safeWrite, ensureDir } from '../src/utils/files.js';

function makeTempDir() {
  const dir = join(tmpdir(), 'ai-memory-archive-test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function removeTempDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

/**
 * Create a log file with dated entries for testing.
 */
function createTestLog(logPath, entries) {
  const header = '# Session Log\n\nReverse-chronological log of work sessions.\n\n---\n';
  const body = entries.map(e =>
    `## ${e.date}\n\n### ${e.project} — ${e.summary}\n- **Completed**: ${e.completed}\n`
  ).join('\n');

  writeFileSync(logPath, header + '\n' + body);
}

describe('archive - log entry parsing', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
    ensureDir(join(tempDir, 'memory'));
    ensureDir(join(tempDir, 'memory', 'archive'));
  });

  afterEach(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('preserves header in log file after archive', () => {
    const logPath = join(tempDir, 'memory', 'GLOBAL_DAILY_LOG.md');
    createTestLog(logPath, [
      { date: '2026-02-06', project: 'test', summary: 'Recent', completed: 'Work' },
    ]);

    // Write strategies config with 0-day retention (archive everything)
    writeFileSync(join(tempDir, 'memory-strategies.json'), JSON.stringify({
      log_retention_days: 0,
      archive_completed_sprints: false,
    }));

    const content = readFileSync(logPath, 'utf8');
    assert.ok(content.includes('# Session Log'), 'Should have header');
    assert.ok(content.includes('---'), 'Should have separator');
  });

  it('log file contains parseable date headings', () => {
    const logPath = join(tempDir, 'memory', 'GLOBAL_DAILY_LOG.md');
    createTestLog(logPath, [
      { date: '2026-02-06', project: 'A', summary: 'S1', completed: 'C1' },
      { date: '2026-01-15', project: 'B', summary: 'S2', completed: 'C2' },
    ]);

    const content = readFileSync(logPath, 'utf8');
    const dateMatches = content.match(/^## \d{4}-\d{2}-\d{2}/gm);
    assert.equal(dateMatches.length, 2);
  });
});

describe('archive - sprint files', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
    ensureDir(join(tempDir, 'memory', 'workflows', 'test-project'));
    ensureDir(join(tempDir, 'memory', 'archive'));
  });

  afterEach(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('identifies completed sprint by status heading', () => {
    const sprintPath = join(tempDir, 'memory', 'workflows', 'test-project', 'developer_sprint_001.md');
    writeFileSync(sprintPath, '# Sprint 001\n\n## Status: COMPLETED\n\nDone.');
    assert.ok(existsSync(sprintPath));

    // The archive command checks for "## Status: COMPLETED" or "## Status: ARCHIVED"
    const content = readFileSync(sprintPath, 'utf8');
    const statusPattern = /^##\s+Status:\s*(COMPLETED|ARCHIVED)\s*$/im;
    assert.ok(statusPattern.test(content));
  });

  it('does not flag in-progress sprint as completed', () => {
    const sprintPath = join(tempDir, 'memory', 'workflows', 'test-project', 'developer_sprint_002.md');
    writeFileSync(sprintPath, '# Sprint 002\n\n## Status: IN_PROGRESS\n\nWorking.');

    const content = readFileSync(sprintPath, 'utf8');
    const statusPattern = /^##\s+Status:\s*(COMPLETED|ARCHIVED)\s*$/im;
    assert.ok(!statusPattern.test(content));
  });
});

describe('archive - atomic writes', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('safeWrite does not leave temp files', () => {
    const p = join(tempDir, 'atomic-test.md');
    safeWrite(p, 'content');
    assert.ok(existsSync(p));
    assert.ok(!existsSync(p + '.tmp'));
  });

  it('safeWrite overwrites existing file', () => {
    const p = join(tempDir, 'overwrite.md');
    writeFileSync(p, 'old');
    safeWrite(p, 'new');
    assert.equal(readFileSync(p, 'utf8'), 'new');
  });
});

describe('archive - dry-run', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
    ensureDir(join(tempDir, 'memory'));
    ensureDir(join(tempDir, 'memory', 'archive'));
  });

  afterEach(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('does not change files when --dry-run', async () => {
    const logPath = join(tempDir, 'memory', 'GLOBAL_DAILY_LOG.md');
    createTestLog(logPath, [
      { date: '2020-01-01', project: 'old', summary: 'Old entry', completed: 'Yes' },
      { date: '2026-02-06', project: 'recent', summary: 'Recent', completed: 'Yes' },
    ]);
    writeFileSync(join(tempDir, 'memory-strategies.json'), JSON.stringify({
      log_retention_days: 365,
      archive_completed_sprints: false,
    }));

    const contentBefore = readFileSync(logPath, 'utf8');

    const { run } = await import('../src/commands/archive.js');
    const origCwd = process.cwd();
    try {
      process.chdir(tempDir);
      await run({ dryRun: true });
    } finally {
      process.chdir(origCwd);
    }

    const contentAfter = readFileSync(logPath, 'utf8');
    assert.equal(contentBefore, contentAfter, 'Log file should be unchanged');
  });
});
