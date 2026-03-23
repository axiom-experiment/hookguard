#!/usr/bin/env node
'use strict';

/**
 * hookguard CLI
 * Zero-dependency git hooks manager
 */

const {
  init,
  add,
  remove,
  list,
  run,
  status,
  uninstall
} = require('../src/index.js');

const args = process.argv.slice(2);
const command = args[0];
const cwd = process.cwd();

function out(msg) { process.stdout.write(String(msg) + '\n'); }
function error(msg) { process.stderr.write('hookguard error: ' + msg + '\n'); }

const VERSION = require('../package.json').version;

const USAGE = `
hookguard v${VERSION} — Zero-dependency git hooks manager

Usage:
  hookguard init                         Set up hookguard in current git repo
  hookguard add <hook> "<command>"       Add a command to a hook
  hookguard remove <hook>                Remove all commands for a hook
  hookguard list                         List all configured hooks
  hookguard run <hook>                   Manually run a hook
  hookguard status                       Show hookguard status
  hookguard uninstall                    Remove hookguard from this repo
  hookguard --version                    Show version
  hookguard --help                       Show this help

Common git hooks:
  pre-commit        Runs before a commit is created (lint, test, format)
  commit-msg        Validates the commit message
  pre-push          Runs before pushing to remote (full test suite)
  prepare-commit-msg  Auto-populates commit messages

Examples:
  hookguard init
  hookguard add pre-commit "npx eslint src/"
  hookguard add pre-commit "npm test"
  hookguard add commit-msg "node scripts/validate-commit.js"
  hookguard add pre-push "npm run build"
  hookguard list
  hookguard run pre-commit
  hookguard status
  hookguard remove pre-commit
  hookguard uninstall

CI Integration:
  Set SKIP_HOOKS=1 to bypass all hookguard hooks in CI pipelines.
  All generated hook scripts check this variable automatically.

GitHub Sponsors: https://github.com/sponsors/yonderzenith
`.trim();

function main() {
  try {
    switch (command) {
      // ── init ──────────────────────────────────────────────────────────────
      case 'init': {
        const result = init(cwd);
        out('');
        out('✓ hookguard initialized');
        out('');
        out(`  Config:         .hookguard/config.json`);
        out(`  Hooks directory: .hookguard/hooks/`);
        out(`  Git configured: ${result.gitConfigured ? 'yes (core.hooksPath set)' : 'no (not in a git repo)'}`);
        out('');
        out('Next steps:');
        out('  hookguard add pre-commit "npm test"');
        out('  hookguard add pre-commit "npx eslint src/"');
        out('  hookguard list');
        out('');
        out('Add .hookguard/ to git: git add .hookguard && git commit -m "chore: add hookguard"');
        break;
      }

      // ── add ───────────────────────────────────────────────────────────────
      case 'add': {
        const hookName = args[1];
        const hookCommand = args.slice(2).join(' ');

        if (!hookName) {
          error('Missing hook name. Usage: hookguard add <hook> "<command>"');
          process.exit(1);
        }
        if (!hookCommand) {
          error('Missing command. Usage: hookguard add pre-commit "npm test"');
          process.exit(1);
        }

        const result = add(hookName, hookCommand, {}, cwd);
        out('');
        out(`✓ Added command to ${result.hook}`);
        out(`  Command: ${result.command}`);
        out(`  This hook now has ${result.total} command${result.total === 1 ? '' : 's'}`);
        out('');
        break;
      }

      // ── remove ────────────────────────────────────────────────────────────
      case 'remove': {
        const hookName = args[1];
        if (!hookName) {
          error('Missing hook name. Usage: hookguard remove <hook>');
          process.exit(1);
        }
        const result = remove(hookName, cwd);
        out('');
        out(`✓ Removed hook: ${result.removed}`);
        out('  Hook file deleted, config updated.');
        out('');
        break;
      }

      // ── list ──────────────────────────────────────────────────────────────
      case 'list': {
        const result = list(cwd);
        out('');

        if (result.total === 0) {
          out('No hooks configured.');
          out('');
          out('Add your first hook:');
          out('  hookguard add pre-commit "npm test"');
          out('  hookguard add pre-commit "npx eslint src/"');
        } else {
          out(`Configured hooks (${result.total} hook${result.total === 1 ? '' : 's'}):`);
          out('');
          for (const h of result.hooks) {
            out(`  ${h.hook} (${h.count} command${h.count === 1 ? '' : 's'}):`);
            for (const cmd of h.commands) {
              const label = cmd.description ? `${cmd.command}  # ${cmd.description}` : cmd.command;
              out(`    → ${label}`);
            }
            out('');
          }
        }
        break;
      }

      // ── run ───────────────────────────────────────────────────────────────
      case 'run': {
        const hookName = args[1];
        if (!hookName) {
          error('Missing hook name. Usage: hookguard run <hook>');
          process.exit(1);
        }
        out('');
        out(`Running hook: ${hookName}...`);
        out('─'.repeat(50));
        const result = run(hookName, cwd);
        out('─'.repeat(50));

        if (result.exitCode === 0) {
          out(`✓ Hook passed: ${hookName}`);
        } else {
          error(`Hook failed: ${hookName} (exit code ${result.exitCode})`);
          process.exit(result.exitCode);
        }
        out('');
        break;
      }

      // ── status ────────────────────────────────────────────────────────────
      case 'status': {
        const result = status(cwd);
        out('');

        if (!result.initialized) {
          out('hookguard: not initialized');
          out('');
          out('Run: hookguard init');
          out('');
        } else {
          out('hookguard status:');
          out('');
          out(`  Initialized:     yes`);
          out(`  Version:         ${result.version}`);
          out(`  Git configured:  ${result.gitConfigured ? 'yes' : 'no (run: git config core.hooksPath .hookguard/hooks)'}`);
          out(`  Active hooks:    ${result.hooksCount}`);

          if (result.hooks.length > 0) {
            out(`  Hooks:           ${result.hooks.join(', ')}`);
          } else {
            out(`  Hooks:           (none — add with: hookguard add pre-commit "npm test")`);
          }
          out('');
        }
        break;
      }

      // ── uninstall ─────────────────────────────────────────────────────────
      case 'uninstall': {
        const result = uninstall(cwd);
        out('');
        out('✓ hookguard uninstalled');
        out('  .hookguard/ directory removed');
        out('  git core.hooksPath reset');
        out('');
        out('Your repository is back to default git hooks behavior.');
        out('');
        break;
      }

      // ── version / help ────────────────────────────────────────────────────
      case '--version':
      case '-v': {
        out(`hookguard v${VERSION}`);
        break;
      }

      case '--help':
      case '-h':
      case undefined: {
        out(USAGE);
        break;
      }

      default: {
        error(`Unknown command: "${command}"`);
        out('');
        out(USAGE);
        process.exit(1);
      }
    }
  } catch (err) {
    error(err.message);
    process.exit(1);
  }
}

main();
