#!/usr/bin/env node
/*
 * Scanning more than one folder. Needs node only — the model is checked
 * directly rather than through a browser, because everything interesting here
 * happens before a single pixel is drawn.
 *
 * Builds its own throwaway roots so it never disturbs the shared fixture, and
 * deliberately puts a same-named repo in both to prove the disambiguation.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const { scan } = require('../lib/scan');

const BASE = path.join(os.tmpdir(), 'repo-lines-multiroot');
const A = path.join(BASE, 'work');
const B = path.join(BASE, 'personal');
const SESSIONS = path.join(BASE, 'sessions');

let ok = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { ok++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}` + (detail !== undefined ? ` :: ${JSON.stringify(detail)}` : '')); }
}

const EMPTY_CONFIG = path.join(os.tmpdir(), 'repo-lines-empty-gitconfig');
fs.writeFileSync(EMPTY_CONFIG, '');
const GITENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: EMPTY_CONFIG, GIT_CONFIG_SYSTEM: EMPTY_CONFIG,
  GIT_AUTHOR_NAME: 'tester', GIT_AUTHOR_EMAIL: 'tester@example.test',
  GIT_COMMITTER_NAME: 'tester', GIT_COMMITTER_EMAIL: 'tester@example.test',
};
const git = (cwd, a) => execFileSync('git', a, { cwd, env: GITENV, stdio: ['ignore', 'pipe', 'pipe'] });

function rmrf(p) {
  if (!fs.existsSync(p)) return;
  (function unlock(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, e.name);
      try { fs.chmodSync(full, 0o777); } catch { /* best effort */ }
      if (e.isDirectory()) unlock(full);
    }
  })(p);
  fs.rmSync(p, { recursive: true, force: true, maxRetries: 3 });
}

function repo(root, name) {
  const dir = path.join(root, name);
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', 'main']);
  fs.writeFileSync(path.join(dir, 'README.md'), `# ${name}\n`);
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--no-verify', '-qm', 'first']);
  return dir;
}

rmrf(BASE);
fs.mkdirSync(SESSIONS, { recursive: true });
repo(A, 'ledger');
repo(A, 'notes');       // same name in both roots, on purpose
repo(B, 'notes');
repo(B, 'sketchbook');

console.log('== multiroot ==');

const m = scan({ roots: [A, B], sessionDir: SESSIONS });
const keys = m.projects.map((p) => p.key).sort();

check('every repo from every root is found', m.projects.length === 4, keys);
check('unique names keep their plain key', keys.includes('ledger') && keys.includes('sketchbook'), keys);
check('a name in two roots is disambiguated',
  keys.includes('work-notes') && keys.includes('personal-notes'), keys);
check('keys stay free of slashes, so urls still parse',
  m.projects.every((p) => !p.key.includes('/')), keys);
check('the disambiguated label names its folder',
  m.projects.filter((p) => p.key.endsWith('-notes')).every((p) => /\((work|personal)\)/.test(p.label)),
  m.projects.map((p) => p.label));
check('unique projects keep a clean label',
  m.projects.find((p) => p.key === 'ledger').label === 'Ledger',
  m.projects.map((p) => p.label));
check('every root is reported', (m.roots || []).length === 2, m.roots);

const dup = scan({ roots: [A, A, B], sessionDir: SESSIONS });
check('the same root listed twice is scanned once', dup.projects.length === 4,
  dup.projects.map((p) => p.key));
check('and is only reported once', dup.roots.length === 2, dup.roots);

const one = scan({ root: A, sessionDir: SESSIONS });
check('a single root still works unchanged', one.projects.length === 2,
  one.projects.map((p) => p.key));
check('and needs no disambiguation', one.projects.map((p) => p.key).sort().join(),
  'ledger,notes');
check('single-root scans still report their root', one.roots.length === 1, one.roots);

const missing = scan({ roots: [A, path.join(BASE, 'nope')], sessionDir: SESSIONS });
check('a missing root does not sink the scan', missing.projects.length === 2,
  missing.projects.map((p) => p.key));

const pinned = scan({ roots: [A, B], sessionDir: SESSIONS, defaultProject: 'personal-notes' });
check('a disambiguated project can be pinned',
  pinned.projects[pinned.defaultIndex].key === 'personal-notes',
  pinned.projects[pinned.defaultIndex].key);

rmrf(BASE);
console.log(fail ? `\n  ${ok}/${ok + fail} multiroot checks passed` : '\nall multiroot checks passed');
process.exit(fail ? 1 : 0);
