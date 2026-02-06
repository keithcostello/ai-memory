/**
 * Tests for src/commands/init.js
 *
 * Tests run against a temp directory to avoid modifying real workspaces.
 * We test the init logic by calling the module's internal functions
 * and verifying the file system state.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { MEMORY_DIRS, TEMPLATE_MAP } from '../src/utils/paths.js';
import { copyTemplate, ensureDir, ensureLineInFile } from '../src/utils/files.js';
import { dirExists, fileExists } from '../src/utils/validation.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = resolve(__dirname, '..', 'src', 'templates');

function makeTempDir() {
  const dir = join(tmpdir(), 'ai-memory-init-test-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function removeTempDir(dir) {
  try { rmSync(dir, { recursive: true, force: true }); } catch { /* best-effort */ }
}

/**
 * Simulate the init command's core logic against a temp directory.
 */
function simulateInit(projectRoot, force = false) {
  // Create directories
  for (const dir of MEMORY_DIRS) {
    ensureDir(join(projectRoot, dir));
  }

  // Copy templates
  const results = { created: 0, skipped: 0, overwritten: 0 };
  for (const [templateRel, targetRel] of Object.entries(TEMPLATE_MAP)) {
    const templatePath = join(TEMPLATES_DIR, templateRel);
    const targetPath = join(projectRoot, targetRel);
    if (existsSync(templatePath)) {
      const action = copyTemplate(templatePath, targetPath, force);
      results[action]++;
    }
  }

  // Update ignore files
  ensureLineInFile(join(projectRoot, '.gitignore'), 'memory/archive/');
  ensureLineInFile(join(projectRoot, '.cursorignore'), 'memory/archive/');

  return results;
}

describe('init command', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('scaffolds all directories', () => {
    simulateInit(tempDir);
    for (const dir of MEMORY_DIRS) {
      assert.ok(dirExists(join(tempDir, dir)), `Missing directory: ${dir}`);
    }
  });

  it('creates all template files', () => {
    simulateInit(tempDir);
    for (const targetRel of Object.values(TEMPLATE_MAP)) {
      assert.ok(
        fileExists(join(tempDir, targetRel)),
        `Missing file: ${targetRel}`
      );
    }
  });

  it('skips existing files without --force', () => {
    // First init
    simulateInit(tempDir);

    // Write custom content to USER.md
    const userMd = join(tempDir, 'memory', 'USER.md');
    writeFileSync(userMd, 'Custom user config');

    // Second init without force
    const results = simulateInit(tempDir, false);
    assert.ok(results.skipped > 0, 'Should have skipped files');

    // Custom content preserved
    assert.equal(readFileSync(userMd, 'utf8'), 'Custom user config');
  });

  it('overwrites files with --force', () => {
    // First init
    simulateInit(tempDir);

    // Write custom content
    const userMd = join(tempDir, 'memory', 'USER.md');
    writeFileSync(userMd, 'Custom user config');

    // Second init with force
    const results = simulateInit(tempDir, true);
    assert.ok(results.overwritten > 0, 'Should have overwritten files');

    // Custom content replaced with template
    const content = readFileSync(userMd, 'utf8');
    assert.ok(content.includes('# User Configuration'), 'Should contain template content');
  });

  it('creates .gitignore with memory/archive/', () => {
    simulateInit(tempDir);
    const content = readFileSync(join(tempDir, '.gitignore'), 'utf8');
    assert.ok(content.includes('memory/archive/'));
  });

  it('creates .cursorignore with memory/archive/', () => {
    simulateInit(tempDir);
    const content = readFileSync(join(tempDir, '.cursorignore'), 'utf8');
    assert.ok(content.includes('memory/archive/'));
  });

  it('appends to existing .gitignore without duplicating', () => {
    writeFileSync(join(tempDir, '.gitignore'), 'node_modules/\n');
    simulateInit(tempDir);

    const content = readFileSync(join(tempDir, '.gitignore'), 'utf8');
    assert.ok(content.includes('node_modules/'));
    assert.ok(content.includes('memory/archive/'));

    // Second init should not duplicate
    simulateInit(tempDir);
    const content2 = readFileSync(join(tempDir, '.gitignore'), 'utf8');
    const count = content2.split('memory/archive/').length - 1;
    assert.equal(count, 1, 'Should not duplicate memory/archive/ line');
  });

  it('memory.mdc uses correct frontmatter format', () => {
    simulateInit(tempDir);
    const content = readFileSync(join(tempDir, '.cursor', 'rules', 'memory.mdc'), 'utf8');

    // Must have description, globs, and alwaysApply
    assert.ok(content.includes('description:'), 'Missing description in frontmatter');
    assert.ok(content.includes('globs:'), 'Missing globs in frontmatter');
    assert.ok(content.includes('alwaysApply: true'), 'Missing alwaysApply in frontmatter');
  });

  it('memory.mdc uses [file](mdc:path) syntax', () => {
    simulateInit(tempDir);
    const content = readFileSync(join(tempDir, '.cursor', 'rules', 'memory.mdc'), 'utf8');

    assert.ok(content.includes('[USER.md](mdc:memory/USER.md)'), 'Missing mdc: link for USER.md');
    assert.ok(content.includes('[WAITING_ON.md](mdc:memory/WAITING_ON.md)'), 'Missing mdc: link for WAITING_ON.md');
    assert.ok(content.includes('[COMMON_MISTAKES.md](mdc:memory/ai/COMMON_MISTAKES.md)'), 'Missing mdc: link for COMMON_MISTAKES.md');
  });

  it('memory.mdc includes @file fallback references', () => {
    simulateInit(tempDir);
    const content = readFileSync(join(tempDir, '.cursor', 'rules', 'memory.mdc'), 'utf8');

    assert.ok(content.includes('@memory/USER.md'), 'Missing @file fallback for USER.md');
    assert.ok(content.includes('@memory/WAITING_ON.md'), 'Missing @file fallback for WAITING_ON.md');
    assert.ok(content.includes('@memory/ai/COMMON_MISTAKES.md'), 'Missing @file fallback for COMMON_MISTAKES.md');
  });

  it('memory.mdc includes Cursor Memories coexistence directive', () => {
    simulateInit(tempDir);
    const content = readFileSync(join(tempDir, '.cursor', 'rules', 'memory.mdc'), 'utf8');

    assert.ok(
      content.includes('Cursor Memories') || content.includes('Cursor\'s auto-generated'),
      'Missing Cursor Memories coexistence section'
    );
  });

  it('memory.mdc includes manual fallback directive', () => {
    simulateInit(tempDir);
    const content = readFileSync(join(tempDir, '.cursor', 'rules', 'memory.mdc'), 'utf8');

    assert.ok(
      content.includes('Fallback') || content.includes('Manual Memory Loading'),
      'Missing manual fallback section'
    );
  });

  it('memory-ops.mdc is NOT alwaysApply', () => {
    simulateInit(tempDir);
    const content = readFileSync(join(tempDir, '.cursor', 'rules', 'memory-ops.mdc'), 'utf8');

    assert.ok(content.includes('alwaysApply: false'), 'memory-ops.mdc should be alwaysApply: false');
  });

  it('creates AGENTS.md at project root', () => {
    simulateInit(tempDir);
    assert.ok(fileExists(join(tempDir, 'AGENTS.md')), 'AGENTS.md should be created');

    const content = readFileSync(join(tempDir, 'AGENTS.md'), 'utf8');
    assert.ok(content.includes('ai-memory'), 'AGENTS.md should reference ai-memory');
  });

  it('creates memory-strategies.json with valid defaults', () => {
    simulateInit(tempDir);
    const raw = readFileSync(join(tempDir, 'memory-strategies.json'), 'utf8');
    const config = JSON.parse(raw);

    assert.equal(config.log_retention_days, 14);
    assert.equal(config.archive_completed_sprints, true);
    assert.equal(config.warn_tier1_tokens, 4000);
    assert.equal(config.warn_log_lines, 500);
  });
});
