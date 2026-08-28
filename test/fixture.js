#!/usr/bin/env node
/*
 * Builds the entire test fixture from nothing, idempotently:
 *
 *   <fixtures>/dev/      six sample repositories the scanner points at
 *   <fixtures>/rlhome/   a REPO_LINES_HOME with config + session heartbeats
 *
 * Needs only node and git, so it runs anywhere the tool itself runs.
 * The repos are shaped to match the assertions in e2e.py exactly — in
 * particular laundry-bin-rework must be 6 ahead / 6 behind main, and
 * store-run-receipts must read as stacked on phase-25-payroll. Change a
 * number here and the browser suite will tell you which check disagrees.
 *
 * Session states never need live processes: scan.js treats a fresh
 * heartbeat as live and a dead pid as advisory, so every record here can
 * carry pid null and still exercise live / idle / ended.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const FIX = process.env.REPO_LINES_FIXTURES || path.join(os.tmpdir(), 'repo-lines-fixtures');
const DEV = process.env.REPO_LINES_FIXTURE_DEV || path.join(FIX, 'dev');
const RLHOME = process.env.REPO_LINES_HOME || path.join(FIX, 'rlhome');
const TREES = path.join(DEV, 'trees');

const MIN = 60 * 1000;
const NOW = Date.now();
const at = (minAgo) => new Date(NOW - minAgo * MIN).toISOString();

/* Every commit gets an explicit, distinct timestamp so the shared timeline the
   page draws is deterministic. The author is lowercase on purpose: a tooltip
   check greps for "claude". Global/system git config is masked so a machine's
   gpgsign or hooksPath cannot leak into the fixture — via an empty file,
   because git cannot open the null device as a config file on Windows. */
const EMPTY_CONFIG = path.join(os.tmpdir(), 'repo-lines-empty-gitconfig');
fs.writeFileSync(EMPTY_CONFIG, '');
const GITENV = {
  ...process.env,
  GIT_CONFIG_GLOBAL: EMPTY_CONFIG, GIT_CONFIG_SYSTEM: EMPTY_CONFIG,
  GIT_AUTHOR_NAME: 'claude', GIT_AUTHOR_EMAIL: 'claude@example.test',
  GIT_COMMITTER_NAME: 'claude', GIT_COMMITTER_EMAIL: 'claude@example.test',
};

function git(cwd, args, minAgo) {
  const env = minAgo == null ? GITENV
    : { ...GITENV, GIT_AUTHOR_DATE: at(minAgo), GIT_COMMITTER_DATE: at(minAgo) };
  return execFileSync('git', args, { cwd, env, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

const write = (dir, name, content) => fs.writeFileSync(path.join(dir, name), content);
const append = (dir, name, content) => fs.appendFileSync(path.join(dir, name), content);

function commit(dir, msg, minAgo) {
  git(dir, ['add', '-A']);
  git(dir, ['commit', '--no-verify', '-m', msg], minAgo);
}

function repo(name) {
  const dir = path.join(DEV, name);
  fs.mkdirSync(dir, { recursive: true });
  git(dir, ['init', '-q', '-b', name === 'master-repo' ? 'master' : 'main']);
  return dir;
}

/* git marks its object files read-only, which fs.rmSync refuses to delete on
   Windows, so clear the bit first */
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

const touch = (dir, name, minAgo) => {
  const t = new Date(NOW - minAgo * MIN);
  fs.utimesSync(path.join(dir, name), t, t);
};

/* ---------------- build ---------------- */

const REMOTES = path.join(FIX, 'remotes');   // bare repos, outside the scanned root

rmrf(DEV);
rmrf(REMOTES);
rmrf(path.join(RLHOME, 'sessions'));
fs.mkdirSync(TREES, { recursive: true });
fs.mkdirSync(REMOTES, { recursive: true });

function addRemote(dir, name) {
  const bare = path.join(REMOTES, name + '.git');
  git(REMOTES, ['init', '-q', '--bare', bare]);
  git(dir, ['remote', 'add', 'origin', bare]);
}

/* --- rl-portal: the busy one ---------------------------------------------
   main ── two seed commits, a real (no-ff) merge of phase-24-pwa, then three
           more commits. laundry-bin-rework forks before all that movement,
           so it ends up exactly 6 behind (merge + 2 branch commits + 3).
   laundry-bin-rework ── 6 commits of its own: 6 ahead / 6 behind.
   phase-25-payroll ── forks at main's tip: ahead, 0 behind, clear to merge.
   store-run-receipts ── forks at phase-25's tip: reads as stacked. */
{
  const d = repo('rl-portal');
  write(d, 'README.md', '# rl-portal\n');
  write(d, 'periods.js', 'export const periods = [];\n');
  write(d, 'PayoutTable.jsx', 'export function PayoutTable() { return null; }\n');
  write(d, 'bins.js', 'export const bins = [];\n');
  write(d, 'receipt.js', 'export function receipt() {}\n');
  commit(d, 'start the portal', 13000);
  append(d, 'periods.js', 'export const payPeriodDays = 14;\n');
  commit(d, 'wire payroll periods', 12800);

  git(d, ['branch', 'laundry-bin-rework']);           // forks here: will fall 6 behind

  git(d, ['checkout', '-q', '-b', 'phase-24-pwa']);
  write(d, 'manifest.json', '{ "name": "rl-portal" }\n');
  commit(d, 'add web app manifest', 11500);
  write(d, 'sw.js', 'self.addEventListener("fetch", () => {});\n');
  commit(d, 'cache the shell offline', 11400);
  git(d, ['checkout', '-q', 'main']);
  git(d, ['merge', '--no-ff', '-q', '-m', 'bring the PWA work home', 'phase-24-pwa'], 10000);

  append(d, 'README.md', 'Deploys from main.\n');
  commit(d, 'document the deploy path', 8600);
  append(d, 'periods.js', 'export const holidays = [];\n');
  commit(d, 'account for holidays in periods', 7200);
  append(d, 'README.md', 'Payroll runs on Fridays.\n');
  commit(d, 'note the payroll cadence', 5800);

  git(d, ['checkout', '-q', 'laundry-bin-rework']);
  for (const [i, msg] of [
    'sketch the new bin flow', 'split bins by client', 'weigh-in screen',
    'bin labels print correctly', 'retire the old bin list', 'polish the bin flow',
  ].entries()) {
    append(d, 'bins.js', `// step ${i + 1}\n`);
    commit(d, msg, 7000 - i * 500);
  }

  git(d, ['checkout', '-q', 'main']);
  git(d, ['checkout', '-q', '-b', 'phase-25-payroll']);
  for (const [i, msg] of [
    'payroll period picker', 'gross pay math', 'deductions table',
    'payout confirmation screen', 'payout export',
  ].entries()) {
    append(d, 'PayoutTable.jsx', `// payroll step ${i + 1}\n`);
    commit(d, msg, 2800 - i * 200);
  }

  git(d, ['checkout', '-q', '-b', 'store-run-receipts']);   // stacked on phase-25
  append(d, 'receipt.js', 'export function parseReceipt() {}\n');
  commit(d, 'parse store receipts', 1200);
  append(d, 'receipt.js', 'export function attachReceipt() {}\n');
  commit(d, 'attach receipts to store runs', 1080);

  git(d, ['checkout', '-q', 'main']);
  git(d, ['worktree', 'add', '-q', path.join(TREES, 'rl-portal-phase25'), 'phase-25-payroll']);
  git(d, ['worktree', 'add', '-q', path.join(TREES, 'rl-portal-laundry'), 'laundry-bin-rework']);
  git(d, ['worktree', 'add', '-q', path.join(TREES, 'rl-portal-storerun'), 'store-run-receipts']);
}

/* --- timetable-app: one merged branch, one plain branch a couple ahead --- */
{
  const d = repo('timetable-app');
  write(d, 'retry.js', 'export function retry() {}\n');
  write(d, 'sms.js', 'export const templates = [];\n');
  commit(d, 'seed the timetable app', 9000);
  append(d, 'retry.js', 'export const attempts = 3;\n');
  commit(d, 'cap retry attempts', 8900);

  git(d, ['checkout', '-q', '-b', 'sms-template-cleanup']);
  append(d, 'sms.js', '// deduplicated templates\n');
  commit(d, 'dedupe the sms templates', 8000);
  git(d, ['checkout', '-q', 'main']);
  git(d, ['merge', '--no-ff', '-q', '-m', 'land the sms cleanup', 'sms-template-cleanup'], 7900);

  git(d, ['checkout', '-q', '-b', 'offline-queue-retry']);
  append(d, 'retry.js', 'export function queueOffline() {}\n');
  commit(d, 'queue sends while offline', 1800);
  // pushed at this point, then one more local commit: exactly 1 unpushed
  addRemote(d, 'timetable-app');
  git(d, ['push', '-q', '-u', 'origin', 'offline-queue-retry']);
  append(d, 'retry.js', 'export function drainQueue() {}\n');
  commit(d, 'drain the queue on reconnect', 1560);
  git(d, ['checkout', '-q', 'main']);
}

/* --- rl-site: one branch ahead, worked on from a linked worktree --- */
{
  const d = repo('rl-site');
  write(d, 'EstimateForm.jsx', 'export function EstimateForm() { return null; }\n');
  write(d, 'site.css', 'body { margin: 0; }\n');
  commit(d, 'seed the site', 5700);

  // push main with one extra commit, then rewind the local copy: origin/main
  // is now 1 ahead, so the trunk advisory can teach "behind its remote"
  addRemote(d, 'rl-site');
  append(d, 'site.css', 'h1 { font-weight: 600; }\n');
  commit(d, 'tighten the heading', 5600);
  git(d, ['push', '-q', '-u', 'origin', 'main']);
  git(d, ['reset', '-q', '--hard', 'HEAD~1']);

  git(d, ['checkout', '-q', '-b', 'estimate-form']);   // never pushed, on purpose
  append(d, 'EstimateForm.jsx', '// square footage field\n');
  commit(d, 'ask for square footage', 1500);
  append(d, 'EstimateForm.jsx', '// instant quote\n');
  commit(d, 'show the quote instantly', 1320);
  git(d, ['checkout', '-q', 'main']);
  git(d, ['worktree', 'add', '-q', path.join(TREES, 'rl-site-estimate'), 'estimate-form']);
}

/* --- master-repo: proves trunk detection when the trunk is called master.
       A check asserts the advice never says "main" here, so keep that word
       out of the commit subjects too. --- */
{
  const d = repo('master-repo');
  write(d, 'tool.js', 'export function tool() {}\n');
  commit(d, 'first cut of the tool', 14000);
  append(d, 'tool.js', 'export const version = 2;\n');
  commit(d, 'second pass on the tool', 13900);
}

/* --- empty-repo: initialised, never committed --- */
repo('empty-repo');

/* --- not-a-repo: a plain folder the scanner must skip --- */
{
  const d = path.join(DEV, 'not-a-repo');
  fs.mkdirSync(d, { recursive: true });
  write(d, 'notes.txt', 'just a folder\n');
}

/* ---------------- uncommitted work ----------------
   periods.js is deliberately dirty in BOTH the phase-25 and laundry worktrees:
   that is what fires the two-lines-one-file collision notice. */
const WT = {
  phase25: path.join(TREES, 'rl-portal-phase25'),
  laundry: path.join(TREES, 'rl-portal-laundry'),
  storerun: path.join(TREES, 'rl-portal-storerun'),
  estimate: path.join(TREES, 'rl-site-estimate'),
};
append(WT.phase25, 'PayoutTable.jsx', '// wip: confirmation copy\n');
append(WT.phase25, 'periods.js', '// wip: period rollover\n');
append(WT.laundry, 'bins.js', '// wip: bin sort order\n');
append(WT.laundry, 'periods.js', '// wip: laundry pay period\n');
append(WT.storerun, 'receipt.js', '// wip: receipt totals\n');
append(WT.estimate, 'EstimateForm.jsx', '// wip: zip code lookup\n');

/* mtimes are how the scanner tells a working session from a lapsed one, so set
   them last — after git has finished touching everything */
touch(WT.phase25, 'PayoutTable.jsx', 0); touch(WT.phase25, 'periods.js', 0);
touch(WT.laundry, 'bins.js', 18); touch(WT.laundry, 'periods.js', 18);
touch(WT.storerun, 'receipt.js', 240);
touch(WT.estimate, 'EstimateForm.jsx', 0);

/* ---------------- sessions + config ----------------
   Two live (fresh beats), one idle (18 min), two ended (4 hours) — one of the
   ended ones points outside the scanned root, so it renders as "Outside". */
const S = path.join(RLHOME, 'sessions');
fs.mkdirSync(S, { recursive: true });
const session = (file, rec) =>
  fs.writeFileSync(path.join(S, file + '.json'), JSON.stringify(rec, null, 2));

const sess = (agent, worktree, branch, minAgo, note) => ({
  agent, pid: null, worktree, branch,
  startedAt: at(minAgo + 30), beatAt: at(minAgo), note: note || null,
});
session('a', sess('Claude Code', WT.phase25, 'phase-25-payroll', 0, 'payout confirmation step'));
session('b', sess('Codex', WT.laundry, 'laundry-bin-rework', 18));
session('c', sess('Codex', WT.storerun, 'store-run-receipts', 240));
session('d', sess('Claude Code', WT.estimate, 'estimate-form', 0));
session('e', sess('Claude Code', path.join(FIX, 'somewhere-else'), 'who-knows', 240));

const confFile = path.join(RLHOME, 'config.json');
const conf = (() => { try { return JSON.parse(fs.readFileSync(confFile, 'utf8')); } catch { return {}; } })();
conf.defaultProject = 'rl-portal';
conf.pretty = { Rl: 'Repo Lines' };   // e2e asserts the "Repo Lines Portal" label via this
fs.writeFileSync(confFile, JSON.stringify(conf, null, 2) + '\n');

console.log(`fixture ready · ${DEV}`);
