#!/usr/bin/env node
/*
 * Runs the suites. Three of them drive a real browser through Playwright, which
 * is a Python dependency rather than a Node one, so this script checks for it up
 * front and says what to install instead of failing halfway through a run.
 *
 *   node test/run.js            every suite
 *   node test/run.js paths      one suite (paths | e2e | serve | hooks)
 *   node test/run.js fixture    rebuild the throwaway repos only
 */
const { spawnSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');

const ROOT = path.resolve(__dirname, '..');
const FIX = process.env.REPO_LINES_FIXTURES || path.join(os.tmpdir(), 'repo-lines-fixtures');
const HOME = path.join(FIX, 'rlhome');
const DEV = path.join(FIX, 'dev');
const WIN = process.platform === 'win32';

function have(cmd, args = ['--version']) {
  const r = spawnSync(cmd, args, { stdio: 'ignore', shell: WIN });
  return !r.error && r.status === 0;
}

function python() {
  for (const c of ['python3', 'python', 'py']) if (have(c)) return c;
  return null;
}

/* The fixture script is bash. Git for Windows ships bash, so look there too. */
function bash() {
  if (have('bash', ['--version'])) return 'bash';
  if (WIN) {
    for (const p of [
      'C:\\Program Files\\Git\\bin\\bash.exe',
      'C:\\Program Files (x86)\\Git\\bin\\bash.exe',
    ]) if (fs.existsSync(p)) return p;
  }
  return null;
}

function run(cmd, args, extraEnv = {}) {
  const r = spawnSync(cmd, args, {
    cwd: ROOT,
    stdio: 'inherit',
    env: { ...process.env, REPO_LINES_HOME: HOME, REPO_LINES_FIXTURE_DEV: DEV, ...extraEnv },
    shell: WIN && !path.isAbsolute(cmd),
  });
  if (r.error) { console.error(`  could not run ${cmd}: ${r.error.message}`); return 1; }
  return r.status === null ? 1 : r.status;
}

function buildFixture() {
  const sh = bash();
  if (!sh) {
    console.error('Fixtures need bash. On Windows it comes with Git for Windows.');
    return 1;
  }
  fs.mkdirSync(FIX, { recursive: true });
  return run(sh, [path.join('test', 'fixture.sh')]);
}

const SUITES = {
  paths: { needsPython: false, needsFixture: false, run: () => run('node', [path.join('test', 'paths.js')]) },
  e2e: { needsPython: true, needsFixture: true, run: (py) => run(py, [path.join('test', 'e2e.py')]) },
  serve: { needsPython: true, needsFixture: true, run: (py) => run(py, [path.join('test', 'serve.py')]) },
  hooks: { needsPython: true, needsFixture: true, run: (py) => run(py, [path.join('test', 'hooks.py')]) },
};

function main() {
  const pick = process.argv[2];
  if (pick === 'fixture') process.exit(buildFixture());

  const names = pick ? [pick] : Object.keys(SUITES);
  for (const n of names) if (!SUITES[n]) {
    console.error(`Unknown suite "${n}". Try: ${Object.keys(SUITES).join(', ')}, fixture`);
    process.exit(1);
  }

  const wantsPython = names.some((n) => SUITES[n].needsPython);
  const py = wantsPython ? python() : null;
  if (wantsPython && !py) {
    console.error('Python 3 is needed for the browser suites. Install it, then:');
    console.error('  pip install playwright && playwright install chromium');
    console.error('Meanwhile `node test/run.js paths` runs without it.');
    process.exit(1);
  }
  if (py) {
    const check = spawnSync(py, ['-c', 'import playwright'], { stdio: 'ignore', shell: WIN });
    if (check.status !== 0) {
      console.error('Playwright is missing. Install it with:');
      console.error(`  ${py} -m pip install playwright && ${py} -m playwright install chromium`);
      process.exit(1);
    }
  }

  if (names.some((n) => SUITES[n].needsFixture)) {
    console.log('== fixtures ==');
    if (buildFixture() !== 0) process.exit(1);
  }

  let failed = [];
  for (const n of names) {
    console.log(`\n== ${n} ==`);
    if (SUITES[n].run(py) !== 0) failed.push(n);
  }

  console.log('');
  if (failed.length) { console.error(`FAILED: ${failed.join(', ')}`); process.exit(1); }
  console.log(`All suites passed (${names.join(', ')}).`);
}

main();
