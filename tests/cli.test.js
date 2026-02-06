/**
 * Tests for bin/cli.js - CLI error handling and behavior.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync, spawnSync } from 'node:child_process';

function makeTempDir(prefix = 'ai-memory-cli-test-') {
  const dir = join(tmpdir(), prefix + Date.now() + '-' + Math.random().toString(36).slice(2, 8));
  mkdirSync(dir, { recursive: true });
  return dir;
}

function removeTempDir(dir) {
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

describe('CLI - getVersion error handling', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = makeTempDir();
  });

  afterEach(() => {
    if (tempDir) removeTempDir(tempDir);
  });

  it('logs warning when package.json is missing', () => {
    // Create bin/ with a copy of cli.js, but no package.json at project root
    const binDir = join(tempDir, 'bin');
    mkdirSync(binDir, { recursive: true });
    const cliSource = readFileSync(join(process.cwd(), 'bin', 'cli.js'), 'utf8');
    writeFileSync(join(binDir, 'cli.js'), cliSource);

    const cliPath = join(binDir, 'cli.js');
    const result = execSync(`node "${cliPath}" help`, {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
    });

    // When package.json is missing, getVersion logs to stderr and returns 'unknown'
    // The help output goes to stdout; the warning goes to stderr
    // execSync by default merges stdout and stderr, so we get both
    assert.ok(
      result.includes('unknown') || result.includes('Could not read package.json'),
      'Should show unknown version or warning when package.json missing'
    );
  });
});

describe('CLI - unknown command', () => {
  it('displays error for invalid command', () => {
    try {
      execSync('node bin/cli.js invalidcmd', {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        cwd: process.cwd(),
      });
    } catch (err) {
      const output = (err.stdout || '') + (err.stderr || '') + (err.message || '');
      assert.ok(output.includes('Unknown command'), 'Should show unknown command error');
      return;
    }
    assert.fail('Expected CLI to exit with code 1 for unknown command');
  });

  it('displays (unrecognizable input) for non-printable command', () => {
    // Use zero-width chars (U+200B, U+200C) - stripped by sanitizer, no null bytes for spawn
    const zwCommand = '\u200B\u200C\u200D';
    const result = spawnSync('node', ['bin/cli.js', zwCommand], {
      encoding: 'utf8',
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
    });
    const output = (result.stdout || '') + (result.stderr || '');
    assert.ok(
      output.includes('(unrecognizable input)'),
      `Should show (unrecognizable input) for non-printable command. Got: ${output.slice(0, 200)}`
    );
    assert.notEqual(result.status, 0, 'Should exit with non-zero');
  });
});

describe('CLI - completions', () => {
  it('outputs bash completion script', () => {
    const result = execSync('node bin/cli.js completions bash', {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      cwd: process.cwd(),
    });
    assert.ok(result.length > 0, 'Should output non-empty');
    assert.ok(result.includes('complete'), 'Should contain complete');
    assert.ok(result.includes('ai-memory'), 'Should contain ai-memory');
  });

  it('outputs zsh completion script', () => {
    const result = execSync('node bin/cli.js completions zsh', {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      cwd: process.cwd(),
    });
    assert.ok(result.length > 0, 'Should output non-empty');
    assert.ok(result.includes('_ai_memory') || result.includes('compdef'), 'Should contain zsh completion');
  });

  it('outputs fish completion script', () => {
    const result = execSync('node bin/cli.js completions fish', {
      encoding: 'utf8',
      maxBuffer: 1024 * 1024,
      cwd: process.cwd(),
    });
    assert.ok(result.length > 0, 'Should output non-empty');
    assert.ok(result.includes('complete -c ai-memory'), 'Should contain fish complete');
  });

  it('exits 1 for invalid shell', () => {
    try {
      execSync('node bin/cli.js completions foo', {
        encoding: 'utf8',
        maxBuffer: 1024 * 1024,
        cwd: process.cwd(),
      });
    } catch (err) {
      assert.equal(err.status, 1, 'Should exit with code 1');
      const output = (err.stdout || '') + (err.stderr || '');
      assert.ok(output.includes('Unknown shell') || output.includes('bash') || output.includes('zsh'), 'Should hint at valid shells');
      return;
    }
    assert.fail('Expected CLI to exit with code 1 for invalid shell');
  });
});
