/**
 * @module commands/init
 * Scaffold the ai-memory system into the current workspace.
 *
 * Creates directory structure, copies template files, updates
 * .gitignore and .cursorignore, and scaffolds AGENTS.md.
 */

import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { findProjectRoot, MEMORY_DIRS, TEMPLATE_MAP } from '../utils/paths.js';
import { fileExists, dirExists } from '../utils/validation.js';
import { ensureDir, copyTemplate, ensureLineInFile } from '../utils/files.js';

// Resolve the templates directory relative to this module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TEMPLATES_DIR = resolve(__dirname, '..', 'templates');

/**
 * Run the init command. Scaffolds the memory system into the current workspace.
 *
 * If findProjectRoot returns null, scaffolds into cwd with a warning.
 * Does not throw; logs errors to stderr and continues where possible.
 *
 * @param {{ force?: boolean }} [options={}] - force: overwrite existing files
 * @returns {Promise<void>}
 * @throws {TypeError} From findProjectRoot if cwd is invalid
 * @throws {Error} From ensureDir, copyTemplate, ensureLineInFile on FS failure
 */
export async function run(options = {}) {
  const force = Boolean(options.force);
  const cwd = process.cwd();

  // Step 1: Detect project root
  const projectInfo = findProjectRoot(cwd);
  let projectRoot;

  if (projectInfo) {
    projectRoot = projectInfo.root;
    console.log(`Project root detected: ${projectRoot} (found ${projectInfo.marker})`);
  } else {
    projectRoot = cwd;
    console.log(
      `Warning: No .git or package.json found within 5 parent directories.\n` +
      `Scaffolding into current directory: ${cwd}`
    );
  }

  // Step 2: Check for existing memory system
  const memoryDir = join(projectRoot, 'memory');
  if (dirExists(memoryDir) && !force) {
    const hasFiles = fileExists(join(memoryDir, 'USER.md')) ||
                     fileExists(join(memoryDir, 'WAITING_ON.md'));
    if (hasFiles) {
      console.log(
        `\nMemory system already exists at ${memoryDir}\n` +
        `Use --force to overwrite, or run 'ai-memory status' to check health.`
      );
      return;
    }
  }

  console.log(force ? '\nInitializing memory system (--force: overwriting existing files)...\n' :
                       '\nInitializing memory system...\n');

  // Step 3: Create directory structure
  console.log('Creating directories:');
  for (const dir of MEMORY_DIRS) {
    const dirPath = join(projectRoot, dir);
    if (!dirExists(dirPath)) {
      ensureDir(dirPath);
      console.log(`  + ${dir}/`);
    } else {
      console.log(`  ✓ ${dir}/ (exists)`);
    }
  }

  // Step 4: Copy template files
  console.log('\nCopying templates:');
  const results = { created: 0, skipped: 0, overwritten: 0 };

  for (const [templateRel, targetRel] of Object.entries(TEMPLATE_MAP)) {
    const templatePath = join(TEMPLATES_DIR, templateRel);
    const targetPath = join(projectRoot, targetRel);

    // Validate that template exists in our package
    if (!fileExists(templatePath)) {
      console.error(`  ✗ ${targetRel} (template missing: ${templateRel})`);
      continue;
    }

    const action = copyTemplate(templatePath, targetPath, force);
    results[action]++;

    const symbols = { created: '+', skipped: '✓', overwritten: '↻' };
    const labels = { created: '', skipped: ' (exists, skipped)', overwritten: ' (overwritten)' };
    console.log(`  ${symbols[action]} ${targetRel}${labels[action]}`);
  }

  // Step 5: Update .gitignore
  console.log('\nUpdating ignore files:');
  const gitignorePath = join(projectRoot, '.gitignore');
  const gitignoreAdded = ensureLineInFile(gitignorePath, 'memory/archive/');
  console.log(gitignoreAdded
    ? '  + .gitignore: added memory/archive/'
    : '  ✓ .gitignore: memory/archive/ already present');

  // Step 6: Update .cursorignore
  const cursorignorePath = join(projectRoot, '.cursorignore');
  const cursorignoreAdded = ensureLineInFile(cursorignorePath, 'memory/archive/');
  console.log(cursorignoreAdded
    ? '  + .cursorignore: added memory/archive/'
    : '  ✓ .cursorignore: memory/archive/ already present');

  // Step 7: Print summary
  const total = results.created + results.skipped + results.overwritten;
  console.log(`
${'='.repeat(60)}
✅ ai-memory initialized successfully
${'='.repeat(60)}

Memory files:
  ${describeFile('memory/USER.md', '← Edit this: your preferences, tech stack, conventions')}
  ${describeFile('memory/WAITING_ON.md', '← AI updates this: current state, blockers, next steps')}
  ${describeFile('memory/ai/COMMON_MISTAKES.md', '← AI updates this: learned corrections')}
  ${describeFile('memory/GLOBAL_DAILY_LOG.md', '← AI appends to this: session history')}

Cursor rules:
  ${describeFile('.cursor/rules/memory.mdc', '← Always-on: injects memory into every prompt')}
  ${describeFile('.cursor/rules/memory-ops.mdc', '← Agent-requested: memory write protocols')}
  ${describeFile('.cursor/rules/memory-logs.mdc', '← On-demand: log access when needed')}

Files: ${results.created} created, ${results.skipped} skipped, ${results.overwritten} overwritten

Next steps:
  1. Edit memory/USER.md with your preferences
  2. Restart Cursor to load the new rules
  3. Run 'ai-memory status' to verify
`);
}

/**
 * Format a file path with its description for the summary output.
 *
 * @param {string} filePath - Relative file path
 * @param {string} description - Human-readable description
 * @returns {string}
 */
function describeFile(filePath, description) {
  return `${filePath}  ${description}`;
}
