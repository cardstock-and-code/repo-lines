'use strict';
const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const MAX_TRUNK = 12;       // most recent trunk commits to draw
const MAX_BRANCH = 12;      // most recent commits per branch
const MAX_LINES = 9;        // branches drawn per project (trunk + 8)
const LIVE_SEC = 90;        // heartbeat newer than this = live
const IDLE_SEC = 60 * 30;   // heartbeat newer than this = idle, else ended

const PALETTE = ['#4fbfef', '#ef9457', '#bd93e8', '#4fd1a5', '#f0c04a', '#7fb2ff', '#e88fb8', '#8fd67a'];
const TRUNK_COLOR = '#ded7c8';

/* ---------------- git plumbing ---------------- */

/* Windows hands back forward slashes from `git worktree list` but backslashes
   from path.resolve, and its filesystem does not care about case. Paths get used
   as map keys, so they need one canonical form or nothing matches. */
function pathKey(p) {
  if (!p) return '';
  const r = path.resolve(String(p)).replace(/[\\/]+/g, '/').replace(/\/+$/, '');
  return process.platform === 'win32' ? r.toLowerCase() : r;
}

function git(cwd, args, { allowFail = false, raw = false } = {}) {
  try {
    const out = execFileSync('git', ['-c', 'core.quotepath=false', '--no-pager', ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      maxBuffer: 32 * 1024 * 1024,
    });
    // porcelain status encodes state in the first two columns, so leading
    // whitespace is meaningful and must survive
    // git on Windows can hand back CRLF; a stray \r would end up inside branch
    // names, file paths and shas
    const norm = out.replace(/\r\n/g, '\n');
    return raw ? norm.replace(/\n$/, '') : norm.trim();
  } catch (e) {
    if (allowFail) return null;
    throw new Error(`git ${args.join(' ')} failed in ${cwd}: ${String(e.stderr || e.message).trim()}`);
  }
}

const gitLines = (cwd, args, o) => {
  const out = git(cwd, args, o);
  return out ? out.split('\n').filter(Boolean) : [];
};

const REC = '%H%x1f%s%x1f%an%x1f%cI%x1f%P';
function parseCommits(lines) {
  return lines.map((l) => {
    const [sha, subject, author, iso, parents] = l.split('\x1f');
    return { sha, subject, author, iso, parents: (parents || '').split(' ').filter(Boolean) };
  });
}

function isGitRepo(dir) {
  const common = git(dir, ['rev-parse', '--git-common-dir'], { allowFail: true });
  if (common === null) return false;
  const own = git(dir, ['rev-parse', '--git-dir'], { allowFail: true });
  const abs = (p) => path.resolve(dir, p);
  // linked worktrees share a common dir but have their own git dir -> not a top-level project
  if (own && common && abs(own) !== abs(common)) return false;
  return true;
}

function hasCommits(dir) {
  return git(dir, ['rev-parse', '--verify', 'HEAD'], { allowFail: true }) !== null;
}

/* ---------------- discovery ---------------- */

function findRepos(root, depth = 2) {
  const found = [];
  const skip = new Set(['node_modules', '.git', 'dist', 'build', '.next', 'vendor', '.venv', 'target']);
  (function walk(dir, d) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('.') || skip.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (fs.existsSync(path.join(full, '.git'))) {
        if (isGitRepo(full)) found.push(full);
        continue; // don't descend into repos
      }
      if (d > 1) walk(full, d - 1);
    }
  })(root, depth);
  return found.sort();
}

/* Optional per-repo overrides, since git cannot always infer a stack:
   { "label": "S&R Portal", "base": { "child-branch": "parent-branch" }, "hide": ["old-thing"] } */
function readConfig(dir) {
  for (const name of ['.repo-lines.json', '.repolines.json']) {
    try {
      const raw = fs.readFileSync(path.join(dir, name), 'utf8');
      const c = JSON.parse(raw);
      return { label: c.label, base: c.base || null, hide: c.hide || [] };
    } catch { /* absent or malformed: fall through to defaults */ }
  }
  return { label: null, base: null, hide: [] };
}

function pickTrunk(dir, branches) {
  for (const pref of ['main', 'master', 'develop', 'trunk']) {
    if (branches.includes(pref)) return pref;
  }
  const head = git(dir, ['symbolic-ref', '--short', 'HEAD'], { allowFail: true });
  if (head && branches.includes(head)) return head;
  return branches[0];
}

/* ---------------- per-repo model ---------------- */

function scanRepo(dir, pretty, ident) {
  const label = path.basename(dir);
  const id = ident || { key: label, label: prettyName(label, pretty) };
  const project = { key: id.key, label: id.label, path: tildify(dir), dir, warnings: [] };

  if (!hasCommits(dir)) {
    project.empty = 'This repository has no commits yet, so there is nothing to draw.';
    project.lines = []; project.sessions = []; project.notice = null;
    return project;
  }

  const branches = gitLines(dir, ['for-each-ref', '--format=%(refname:short)', 'refs/heads']);
  if (!branches.length) {
    project.empty = 'This repository has commits but no named branch checked out.';
    project.lines = []; project.sessions = []; project.notice = null;
    return project;
  }

  const trunk = pickTrunk(dir, branches);
  project.trunk = trunk;

  const mergedSet = new Set(
    gitLines(dir, ['branch', '--merged', trunk, '--format=%(refname:short)'], { allowFail: true }) || []
  );
  mergedSet.delete(trunk);

  const cfg = readConfig(dir);
  if (cfg.label) project.label = cfg.label;

  const tip = {}, tipTime = {};
  for (const b of branches) {
    tip[b] = git(dir, ['rev-parse', b]);
    tipTime[b] = Number(git(dir, ['log', '-1', '--format=%ct', b])) || 0;
  }
  const isAncestorOfTrunk = (sha) =>
    git(dir, ['merge-base', '--is-ancestor', sha, trunk], { allowFail: true }) !== null;

  /* --- which branch is this one built on? ---------------------------------
     A branch is "stacked" when it shares a base with another branch that is
     itself off trunk. Git cannot tell which of two siblings forked from which,
     so we guess (most recently advanced tip is the base), break any cycles the
     guess creates, and let .repo-lines.json override the answer outright. */
  function inferBase(b) {
    if (cfg.base && cfg.base[b]) {
      const c = cfg.base[b];
      if (branches.includes(c) && c !== b) {
        const mb = git(dir, ['merge-base', b, c], { allowFail: true });
        if (mb) return { name: c, mb, declared: true };
      }
    }
    if (mergedSet.has(b)) return null; // merged branches always answer to trunk
    let best = null;
    for (const c of branches) {
      if (c === b || c === trunk) continue;
      const mb = git(dir, ['merge-base', b, c], { allowFail: true });
      if (!mb || mb === tip[b] || isAncestorOfTrunk(mb)) continue;
      const dist = Number(git(dir, ['rev-list', '--count', `${mb}..${b}`]));
      if (!best || dist < best.dist || (dist === best.dist && tipTime[c] > tipTime[best.name])) {
        best = { name: c, mb, dist };
      }
    }
    return best;
  }

  const baseOf = {};
  for (const b of branches) if (b !== trunk) baseOf[b] = inferBase(b);

  // break cycles: in a mutual pair the branch with the newer tip is the base
  for (const b of Object.keys(baseOf)) {
    const p = baseOf[b];
    if (!p) continue;
    const seen = new Set([b]);
    let cur = p.name;
    while (cur && baseOf[cur]) {
      if (seen.has(cur)) {
        const loser = tipTime[b] >= tipTime[cur] ? b : cur;
        if (!(cfg.base && cfg.base[loser])) baseOf[loser] = null;
        break;
      }
      seen.add(cur);
      cur = baseOf[cur].name;
    }
  }

  /* --- assemble displayed lines --- */
  const raw = [];

  // Trunk follows first-parent only. Commits that arrived via a merge belong to
  // the branch that brought them, not to the trunk's own spine.
  raw.push({
    id: trunk, name: trunk, trunk: true,
    commits: parseCommits(gitLines(dir, ['log', '--first-parent', `--format=${REC}`, `-${MAX_TRUNK}`, trunk])).reverse(),
    ahead: 0, behind: 0, merged: false,
  });

  const hidden = new Set(cfg.hide || []);
  let others = branches.filter((b) => b !== trunk && !hidden.has(b));
  others.sort((a, b) => tipTime[b] - tipTime[a]);

  const shown = others.slice(0, MAX_LINES - 1);
  if (others.length > shown.length) {
    const n = others.length - shown.length;
    project.warnings.push(`${n} more branch${n > 1 ? 'es are' : ' is'} not drawn — showing the ${shown.length} most recently touched.`);
  }

  const closedInline = [];

  for (const b of shown) {
    const merged = mergedSet.has(b);
    const counts = git(dir, ['rev-list', '--left-right', '--count', `${trunk}...${b}`]).split(/\s+/);
    const behind = Number(counts[0]) || 0;
    const ahead = Number(counts[1]) || 0;

    let parentName, forkSha, mergeSha = null;

    if (merged) {
      parentName = trunk;
      // the merge commit on trunk that brought this branch in, if there was one
      mergeSha = gitLines(dir, ['rev-list', '--merges', '--ancestry-path', `${tip[b]}..${trunk}`], { allowFail: true }).pop() || null;
      if (!mergeSha) {
        // fast-forwarded: this branch's commits ARE trunk commits. Drawing it as a
        // separate lane would be a lie, so list it instead.
        closedInline.push(b);
        continue;
      }
      forkSha = git(dir, ['merge-base', `${mergeSha}^1`, tip[b]], { allowFail: true })
        || git(dir, ['merge-base', b, trunk]);
    } else {
      const base = baseOf[b];
      parentName = base ? base.name : trunk;
      forkSha = base ? base.mb : git(dir, ['merge-base', b, trunk]);
    }

    let commits = parseCommits(gitLines(dir, ['log', `--format=${REC}`, `-${MAX_BRANCH}`, `${forkSha}..${b}`])).reverse();
    if (!commits.length) commits = parseCommits(gitLines(dir, ['log', `--format=${REC}`, '-2', b])).reverse();

    raw.push({
      id: b, name: b, trunk: false, commits, ahead, behind, merged,
      parentName, forkSha, mergeShaRaw: mergeSha,
      declaredBase: !!(cfg.base && cfg.base[b]),
    });
  }

  if (closedInline.length) project.closedInline = closedInline;

  /* --- make sure every fork and merge point is drawn on the parent line --- */
  const byId = Object.fromEntries(raw.map((l) => [l.id, l]));
  for (const l of raw) {
    if (l.trunk) continue;
    const parent = byId[l.parentName] || byId[trunk];
    l.parentId = parent.id;
    for (const sha of [l.forkSha, l.mergeShaRaw]) {
      if (!sha) continue;
      if (parent.commits.some((c) => c.sha === sha)) continue;
      const c = parseCommits(gitLines(dir, ['log', `--format=${REC}`, '-1', sha], { allowFail: true }))[0];
      if (c) { c.anchor = true; parent.commits.push(c); }
    }
  }
  for (const l of raw) {
    l.commits.sort((a, b) => (a.iso < b.iso ? -1 : a.iso > b.iso ? 1 : 0));
  }
  for (const l of raw) if (l.mergeShaRaw) l.mergeSha = l.mergeShaRaw;

  /* --- x positions: one shared timeline, ordered by commit date --- */
  const all = [];
  for (const l of raw) for (const c of l.commits) all.push({ line: l.id, c });
  all.sort((a, b) => (a.c.iso < b.c.iso ? -1 : a.c.iso > b.c.iso ? 1 : 0));
  const xOf = new Map();
  let x = 0;
  for (const { c } of all) {
    if (!xOf.has(c.sha)) xOf.set(c.sha, x++);
  }
  for (const l of raw) for (const c of l.commits) c.x = xOf.get(c.sha);

  /* --- gaps: consecutive drawn commits that aren't actually adjacent --- */
  for (const l of raw) {
    for (let i = 1; i < l.commits.length; i++) {
      const prev = l.commits[i - 1], cur = l.commits[i];
      const n = Number(git(dir, ['rev-list', '--count', '--first-parent', `${prev.sha}..${cur.sha}`], { allowFail: true }) || 1);
      if (n > 1) cur.gapBefore = n - 1;
    }
  }

  /* --- lanes: nearest fork first, then shortest span --- */
  const spanOf = (l) => {
    const start = l.trunk ? 0 : xOf.get(l.forkSha);
    const end = l.mergeSha ? xOf.get(l.mergeSha) : l.commits[l.commits.length - 1].x;
    return { start: start == null ? 0 : start, end };
  };
  const ordered = [raw[0], ...raw.slice(1).sort((a, b) => {
    const A = spanOf(a), B = spanOf(b);
    if (A.start !== B.start) return A.start - B.start;
    return (A.end - A.start) - (B.end - B.start);
  })];

  /* --- push state ---------------------------------------------------------
     Only computed when the repo has a remote at all: a purely local repo would
     otherwise flag every branch as "never pushed", which is noise, not advice.
     The scanner never fetches — these numbers compare against whatever the
     last manual fetch or push left in the remote-tracking refs, and the
     advisory copy says so. */
  const hasRemote = gitLines(dir, ['remote'], { allowFail: true }).length > 0;
  function pushState(b) {
    const u = git(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', `${b}@{upstream}`], { allowFail: true });
    if (!u) return { upstream: null, unpushed: 0, behindUpstream: 0 };
    const counts = git(dir, ['rev-list', '--left-right', '--count', `${u}...${b}`], { allowFail: true });
    const [behindUpstream, unpushed] = (counts || '0 0').split(/\s+/).map(Number);
    return { upstream: u, unpushed: unpushed || 0, behindUpstream: behindUpstream || 0 };
  }

  /* --- lanes + colors + status --- */
  const lines = [];
  ordered.forEach((l, i) => {
    const status = l.trunk ? 'trunk'
      : l.merged ? 'merged'
      : l.parentId && l.parentId !== trunk ? 'stacked'
      : l.behind > 0 ? 'caution'
      : l.ahead > 0 ? 'clear'
      : 'quiet';
    const color = l.trunk ? TRUNK_COLOR : PALETTE[(i - 1) % PALETTE.length];
    const parent = byId[l.parentId];
    const aheadOfParent = (!l.trunk && l.parentId && l.parentId !== trunk)
      ? Number(git(dir, ['rev-list', '--count', `${l.parentId}..${l.id}`], { allowFail: true }) || l.ahead)
      : l.ahead;
    lines.push({
      id: l.id, name: l.name, lane: i, color, trunk: !!l.trunk, status,
      remote: hasRemote ? pushState(l.id) : null,
      ahead: l.ahead, behind: l.behind, aheadOfParent, declaredBase: !!l.declaredBase,
      parent: l.parentId || null,
      from: l.trunk ? null : { line: l.parentId, x: xOf.get(l.forkSha) },
      mergeTo: l.mergeSha ? { line: parent ? parent.id : trunk, x: xOf.get(l.mergeSha) } : null,
      commits: l.commits.map((c) => ({
        x: c.x, sha: c.sha.slice(0, 7), m: c.subject, who: c.author,
        when: ago(c.iso), iso: c.iso,
        junction: c.parents.length > 1,
        gapBefore: c.gapBefore || 0,
      })),
    });
  });

  project.lines = lines;
  project.worktrees = readWorktrees(dir);
  return project;
}

/* ---------------- worktrees + dirt ---------------- */

function readWorktrees(dir) {
  const out = git(dir, ['worktree', 'list', '--porcelain'], { allowFail: true });
  if (!out) return [];
  const trees = [];
  let cur = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('worktree ')) { cur = { path: line.slice(9) }; trees.push(cur); }
    else if (line.startsWith('branch ') && cur) cur.branch = line.slice(7).replace('refs/heads/', '');
    else if (line === 'detached' && cur) cur.branch = null;
  }
  const others = trees.map((t) => pathKey(t.path));
  for (const t of trees) {
    // -unormal collapses an untracked directory to one entry instead of listing
    // every file inside it, which is the difference between "3 changes" and "667"
    const st = git(t.path, ['status', '--porcelain=v1', '-unormal'], { allowFail: true, raw: true });
    const rows = (st ? st.split('\n') : []).map(parseStatusLine).filter(Boolean)
      .filter((r) => !isNoise(r.file))
      // another worktree of this same repo living inside this one is not your edit
      .filter((r) => !others.some((o) => o !== pathKey(t.path) && o === pathKey(path.join(t.path, r.file))));
    t.dirty = rows.map((r) => r.file);
    // Collisions are about individual files two people could both be holding.
    // -unormal reports a wholly untracked directory as one "dir/" entry; that is
    // a folder git is not tracking at all, not a file anyone is editing.
    t.edited = rows.filter((r) => !r.file.endsWith('/')).map((r) => r.file);
    let newest = 0;
    for (const f of t.dirty.slice(0, 40)) {
      try { newest = Math.max(newest, fs.statSync(path.join(t.path, f)).mtimeMs); } catch { /* deleted */ }
    }
    t.lastActivity = newest || null;
  }
  return trees;
}

/* ---------------- sessions ---------------- */

function pidAlive(pid) {
  if (!pid) return false;
  try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; }
}

function readSessions(sessionDir) {
  let files = [];
  try { files = fs.readdirSync(sessionDir).filter((f) => f.endsWith('.json')); } catch { return []; }
  const now = Date.now();
  const out = [];
  for (const f of files) {
    let s;
    try { s = JSON.parse(fs.readFileSync(path.join(sessionDir, f), 'utf8')); } catch { continue; }
    if (!s || !s.worktree) continue;
    const beat = Date.parse(s.beatAt || s.startedAt || 0) || 0;
    const age = (now - beat) / 1000;
    // A pid is supporting evidence, not a veto. Hooks check in from a shell that
    // exits immediately, so its pid is dead within milliseconds while the agent
    // itself is very much running. A fresh heartbeat outranks a dead pid.
    const alive = pidAlive(s.pid);
    let state;
    if (age < LIVE_SEC) state = 'live';
    else if (alive) state = 'idle';
    else if (age < IDLE_SEC) state = 'idle';
    else state = 'ended';
    out.push({
      file: f,
      agent: s.agent || 'Session',
      pid: s.pid || null,
      branch: s.branch || null,
      worktree: s.worktree,
      worktreeAbs: pathKey(s.worktree.replace(/^~/, os.homedir())),
      state, when: ago(new Date(beat).toISOString()), ageSec: Math.round(age), beatMs: beat,
      note: s.note || null,
    });
  }
  return out;
}

/* ---------------- collisions ---------------- */

// " M src/a.js", "?? new.txt", "R  old.js -> new.js"
function parseStatusLine(line) {
  const m = /^(..)\s(.*)$/.exec(line);
  if (!m) return null;
  const raw = m[2];
  const file = (raw.includes(' -> ') ? raw.split(' -> ').pop() : raw).replace(/^"|"$/g, '').trim();
  if (!file) return null;
  return { code: m[1], file, untracked: m[1] === '??' };
}

/* Directories that are machine output rather than your work. Without this a
   single repo can report hundreds of "changed" files and every worktree looks
   like it collides with every other one. */
const NOISE = new Set([
  'node_modules', '.pnpm-store', '.yarn', '.venv', 'venv', '__pycache__',
  'dist', 'build', 'out', 'target', 'coverage', '.next', '.nuxt', '.turbo',
  '.cache', '.parcel-cache', '.gradle', '.terraform', 'vendor',
]);

function isNoise(file) {
  const parts = file.split('/');
  if (parts.some((seg) => NOISE.has(seg))) return true;
  // agent scratch space: nested worktrees and session state under .claude/.codex
  if (/^\.(claude|codex)\/(worktrees|sessions|shell-snapshots|todos)\b/.test(file)) return true;
  return false;
}

function dirOf(p) { const d = path.dirname(p); return d === '.' ? '' : d; }

function attachSessions(project, sessions) {
  const mine = [];
  const treeByPath = new Map((project.worktrees || []).map((t) => [pathKey(t.path), t]));
  const now = Date.now();
  // one worktree, one session: if several heartbeats point at the same place,
  // the most recent one wins rather than showing the same work twice
  const freshest = new Map();
  for (const s of sessions) {
    const prev = freshest.get(s.worktreeAbs);
    if (!prev || (s.beatMs || 0) > (prev.beatMs || 0)) freshest.set(s.worktreeAbs, s);
  }
  for (const s of freshest.values()) {
    const t = treeByPath.get(s.worktreeAbs);
    if (!t) continue;
    // A heartbeat can lapse while the session is plainly still working, so the
    // newest edit in the worktree also counts as a sign of life.
    const seen = Math.max(s.beatMs || 0, t.lastActivity || 0);
    const age = (now - seen) / 1000;
    let state = s.state;
    if (age < LIVE_SEC) state = 'live';
    else if (state !== 'ended' || age < IDLE_SEC) state = state === 'ended' ? 'ended' : 'idle';
    mine.push({
      ...s, state, branch: s.branch || t.branch,
      when: ago(new Date(seen || Date.now()).toISOString()),
      touching: t.dirty.slice(0, 6), allDirty: t.dirty,
      moreDirty: Math.max(0, t.dirty.length - 6),
    });
  }
  project.sessions = mine;

  // Overlapping uncommitted work is a hazard whether or not an agent is still
  // running, so this reads worktrees rather than sessions. Sessions only supply
  // friendlier names when we have them.
  const sessionByTree = new Map(mine.map((s) => [s.worktreeAbs, s]));
  const nameFor = (t) => {
    const s = sessionByTree.get(pathKey(t.path));
    if (s) return { who: s.agent, branch: s.branch || t.branch, session: s };
    return { who: t.branch ? `The ${t.branch} worktree` : 'An unattended worktree', branch: t.branch, session: null };
  };

  const trees = (project.worktrees || []).filter((t) => t.edited && t.edited.length);
  const clashes = [];
  for (let i = 0; i < trees.length; i++) {
    for (let j = i + 1; j < trees.length; j++) {
      const A = new Set(trees[i].edited);
      const sameFiles = trees[j].edited.filter((f) => A.has(f));
      const a = nameFor(trees[i]), b = nameFor(trees[j]);
      if (sameFiles.length) { clashes.push({ kind: 'file', a, b, files: sameFiles }); continue; }
      const ad = new Set(trees[i].edited.map(dirOf).filter(Boolean));
      const near = [...new Set(trees[j].edited.map(dirOf).filter((d) => d && ad.has(d)))];
      if (near.length) clashes.push({ kind: 'folder', a, b, files: near });
    }
  }
  for (const c of clashes) { if (c.a.session) c.a.session.clash = true; if (c.b.session) c.b.session.clash = true; }

  project.clashHints = clashes.filter((c) => c.kind === 'file').map((c) => ({
    branches: [c.a.branch, c.b.branch].filter(Boolean),
    other: c.b.branch,
    file: c.files[0],
  }));
  project.clashes = clashes.map((c) => ({
    kind: c.kind, a: c.a.who, aBranch: c.a.branch, b: c.b.who, bBranch: c.b.branch, files: c.files.slice(0, 4),
  }));

  if (clashes.length) {
    const c = clashes[0];
    const extra = clashes.length > 1 ? ` (${clashes.length - 1} other overlap${clashes.length > 2 ? 's' : ''} too)` : '';
    project.notice = c.kind === 'file'
      ? {
          title: 'Two lines, one file',
          body: `${esc(c.a.who)} and ${esc(c.b.who)} both have uncommitted changes to ${
            c.files.length > 1 ? `${c.files.length} of the same files` : `<code>${esc(c.files[0])}</code>`
          }. Whoever merges second reconciles it by hand${extra}. Nothing has gone wrong yet.`,
        }
      : {
          title: 'Two lines, same area',
          body: `${esc(c.a.who)} and ${esc(c.b.who)} are both working inside <code>${esc(c.files[0])}</code>. No file is shared yet, so this is a heads-up rather than a problem.`,
        };
  } else project.notice = null;
}

/* ---------------- advisories ---------------- */

function advisoryFor(line, project) {
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  // branch names are interpolated into HTML below, so escape them once here
  const trunk = esc(project.trunk);
  const l = Object.assign({}, line, { name: esc(line.name), parent: esc(line.parent || '') });

  if (l.trunk) {
    const last = l.commits[l.commits.length - 1];
    const open = project.lines.filter((x) => !x.trunk && x.status !== 'merged').length;
    return {
      status: 'Trunk line', tone: l.color,
      counts: `${n(l.commits.length, 'commit', 'commits')} shown · last change ${last ? last.when : 'unknown'}`,
      body: [
        `This is the line everything else comes back to. Whatever sits here is what actually runs when you deploy.`,
        open
          ? `${n(open, 'line is', 'lines are')} currently open off it. Select one to see whether it is ready to come home.`
          : `Nothing is waiting on it right now.`,
      ],
      why: `Rule of thumb: do not build directly on this line. Split off, build, come back.`,
    };
  }

  if (l.status === 'merged') {
    return {
      status: 'Closed', tone: l.color,
      counts: `folded into ${trunk}`,
      body: [
        `Done and put away. Its work now lives in ${trunk}, so this line is safe to delete whenever you feel like tidying.`,
        `It is drawn faintly here only so you can see where it rejoined the trunk.`,
      ],
      why: `Deleting a merged line does not delete its commits — they are part of ${trunk} now.`,
    };
  }

  if (l.status === 'stacked') {
    const body = [
      `This branch is stacked: it did not split off the ${trunk} trunk, it split off ${l.parent}, which is itself still unmerged. So it is sitting on ground that has not settled yet.`,
      `Two consequences. It cannot merge into ${trunk} until ${l.parent} gets there first. And if ${l.parent} changes shape before it lands — a rewrite, a squash, a rebase — this line has to be rebuilt on top of the new shape.`,
      `If this work does not actually depend on ${l.parent}, the cleanest fix is to move this line so it splits off ${trunk} directly. That removes the dependency entirely.`,
    ];
    if (l.behind > 0) body.push(`It is also ${n(l.behind, 'commit', 'commits')} behind ${trunk}, which will need sorting out once ${l.parent} lands.`);
    if (!l.declaredBase) body.push(`Worth knowing: git cannot prove which of these two lines split from the other — they share a base. If this reads backwards, say so in <code>.repo-lines.json</code> and it will be drawn your way.`);
    return {
      status: 'Stacked — read this', tone: l.color,
      counts: `${n(l.aheadOfParent, 'commit', 'commits')} ahead of ${l.parent} · ${l.ahead} ahead of ${trunk}`,
      body,
      why: `This is the branch-off-a-branch situation. It is not wrong, but it ties two pieces of work together that did not have to be.`,
    };
  }

  if (l.status === 'caution') {
    return {
      status: 'Update before merging', tone: '#f0c04a',
      counts: `${l.ahead} ahead · ${l.behind} behind`,
      body: [
        `${n(l.ahead, 'commit', 'commits')} of work here, but ${trunk} has moved ${n(l.behind, 'commit', 'commits')} forward since this line split off. The two have drifted apart.`,
        `Bring ${trunk} into this line first and settle any disagreements here, on your own line, while nothing else is at stake. Then merge. The alternative is settling those same disagreements during the merge itself, with ${trunk} half-changed.`,
        `Nothing is broken. This is ordinary drift on a line that has been open a while.`,
      ],
      why: `Behind means: things changed underneath you. The longer a line stays open, the bigger that number gets.`,
    };
  }

  if (l.status === 'clear') {
    return {
      status: 'Clear to merge', tone: l.color,
      counts: `${l.ahead} ahead · 0 behind`,
      body: [
        `${n(l.ahead, 'commit', 'commits')} of new work, and ${trunk} has not moved since this line split off. Merging it will be a straight fast-forward — no conflicts to untangle.`,
        `You do not have to merge right now. But every day ${trunk} moves is a day this line drifts, so small and finished is the best time to land it.`,
      ],
      why: `Zero behind is the good number. It means nobody changed the ground underneath you while you were building.`,
    };
  }

  return {
    status: 'Nothing new', tone: '#67748a',
    counts: `0 ahead · ${l.behind} behind`,
    body: [
      `This line has no commits of its own that ${trunk} does not already have.`,
      l.behind > 0
        ? `It is ${n(l.behind, 'commit', 'commits')} behind. Either delete it or bring it up to date before starting work here.`
        : `It is level with ${trunk}. Safe to delete, or start building on it.`,
    ],
    why: `An empty line costs nothing, but it is easy to forget which ones still matter.`,
  };
}

/* What the push state means for this line, in one sentence appended to the
   advisory. Silent when the repo has no remote, when the line is closed, and
   when there is nothing to say. Every sentence contains a bare "push" or
   "fetch" so the glossary can make the word askable. */
function remoteNote(line) {
  const r = line.remote;
  if (!r) return null;
  const n = (k, one, many) => `${k} ${k === 1 ? one : many}`;
  if (line.trunk) {
    if (!r.upstream) return null;
    const bits = [];
    if (r.behindUpstream > 0) {
      bits.push(`One more thing: this machine's copy of ${esc(line.name)} is ${n(r.behindUpstream, 'commit', 'commits')} behind ${esc(r.upstream)} — as of the last time this computer talked to it. This page never checks the network on its own, so that number only moves when you fetch or pull.`);
    }
    if (r.unpushed > 0) {
      bits.push(`${n(r.unpushed, 'commit here has', 'commits here have')} not been pushed to ${esc(r.upstream)} yet — push when you want them living somewhere safer than this machine.`);
    }
    return bits.join(' ') || null;
  }
  if (line.status === 'merged') return null;
  if (!r.upstream) {
    return `This line exists only on this machine — it has never been pushed. If this computer is lost, so is the branch. Push it once it is worth keeping.`;
  }
  if (r.unpushed > 0) {
    return `${n(r.unpushed, 'of these commits is', 'of these commits are')} not on ${esc(r.upstream)} yet — push when you want a copy that lives off this machine.`;
  }
  if (r.behindUpstream > 0) {
    return `${esc(r.upstream)} has ${n(r.behindUpstream, 'commit', 'commits')} this machine has not pulled down yet, as of the last fetch.`;
  }
  return null;
}

/* ---------------- merge order ---------------- */

/* What to do, in the order it has to happen. Derived from the graph, so it
   accounts for a branch that cannot land until its base does. */
function stepsFor(l, project) {
  const trunk = project.trunk;
  const byId = Object.fromEntries(project.lines.map((x) => [x.id, x]));
  const steps = [];

  if (l.trunk || l.status === 'merged') return steps;

  // walk down to the trunk, collecting every branch that must land first
  const chain = [];
  let cur = l;
  const guard = new Set();
  while (cur && cur.parent && cur.parent !== trunk && !guard.has(cur.id)) {
    guard.add(cur.id);
    const base = byId[cur.parent];
    if (!base) break;
    chain.unshift(base);
    cur = base;
  }

  for (const b of chain) {
    if (b.behind > 0) {
      steps.push({
        do: `Update ${b.name} from ${trunk}`,
        why: `it is ${b.behind} behind, and it has to land before this line can`,
      });
    }
    steps.push({
      do: `Merge ${b.name} into ${trunk}`,
      why: `${l.name} is built on it, so it cannot go first`,
    });
    steps.push({
      do: `Update ${l.name} from ${trunk}`,
      why: `so it sits on the newly merged work rather than the old copy`,
    });
  }

  if (!chain.length && l.behind > 0) {
    steps.push({
      do: `Update ${l.name} from ${trunk}`,
      why: `${trunk} moved ${l.behind} commits ahead; settle any clashes here, not during the merge`,
    });
  }

  const clash = (project.clashHints || []).find((c) => c.branches.includes(l.id));
  if (clash) {
    const other = clash.branches.find((b) => b !== l.id);
    if (other) {
      steps.push({
        do: `Settle the overlap with ${other} first`,
        why: `both have uncommitted edits to ${clash.file}; whichever merges second has to reconcile it by hand`,
      });
    }
  }

  steps.push({
    do: `Merge ${l.name} into ${trunk}`,
    why: chain.length ? 'now it has a clear path' : (l.behind > 0 ? 'now it will go in cleanly' : 'nothing is in its way'),
  });

  if (l.status !== 'quiet') {
    steps.push({ do: `Delete ${l.name}`, why: 'its commits live in ' + trunk + ' now, so nothing is lost' });
  }
  return steps;
}

/* ---------------- helpers ---------------- */

function ago(iso) {
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 10) return 'just now';
  if (s < 45) return `${Math.round(s)} sec ago`;
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) { const h = Math.round(s / 3600); return `${h} hr ago`; }
  const d = Math.round(s / 86400);
  if (d < 14) return `${d} day${d > 1 ? 's' : ''} ago`;
  const w = Math.round(d / 7);
  return w < 9 ? `${w} week${w > 1 ? 's' : ''} ago` : `${Math.round(d / 30)} mo ago`;
}

function tildify(p) {
  if (!p) return p;
  const h = pathKey(os.homedir());
  const k = pathKey(p);
  // compare canonically, but slice the original so its own separators survive
  if (k === h) return '~';
  if (k.startsWith(h + '/')) return '~' + String(p).slice(String(p).length - (k.length - h.length));
  return p;
}

/* Folder name -> display label. `pretty` comes from ~/.repo-lines/config.json
   ("pretty": { "Sr": "S&R" }) so personal shorthand stays a preference rather
   than a rule baked into the code. Keys match whole title-cased words. */
function prettyName(s, pretty) {
  let out = s.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\bPwa\b/, 'PWA');
  for (const [from, to] of Object.entries(pretty || {})) {
    const safe = String(from).replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
    out = out.replace(new RegExp('\\b' + safe + '\\b', 'g'), to);
  }
  return out;
}

function esc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* ---------------- glossary ---------------- */

/* The page uses these words, so it should be able to explain them. Keyed by the
   term as it appears on screen. */
const GLOSSARY = {
  ahead: {
    term: 'ahead',
    short: 'Commits this line has that the trunk does not.',
    long: 'Your new work, waiting to be merged. A high number is not a problem in itself, but it does mean a bigger change landing all at once.',
  },
  behind: {
    term: 'behind',
    short: 'Commits the trunk has that this line does not.',
    long: 'Work that landed on the trunk after you split off. The ground moved underneath you. Pull it in before merging, so you settle any disagreements on your own line rather than during the merge.',
  },
  trunk: {
    term: 'trunk',
    short: 'The line everything comes back to, usually called main.',
    long: 'What actually runs when you deploy. The habit worth keeping: never build directly on it. Split off, build, come back.',
  },
  branch: {
    term: 'branch',
    short: 'A line of work split off from another line.',
    long: 'A place to build without disturbing what already works. Cheap to make, cheap to throw away. The cost is not in creating them, it is in leaving them open so long that they drift.',
  },
  worktree: {
    term: 'worktree',
    short: 'A second folder on disk showing a different branch of the same repository.',
    long: 'Normally one repository means one folder, showing one branch at a time. A worktree lets you have several folders open at once, each on its own branch, sharing the same history. That is why two agents can work in parallel without fighting over the same files: they are in different folders. Deleting a worktree folder does not delete the branch or its commits.',
  },
  'fast-forward': {
    term: 'fast-forward',
    short: 'A merge with nothing to reconcile.',
    long: 'When the trunk has not moved since you split off, merging is just sliding the trunk label forward to where your work already is. No new merge commit, no conflicts, nothing to resolve.',
  },
  stacked: {
    term: 'stacked',
    short: 'A branch cut from another branch instead of from the trunk.',
    long: 'It cannot reach the trunk until the branch underneath it does, so the two are tied together. And if the lower branch is rewritten before it lands, the upper one has to be rebuilt on the new shape. Not wrong, but it couples two pieces of work that may not need coupling.',
  },
  merge: {
    term: 'merge',
    short: 'Bringing one line of work into another.',
    long: 'Git combines the two histories. Where both changed the same lines, it asks you to decide. Everything else it works out on its own.',
  },
  commit: {
    term: 'commit',
    short: 'One saved step in the history.',
    long: 'A snapshot with a message. Commits are permanent once pushed, which is why merging a branch and then deleting it loses nothing: the commits have already moved into the trunk.',
  },
  uncommitted: {
    term: 'uncommitted',
    short: 'Edits saved to disk but not yet recorded as a commit.',
    long: 'They exist only in that one folder. Git cannot help you merge or recover them until they are committed, which is why two worktrees with uncommitted edits to the same file is worth flagging.',
  },
  push: {
    term: 'push',
    short: 'Sending your commits to the copy of the repository that lives elsewhere.',
    long: 'Usually to GitHub or a similar host, called the remote. Until a branch is pushed it exists only on this machine — no backup, no way for anyone or anything else to see it. Pushing costs nothing and loses nothing.',
  },
  fetch: {
    term: 'fetch',
    short: 'Asking the remote what has changed, without changing your work.',
    long: 'Fetching updates this machine’s picture of the remote — nothing about your own branches moves. This page never fetches on its own, so any "behind its remote" number is only as fresh as the last time you fetched or pulled.',
  },
  drift: {
    term: 'drift',
    short: 'The gap that opens between a line and the trunk over time.',
    long: 'Every commit that lands on the trunk while your branch is open widens it. Small and frequent merges keep drift near zero; long-lived branches accumulate it.',
  },
};

/* ---------------- entry ---------------- */

/* Two roots can each hold a folder called "site". The key is what the URL hash
   and the pinned default are matched against, so it has to stay unique and
   slash-free; a colliding project takes its parent folder as a prefix, and
   says so in its label. */
function identify(dirs, pretty) {
  const count = {};
  for (const d of dirs) {
    const b = path.basename(d);
    count[b] = (count[b] || 0) + 1;
  }
  const out = new Map();
  for (const d of dirs) {
    const b = path.basename(d);
    if (count[b] === 1) {
      out.set(d, { key: b, label: prettyName(b, pretty) });
    } else {
      const parent = path.basename(path.dirname(d)) || 'root';
      out.set(d, {
        key: `${parent}-${b}`,
        label: `${prettyName(b, pretty)} (${parent})`,
      });
    }
  }
  return out;
}

function scan({ root, roots, sessionDir, defaultProject, pretty }) {
  const started = Date.now();
  const all = (roots && roots.length ? roots : [root]).filter(Boolean);
  // one folder listed twice, or nested inside another, must not double-scan
  const seenRoot = new Set();
  const rootList = all.filter((r) => {
    const k = pathKey(r);
    if (seenRoot.has(k)) return false;
    seenRoot.add(k); return true;
  });
  const repos = [];
  for (const r of rootList) {
    for (const d of findRepos(r)) if (!repos.some((x) => pathKey(x) === pathKey(d))) repos.push(d);
  }
  const ident = identify(repos, pretty);
  const sessions = readSessions(sessionDir);
  const projects = [];
  const skipped = [];

  for (const dir of repos) {
    try {
      const p = scanRepo(dir, pretty, ident.get(dir));
      attachSessions(p, sessions);
      if (p.lines) for (const l of p.lines) {
        l.advisory = advisoryFor(l, p);
        const note = remoteNote(l);
        if (note) l.advisory.body.push(note);
        l.steps = stepsFor(l, p);
      }
      delete p.clashHints;
      delete p.dir;
      if (p.worktrees) p.worktrees = p.worktrees.map((t) => ({ path: tildify(t.path), branch: t.branch, dirty: t.dirty.length }));
      delete p.clashes;
      for (const s of p.sessions || []) { delete s.allDirty; delete s.worktreeAbs; delete s.beatMs; }
      projects.push(p);
    } catch (e) {
      skipped.push({ path: tildify(dir), reason: e.message });
    }
  }

  // One flat list of every session anywhere, which is how you actually think
  // about them: "what is running right now", not "what is running in this repo".
  const allSessions = [];
  for (const p of projects) {
    for (const s of p.sessions || []) {
      allSessions.push({
        ...s,
        project: p.key,
        projectLabel: p.label,
        known: true,
      });
    }
  }

  // sessions pointing at worktrees we did not scan
  const claimed = new Set();
  for (const p of projects) for (const s of p.sessions) claimed.add(s.file);
  const seenTree = new Set();
  const orphans = sessions.filter((s) => {
    if (claimed.has(s.file) || seenTree.has(s.worktreeAbs)) return false;
    seenTree.add(s.worktreeAbs); return true;
  }).map((s) => ({
    agent: s.agent, branch: s.branch, worktree: s.worktree, state: s.state, when: s.when,
    project: null, projectLabel: null, known: false, touching: [], moreDirty: 0,
  }));
  for (const o of orphans) allSessions.push(o);

  // liveness first, then most recently seen
  const rank = { live: 0, idle: 1, ended: 2 };
  allSessions.sort((a, b) => {
    if (rank[a.state] !== rank[b.state]) return rank[a.state] - rank[b.state];
    return (a.ageSec || 0) - (b.ageSec || 0);
  });
  for (const s of allSessions) delete s.file;

  // Alphabetical, so the dropdown never reshuffles under you. Which project
  // opens first is a separate, pinned choice.
  projects.sort((a, b) => (a.label || '').localeCompare(b.label || ''));

  let defaultIndex = 0;
  let defaultMissing = null;
  if (defaultProject) {
    const want = String(defaultProject).toLowerCase();
    const i = projects.findIndex(
      (p) => p.key.toLowerCase() === want || (p.label || '').toLowerCase() === want
    );
    if (i >= 0) defaultIndex = i;
    else defaultMissing = defaultProject;
  }

  const now = new Date().toISOString();
  return {
    generatedAt: now,
    // `root` stays a single string for anything that reads one; `roots` is the
    // full list, so the page can say where it actually looked
    root: rootList.map((r) => tildify(r)).join(' · '),
    roots: rootList.map((r) => tildify(r)),
    // each section carries its own timestamp: sessions go stale in minutes,
    // branch topology stays true for hours
    sections: {
      branches: { at: now, trustFor: '1 hour' },
      working: { at: now, trustFor: '10 minutes' },
      sessions: { at: now, trustFor: '2 minutes' },
    },
    scanMs: Date.now() - started,
    defaultIndex, defaultMissing,
    defaultProject: defaultProject || null,
    glossary: GLOSSARY,
    projects, sessions: allSessions, orphans, skipped,
  };
}

module.exports = { scan, findRepos, ago, esc, tildify };
