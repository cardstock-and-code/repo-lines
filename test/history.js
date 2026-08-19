#!/usr/bin/env node
/*
 * The rolling snapshot log. Node only: this suite has to fabricate snapshots
 * that are hours and days old, which no browser run could wait around for.
 */
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const history = require('../lib/history');

const DIR = path.join(os.tmpdir(), 'repo-lines-history-test');
const HOUR = 3600 * 1000;
const NOW = Date.parse('2026-08-19T12:00:00Z');

let ok = 0, fail = 0;
function check(name, cond, detail) {
  if (cond) { ok++; console.log(`  PASS  ${name}`); }
  else { fail++; console.log(`  FAIL  ${name}` + (detail !== undefined ? ` :: ${JSON.stringify(detail)}` : '')); }
}

/* A model just real enough for history to read. */
function model(lines, at) {
  return {
    generatedAt: new Date(at || NOW).toISOString(),
    projects: [{
      key: 'demo',
      lines: lines.map((l) => ({
        id: l.id, name: l.id, status: l.status || 'clear',
        ahead: l.ahead || 0, behind: l.behind || 0,
        commits: [{ sha: l.tip }],
      })),
    }],
  };
}

/* Write a snapshot dated in the past, the way record() names them. */
function plant(at, lines) {
  fs.mkdirSync(DIR, { recursive: true });
  const name = new Date(at).toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
  fs.writeFileSync(path.join(DIR, name + '.json'), JSON.stringify(history.trim(model(lines, at))));
  return name;
}

const reset = () => fs.rmSync(DIR, { recursive: true, force: true });

console.log('== history ==');

/* --- writing --- */
reset();
check('the first snapshot is always written',
  history.record(DIR, model([{ id: 'main', tip: 'aaa' }]), NOW) !== null);
check('a second one minutes later is not',
  history.record(DIR, model([{ id: 'main', tip: 'bbb' }]), NOW + 5 * 60 * 1000) === null);
check('but one an hour later is',
  history.record(DIR, model([{ id: 'main', tip: 'bbb' }]), NOW + HOUR + 1000) !== null);
check('so a refresh-heavy day leaves few files', history.list(DIR).length === 2, history.list(DIR).length);

/* --- retention --- */
reset();
plant(NOW - 40 * 24 * HOUR, [{ id: 'main', tip: 'old' }]);
plant(NOW - 3 * 24 * HOUR, [{ id: 'main', tip: 'mid' }]);
history.record(DIR, model([{ id: 'main', tip: 'new' }]), NOW);
const kept = history.list(DIR);
check('snapshots older than 30 days are pruned', kept.length === 2, kept.map((k) => k.file));
check('recent ones are kept', kept.some((k) => NOW - k.at === 3 * 24 * HOUR), kept.map((k) => k.file));

/* --- comparing --- */
reset();
check('nothing to say with no history', history.compare(DIR, model([{ id: 'main', tip: 'a' }]), NOW) === null);

plant(NOW - 30 * 60 * 1000, [{ id: 'main', tip: 'a' }]);
check('a snapshot from half an hour ago is too close to be useful',
  history.compare(DIR, model([{ id: 'main', tip: 'b' }]), NOW) === null);

reset();
plant(NOW - 25 * HOUR, [{ id: 'main', tip: 'a', ahead: 0 }, { id: 'feature', tip: 'f1', ahead: 2 }]);
let c = history.compare(DIR, model([
  { id: 'main', tip: 'a2', ahead: 0 },
  { id: 'feature', tip: 'f3', ahead: 5 },
]), NOW);
check('a day-old snapshot is described as yesterday', c.since === 'since yesterday', c.since);
check('a line that gained commits reports how many',
  c.projects.demo.includes('feature moved 3'), c.projects.demo);
check('a line whose tip changed without a count just says changed',
  c.projects.demo.includes('main changed'), c.projects.demo);

reset();
plant(NOW - 25 * HOUR, [{ id: 'main', tip: 'a' }, { id: 'gone-branch', tip: 'g1' }]);
c = history.compare(DIR, model([{ id: 'main', tip: 'a' }, { id: 'brand-new', tip: 'n1' }]), NOW);
check('a branch that appeared is called new', c.projects.demo.includes('brand-new is new'), c.projects.demo);
check('a branch that vanished is called gone', c.projects.demo.includes('gone-branch is gone'), c.projects.demo);

reset();
plant(NOW - 25 * HOUR, [{ id: 'main', tip: 'a' }]);
c = history.compare(DIR, model([{ id: 'main', tip: 'a' }]), NOW);
check('an unchanged project says so plainly', c.projects.demo === 'nothing moved', c.projects.demo);

reset();
plant(NOW - 4 * HOUR, [{ id: 'main', tip: 'a' }]);
c = history.compare(DIR, model([{ id: 'main', tip: 'b' }]), NOW);
check('without a day of history it says how old the comparison is',
  c.since === 'since 4 hours ago', c.since);

reset();
plant(NOW - 5 * 24 * HOUR, [{ id: 'main', tip: 'a' }]);
c = history.compare(DIR, model([{ id: 'main', tip: 'b' }]), NOW);
check('a much older comparison counts the days', c.since === 'since 5 days ago', c.since);

reset();
plant(NOW - 25 * HOUR, [{ id: 'main', tip: 'a' }]);
c = history.compare(DIR, model([{ id: 'main', tip: 'a' }, { id: 'x1', tip: '1' }, { id: 'x2', tip: '2' },
  { id: 'x3', tip: '3' }, { id: 'x4', tip: '4' }, { id: 'x5', tip: '5' }]), NOW);
check('a long list is capped rather than sprawling',
  /and \d+ more$/.test(c.projects.demo), c.projects.demo);

reset();
plant(NOW - 25 * HOUR, [{ id: 'main', tip: 'a' }]);
c = history.compare(DIR, {
  generatedAt: new Date(NOW).toISOString(),
  projects: [{ key: 'appeared-later', lines: [{ id: 'main', name: 'main', ahead: 0, commits: [{ sha: 'z' }] }] }],
}, NOW);
check('a project with no record that far back says so',
  c.projects['appeared-later'] === 'no record of this project that far back',
  c.projects['appeared-later']);

/* --- robustness --- */
reset();
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, 'not-a-snapshot.txt'), 'ignore me');
fs.writeFileSync(path.join(DIR, '2026-08-18T12-00-00Z.json'), '{ broken');
check('a corrupt snapshot does not throw',
  history.compare(DIR, model([{ id: 'main', tip: 'a' }]), NOW) === null);
check('non-snapshot files are ignored', history.list(DIR).length === 1, history.list(DIR).length);

reset();
console.log(fail ? `\n  ${ok}/${ok + fail} history checks passed` : '\nall history checks passed');
process.exit(fail ? 1 : 0);
