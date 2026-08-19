# Roadmap

Ordered by what would hurt most if left alone.

## Now

### 1. Rebuild the test fixture as a real builder

`test/fixture.sh` refreshes a fixture it cannot create. The browser suites are
therefore unrunnable on a fresh machine. It needs to build these from nothing,
idempotently, under a temp directory:

- **sr-portal** — trunk `main`. Branches: `phase-24-pwa` (merged into main with a
  real merge commit, not fast-forward), `laundry-bin-rework` (6 ahead, 6 behind),
  `phase-25-payroll` (ahead, nothing behind), `store-run-receipts` (cut from
  `phase-25-payroll`, so it reads as stacked). Four linked worktrees under
  `trees/`, with the same file left uncommitted in two of them so the collision
  notice fires.
- **convention-app** — trunk `main`, one merged branch, `offline-queue-retry`
  a couple of commits ahead.
- **sr-site** — trunk `main`, `estimate-form` ahead.
- **master-repo** — trunk named `master`, to prove trunk detection.
- **empty-repo** — `git init`, no commits.
- **not-a-repo** — a plain directory that must be skipped.

Assertions in `e2e.py` depend on the exact ahead/behind numbers, so build it,
run the suite, and adjust until green rather than guessing.

Also worth doing while in there: make it cross-platform, or accept that fixtures
require Git Bash on Windows and say so.

### 2. Remotes are untested

Every repo the scanner has ever run against had no origin, so ahead/behind has
only ever been computed local-vs-local. Real repos have remotes, and the numbers
may be comparing against `origin/main` rather than local `main`. Decide which
comparison is the useful one — probably local vs its own upstream — and test it
against a repo with a remote, including a branch that has never been pushed.

This is the most likely source of a wrong number in daily use.

## Next

### 3. Pin the default project from the page

Setting the default is a CLI command that changes something you look at in a
browser. It should be a pin control next to the project dropdown. Needs a small
write endpoint on the `serve` path, which is the first time the server would
accept a POST — keep it loopback-only and narrow.

### 4. Tight layout at 1280×720

The clamps prevent anything unusable, but with the advice strip expanded the map
gets cramped on a small laptop. Rebalance the defaults by viewport height rather
than using one fixed default.

### 5. Fonts fetch from Google

The page pulls Barlow Condensed and IBM Plex from the network and falls back to
system faces offline. Embedding them as base64 would make the file truly
self-contained at the cost of roughly a hundred kilobytes per page. Deliberately
not done yet; revisit if the page is ever opened away from a network.

### 6. Session notes

`session start --note` exists but nothing sets it automatically. A hook could
pass the branch's last commit subject, or the agent could set it when it starts a
task, so the sidebar says what each session is *doing* rather than only where.

## Later

- **Mobile.** The layout still works and its tests still pass, but it stopped
  being optimised once this became a desktop tool. Revisit only if it gets used
  from a phone.
- **History.** Every render is discarded. Keeping a small rolling log of
  snapshots would allow "what changed since yesterday", which is a different and
  possibly more useful question than "what is true now".
- **More than one root.** `--root` takes a single folder. Projects living
  elsewhere show up as sessions "not scanned".

## Decisions worth not relitigating

- **Snapshot, not live dashboard.** Raised twice, rejected twice. A page that
  repaints while you are reading advice is worse, not better.
- **Heartbeat files, not process sniffing.** Sniffing for agent processes is
  brittle across platforms and tells you nothing about which worktree.
- **PID is advisory.** A hook checks in from a shell that exits immediately, so a
  dead PID cannot be treated as proof a session ended. A fresh heartbeat wins.
- **Stacked-branch detection is a heuristic and says so.** Git genuinely cannot
  prove which of two branches sharing a base was cut from the other. The advisory
  admits the ambiguity rather than faking certainty. `.repo-lines.json` `base`
  overrides it.
- **No line-item pricing on the diagram.** Closed branches collapse because they
  are history, not decisions.
