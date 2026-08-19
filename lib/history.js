'use strict';
/*
 * A small rolling log of past snapshots, so the page can answer "did anything
 * move while I wasn't looking" — a different question from "what is true now",
 * and often a more useful one.
 *
 * Deliberately not a diff viewer. Each snapshot keeps only what is needed to
 * write one sentence per project, which is all this feature is for. Storing
 * whole models would grow without bound and tempt the page into becoming a
 * second product.
 */
const fs = require('fs');
const path = require('path');

const HOUR = 3600 * 1000;
const WRITE_EVERY = 1 * HOUR;        // a refresh-heavy day must not spam the log
const KEEP_MS = 30 * 24 * HOUR;      // a month is plenty to answer "since when"
const DAY_ISH = 20 * HOUR;           // close enough to "yesterday" to say so
const MIN_GAP = 2 * HOUR;            // below this, a comparison says nothing useful

/* Only the numbers a sentence can be written from. */
function trim(model) {
  const projects = {};
  for (const p of model.projects || []) {
    const lines = {};
    for (const l of p.lines || []) {
      const last = (l.commits || [])[(l.commits || []).length - 1];
      lines[l.id] = { ahead: l.ahead || 0, behind: l.behind || 0, status: l.status, tip: last ? last.sha : null };
    }
    projects[p.key] = { lines };
  }
  return { at: model.generatedAt || new Date().toISOString(), projects };
}

function list(dir) {
  try {
    return fs.readdirSync(dir)
      .filter((f) => f.endsWith('.json'))
      .map((f) => ({ file: f, at: Date.parse(f.slice(0, -5).replace(/-(\d\d)-(\d\d)Z$/, ':$1:$2Z')) }))
      .filter((s) => !Number.isNaN(s.at))
      .sort((a, b) => a.at - b.at);
  } catch { return []; }
}

/* Throttled, and prunes as it goes so nothing else has to remember to. */
function record(dir, model, now = Date.now()) {
  const snaps = list(dir);
  const newest = snaps.length ? snaps[snaps.length - 1].at : 0;
  if (now - newest < WRITE_EVERY) return null;
  try {
    fs.mkdirSync(dir, { recursive: true });
    const name = new Date(now).toISOString().replace(/\.\d+Z$/, 'Z').replace(/:/g, '-');
    fs.writeFileSync(path.join(dir, name + '.json'), JSON.stringify(trim(model)));
    for (const s of snaps) {
      if (now - s.at > KEEP_MS) { try { fs.unlinkSync(path.join(dir, s.file)); } catch { /* gone already */ } }
    }
    return name;
  } catch { return null; }   // history is a nicety; never fail a scan over it
}

/* The snapshot worth comparing against: about a day old if we have one,
   otherwise the oldest that is far enough back to be interesting. */
function pick(snaps, now) {
  const old = snaps.filter((s) => now - s.at >= DAY_ISH);
  if (old.length) return old[old.length - 1];
  const some = snaps.filter((s) => now - s.at >= MIN_GAP);
  return some.length ? some[0] : null;
}

function read(dir, file) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, file), 'utf8')); }
  catch { return null; }
}

const MAX_PARTS = 4;

/* One plain sentence per project. Returns { since, projects: {key: text} },
   or null when there is nothing old enough to compare against. */
function compare(dir, model, now = Date.now()) {
  const snaps = list(dir);
  const chosen = pick(snaps, now);
  if (!chosen) return null;
  const prev = read(dir, chosen.file);
  if (!prev || !prev.projects) return null;

  const ageH = (now - chosen.at) / HOUR;
  const since = ageH >= DAY_ISH / HOUR
    ? (ageH >= 44 ? `since ${Math.round(ageH / 24)} days ago` : 'since yesterday')
    : `since ${Math.round(ageH)} hours ago`;

  const projects = {};
  for (const p of model.projects || []) {
    const was = prev.projects[p.key];
    if (!was) { projects[p.key] = 'no record of this project that far back'; continue; }
    const parts = [];
    for (const l of p.lines || []) {
      const before = was.lines[l.id];
      const last = (l.commits || [])[(l.commits || []).length - 1];
      const tip = last ? last.sha : null;
      if (!before) { parts.push(`${l.name} is new`); continue; }
      if (before.tip === tip) continue;
      const gained = (l.ahead || 0) - (before.ahead || 0);
      // a rebase or squash changes the tip without adding anything countable,
      // so only claim a number when there is one
      parts.push(gained > 0 ? `${l.name} moved ${gained}` : `${l.name} changed`);
    }
    for (const id of Object.keys(was.lines)) {
      if (!(p.lines || []).some((l) => l.id === id)) parts.push(`${id} is gone`);
    }
    if (!parts.length) { projects[p.key] = 'nothing moved'; continue; }
    const shown = parts.slice(0, MAX_PARTS);
    const extra = parts.length - shown.length;
    projects[p.key] = shown.join(', ') + (extra ? `, and ${extra} more` : '');
  }
  return { since, projects };
}

module.exports = { record, compare, trim, list };
