# Roadmap

Ordered by what would hurt most if left alone. Reshaped 2026-08-19 after a
design-grilling session; the release plan and open-sourcing decisions below
came out of that session.

## Release plan

- ~~**0.5.0**~~ — reached 2026-08-19 when the remotes work landed.
- ~~**1.0.0**~~ — reached 2026-08-19; all five items are done.

Nothing outstanding. The LICENSE and publishable package.json landed
2026-08-19; the repo went public and moved to the studio account 2026-08-28;
`repo-lines@1.0.0` published to npm the same day and was verified with a
clean-room `npx repo-lines` against the live registry.

## Next

Nothing scheduled. The five items decided in the 2026-08-19 grilling have all
landed and the version is 1.0.0; what follows should come from real use, or
from someone else's issue once the repo is public.

## Open-sourcing (decided 2026-08-19)

- **Home:** `cardstock-and-code/repo-lines` on GitHub — as originally decided,
  after a detour: first pushed to a personal account on 2026-08-19, then
  transferred to the studio account on 2026-08-28 once it went public. On npm
  as `repo-lines` (name verified free; account still to register). License
  MIT, copyright Cardstock & Code.
- **Positioning:** for beginner AI coders learning branching and worktrees.
  Research found the zero-install + plain-English combination is the
  uncontested niche; the agent-dashboard feature race is already crowded
  (GitKraken 12.4, Conductor, Nimbalyst).
- **Light scrub before public:** fix the hooks' hardcoded user paths, move the
  personal working-style section out of the public CLAUDE.md, drop the
  render.js name-comment, make the `Sr → S&R` prettifier a config nicety.
- **Demo:** a live GitHub Pages demo rendered from the test fixture — built
  2026-08-19 as `.github/workflows/demo.yml`, published at
  https://cardstock-and-code.github.io/repo-lines/ on every push to main. The
  screenshot idea was dropped: the live page is strictly better and cannot go
  stale.
- **Support posture, stated in the README:** ~an hour a week; triage and
  obvious fixes; no roadmap promises.
- **Extensibility:** document what exists (`.repo-lines.json`, `REPO_LINES_*`
  env vars, hooks templates). Build nothing speculative until a real user asks.

## Later

- **Mobile.** The layout still works and its tests still pass, but it stopped
  being optimised once this became a desktop tool. Revisit only if it gets used
  from a phone.

## Done

- **Automatic session notes** (2026-08-19, version now 1.0.0). A session with
  no explicit note shows its branch's last commit subject instead, labelled
  "last commit" so the source is never ambiguous. Deviation worth noting: the
  plan had the hook pass this on each beat, but deriving it at scan time is
  simpler, needs no hook change, works for hand-registered sessions, and
  cannot go stale between beats.
- **Snapshot history** (2026-08-19). `lib/history.js` records a trimmed
  snapshot per scan, throttled to one an hour and pruned at 30 days, then
  writes one sentence per project under the project name. Deviation worth
  noting: the grilling said `serve` would record, but file renders record too,
  since both are "taking a snapshot" and file-mode users would otherwise never
  accumulate history. `--no-history` opts out entirely. Covered by
  `test/history.js` (20 checks), which fabricates snapshot ages no browser run
  could wait for.
- **Multiple roots** (2026-08-19). `--root` repeats, `REPO_LINES_ROOT` accepts
  a delimited list, and config.json takes a `roots` array. A name appearing in
  two roots keeps both, disambiguated by parent folder in both key and label;
  keys stay slash-free so URLs still parse. Duplicate and missing roots are
  handled without sinking the scan. Covered by a new node-only suite,
  `test/multiroot.js` (14 checks), so the browser suites stayed untouched.
- **Friction bundle** (2026-08-19). Pin-from-page: the server's first and only
  write route, `POST /config`, loopback-bound, accepting exactly
  `{"defaultProject": name-or-null}` and validating the name against real
  projects; a pin button sits next to the project dropdown and hides on
  file:// pages. Layout: pane defaults now scale with the viewport — the
  sidebar caps at 24% of width and the advice strip's default ceiling drops
  from 42vh to 32vh on screens 820px and shorter. And `serve --app` opens the
  page as a chromeless Edge/Chrome window, which is the entire answer to
  "should this be an Electron app".
- **Remotes — the honest number** (2026-08-19, version now 0.5.0). The scanner
  never fetches; when a repo has a remote, each line carries its push state
  (upstream, unpushed count, behind-upstream count) and the advisory appends
  one plain-English sentence: trunks behind their remote say the number is only
  as fresh as the last fetch, never-pushed branches say they exist only on this
  machine, unpushed commits are counted. Repos with no remote are never nagged.
  "push" and "fetch" joined the glossary. This unlocks going public + npm
  publish per the release plan — the identity scrub is also done, so the two
  remaining operator steps are registering the npm account and pushing to the
  cardstock-and-code repo.
- **Test fixture builder** (2026-08-19). `test/fixture.js` builds everything
  from nothing — six repos, worktrees, heartbeats, mtimes — with node and git
  only, cross-platform. The suites were de-hardcoded from the original sandbox
  paths; all 170 checks pass on Windows. Surfaced and fixed a real Windows bug
  in `scan.js`: collision session lookup compared raw paths against canonical
  ones, so collisions lost their agent names and file highlights.

## Decisions worth not relitigating

- **Snapshot, not live dashboard.** Raised twice, rejected twice, reaffirmed
  2026-08-19. A page that repaints while you are reading advice is worse, not
  better.
- **Zero dependencies and single-file output.** Reaffirmed 2026-08-19 with the
  landscape research in hand: these constraints are the differentiation, not a
  limitation. Reopenable only if a big, meaningful feature genuinely demands it.
- **Never fetch.** Decided 2026-08-19 with the remotes work. Zero-trust-to-run
  matters for strangers pointing the tool at work repos.
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
