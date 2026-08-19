# Roadmap

Ordered by what would hurt most if left alone. Reshaped 2026-08-19 after a
design-grilling session; the release plan and open-sourcing decisions below
came out of that session.

## Release plan

- **0.5.0** — ships when item 1 (remotes) lands. This is also when the repo
  goes public and `repo-lines` publishes to npm: the known-wrong number is
  fixed, so the page can be trusted by strangers.
- **1.0.0** — ships when items 1–5 have all landed.

## Next

### 3. Multiple roots

Repeatable `--root` flag plus a `roots` array in config.json. Duplicate project
names disambiguate with their parent folder.

### 4. Snapshot history

`serve` writes a trimmed model to `~/.repo-lines/history/` at most once per
hour, keeps 30 days, and the page shows one plain-English line per project —
"since yesterday: main moved 3, laundry-bin-rework unchanged". Not a diff UI;
the question history answers is "did anything move while I wasn't looking",
and a sentence answers it.

### 5. Automatic session notes

The branch's last commit subject fills the note as a fallback, passed by the
hook on each beat; an explicit `--note` always wins.

## Open-sourcing (decided 2026-08-19)

- **Home:** the `cardstock-and-code` GitHub account (created 2026-08-19), as
  `repo-lines` on npm (name verified free; npm account still to register).
  License MIT, copyright Cardstock & Code.
- **Positioning:** for beginner AI coders learning branching and worktrees.
  Research found the zero-install + plain-English combination is the
  uncontested niche; the agent-dashboard feature race is already crowded
  (GitKraken 12.4, Conductor, Nimbalyst).
- **Light scrub before public:** fix the hooks' hardcoded user paths, move the
  personal working-style section out of the public CLAUDE.md, drop the
  render.js name-comment, make the `Sr → S&R` prettifier a config nicety.
- **Demo:** screenshot in the README plus a live GitHub Pages demo rendered
  from the test fixture (which already builds six realistic repos).
- **Support posture, stated in the README:** ~an hour a week; triage and
  obvious fixes; no roadmap promises.
- **Extensibility:** document what exists (`.repo-lines.json`, `REPO_LINES_*`
  env vars, hooks templates). Build nothing speculative until a real user asks.

## Later

- **Mobile.** The layout still works and its tests still pass, but it stopped
  being optimised once this became a desktop tool. Revisit only if it gets used
  from a phone.

## Done

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
