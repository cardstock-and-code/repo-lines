---
name: repo-lines
description: Draw a plain-language picture of where every git project stands — branch topology, how far ahead or behind each branch is, which branches are stacked on other branches, which agent sessions are running in which worktrees, and where two sessions are about to collide. Use when the user asks to see their branches, their repos, "where things stand", what is safe to merge, whether a branch is stale, what sessions are open, or asks to refresh/update Repo Lines. Also use before advising on a merge, rebase, or branch cleanup, since the scan gives the real numbers instead of a guess.
---

# Repo Lines

Generates a self-contained HTML page showing every git repository under a dev
folder as a transit-style diagram: branches are lines, commits are stops, and a
fixed status rail says what to do about each one in plain English.

## Running it

```bash
node ~/.repo-lines/app/bin/repo-lines.js --root ~/dev --open
```

Writes two files to `~/.repo-lines/`:

- `repo-lines.html` — the page. Open it, or pass `--open`.
- `repo-lines.json` — the same data, for you to read.

For an ongoing session, prefer `repo-lines serve --root <path>`: it holds a URL
at `http://localhost:4321` and rescans on each request, so the user refreshes
rather than asking for a rebuild. `/model.json` on that same server returns the
snapshot for you to read.

Useful flags: `--root <path>` (default `~/dev`), `--out <path>` (default
`~/.repo-lines`), `--open`, `--default <project>` for a one-off override.

Preferences live in `~/.repo-lines/config.json` (`defaultProject`, `root`). Set
the pinned project with `repo-lines default <name>`; it validates the name
against what is actually on disk. The pinned project opens every time, whether or
not the live work is there.

Regenerate whenever the user asks, and after any merge, rebase, branch creation,
or branch deletion you perform for them. The page is a snapshot — it is only as
current as the last run.

## Reading the JSON yourself

Prefer `repo-lines.json` over re-running git commands one at a time. Check
`sections` before trusting any part of it — each section carries its own
timestamp because the parts go stale at very different rates:

| Section | Trust for | If older |
|---|---|---|
| `sections.sessions` | ~2 minutes | Re-run before saying who is working where |
| `sections.working` | ~10 minutes | Re-run before claiming a file is uncommitted |
| `sections.branches` | ~1 hour | Fine to reuse unless commits have landed since |

Top level: `sessions[]` is the flat list of every session across every repo,
sorted live first, each tagged with `project`, `projectLabel`, and `known`
(false when the worktree is outside the scanned root). Read this rather than
walking the projects when the user asks what is running. Also `defaultIndex`,
and `defaultMissing` when a pinned default could not be found.

Per project, the fields that matter: `trunk`, `lines[]` (each with `status`,
`ahead`, `behind`, `parent`, `advisory`), `sessions[]` (the same sessions, scoped
to that repo), `notice`, `warnings[]`.

`status` is one of `trunk`, `clear`, `caution`, `stacked`, `merged`, `quiet`.

## Sessions

Sessions are optional. Without them the diagram and all merge advice still work;
the sidebar is just empty and collision warnings fall back to naming worktrees
rather than agents.

To have a session appear, run this once at the start of a session, from inside
the worktree:

```bash
node ~/.repo-lines/app/bin/repo-lines.js session start --agent "Claude Code" --watch
```

`--watch` starts a detached beater that refreshes the heartbeat every 30 seconds
and shuts itself down once the worktree has been quiet for 45 minutes, so nothing
is left running. Other subcommands: `beat`, `end`, `list`, `prune`.

Liveness does not depend on the heartbeat alone. The scanner also looks at the
newest edit in each worktree, so a session that stops checking in but is plainly
still editing files still reads as live.

## When the stack looks wrong

Git cannot always prove which of two branches was cut from the other — if they
share a base, the relationship is genuinely ambiguous. The scanner guesses (the
branch whose tip moved most recently is treated as the base) and says so in the
advisory. To fix it permanently, add `.repo-lines.json` at the repo root:

```json
{
  "label": "S&R Portal",
  "base": { "store-run-receipts": "phase-25-payroll" },
  "hide": ["some-abandoned-branch"]
}
```

## Talking about the results

The page is written for someone who is still building confidence with branches.
Match that register when discussing it: say a branch is "6 commits behind, so
bring main into it before merging", not "rebase onto origin/main to avoid a
non-fast-forward merge". The `advisory` text in the JSON is already phrased this
way — reuse its wording rather than inventing more technical phrasing.

Do not tell the user to run git commands they did not ask for. Report state,
explain the consequence, let them decide.
