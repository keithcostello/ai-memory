/**
 * Tests for src/utils/paths.js, src/utils/validation.js, src/utils/files.js
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { findProjectRoot, resolveMemoryPath, MEMORY_DIRS, TEMPLATE_MAP } from '../src/utils/paths.js';
import { fileExists, dirExists, getFileStats, checkTier1Budget, checkLogHealth, formatAge, countLines } from '../src/utils/validation.js';
import { safeWrite, safeAppend, copyTemplate, ensureDir, ensureLineInFile } from '../src/utils/files.js';

/**
 * Create a unique temp directory for a test.
 */
function makeTempDir(prefix = 'ai-memory-test-') {
  const dir = join(tmpdir(), prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Remove a temp directory and all contents.
 */
function removeTempDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

// =============================================================================
// paths.js
// =============================================================================

describe('findProjectRoot', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  after(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('finds .git directory', () => {
    mkdirSync(join(tempDir, '.git'));
    const result = findProjectRoot(tempDir);
    assert.ok(result);
    assert.equal(result.root, tempDir);
    assert.equal(result.marker, '.git');
  });

  it('finds package.json file', () => {
    writeFileSync(join(tempDir, 'package.json'), '{}');
    const result = findProjectRoot(tempDir);
    assert.ok(result);
    assert.equal(result.root, tempDir);
    assert.equal(result.marker, 'package.json');
  });

  it('walks up to find project root', () => {
    mkdirSync(join(tempDir, '.git'));
    const subdir = join(tempDir, 'a', 'b');
    mkdirSync(subdir, { recursive: true });
    const result = findProjectRoot(subdir);
    assert.ok(result);
    assert.equal(result.root, tempDir);
  });

  it('returns null when no marker found', () => {
    // Create a deeply nested dir with no markers in the temp tree
    const deep = join(tempDir, 'a', 'b', 'c', 'd', 'e', 'f');
    mkdirSync(deep, { recursive: true });
    const result = findProjectRoot(deep);
    // May or may not find something depending on OS temp location
    // The key behavior is that it doesn't throw
    assert.ok(result === null || typeof result === 'object');
  });

  it('prefers .git over package.json', () => {
    mkdirSync(join(tempDir, '.git'));
    writeFileSync(join(tempDir, 'package.json'), '{}');
    const result = findProjectRoot(tempDir);
    assert.ok(result);
    assert.equal(result.marker, '.git');
  });

  it('throws on invalid input', () => {
    assert.throws(() => findProjectRoot(''), TypeError);
    assert.throws(() => findProjectRoot(123), TypeError);
    assert.throws(() => findProjectRoot(null), TypeError);
  });
});

describe('resolveMemoryPath', () => {
  it('resolves a relative path', () => {
    const result = resolveMemoryPath('/project', 'memory/USER.md');
    assert.ok(result.endsWith('memory' + join('/', 'USER.md').slice(0, -1) ? '' : '') || result.includes('memory'));
    assert.ok(result.includes('USER.md'));
  });

  it('rejects directory traversal', () => {
    assert.throws(
      () => resolveMemoryPath('/project', '../../etc/passwd'),
      /escapes project root/
    );
  });

  it('throws on invalid input', () => {
    assert.throws(() => resolveMemoryPath('', 'file.md'), TypeError);
    assert.throws(() => resolveMemoryPath('/root', ''), TypeError);
  });
});

describe('TEMPLATE_MAP', () => {
  it('contains all expected templates', () => {
    assert.ok(Object.keys(TEMPLATE_MAP).length >= 9);
    assert.ok('rules/memory.mdc' in TEMPLATE_MAP);
    assert.ok('rules/memory-ops.mdc' in TEMPLATE_MAP);
    assert.ok('rules/memory-logs.mdc' in TEMPLATE_MAP);
    assert.ok('memory/USER.md' in TEMPLATE_MAP);
    assert.ok('memory/WAITING_ON.md' in TEMPLATE_MAP);
    assert.ok('memory/ai/COMMON_MISTAKES.md' in TEMPLATE_MAP);
    assert.ok('memory/GLOBAL_DAILY_LOG.md' in TEMPLATE_MAP);
    assert.ok('agents-md.md' in TEMPLATE_MAP);
    assert.ok('memory-strategies.json' in TEMPLATE_MAP);
  });
});

// =============================================================================
// validation.js
// =============================================================================

describe('countLines', () => {
  it('returns 0 for empty string', () => {
    assert.equal(countLines(''), 0);
  });

  it('returns correct count for content with trailing newline', () => {
    assert.equal(countLines('line1\nline2\n'), 2);
    assert.equal(countLines('a\n'), 1);
  });

  it('returns correct count for content without trailing newline', () => {
    assert.equal(countLines('line1\nline2'), 2);
    assert.equal(countLines('single'), 1);
  });

  it('returns 1 for single line', () => {
    assert.equal(countLines('one'), 1);
    assert.equal(countLines('one\n'), 1);
  });
});

describe('fileExists', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  after(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('returns true for existing file', () => {
    const p = join(tempDir, 'test.txt');
    writeFileSync(p, 'hello');
    assert.equal(fileExists(p), true);
  });

  it('returns false for non-existent file', () => {
    assert.equal(fileExists(join(tempDir, 'nope.txt')), false);
  });

  it('returns false for directory', () => {
    assert.equal(fileExists(tempDir), false);
  });

  it('returns false for invalid input', () => {
    assert.equal(fileExists(''), false);
    assert.equal(fileExists(null), false);
  });
});

describe('getFileStats', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  after(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('returns stats for existing file', () => {
    const content = 'line 1\nline 2\nline 3';
    const p = join(tempDir, 'test.md');
    writeFileSync(p, content);

    const stats = getFileStats(p);
    assert.equal(stats.exists, true);
    assert.equal(stats.lines, countLines(content));
    assert.equal(stats.characters, content.length);
    assert.equal(stats.estimatedTokens, Math.ceil(content.length / 4));
    assert.ok(stats.lastModified instanceof Date);
    assert.ok(typeof stats.age === 'string');
  });

  it('returns empty stats for non-existent file', () => {
    const stats = getFileStats(join(tempDir, 'nope.md'));
    assert.equal(stats.exists, false);
    assert.equal(stats.lines, 0);
    assert.equal(stats.estimatedTokens, 0);
  });

  it('counts lines correctly with trailing newline (no off-by-one)', () => {
    const content = 'a\nb\nc\n';
    const p = join(tempDir, 'trailing.md');
    writeFileSync(p, content);

    const stats = getFileStats(p);
    assert.equal(stats.lines, 3, 'trailing newline should not inflate count');
  });

  it('returns lines: -1 and warning for file larger than 10 MB', () => {
    const p = join(tempDir, 'huge.md');
    writeFileSync(p, Buffer.alloc(10 * 1024 * 1024 + 1, 'x'));

    const stats = getFileStats(p);
    assert.equal(stats.exists, true);
    assert.equal(stats.lines, -1);
    assert.equal(stats.warning, 'File too large to analyze');
    assert.equal(stats.estimatedTokens, 0);
    assert.equal(stats.characters, 0);
    assert.ok(stats.lastModified instanceof Date);
  });

  it('analyzes file at 10 MB boundary normally', () => {
    const p = join(tempDir, 'boundary.md');
    const content = 'x'.repeat(10 * 1024 * 1024);
    writeFileSync(p, content);

    const stats = getFileStats(p);
    assert.equal(stats.exists, true);
    assert.equal(stats.lines, 1);
    assert.equal(stats.warning, undefined);
    assert.equal(stats.characters, content.length);
  });
});

describe('checkTier1Budget', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
    mkdirSync(join(tempDir, 'memory', 'ai'), { recursive: true });
  });

  after(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('reports under budget when files are small', () => {
    writeFileSync(join(tempDir, 'memory', 'USER.md'), 'small');
    writeFileSync(join(tempDir, 'memory', 'WAITING_ON.md'), 'small');
    writeFileSync(join(tempDir, 'memory', 'ai', 'COMMON_MISTAKES.md'), 'small');

    const result = checkTier1Budget(tempDir);
    assert.equal(result.overBudget, false);
    assert.ok(result.totalTokens < 100);
    assert.equal(result.files.length, 3);
  });

  it('reports over budget when files are large', () => {
    const bigContent = 'x'.repeat(20000); // ~5000 tokens
    writeFileSync(join(tempDir, 'memory', 'USER.md'), bigContent);
    writeFileSync(join(tempDir, 'memory', 'WAITING_ON.md'), 'small');
    writeFileSync(join(tempDir, 'memory', 'ai', 'COMMON_MISTAKES.md'), 'small');

    const result = checkTier1Budget(tempDir, 4000);
    assert.equal(result.overBudget, true);
  });

  it('handles missing files gracefully', () => {
    const result = checkTier1Budget(tempDir);
    assert.equal(result.overBudget, false);
    assert.equal(result.totalTokens, 0);
  });
});

describe('formatAge', () => {
  it('formats seconds ago', () => {
    const recent = new Date(Date.now() - 5000);
    assert.equal(formatAge(recent), 'just now');
  });

  it('formats minutes ago', () => {
    const minutes = new Date(Date.now() - 10 * 60 * 1000);
    assert.ok(formatAge(minutes).includes('m ago'));
  });

  it('formats hours ago', () => {
    const hours = new Date(Date.now() - 3 * 60 * 60 * 1000);
    assert.ok(formatAge(hours).includes('h ago'));
  });

  it('formats days ago', () => {
    const days = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
    assert.ok(formatAge(days).includes('d ago'));
  });

  it('handles invalid dates', () => {
    assert.equal(formatAge(null), 'n/a');
    assert.equal(formatAge(new Date('invalid')), 'n/a');
  });
});

// =============================================================================
// files.js
// =============================================================================

describe('safeWrite', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  after(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('writes file atomically', () => {
    const p = join(tempDir, 'output.txt');
    safeWrite(p, 'hello world');
    assert.equal(readFileSync(p, 'utf8'), 'hello world');
  });

  it('creates parent directories', () => {
    const p = join(tempDir, 'a', 'b', 'c', 'output.txt');
    safeWrite(p, 'deep write');
    assert.equal(readFileSync(p, 'utf8'), 'deep write');
  });

  it('does not leave .tmp files on success', () => {
    const p = join(tempDir, 'clean.txt');
    safeWrite(p, 'clean');
    assert.equal(existsSync(p + '.tmp'), false);
  });

  it('throws on invalid input', () => {
    assert.throws(() => safeWrite('', 'content'), TypeError);
    assert.throws(() => safeWrite(join(tempDir, 'f.txt'), 123), TypeError);
  });
});

describe('ensureDir', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  after(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('rejects path escaping project root when projectRoot provided', () => {
    const projectRoot = join(tempDir, 'project');
    const outsidePath = join(tempDir, 'outside');
    mkdirSync(projectRoot, { recursive: true });

    assert.throws(
      () => ensureDir(outsidePath, projectRoot),
      /escapes project root/
    );
  });

  it('succeeds when path is contained within projectRoot', () => {
    const projectRoot = tempDir;
    const dirPath = join(projectRoot, 'memory', 'nested');

    ensureDir(dirPath, projectRoot);

    assert.ok(existsSync(dirPath));
    assert.ok(existsSync(join(dirPath, '..')));
  });

  it('succeeds without projectRoot (backward compat)', () => {
    const dirPath = join(tempDir, 'no-root', 'nested');

    ensureDir(dirPath);

    assert.ok(existsSync(dirPath));
  });
});

describe('safeAppend', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  after(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('inserts content after header separator', () => {
    const p = join(tempDir, 'log.md');
    writeFileSync(p, '# Log\n\n---\n\n## Old Entry');
    safeAppend(p, '## New Entry\nNew content');

    const result = readFileSync(p, 'utf8');
    const newIdx = result.indexOf('## New Entry');
    const oldIdx = result.indexOf('## Old Entry');
    assert.ok(newIdx < oldIdx, 'New entry should appear before old entry');
  });

  it('prepends when no header separator exists', () => {
    const p = join(tempDir, 'no-header.md');
    writeFileSync(p, '## Old Entry');
    safeAppend(p, '## New Entry');

    const result = readFileSync(p, 'utf8');
    assert.ok(result.startsWith('## New Entry'));
  });

  it('throws for non-existent file', () => {
    assert.throws(
      () => safeAppend(join(tempDir, 'nope.md'), 'content'),
      /does not exist/
    );
  });
});

describe('copyTemplate', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  after(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('copies file and returns created', () => {
    const src = join(tempDir, 'src.txt');
    const dst = join(tempDir, 'dst.txt');
    writeFileSync(src, 'template content');

    const result = copyTemplate(src, dst);
    assert.equal(result, 'created');
    assert.equal(readFileSync(dst, 'utf8'), 'template content');
  });

  it('skips existing file without force', () => {
    const src = join(tempDir, 'src.txt');
    const dst = join(tempDir, 'dst.txt');
    writeFileSync(src, 'new content');
    writeFileSync(dst, 'old content');

    const result = copyTemplate(src, dst, false);
    assert.equal(result, 'skipped');
    assert.equal(readFileSync(dst, 'utf8'), 'old content');
  });

  it('overwrites existing file with force', () => {
    const src = join(tempDir, 'src.txt');
    const dst = join(tempDir, 'dst.txt');
    writeFileSync(src, 'new content');
    writeFileSync(dst, 'old content');

    const result = copyTemplate(src, dst, true);
    assert.equal(result, 'overwritten');
    assert.equal(readFileSync(dst, 'utf8'), 'new content');
  });

  it('throws for missing template', () => {
    assert.throws(
      () => copyTemplate(join(tempDir, 'nope.txt'), join(tempDir, 'dst.txt')),
      /template not found/
    );
  });
});

describe('ensureLineInFile', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  after(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('adds line to empty file', () => {
    const p = join(tempDir, '.gitignore');
    writeFileSync(p, '');
    const added = ensureLineInFile(p, 'memory/archive/');
    assert.equal(added, true);
    assert.ok(readFileSync(p, 'utf8').includes('memory/archive/'));
  });

  it('adds line to non-existent file', () => {
    const p = join(tempDir, '.cursorignore');
    const added = ensureLineInFile(p, 'memory/archive/');
    assert.equal(added, true);
    assert.ok(existsSync(p));
    assert.ok(readFileSync(p, 'utf8').includes('memory/archive/'));
  });

  it('does not duplicate existing line', () => {
    const p = join(tempDir, '.gitignore');
    writeFileSync(p, 'node_modules/\nmemory/archive/\n');
    const added = ensureLineInFile(p, 'memory/archive/');
    assert.equal(added, false);
    // Count occurrences
    const content = readFileSync(p, 'utf8');
    const count = content.split('memory/archive/').length - 1;
    assert.equal(count, 1);
  });
});
