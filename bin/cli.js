#!/usr/bin/env node

/**
 * ai-memory CLI
 *
 * Scaffold and manage a persistent AI memory system for Cursor IDE.
 *
 * Usage:
 *   ai-memory init [--force]    Scaffold the memory system into the current workspace
 *   ai-memory status            Report memory system health
 *   ai-memory archive           Archive old logs and completed sprint files
 *   ai-memory help              Show this help message
 *   ai-memory version           Show package version
 *
 * Zero dependencies — uses only Node.js built-ins.
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

// Resolve package root for version lookup
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = join(__dirname, '..');

/**
 * Parse command-line arguments manually (no external dependencies).
 *
 * @param {string[]} argv - process.argv
 * @returns {{ command: string, flags: Set<string> }}
 */
function parseArgs(argv) {
  // Skip 'node' and script path
  const args = argv.slice(2);
  const flags = new Set();
  let command = '';

  for (const arg of args) {
    if (arg.startsWith('--')) {
      flags.add(arg.slice(2).toLowerCase());
    } else if (arg.startsWith('-')) {
      // Single-dash flags: split into individual characters
      for (const char of arg.slice(1)) {
        flags.add(char.toLowerCase());
      }
    } else if (!command) {
      command = arg.toLowerCase();
    }
  }

  // Support -v and -h as shorthand when no command is given
  if (!command && flags.has('v')) command = 'version';
  if (!command && flags.has('h')) command = 'help';

  return { command, flags };
}

/**
 * Read and return the package version from package.json.
 *
 * @returns {string}
 */
function getVersion() {
  try {
    const pkgPath = join(packageRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || 'unknown';
  } catch {
    return 'unknown';
  }
}

/**
 * Print help message to stdout.
 */
function showHelp() {
  const version = getVersion();
  console.log(`
ai-memory v${version}
Scaffold a persistent AI memory system into any Cursor IDE workspace.

Usage:
  ai-memory <command> [options]

Commands:
  init      Scaffold the memory system into the current workspace
  status    Report memory system health (file sizes, tokens, staleness)
  archive   Archive old logs and completed sprint files
  help      Show this help message
  version   Show package version

Options:
  --force   Overwrite existing files during init

Examples:
  npx ai-memory init          # Set up memory system
  npx ai-memory init --force  # Overwrite existing files
  npx ai-memory status        # Check memory health
  npx ai-memory archive       # Clean up old logs

Documentation: https://github.com/keithcostello/ai-memory
`.trim());
}

/**
 * Main entry point.
 */
async function main() {
  const { command, flags } = parseArgs(process.argv);

  switch (command) {
    case 'init': {
      const { run } = await import('../src/commands/init.js');
      await run({ force: flags.has('force') });
      break;
    }
    case 'status': {
      const { run } = await import('../src/commands/status.js');
      await run();
      break;
    }
    case 'archive': {
      const { run } = await import('../src/commands/archive.js');
      await run();
      break;
    }
    case 'version':
    case 'v':
      console.log(getVersion());
      break;
    case 'help':
    case 'h':
    case '':
      showHelp();
      break;
    default: {
      // Sanitize command for terminal output (strip non-printable characters)
      const safeCommand = command.replace(/[^\x20-\x7E]/g, '');
      console.error(`Unknown command: "${safeCommand}"\n`);
      showHelp();
      process.exitCode = 1;
      break;
    }
  }
}

main().catch((err) => {
  console.error(`\nFatal error: ${err.message}`);
  if (process.env.DEBUG) {
    console.error(err.stack);
  }
  process.exitCode = 1;
});
