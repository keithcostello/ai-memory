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
 *
 * Security: Unknown command strings are sanitized (strip non-printable chars
 * via replace(/[^\x20-\x7E]/g, '')) before display to prevent terminal injection.
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
 * @returns {{ command: string, flags: Set<string>, rest: string[] }}
 * @throws {never} Does not throw
 */
function parseArgs(argv) {
  // Skip 'node' and script path
  const args = argv.slice(2);
  const flags = new Set();
  const rest = [];
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
    } else {
      rest.push(arg);
    }
  }

  // Support -v and -h as shorthand when no command is given
  if (!command && flags.has('v')) command = 'version';
  if (!command && flags.has('h')) command = 'help';

  return { command, flags, rest };
}

/**
 * Read and return the package version from package.json.
 * On read or parse failure, logs a warning to stderr and returns 'unknown'.
 *
 * @returns {string} Version string or 'unknown' on error
 */
function getVersion() {
  try {
    const pkgPath = join(packageRoot, 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkg.version || 'unknown';
  } catch (err) {
    console.warn(`Could not read package.json: ${err.message}`);
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
  init         Scaffold the memory system into the current workspace
  status       Report memory system health (file sizes, tokens, staleness)
  archive      Archive old logs and completed sprint files
  completions  Output shell completion script (bash, zsh, fish)
  help         Show this help message
  version      Show package version

Options:
  --force    Overwrite existing files during init
  --dry-run  Show what archive would do without writing (archive only)
  --json     Output status as JSON (status only)

Examples:
  npx ai-memory init              # Set up memory system
  npx ai-memory init --force     # Overwrite existing files
  npx ai-memory status            # Check memory health
  npx ai-memory status --json     # JSON output
  npx ai-memory archive           # Clean up old logs
  npx ai-memory archive --dry-run # Preview archive without changes
  npx ai-memory completions bash  # Add to ~/.bashrc

Documentation: https://github.com/keithcostello/ai-memory
`.trim());
}

/**
 * Main entry point. Dispatches to command handlers.
 *
 * @throws {Error} Re-thrown from command handlers; also from dynamic imports
 */
/**
 * Output shell completion script.
 *
 * @param {string} shell - One of 'bash', 'zsh', 'fish'
 * @returns {void}
 */
function outputCompletions(shell) {
  if (shell === 'bash') {
    console.log(`# Bash completion for ai-memory
complete -W "init status archive help version completions --force --dry-run --json" ai-memory`);
  } else if (shell === 'zsh') {
    console.log(`# Zsh completion for ai-memory
_ai_memory() {
  _values "ai-memory command" \\
    "init" "status" "archive" "help" "version" "completions"
  _values "ai-memory flag" \\
    "--force" "--dry-run" "--json"
}
compdef _ai_memory ai-memory`);
  } else {
    console.log(`# Fish completion for ai-memory
complete -c ai-memory -a "init status archive help version completions"
complete -c ai-memory -l force -d "Overwrite existing files during init"
complete -c ai-memory -l dry-run -d "Preview archive without writing"
complete -c ai-memory -l json -d "Output status as JSON"`);
  }
}

async function main() {
  const { command, flags, rest } = parseArgs(process.argv);

  switch (command) {
    case 'init': {
      const { run } = await import('../src/commands/init.js');
      await run({ force: flags.has('force') });
      break;
    }
    case 'status': {
      const { run } = await import('../src/commands/status.js');
      await run({ json: flags.has('json') });
      break;
    }
    case 'archive': {
      const { run } = await import('../src/commands/archive.js');
      await run({ dryRun: flags.has('dry-run') });
      break;
    }
    case 'completions': {
      const shell = (rest[0] || 'bash').toLowerCase();
      if (!['bash', 'zsh', 'fish'].includes(shell)) {
        console.error(`Unknown shell: "${shell}". Use bash, zsh, or fish.\n`);
        process.exitCode = 1;
      } else {
        outputCompletions(shell);
      }
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
      const display = safeCommand || '(unrecognizable input)';
      console.error(`Unknown command: "${display}"\n`);
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
