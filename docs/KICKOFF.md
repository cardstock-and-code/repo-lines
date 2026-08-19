# Kickoff prompt

**Historical, kept for the record.** This was the brief that moved the tool out
of a chat session and into this repository on 2026-08-19. Parts of it are no
longer true — notably the broken test fixture it describes, which was rebuilt
that same day. For the current state read `CLAUDE.md` and `docs/ROADMAP.md`.

---

This is Repo Lines, a working tool I built in a chat session and am now moving
into a real project. Read `CLAUDE.md` and `docs/ROADMAP.md` before doing
anything — they cover what it is, the constraints, and what is already decided.

Short version: it scans a folder of git repos and generates one self-contained
HTML page showing branches as transit lines, with plain-English advice about what
to do with each branch and in what order. Zero dependencies, Node plus git only.
It runs as `node bin/repo-lines.js serve --root C:\dev --open` and I use it daily
on localhost. It works — this is not a rescue job.

Everything in `bin/`, `lib/`, `hooks/`, and `test/` is working code. The four
test suites passed when this was packaged: 133 end-to-end browser checks, 13
server checks, 16 hook checks, and the path suite.

One thing is knowingly broken in the move: `test/fixture.sh` refreshes the test
fixture but cannot create it, because the fixture repos were built by ad-hoc
commands that were never captured. So the browser suites have nothing to run
against on this machine. `docs/ROADMAP.md` item 1 describes exactly what those
repos need to contain.

Please start by:

1. Confirming the tool runs here — `node bin/repo-lines.js serve --root C:\dev`
   and check the page loads.
2. Running `npm test` to see what passes and what cannot run yet.
3. Telling me what you would tackle first before you start changing anything.

Do not restructure `lib/render.js` into modules. It is one large file on purpose
so the output stays a single self-contained page with no build step.

---
