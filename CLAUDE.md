# Repo Lines — project context

Read this first in any session on this repo.

## What it is

A snapshot generator that scans a folder of git repositories and writes one
self-contained HTML page showing where the code stands: branches drawn as transit
lines, commits as stops, and a plain-English advisory strip that says what to do
about the selected branch and in what order.

The audience is a beginner AI coder — someone who builds with agents but is
still building confidence with branches and worktrees — so the page's job is as
much to **teach** as to display. Every design decision bends toward "would
someone who is unsure about rebasing understand this?"

## Non-negotiables

- **Zero dependencies.** Node 18+ and git. No npm install, ever. This is a
  deliberate constraint, not an accident — it keeps the tool copyable and makes
  it safe to run against any repo.
- **It is a snapshot, not a daemon.** No file watchers, no background process, no
  push channel to the browser. `serve` rescans per request; refreshing the tab is
  how you take a new snapshot. This was considered and chosen twice.
- **Plain language.** The advisory copy avoids jargon, and where it must use a
  term, that term is in the glossary and hoverable on the page. Do not introduce
  wording that assumes git fluency.
- **No decorative emojis.** Meaningful icons only.
- **Dark by default.**

## Layout

```
bin/repo-lines.js   CLI: render (default), serve, session, default, config
lib/scan.js         git → model. All git reading and inference lives here.
lib/render.js       model → self-contained HTML. Template is a String.raw block;
                    the model is injected at the "__MODEL__" placeholder.
hooks/              Ready-made lifecycle configs for Claude Code and Codex
docs/SKILL.md       Instructions for an agent using the tool
test/               Four suites, see below
```

`lib/render.js` is one large file that emits HTML, CSS, and JS as text. It is
long, but splitting it would break the single-file, no-build guarantee. Prefer
editing in place over restructuring.

## Commands

```bash
node bin/repo-lines.js serve --root ~/dev --open   # localhost:4321, rescans per refresh
node bin/repo-lines.js --root ~/dev --open         # write a file instead
node bin/repo-lines.js default sr-portal           # pin the project that opens first
node bin/repo-lines.js session start --agent "Claude Code" --pid none --quiet
npm test                                           # all suites
node test/run.js paths                             # suites needing no browser: paths, multiroot
```

Preferences live in `~/.repo-lines/config.json`. Sessions live in
`~/.repo-lines/sessions/`. Pane sizes live in browser localStorage.

## Tests

| Suite | Needs | Covers |
| --- | --- | --- |
| `paths.js` | node only | Windows path normalisation, CRLF handling |
| `multiroot.js` | node only | 14 checks: several roots, name collisions, missing folders |
| `history.js` | node only | 20 checks: throttling, retention, the "since" sentence |
| `e2e.py` | python + playwright | 140 checks: rendering, advice, remotes, zoom, panes, mobile |
| `serve.py` | python + playwright | 26 checks: the localhost server, refresh keeps your place, pinning |
| `hooks.py` | python | 16 checks: session check-in lifecycle |

`test/fixture.js` builds the entire fixture from nothing — six sample repos,
worktrees, heartbeats, mtimes — idempotently, with node and git only, so the
suites run on any fresh machine. `node test/run.js fixture` rebuilds it alone.
The repos are shaped to match e2e.py's exact ahead/behind assertions; the
comments in fixture.js say which numbers matter.

Maintainer-specific working preferences live in `CLAUDE.local.md`, which is
gitignored — create your own if you want one.
