/**
 * Tests for src/commands/status.js
 *
 * Tests the underlying validation functions that power the status command.
 * The status command itself writes to stdout, so we test the logic layer.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { checkTier1Budget, checkLogHealth, getFileStats } from '../src/utils/validation.js';

function makeTempDir() {
  const dir = join(tmpdir(), 'ai-memory-status-test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function removeTempDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

describe('status - Tier 1 budget', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
    mkdirSync(join(tempDir, 'memory', 'ai'), { recursive: true });
  });

  afterEach(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('reports all three Tier 1 files', () => {
    writeFileSync(join(tempDir, 'memory', 'USER.md'), 'user');
    writeFileSync(join(tempDir, 'memory', 'WAITING_ON.md'), 'waiting');
    writeFileSync(join(tempDir, 'memory', 'ai', 'COMMON_MISTAKES.md'), 'mistakes');

    const result = checkTier1Budget(tempDir);
    assert.equal(result.files.length, 3);
    assert.ok(result.files.every(f => f.stats.exists));
  });

  it('token estimates are reasonable', () => {
    // 100 chars should be ~25 tokens
    const content = 'a'.repeat(100);
    writeFileSync(join(tempDir, 'memory', 'USER.md'), content);
    writeFileSync(join(tempDir, 'memory', 'WAITING_ON.md'), '');
    writeFileSync(join(tempDir, 'memory', 'ai', 'COMMON_MISTAKES.md'), '');

    const result = checkTier1Budget(tempDir);
    const userFile = result.files.find(f => f.relativePath.includes('USER'));
    assert.equal(userFile.stats.estimatedTokens, 25);
  });

  it('triggers over-budget warning at threshold', () => {
    // 16001 chars / 4 = 4001 tokens — just over 4000 budget
    writeFileSync(join(tempDir, 'memory', 'USER.md'), 'x'.repeat(16001));
    writeFileSync(join(tempDir, 'memory', 'WAITING_ON.md'), '');
    writeFileSync(join(tempDir, 'memory', 'ai', 'COMMON_MISTAKES.md'), '');

    const result = checkTier1Budget(tempDir, 4000);
    assert.equal(result.overBudget, true);
  });

  it('does not trigger under budget', () => {
    writeFileSync(join(tempDir, 'memory', 'USER.md'), 'x'.repeat(100));
    writeFileSync(join(tempDir, 'memory', 'WAITING_ON.md'), 'x'.repeat(100));
    writeFileSync(join(tempDir, 'memory', 'ai', 'COMMON_MISTAKES.md'), 'x'.repeat(100));

    const result = checkTier1Budget(tempDir, 4000);
    assert.equal(result.overBudget, false);
  });
});

describe('status - log health', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
    mkdirSync(join(tempDir, 'memory'), { recursive: true });
  });

  afterEach(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('reports existing log', () => {
    writeFileSync(join(tempDir, 'memory', 'GLOBAL_DAILY_LOG.md'), '# Log\n---\n');
    const result = checkLogHealth(tempDir);
    assert.equal(result.exists, true);
    assert.ok(result.lines > 0);
  });

  it('reports missing log', () => {
    const result = checkLogHealth(tempDir);
    assert.equal(result.exists, false);
  });

  it('flags log needing archive', () => {
    const lines = Array.from({ length: 600 }, (_, i) => `Line ${i}`).join('\n');
    writeFileSync(join(tempDir, 'memory', 'GLOBAL_DAILY_LOG.md'), lines);

    const result = checkLogHealth(tempDir, 500);
    assert.equal(result.needsArchive, true);
  });

  it('does not flag small log', () => {
    writeFileSync(join(tempDir, 'memory', 'GLOBAL_DAILY_LOG.md'), 'Small log');
    const result = checkLogHealth(tempDir, 500);
    assert.equal(result.needsArchive, false);
  });

  it('returns warning and lines: -1 when log file exceeds 10 MB', () => {
    const logPath = join(tempDir, 'memory', 'GLOBAL_DAILY_LOG.md');
    writeFileSync(logPath, Buffer.alloc(10 * 1024 * 1024 + 1, 'x'));

    const result = checkLogHealth(tempDir);
    assert.equal(result.exists, true);
    assert.equal(result.lines, -1);
    assert.equal(result.warning, 'File too large to analyze');
    assert.equal(result.needsArchive, false);
  });
});

describe('status - staleness detection', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('detects recent files', () => {
    const p = join(tempDir, 'recent.md');
    writeFileSync(p, 'content');
    const stats = getFileStats(p);
    assert.ok(stats.age === 'just now' || stats.age.includes('m ago') || stats.age.includes('s ago'));
  });
});

describe('status - JSON output', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
    mkdirSync(join(tempDir, 'memory', 'ai'), { recursive: true });
  });

  afterEach(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('outputs valid JSON with expected keys when --json', async () => {
    writeFileSync(join(tempDir, 'package.json'), '{}');
    writeFileSync(join(tempDir, 'memory', 'USER.md'), 'user');
    writeFileSync(join(tempDir, 'memory', 'WAITING_ON.md'), 'waiting');
    writeFileSync(join(tempDir, 'memory', 'ai', 'COMMON_MISTAKES.md'), 'mistakes');
    writeFileSync(join(tempDir, 'memory', 'GLOBAL_DAILY_LOG.md'), '# Log\n---\n');

    const { run } = await import('../src/commands/status.js');
    const origCwd = process.cwd();
    let output = '';
    const origLog = console.log;
    try {
      process.chdir(tempDir);
      console.log = (...args) => { output += args.join(' '); };
      await run({ json: true });
    } finally {
      process.chdir(origCwd);
      console.log = origLog;
    }

    const parsed = JSON.parse(output);
    assert.ok(parsed.tier1, 'Should have tier1');
    assert.ok(parsed.logHealth, 'Should have logHealth');
    assert.ok(Array.isArray(parsed.rules), 'Should have rules array');
    assert.ok(Array.isArray(parsed.projects), 'Should have projects array');
    assert.ok(Array.isArray(parsed.sprints), 'Should have sprints array');
    assert.ok(Array.isArray(parsed.warnings), 'Should have warnings array');
  });
});
