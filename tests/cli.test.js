/**
 * Tests for bin/cli.js - CLI error handling and behavior.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';

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
});
