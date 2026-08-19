# Repo Lines

A picture of where your code stands. Scans a folder of git repositories and
writes one self-contained HTML page: branches as lines, commits as stops, and a
status rail that says in plain English what to do about each branch.

## Who this is for

**Beginner AI coders learning to understand branching and worktrees.** If you
build with Claude Code or Codex but branches, merges, and worktrees still feel
shaky, this tool is aimed at you. It does not assume git fluency: every
advisory is written in plain English, every term of art is hoverable and
explained, and the diagram is designed to teach you how to read it. Watching
your own repos on this page is a gentler way to learn what "6 ahead, 6 behind"
means than reading about it in the abstract.

If you are already fluent in git, the page will still tell you the truth — but
the explanations exist for the person who is not, and they are not going away.

No daemon, no watchers, no background process. Every page you see is a snapshot
taken when you asked for it — either written to a file, or served on localhost
and refreshed on demand.

New to the code? Start with `CLAUDE.md`, then `docs/ROADMAP.md`.

## Install

macOS / Linux:

```bash
mkdir -p ~/.repo-lines
cp -R app ~/.repo-lines/app
node ~/.repo-lines/app/bin/repo-lines.js serve --root ~/dev --open
```

Windows PowerShell — note `$HOME`, not `~`. PowerShell does not expand `~`
inside an argument, so it gets passed through literally and resolved against
whatever folder you happen to be in:

```powershell
mkdir "$HOME\.repo-lines" -Force
Copy-Item -Recurse -Force .\app "$HOME\.repo-lines\app"
node "$HOME\.repo-lines\app\bin\repo-lines.js" serve --root C:\dev --open
```

Worth adding a shortcut to your PowerShell profile:

```powershell
function repo-lines { node "$HOME\.repo-lines\app\bin\repo-lines.js" @args }
```

Then `repo-lines serve --root C:\dev --open`.

Requires Node 18+ and git. Nothing else — no npm install.

Optional shortcut:

```bash
alias lines='node ~/.repo-lines/app/bin/repo-lines.js serve --root ~/dev --open'
```

## What it tells you

Every branch gets one of these, with the reasoning spelled out underneath:

- **Clear to merge** — ahead of main, nothing behind it, no conflicts coming.
- **Update before merging** — main has moved on; pull it in first, settle the
  disagreements on your own line rather than during the merge.
- **Stacked** — this branch was cut from another unmerged branch, not from main.
  It cannot land until that one does, and if that one changes shape this one has
  to be redrawn.
- **Closed** — merged already, safe to delete.
- **Trunk line** — what actually runs when you deploy.

It also flags when two worktrees have uncommitted changes to the same file,
which is the thing that quietly ruins an afternoon.

## Running it on localhost (recommended)

```bash
node ~/.repo-lines/app/bin/repo-lines.js serve --root ~/dev --open
```

Serves at `http://localhost:4321`, bound to loopback only. Every refresh takes a
fresh snapshot — a scan is a few hundred milliseconds, so it feels instant. There
is no watcher and no daemon: the page is still a still image, you just decide
when to take a new one.

Leave the tab open and hit refresh when you want to know where things stand.

The selected project and branch live in the URL, so a refresh keeps your place
rather than bouncing you back to the default. That also means a view is
bookmarkable: `http://localhost:4321/#sr-portal/phase-25-payroll`.

`/model.json` serves the same snapshot as JSON, for agents.

Use `--port` if 4321 is taken; it will also walk forward a few ports on its own
if it finds the one you asked for busy.

### Or without a server

`repo-lines` on its own still writes `repo-lines.html` to disk and `--open`
opens it directly. Same page, but you regenerate by re-running the command.

## Checking sessions in automatically

Nothing detects agents on its own, so each session announces itself. Both Claude
Code and Codex can do that for you with lifecycle hooks; the configs are in the
`hooks/` folder of this package.

**Claude Code** — merge `hooks/claude-code-settings.json` into
`%USERPROFILE%\.claude\settings.json`. It hooks three events: `SessionStart`
checks in, `UserPromptSubmit` keeps the heartbeat fresh, and `SessionEnd` checks
out. Run `/hooks` in Claude Code to confirm they loaded.

**Codex** — copy `hooks/codex-hooks.json` to `%USERPROFILE%\.codex\hooks.json`.
Codex requires you to review and trust a new hook before it runs, so run
`/hooks` in Codex once and trust them. The same three events are used.

Both configs pass `--quiet` so nothing lands in the agent's transcript, and
`--pid none` because the shell that runs a hook exits immediately. A session is
counted live from its heartbeat, not from that shell.

Both configs point at `%USERPROFILE%\.repo-lines\app`. Edit the paths if you
installed elsewhere — and if your agent runs hooks without a shell, replace
`%USERPROFILE%` with the literal path, since nothing will expand it for you.
On macOS and Linux use `~/.repo-lines/app` in the non-Windows command fields.

If you would rather not use hooks, check in by hand from inside a repo:

```powershell
repo-lines session start --agent "Claude Code" --note "what you are doing"
repo-lines session end
```

## Reading the map

The diagram is fitted to its box, so there are no scrollbars. Scroll the wheel
over it to zoom in, drag to pan once you are past fit, and double-click to go
back to the whole picture.

Merged branches are folded into a single `N closed branches` row in the status
rail. They are history rather than decisions, so they stay out of the way until
you click to see them.

## Adjusting the panes

Drag the seam between the map and the session list to make either wider, and the
seam above the advice strip to make it taller. Double-click a seam to reset it,
or focus it and use the arrow keys. Sizes are remembered per machine.

## What counts as a working file

Untracked directories, `node_modules`, package stores, build output, and agent
scratch space under `.claude/` and `.codex/` are left out of the working-file
list and out of collision detection. Without that a single repo can report
hundreds of changed files, and every worktree looks like it collides with every
other one.

## The session list

The sidebar is a master list of every session everywhere, not just the project
you happen to be looking at. Each card names its project, its branch, its
worktree, and the files it has open. They are grouped by working now, resting,
and finished.

Clicking a card jumps to that project and highlights its branch on the map. So
the sidebar answers "what is running right now", and one click answers "and where
is that".

### Or in its own window

```bash
node ~/.repo-lines/app/bin/repo-lines.js serve --app
```

Same server, but opened as a chromeless Edge/Chrome app window with its own
taskbar entry — as close to a desktop app as this tool will ever get, on
purpose. Falls back to an ordinary tab if neither browser is found.

## Choosing which project opens first

Click the pin next to the project dropdown — pinned means this project opens
first, every time. Clicking again unpins. The pin only works over localhost,
because saving it is the one thing the server will write; on a file page use
the CLI instead:

```bash
node ~/.repo-lines/app/bin/repo-lines.js default sr-portal
```

Saved to `~/.repo-lines/config.json`, so it survives regeneration. The default
opens every time regardless of where the active work is — if a session is live
elsewhere, it still shows in the sidebar, one click away.

`default` on its own prints the current setting; `default none` clears it. The
dropdown itself stays alphabetical so it never reshuffles under you.

## Sessions (optional)

```bash
cd ~/dev/trees/my-worktree
node ~/.repo-lines/app/bin/repo-lines.js session start --agent "Claude Code" --watch
```

The sidebar then shows which agent is in which worktree on which branch. Click a
session to highlight its branch in the diagram.

Each card also says what the session is *doing*: the `--note` if one was set,
otherwise the branch's own last commit subject, marked "last commit" so you
know where it came from. The fallback is read fresh on every snapshot, so it
never goes stale.

Everything works without this. Sessions only add names to the sidebar.

## Per-repo overrides

`.repo-lines.json` at a repo root:

```json
{
  "label": "S&R Portal",
  "base": { "child-branch": "parent-branch" },
  "hide": ["abandoned-branch"]
}
```

`base` is worth knowing about: when two branches share a base, git genuinely
cannot prove which was cut from which. The scanner guesses and says so. This
setting makes it certain.

## More than one folder

`--root` can be repeated:

```bash
node ~/.repo-lines/app/bin/repo-lines.js serve --root ~/dev --root ~/clients
```

Or set them once in `~/.repo-lines/config.json`:

```json
{ "roots": ["~/dev", "~/clients"] }
```

If the same project name appears in two roots, both are kept and each is
labelled with the folder it came from — "Notes (dev)" and "Notes (clients)".
A folder that does not exist is reported and skipped rather than stopping the
scan.

## What changed since yesterday

Every snapshot you take is also recorded — a small trimmed copy, at most one
per hour, kept for 30 days in `~/.repo-lines/history/`. Once there is one old
enough to be worth comparing against, the page adds a line under the project
name:

> **since yesterday:** laundry-bin-rework moved 3, store-run-receipts is new

That is the whole feature. It answers "did anything move while I wasn't
looking", which is a different question from "what is true now". It is
deliberately not a diff viewer.

Before there is a day of history it compares against the oldest snapshot it
has and says so ("since 4 hours ago"). `--no-history` turns the whole thing
off, recording included.

## Global preferences

`~/.repo-lines/config.json` can also hold a `pretty` map that fixes up
title-cased words in project labels — shorthand only you use, kept as a
preference rather than a rule in the code:

```json
{
  "defaultProject": "my-portal",
  "pretty": { "Sr": "S&R" }
}
```

With that, a folder called `sr-portal` is labelled "S&R Portal".

## Files it writes

| File | For |
|---|---|
| `~/.repo-lines/repo-lines.html` | You |
| `~/.repo-lines/repo-lines.json` | Agents, with per-section staleness stamps |
| `~/.repo-lines/history/*.json` | "Since yesterday"; hourly at most, 30 days |

## Offline

The page pulls Barlow Condensed and IBM Plex from Google Fonts. Offline it falls
back to condensed and system faces — same layout, slightly different texture.

## Remotes

The scanner **never touches the network**. Ahead/behind against a remote is
computed from whatever your last fetch or push left behind, and the page says
so in plain English: a trunk that has fallen behind its remote tells you the
number is only as fresh as your last fetch, and a branch that has never been
pushed tells you it exists only on this machine. Repos with no remote at all
are never nagged about pushing.

## Support

This is a working tool I use daily, maintained in roughly an hour a week.
Issues are read and obvious fixes get merged; there is no roadmap promise and
no SLA. It is deliberately small — if you need more, fork it, that is what the
license is for.
