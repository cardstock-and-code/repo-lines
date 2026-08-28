#!/usr/bin/env python3
"""Hook-driven check-in: what fires when an agent starts, prompts, and exits."""
import subprocess, os, sys, json, shutil, tempfile, time
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
APP = str(REPO / "bin" / "repo-lines.js")
FIX = Path(os.environ.get("REPO_LINES_FIXTURES") or Path(tempfile.gettempdir()) / "repo-lines-fixtures")
ROOT = os.environ.get("REPO_LINES_FIXTURE_DEV") or str(FIX / "dev")
# a home of its own: this suite creates and deletes sessions, and must not
# disturb the heartbeats the fixture laid down for the browser suites
HOME = str(FIX / "hookhome")
ok = fail = 0
def check(name, cond, detail=""):
    global ok, fail
    if cond: ok += 1; print(f"  PASS  {name}")
    else: fail += 1; print(f"  FAIL  {name}" + (f" :: {detail}" if detail else ""))

shutil.rmtree(HOME, ignore_errors=True); os.makedirs(HOME)
env = dict(os.environ, REPO_LINES_HOME=HOME)

def hook(cwd, *args):
    """A short-lived process that exits at once, exactly as a hook handler does."""
    return subprocess.run(["node", APP, *args], cwd=cwd, env=env, capture_output=True, text=True)

def sessions():
    # require() and the scan options both take the paths as JS strings, where
    # backslashes would read as escapes; forward slashes work on every platform
    lib = (REPO / "lib" / "scan.js").as_posix()
    root = Path(ROOT).as_posix()
    sdir = (Path(HOME) / "sessions").as_posix()
    r = subprocess.run(["node", "-e",
        f"const{{scan}}=require('{lib}');"
        f"console.log(JSON.stringify(scan({{root:'{root}',sessionDir:'{sdir}'}}).sessions))"],
        capture_output=True, text=True, env=env)
    return json.loads(r.stdout)

print("-- SessionStart --")
r = hook(f"{ROOT}/rl-portal", "session", "start", "--agent", "Claude Code", "--pid", "none", "--quiet")
check("check-in is silent", r.stdout.strip() == "", repr(r.stdout))
check("and succeeds", r.returncode == 0, r.returncode)
s = sessions()
check("session appears", len(s) == 1, len(s))
check("shown as live despite the hook shell being gone", s[0]["state"] == "live", s[0]["state"])
check("no pid recorded", s[0].get("pid") in (None, 0), s[0].get("pid"))

print("\n-- a second agent, same repo, different worktree --")
hook(f"{ROOT}/trees/rl-portal-laundry", "session", "start", "--agent", "Codex", "--pid", "none", "--quiet")
s = sessions()
check("both are listed", len(s) == 2, len(s))
branches = sorted(x["branch"] for x in s)
check("each on its own branch", branches == ["laundry-bin-rework", "main"], branches)
agents = sorted(x["agent"] for x in s)
check("each names its own agent", agents == ["Claude Code", "Codex"], agents)

print("\n-- UserPromptSubmit keeps it alive --")
old = [x for x in sessions() if x["agent"] == "Claude Code"][0]["ageSec"]
time.sleep(1.2)
hook(f"{ROOT}/rl-portal", "session", "beat", "--agent", "Claude Code", "--pid", "none", "--quiet")
new = [x for x in sessions() if x["agent"] == "Claude Code"][0]["ageSec"]
check("heartbeat refreshes", new <= old, f"{old} -> {new}")

print("\n-- a beat with no prior start registers itself --")
hook(f"{ROOT}/timetable-app", "session", "beat", "--agent", "Codex", "--pid", "none", "--quiet")
check("self-registered", len(sessions()) == 3, len(sessions()))

print("\n-- SessionEnd --")
r = hook(f"{ROOT}/trees/rl-portal-laundry", "session", "end", "--quiet")
check("checkout is silent", r.stdout.strip() == "", repr(r.stdout))
check("session removed", len(sessions()) == 2, len(sessions()))
r = hook(f"{ROOT}/rl-site", "session", "end", "--quiet")
check("ending an unregistered session is harmless", r.returncode == 0 and r.stdout.strip() == "", r.returncode)

print("\n-- launched somewhere that is not a repo --")
r = hook(f"{ROOT}/not-a-repo", "session", "start", "--agent", "Codex", "--pid", "none", "--quiet")
check("exits clean", r.returncode == 0, r.returncode)
check("says nothing to the transcript", r.stdout.strip() == "" and r.stderr.strip() == "", repr(r.stderr))
check("and records nothing", len(sessions()) == 2, len(sessions()))

print(f"\n  {ok}/{ok+fail} hook checks passed")
sys.exit(1 if fail else 0)
