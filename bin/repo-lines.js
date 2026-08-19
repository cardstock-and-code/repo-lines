#!/usr/bin/env node
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn } = require('child_process');

const { scan } = require('../lib/scan');
const { render } = require('../lib/render');
const history = require('../lib/history');

const HOME = os.homedir();
const CONF_DIR = process.env.REPO_LINES_HOME || path.join(HOME, '.repo-lines');
const SESSION_DIR = path.join(CONF_DIR, 'sessions');
const HISTORY_DIR = path.join(CONF_DIR, 'history');

/* Every snapshot both contributes to the rolling log and reads it back, so the
   page can say what moved since last time. Off with --no-history. */
function withHistory(model, o) {
  if (o.history === false || o['no-history']) return model;
  history.record(HISTORY_DIR, model);
  model.since = history.compare(HISTORY_DIR, model);
  return model;
}

function expand(p) {
  if (!p) return p;
  return path.resolve(p.startsWith('~') ? path.join(HOME, p.slice(1)) : p);
}

/* Preferences that should survive regeneration, so they live in a file rather
   than in flags you would have to retype every time. */
function readConfig() {
  const f = path.join(CONF_DIR, 'config.json');
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch (e) {
    if (e.code !== 'ENOENT') console.error(`Ignoring ${f}: ${e.message}`);
    return {};
  }
}

function writeConfig(next) {
  fs.mkdirSync(CONF_DIR, { recursive: true });
  const f = path.join(CONF_DIR, 'config.json');
  fs.writeFileSync(f, JSON.stringify(next, null, 2) + '\n');
  return f;
}

/* --root may be repeated, so repeated flags collect into an array rather than
   the last one silently winning. */
const REPEATABLE = new Set(['root']);

function args(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const v = (argv[i + 1] && !argv[i + 1].startsWith('--')) ? argv[++i] : true;
      if (REPEATABLE.has(k) && k in out) out[k] = [].concat(out[k], v);
      else out[k] = v;
    } else out._.push(a);
  }
  return out;
}

/* Every place a root can come from, in order of precedence, as a list. */
function rootsFrom(o, conf) {
  const flags = o.root ? [].concat(o.root).filter((r) => typeof r === 'string') : [];
  if (flags.length) return flags.map(expand);
  const env = process.env.REPO_LINES_ROOT;
  if (env) return env.split(path.delimiter).filter(Boolean).map(expand);
  if (Array.isArray(conf.roots) && conf.roots.length) return conf.roots.map(expand);
  if (conf.root) return [expand(conf.root)];
  return [path.join(HOME, 'dev')];
}

/* Missing folders are worth saying out loud, but one bad entry should not stop
   a scan of the others. */
function usableRoots(roots) {
  const ok = roots.filter((r) => fs.existsSync(r));
  for (const r of roots) if (!ok.includes(r)) console.error(`  skipping missing folder: ${r}`);
  if (!ok.length) {
    console.error(`No such folder: ${roots.join(', ')}\nPass --root <path>, or set REPO_LINES_ROOT.`);
    process.exit(1);
  }
  return ok;
}

function git(cwd, a) {
  try {
    return execFileSync('git', a, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return null; }
}

/* ------------------------- render ------------------------- */

function cmdRender(o) {
  const conf = readConfig();
  const roots = usableRoots(rootsFrom(o, conf));
  const outDir = expand(o.out || CONF_DIR);
  fs.mkdirSync(outDir, { recursive: true });

  const defaultProject = o.default || conf.defaultProject || null;
  const model = withHistory(scan({ roots, sessionDir: SESSION_DIR, defaultProject, pretty: conf.pretty }), o);
  const htmlPath = path.join(outDir, 'repo-lines.html');
  const jsonPath = path.join(outDir, 'repo-lines.json');

  fs.writeFileSync(htmlPath, render(model), 'utf8');
  fs.writeFileSync(jsonPath, JSON.stringify(model, null, 2), 'utf8');

  const nLines = model.projects.reduce((n, p) => n + (p.lines ? p.lines.length : 0), 0);
  const live = model.sessions.filter((s) => s.state === 'live').length;
  console.log(`${model.projects.length} projects · ${nLines} lines · ${model.sessions.length} sessions (${live} live) · ${model.scanMs}ms`);
  if (model.defaultMissing) {
    console.log(`  note: default project "${model.defaultMissing}" was not found under ${model.root}; opening ${model.projects[0] ? model.projects[0].label : 'nothing'} instead.`);
  }
  for (const s of model.skipped) console.log(`  skipped ${s.path}: ${s.reason.split('\n')[0]}`);
  console.log(htmlPath);
  console.log(jsonPath);
  if (o.open) openInBrowser(htmlPath);
}

/* `start` is a cmd.exe builtin, not a program, so spawning it directly throws
   ENOENT on Windows. */
function openInBrowser(target) {
  try {
    if (process.platform === 'win32') {
      spawn('cmd', ['/c', 'start', '', target], { detached: true, stdio: 'ignore' }).unref();
    } else {
      const opener = process.platform === 'darwin' ? 'open' : 'xdg-open';
      spawn(opener, [target], { detached: true, stdio: 'ignore' }).unref();
    }
  } catch { /* headless, or no browser; not worth failing the run over */ }
}

/* ------------------------- serve ------------------------- */

/* A snapshot per request. Refreshing the tab is how you take a new one, which
   keeps the page a still image rather than something that repaints while you
   are reading it. Bound to loopback only. */
function cmdServe(o) {
  const http = require('http');
  const conf = readConfig();
  const roots = usableRoots(rootsFrom(o, conf));
  let defaultProject = o.default || conf.defaultProject || null;
  const host = '127.0.0.1';
  let port = Number(o.port || conf.port || 4321);

  function snapshot() {
    const t0 = Date.now();
    const model = withHistory(scan({ roots, sessionDir: SESSION_DIR, defaultProject, pretty: conf.pretty }), o);
    return { model, ms: Date.now() - t0 };
  }

  const server = http.createServer((req, res) => {
    const url = (req.url || '/').split('?')[0];
    const send = (code, type, body) => {
      res.writeHead(code, {
        'content-type': type,
        // a snapshot must never be served from cache, or refresh would lie
        'cache-control': 'no-store, must-revalidate',
      });
      res.end(body);
    };
    /* The one write the server accepts: pinning (or unpinning) the default
       project from the page. Loopback-bound like everything else, one key,
       validated against the projects that actually exist. */
    if (req.method === 'POST' && url === '/config') {
      let body = '';
      req.on('data', (c) => {
        body += c;
        if (body.length > 1024) { send(413, 'text/plain', 'Too large'); req.destroy(); }
      });
      req.on('end', () => {
        if (res.writableEnded) return;
        let parsed;
        try { parsed = JSON.parse(body); } catch { return send(400, 'application/json', '{"error":"body must be JSON"}'); }
        const keys = Object.keys(parsed || {});
        if (keys.length !== 1 || keys[0] !== 'defaultProject'
            || (parsed.defaultProject !== null && typeof parsed.defaultProject !== 'string')) {
          return send(400, 'application/json', '{"error":"only {\\"defaultProject\\": <name or null>} is accepted"}');
        }
        const name = parsed.defaultProject;
        if (name !== null) {
          const { findRepos } = require('../lib/scan');
          const known = roots.flatMap((r) => findRepos(r)).map((d) => path.basename(d));
          if (!known.some((k) => k.toLowerCase() === name.toLowerCase())) {
            return send(400, 'application/json', '{"error":"no such project"}');
          }
        }
        const c = readConfig();
        if (name === null) delete c.defaultProject; else c.defaultProject = name;
        writeConfig(c);
        defaultProject = name;
        console.log(`  ${new Date().toLocaleTimeString()}  pin -> ${name || 'cleared'}`);
        send(200, 'application/json', JSON.stringify({ defaultProject: name }));
      });
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(405, 'text/plain', 'GET only');
    try {
      if (url === '/' || url === '/index.html') {
        const { model, ms } = snapshot();
        const live = model.sessions.filter((s) => s.state === 'live').length;
        console.log(`  ${new Date().toLocaleTimeString()}  rescan · ${model.projects.length} projects · ${live} live · ${ms}ms`);
        return send(200, 'text/html; charset=utf-8', render(model));
      }
      if (url === '/model.json') {
        const { model } = snapshot();
        return send(200, 'application/json; charset=utf-8', JSON.stringify(model, null, 2));
      }
      if (url === '/health') return send(200, 'text/plain', 'ok');
      send(404, 'text/plain', 'Not found. Try /');
    } catch (e) {
      console.error('  scan failed:', e.message);
      send(500, 'text/html; charset=utf-8',
        `<pre style="font:14px ui-monospace;padding:24px;color:#c33">Scan failed\n\n${escapeHtml(e.stack || e.message)}</pre>`);
    }
  });

  server.on('error', (e) => {
    if (e.code === 'EADDRINUSE' && port < Number(o.port || conf.port || 4321) + 12) {
      port += 1;
      server.listen(port, host);
      return;
    }
    console.error(`Could not listen on ${host}:${port} — ${e.message}`);
    process.exit(1);
  });

  server.listen(port, host, () => {
    const addr = `http://localhost:${port}`;
    console.log(`repo-lines serving ${roots.join('\n                 ')}`);
    console.log(`  ${addr}`);
    console.log('  every refresh takes a fresh snapshot · ctrl-c to stop');
    if (o.app) openAppWindow(addr);
    else if (o.open) openInBrowser(addr);
  });
}

/* A chromeless browser window is all the "desktop app" this needs: no runtime
   to ship, no installer. Falls back to an ordinary tab when no Chromium-family
   browser can be found. */
function openAppWindow(url) {
  const { spawnSync } = require('child_process');
  const candidates = [];
  if (process.platform === 'win32') {
    const pf = process.env.ProgramFiles || 'C:\\Program Files';
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)';
    const local = process.env.LOCALAPPDATA || '';
    candidates.push(
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    );
  } else {
    candidates.push('google-chrome', 'chromium', 'chromium-browser', 'microsoft-edge');
  }
  for (const exe of candidates) {
    try {
      const ok = path.isAbsolute(exe)
        ? fs.existsSync(exe)
        : spawnSync(exe, ['--version'], { stdio: 'ignore' }).status === 0;
      if (!ok) continue;
      spawn(exe, [`--app=${url}`], { detached: true, stdio: 'ignore' }).unref();
      return;
    } catch { /* try the next one */ }
  }
  console.log('  no Edge or Chrome found for --app; opening a normal tab instead');
  openInBrowser(url);
}

function escapeHtml(s) {
  return String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
}

/* ------------------------- sessions ------------------------- */

function idFor(worktree) {
  return path.resolve(worktree).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(-90);
}

function sessionFile(worktree) {
  return path.join(SESSION_DIR, idFor(worktree) + '.json');
}

function cmdSessionStart(o) {
  const wt = expand(o.worktree || process.cwd());
  const top = git(wt, ['rev-parse', '--show-toplevel']);
  if (!top) {
    // Hooks fire wherever the agent was launched, which is not always a repo.
    // Staying quiet keeps a harmless case out of the agent's transcript.
    if (o.quiet) process.exit(0);
    console.error(`Not inside a git worktree: ${wt}`);
    process.exit(1);
  }
  const branch = git(top, ['rev-parse', '--abbrev-ref', 'HEAD']);
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const now = new Date().toISOString();
  const rec = {
    agent: o.agent || process.env.REPO_LINES_AGENT || 'Session',
    // "--pid none" records no pid, which is right for hook check-ins: the
    // shell that ran the hook is gone before the page is ever rendered.
    pid: (o.pid === 'none' || o.pid === '0') ? null : (Number(o.pid) || process.ppid || process.pid),
    worktree: top,
    branch,
    note: o.note || null,
    startedAt: now,
    beatAt: now,
  };
  fs.writeFileSync(sessionFile(top), JSON.stringify(rec, null, 2));
  if (!o.quiet) console.log(`${rec.agent} checked in · ${branch} · ${top}`);
  if (o.watch) startWatcher(top);
}

function cmdSessionBeat(o) {
  const wt = expand(o.worktree || process.cwd());
  const top = git(wt, ['rev-parse', '--show-toplevel']) || wt;
  const f = sessionFile(top);
  let rec;
  try { rec = JSON.parse(fs.readFileSync(f, 'utf8')); }
  catch { return cmdSessionStart(o); }
  rec.beatAt = new Date().toISOString();
  rec.branch = git(top, ['rev-parse', '--abbrev-ref', 'HEAD']) || rec.branch;
  if (o.note) rec.note = o.note;
  fs.writeFileSync(f, JSON.stringify(rec, null, 2));
  if (!o.quiet) console.log(`beat · ${rec.branch}`);
}

function cmdSessionEnd(o) {
  const wt = expand(o.worktree || process.cwd());
  const top = git(wt, ['rev-parse', '--show-toplevel']) || wt;
  try { fs.unlinkSync(sessionFile(top)); if (!o.quiet) console.log('checked out'); }
  catch { if (!o.quiet) console.log('no session was recorded here'); }
}

function cmdSessionList() {
  let files = [];
  try { files = fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith('.json')); } catch { /* none */ }
  if (!files.length) return console.log('No sessions checked in.');
  for (const f of files) {
    try {
      const r = JSON.parse(fs.readFileSync(path.join(SESSION_DIR, f), 'utf8'));
      const age = Math.round((Date.now() - Date.parse(r.beatAt)) / 1000);
      console.log(`${r.agent.padEnd(14)} ${String(r.branch).padEnd(22)} ${age}s ago  ${r.worktree}`);
    } catch { /* skip unreadable */ }
  }
}

function cmdSessionPrune() {
  let files = [];
  try { files = fs.readdirSync(SESSION_DIR).filter((f) => f.endsWith('.json')); } catch { return; }
  let n = 0;
  for (const f of files) {
    const full = path.join(SESSION_DIR, f);
    try {
      const r = JSON.parse(fs.readFileSync(full, 'utf8'));
      let alive = false;
      try { process.kill(r.pid, 0); alive = true; } catch (e) { alive = e.code === 'EPERM'; }
      const stale = Date.now() - Date.parse(r.beatAt) > 24 * 3600 * 1000;
      if (!alive && stale) { fs.unlinkSync(full); n++; }
    } catch { fs.unlinkSync(full); n++; }
  }
  console.log(`pruned ${n}`);
}

// Optional background beater: refreshes the heartbeat, and stops on its own once
// the worktree has been quiet for a while, so nothing is left running forever.
function startWatcher(top) {
  const child = spawn(process.execPath, [__filename, 'session', 'watch', '--worktree', top], {
    detached: true, stdio: 'ignore',
  });
  child.unref();
  console.log(`watching ${top} (pid ${child.pid})`);
}

function cmdSessionWatch(o) {
  const top = expand(o.worktree || process.cwd());
  const quitAfter = (Number(o.quiet_for) || 45) * 60 * 1000;
  let lastChange = Date.now();
  let prev = '';
  setInterval(() => {
    const st = git(top, ['status', '--porcelain=v1', '-uall']) || '';
    if (st !== prev) { prev = st; lastChange = Date.now(); }
    if (Date.now() - lastChange > quitAfter) { try { fs.unlinkSync(sessionFile(top)); } catch {} process.exit(0); }
    cmdSessionBeat({ worktree: top, quiet: true });
  }, 30000);
}

function cmdDefault(o) {
  const name = o._[1];
  const conf = readConfig();
  if (!name) {
    console.log(conf.defaultProject
      ? `Default project: ${conf.defaultProject}`
      : 'No default project set. The first project alphabetically opens instead.');
    return;
  }
  if (name === 'none' || name === 'clear') {
    delete conf.defaultProject;
    console.log(`Default cleared · ${writeConfig(conf)}`);
    return;
  }
  const roots = rootsFrom(o, conf).filter((r) => fs.existsSync(r));
  const { findRepos } = require('../lib/scan');
  const keys = roots.flatMap((r) => findRepos(r)).map((d) => path.basename(d));
  if (keys.length && !keys.some((k) => k.toLowerCase() === String(name).toLowerCase())) {
    console.error(`No project called "${name}" under ${roots.join(', ')}.`);
    console.error(`Found: ${keys.join(', ')}`);
    process.exit(1);
  }
  conf.defaultProject = name;
  console.log(`Default project: ${name} · ${writeConfig(conf)}`);
}

/* ------------------------- main ------------------------- */

const HELP = `repo-lines — a picture of where your code stands

  repo-lines                          scan ~/dev and write the page
  repo-lines --root ~/code --open     scan elsewhere and open it
  repo-lines --root ~/a --root ~/b    scan more than one folder
  repo-lines --out ~/Desktop          choose where the page is written

  repo-lines serve [--open]           serve at http://localhost:4321
  repo-lines serve --app              same, in its own chromeless window
  repo-lines serve --port 5000        pick a different port

  repo-lines --no-history             do not record or read the rolling log
  repo-lines default sr-portal        always open this project first
  repo-lines default                  show the current default
  repo-lines default none             clear it
  repo-lines config                   show saved preferences

  repo-lines session start --agent "Claude Code" [--watch]
  repo-lines session beat | end | list | prune

Per-repo overrides go in <repo>/.repo-lines.json:
  { "label": "S&R Portal", "base": { "child-branch": "parent-branch" }, "hide": ["old"] }
`;

function main() {
  const argv = process.argv.slice(2);
  const o = args(argv);
  const cmd = o._[0];

  if (o.help || cmd === 'help') return console.log(HELP);

  if (cmd === 'session') {
    const sub = o._[1] || 'start';
    if (sub === 'start') return cmdSessionStart(o);
    if (sub === 'beat') return cmdSessionBeat(o);
    if (sub === 'end' || sub === 'stop') return cmdSessionEnd(o);
    if (sub === 'list') return cmdSessionList();
    if (sub === 'prune') return cmdSessionPrune();
    if (sub === 'watch') return cmdSessionWatch(o);
    console.error(`Unknown session command: ${sub}`); process.exit(1);
  }

  if (cmd === 'serve') return cmdServe(o);
  if (cmd === 'default') return cmdDefault(o);
  if (cmd === 'config') {
    const c = readConfig();
    console.log(Object.keys(c).length ? JSON.stringify(c, null, 2) : 'No config set.');
    return;
  }
  if (!cmd || cmd === 'render') return cmdRender(o);
  console.error(`Unknown command: ${cmd}\n\n${HELP}`); process.exit(1);
}

main();
