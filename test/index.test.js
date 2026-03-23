'use strict';

/**
 * hookguard test suite
 * Uses Node.js built-in test runner (node:test) — zero external dependencies
 */

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const {
  init,
  add,
  remove,
  list,
  status,
  uninstall,
  generateHookScript,
  VALID_HOOKS,
  CONFIG_DIR,
  HOOKS_DIR,
  CONFIG_FILE
} = require('../src/index.js');

// ─── Test helpers ─────────────────────────────────────────────────────────────

function makeTmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'hookguard-test-'));
}

function removeTmpDir(dir) {
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch (_) {}
}

function readConfig(cwd) {
  return JSON.parse(fs.readFileSync(path.join(cwd, CONFIG_FILE), 'utf8'));
}

// ─── VALID_HOOKS constant ─────────────────────────────────────────────────────

describe('VALID_HOOKS', () => {
  it('includes pre-commit', () => {
    assert.ok(VALID_HOOKS.includes('pre-commit'));
  });

  it('includes commit-msg', () => {
    assert.ok(VALID_HOOKS.includes('commit-msg'));
  });

  it('includes pre-push', () => {
    assert.ok(VALID_HOOKS.includes('pre-push'));
  });

  it('includes prepare-commit-msg', () => {
    assert.ok(VALID_HOOKS.includes('prepare-commit-msg'));
  });

  it('includes post-commit', () => {
    assert.ok(VALID_HOOKS.includes('post-commit'));
  });

  it('contains at least 15 hooks', () => {
    assert.ok(VALID_HOOKS.length >= 15);
  });

  it('does not include invented hook names', () => {
    assert.ok(!VALID_HOOKS.includes('on-deploy'));
    assert.ok(!VALID_HOOKS.includes('before-push'));
    assert.ok(!VALID_HOOKS.includes('post-build'));
  });
});

// ─── generateHookScript ───────────────────────────────────────────────────────

describe('generateHookScript', () => {
  it('starts with a POSIX shebang', () => {
    const script = generateHookScript([{ command: 'npm test' }]);
    assert.ok(script.startsWith('#!/bin/sh'));
  });

  it('includes SKIP_HOOKS=1 bypass logic', () => {
    const script = generateHookScript([{ command: 'npm test' }]);
    assert.ok(script.includes('SKIP_HOOKS'));
    assert.ok(script.includes('exit 0'));
  });

  it('includes the command', () => {
    const script = generateHookScript([{ command: 'npm run lint' }]);
    assert.ok(script.includes('npm run lint'));
  });

  it('includes all commands when multiple provided', () => {
    const script = generateHookScript([
      { command: 'npm test' },
      { command: 'npm run lint' }
    ]);
    assert.ok(script.includes('npm test'));
    assert.ok(script.includes('npm run lint'));
  });

  it('includes exit-on-failure logic for each command', () => {
    const script = generateHookScript([{ command: 'npm test' }]);
    assert.ok(script.includes('HOOKGUARD_STATUS=$?'));
    assert.ok(script.includes('exit $HOOKGUARD_STATUS'));
  });

  it('uses description as label when provided', () => {
    const script = generateHookScript([
      { command: 'npm test', description: 'Run test suite' }
    ]);
    assert.ok(script.includes('Run test suite'));
  });

  it('falls back to command as label when no description', () => {
    const script = generateHookScript([{ command: 'npm run build' }]);
    assert.ok(script.includes('npm run build'));
  });

  it('handles empty command array gracefully', () => {
    const script = generateHookScript([]);
    assert.ok(script.includes('#!/bin/sh'));
    assert.ok(script.includes('SKIP_HOOKS'));
  });
});

// ─── init ─────────────────────────────────────────────────────────────────────

describe('init', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  after(() => {
    removeTmpDir(tmpDir);
  });

  it('returns initialized: true', () => {
    const result = init(tmpDir);
    assert.equal(result.initialized, true);
  });

  it('creates .hookguard directory', () => {
    init(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, CONFIG_DIR)));
  });

  it('creates .hookguard/hooks subdirectory', () => {
    init(tmpDir);
    assert.ok(fs.existsSync(path.join(tmpDir, HOOKS_DIR)));
  });

  it('creates config.json with correct structure', () => {
    init(tmpDir);
    const config = readConfig(tmpDir);
    assert.equal(config.version, '1.0');
    assert.ok(typeof config.initializedAt === 'string');
    assert.deepEqual(config.hooks, {});
  });

  it('config.json initializedAt is a valid ISO timestamp', () => {
    init(tmpDir);
    const config = readConfig(tmpDir);
    const date = new Date(config.initializedAt);
    assert.ok(!isNaN(date.getTime()));
  });

  it('returns configDir path', () => {
    const result = init(tmpDir);
    assert.ok(result.configDir.includes(CONFIG_DIR));
  });

  it('returns hooksDir path', () => {
    const result = init(tmpDir);
    assert.ok(result.hooksDir.includes('hooks'));
  });

  it('throws if already initialized', () => {
    init(tmpDir);
    assert.throws(
      () => init(tmpDir),
      /already initialized/
    );
  });
});

// ─── add ──────────────────────────────────────────────────────────────────────

describe('add', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    init(tmpDir);
  });

  after(() => {
    removeTmpDir(tmpDir);
  });

  it('returns hook name, command, and total count', () => {
    const result = add('pre-commit', 'npm test', {}, tmpDir);
    assert.equal(result.hook, 'pre-commit');
    assert.equal(result.command, 'npm test');
    assert.equal(result.total, 1);
  });

  it('throws for invalid hook name', () => {
    assert.throws(
      () => add('on-deploy', 'npm test', {}, tmpDir),
      /not a valid git hook/
    );
  });

  it('throws for empty command string', () => {
    assert.throws(
      () => add('pre-commit', '', {}, tmpDir),
      /Command must be a non-empty string/
    );
  });

  it('throws for whitespace-only command', () => {
    assert.throws(
      () => add('pre-commit', '   ', {}, tmpDir),
      /Command must be a non-empty string/
    );
  });

  it('throws if not initialized', () => {
    const uninitDir = makeTmpDir();
    try {
      assert.throws(
        () => add('pre-commit', 'npm test', {}, uninitDir),
        /not initialized/
      );
    } finally {
      removeTmpDir(uninitDir);
    }
  });

  it('updates config.json with the new command', () => {
    add('pre-commit', 'npm test', {}, tmpDir);
    const config = readConfig(tmpDir);
    assert.ok(Array.isArray(config.hooks['pre-commit']));
    assert.equal(config.hooks['pre-commit'].length, 1);
    assert.equal(config.hooks['pre-commit'][0].command, 'npm test');
  });

  it('creates the hook file in .hookguard/hooks/', () => {
    add('pre-commit', 'npm test', {}, tmpDir);
    const hookFile = path.join(tmpDir, HOOKS_DIR, 'pre-commit');
    assert.ok(fs.existsSync(hookFile));
  });

  it('hook file is readable and has content after add', () => {
    add('pre-commit', 'npm test', {}, tmpDir);
    const hookFile = path.join(tmpDir, HOOKS_DIR, 'pre-commit');
    assert.ok(fs.existsSync(hookFile));
    const content = fs.readFileSync(hookFile, 'utf8');
    assert.ok(content.length > 0);
    // On Unix, verify owner execute bit is set; Windows doesn't use unix permissions
    if (process.platform !== 'win32') {
      const stat = fs.statSync(hookFile);
      assert.ok((stat.mode & 0o100) !== 0, 'Owner execute bit should be set on Unix');
    }
  });

  it('hook file contains the command', () => {
    add('pre-commit', 'npm run lint', {}, tmpDir);
    const hookFile = path.join(tmpDir, HOOKS_DIR, 'pre-commit');
    const content = fs.readFileSync(hookFile, 'utf8');
    assert.ok(content.includes('npm run lint'));
  });

  it('appends when called twice for the same hook', () => {
    add('pre-commit', 'npm test', {}, tmpDir);
    add('pre-commit', 'npm run lint', {}, tmpDir);
    const config = readConfig(tmpDir);
    assert.equal(config.hooks['pre-commit'].length, 2);
    assert.equal(config.hooks['pre-commit'][0].command, 'npm test');
    assert.equal(config.hooks['pre-commit'][1].command, 'npm run lint');
  });

  it('second add returns total of 2', () => {
    add('pre-commit', 'npm test', {}, tmpDir);
    const result = add('pre-commit', 'npm run lint', {}, tmpDir);
    assert.equal(result.total, 2);
  });

  it('stores description when provided in options', () => {
    add('pre-commit', 'npm test', { description: 'Run test suite' }, tmpDir);
    const config = readConfig(tmpDir);
    assert.equal(config.hooks['pre-commit'][0].description, 'Run test suite');
  });

  it('trims leading/trailing whitespace from command', () => {
    add('pre-commit', '  npm test  ', {}, tmpDir);
    const config = readConfig(tmpDir);
    assert.equal(config.hooks['pre-commit'][0].command, 'npm test');
  });

  it('addedAt is stored as ISO timestamp', () => {
    add('pre-commit', 'npm test', {}, tmpDir);
    const config = readConfig(tmpDir);
    const date = new Date(config.hooks['pre-commit'][0].addedAt);
    assert.ok(!isNaN(date.getTime()));
  });

  it('can add hooks for different hook names independently', () => {
    add('pre-commit', 'npm test', {}, tmpDir);
    add('pre-push', 'npm run build', {}, tmpDir);
    const config = readConfig(tmpDir);
    assert.ok(config.hooks['pre-commit']);
    assert.ok(config.hooks['pre-push']);
  });
});

// ─── remove ───────────────────────────────────────────────────────────────────

describe('remove', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    init(tmpDir);
    add('pre-commit', 'npm test', {}, tmpDir);
  });

  after(() => {
    removeTmpDir(tmpDir);
  });

  it('returns removed hook name', () => {
    const result = remove('pre-commit', tmpDir);
    assert.equal(result.removed, 'pre-commit');
  });

  it('removes the hook from config.json', () => {
    remove('pre-commit', tmpDir);
    const config = readConfig(tmpDir);
    assert.equal(config.hooks['pre-commit'], undefined);
  });

  it('deletes the hook file', () => {
    remove('pre-commit', tmpDir);
    const hookFile = path.join(tmpDir, HOOKS_DIR, 'pre-commit');
    assert.ok(!fs.existsSync(hookFile));
  });

  it('throws for unconfigured hook', () => {
    assert.throws(
      () => remove('commit-msg', tmpDir),
      /No hook configured for/
    );
  });

  it('throws for invalid hook name', () => {
    assert.throws(
      () => remove('fake-hook', tmpDir),
      /not a valid git hook/
    );
  });

  it('throws if not initialized', () => {
    const uninitDir = makeTmpDir();
    try {
      assert.throws(
        () => remove('pre-commit', uninitDir),
        /not initialized/
      );
    } finally {
      removeTmpDir(uninitDir);
    }
  });

  it('does not affect other hooks when removing one', () => {
    add('pre-push', 'npm run build', {}, tmpDir);
    remove('pre-commit', tmpDir);
    const config = readConfig(tmpDir);
    assert.ok(config.hooks['pre-push']);
    assert.equal(config.hooks['pre-commit'], undefined);
  });
});

// ─── list ─────────────────────────────────────────────────────────────────────

describe('list', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    init(tmpDir);
  });

  after(() => {
    removeTmpDir(tmpDir);
  });

  it('returns empty hooks array when nothing configured', () => {
    const result = list(tmpDir);
    assert.deepEqual(result.hooks, []);
    assert.equal(result.total, 0);
  });

  it('returns configured hooks', () => {
    add('pre-commit', 'npm test', {}, tmpDir);
    const result = list(tmpDir);
    assert.equal(result.total, 1);
    assert.equal(result.hooks[0].hook, 'pre-commit');
  });

  it('includes commands array for each hook', () => {
    add('pre-commit', 'npm test', {}, tmpDir);
    const result = list(tmpDir);
    assert.ok(Array.isArray(result.hooks[0].commands));
    assert.equal(result.hooks[0].commands[0].command, 'npm test');
  });

  it('includes count for each hook', () => {
    add('pre-commit', 'npm test', {}, tmpDir);
    add('pre-commit', 'npm run lint', {}, tmpDir);
    const result = list(tmpDir);
    assert.equal(result.hooks[0].count, 2);
  });

  it('returns multiple hooks', () => {
    add('pre-commit', 'npm test', {}, tmpDir);
    add('pre-push', 'npm run build', {}, tmpDir);
    const result = list(tmpDir);
    assert.equal(result.total, 2);
  });

  it('throws if not initialized', () => {
    const uninitDir = makeTmpDir();
    try {
      assert.throws(() => list(uninitDir), /not initialized/);
    } finally {
      removeTmpDir(uninitDir);
    }
  });
});

// ─── status ───────────────────────────────────────────────────────────────────

describe('status', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
  });

  after(() => {
    removeTmpDir(tmpDir);
  });

  it('returns initialized: false when not set up', () => {
    const result = status(tmpDir);
    assert.equal(result.initialized, false);
  });

  it('returns hooksCount: 0 when not initialized', () => {
    const result = status(tmpDir);
    assert.equal(result.hooksCount, 0);
  });

  it('returns empty hooks array when not initialized', () => {
    const result = status(tmpDir);
    assert.deepEqual(result.hooks, []);
  });

  it('returns initialized: true after init', () => {
    init(tmpDir);
    const result = status(tmpDir);
    assert.equal(result.initialized, true);
  });

  it('returns hooksCount after adding hooks', () => {
    init(tmpDir);
    add('pre-commit', 'npm test', {}, tmpDir);
    add('pre-push', 'npm run build', {}, tmpDir);
    const result = status(tmpDir);
    assert.equal(result.hooksCount, 2);
  });

  it('includes hooks names array', () => {
    init(tmpDir);
    add('pre-commit', 'npm test', {}, tmpDir);
    const result = status(tmpDir);
    assert.ok(result.hooks.includes('pre-commit'));
  });

  it('returns version from config', () => {
    init(tmpDir);
    const result = status(tmpDir);
    assert.equal(result.version, '1.0');
  });
});

// ─── uninstall ────────────────────────────────────────────────────────────────

describe('uninstall', () => {
  let tmpDir;

  beforeEach(() => {
    tmpDir = makeTmpDir();
    init(tmpDir);
  });

  after(() => {
    removeTmpDir(tmpDir);
  });

  it('returns uninstalled: true', () => {
    const result = uninstall(tmpDir);
    assert.equal(result.uninstalled, true);
  });

  it('removes the .hookguard directory', () => {
    uninstall(tmpDir);
    assert.ok(!fs.existsSync(path.join(tmpDir, CONFIG_DIR)));
  });

  it('throws if not initialized', () => {
    const uninitDir = makeTmpDir();
    try {
      assert.throws(
        () => uninstall(uninitDir),
        /not initialized/
      );
    } finally {
      removeTmpDir(uninitDir);
    }
  });

  it('status shows not initialized after uninstall', () => {
    uninstall(tmpDir);
    const result = status(tmpDir);
    assert.equal(result.initialized, false);
  });
});

// ─── Integration: full lifecycle ──────────────────────────────────────────────

describe('integration: full lifecycle', () => {
  let tmpDir;

  before(() => {
    tmpDir = makeTmpDir();
  });

  after(() => {
    removeTmpDir(tmpDir);
  });

  it('init → add → list → remove → uninstall without errors', () => {
    init(tmpDir);
    add('pre-commit', 'npm test', {}, tmpDir);
    add('pre-commit', 'npx eslint src/', { description: 'Lint check' }, tmpDir);
    add('pre-push', 'npm run build', {}, tmpDir);

    const listed = list(tmpDir);
    assert.equal(listed.total, 2);

    remove('pre-push', tmpDir);
    const afterRemove = list(tmpDir);
    assert.equal(afterRemove.total, 1);
    assert.equal(afterRemove.hooks[0].hook, 'pre-commit');
    assert.equal(afterRemove.hooks[0].count, 2);

    const s = status(tmpDir);
    assert.equal(s.initialized, true);
    assert.equal(s.hooksCount, 1);

    uninstall(tmpDir);
    assert.ok(!fs.existsSync(path.join(tmpDir, CONFIG_DIR)));
  });
});
