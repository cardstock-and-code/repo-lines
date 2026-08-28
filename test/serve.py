#!/usr/bin/env python3
"""Localhost server checks: fresh snapshot per request, place kept across refresh."""
import subprocess, tempfile, time, socket, sys, os, json
from pathlib import Path
from playwright.sync_api import sync_playwright

FIX = Path(os.environ.get("REPO_LINES_FIXTURES") or Path(tempfile.gettempdir()) / "repo-lines-fixtures")
ROOT = os.environ.get("REPO_LINES_FIXTURE_DEV") or str(FIX / "dev")
HOME = os.environ.get("REPO_LINES_HOME") or str(FIX / "rlhome")
PORT = 4399
APP = str(Path(__file__).resolve().parent.parent / "bin" / "repo-lines.js")

ok = fail = 0
def check(name, cond, detail=""):
    global ok, fail
    if cond: ok += 1; print(f"  PASS  {name}")
    else: fail += 1; print(f"  FAIL  {name}" + (f" :: {detail}" if detail else ""))

def git(cwd, *a): subprocess.run(["git", *a], cwd=cwd, capture_output=True, check=True)

env = dict(os.environ, REPO_LINES_HOME=HOME)
srv = subprocess.Popen(["node", APP, "serve", "--root", ROOT, "--port", str(PORT)],
                       env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
for _ in range(60):
    try:
        socket.create_connection(("127.0.0.1", PORT), 0.2).close(); break
    except OSError: time.sleep(0.1)
else:
    print("server never came up"); sys.exit(1)

try:
    print("-- server basics --")
    import urllib.request
    def get(p):
        with urllib.request.urlopen(f"http://127.0.0.1:{PORT}{p}") as r:
            return r.status, dict(r.headers), r.read().decode()
    s, h, body = get("/")
    check("serves the page", s == 200 and "<svg" in body)
    check("never cached", "no-store" in h.get("cache-control", ""), h.get("cache-control"))
    s2, _, j = get("/model.json")
    check("exposes the snapshot as json", s2 == 200 and json.loads(j)["projects"], "")
    a = json.loads(j)["generatedAt"]; time.sleep(1.1)
    b2 = json.loads(get("/model.json")[2])["generatedAt"]
    check("each request is a fresh scan", a != b2, f"{a} == {b2}")
    try:
        get("/nope"); check("unknown path 404s", False)
    except urllib.error.HTTPError as e:
        check("unknown path 404s", e.code == 404, e.code)

    print("\n-- keeps your place across a refresh --")
    with sync_playwright() as pw:
        br = pw.chromium.launch(); pg = br.new_page(viewport={"width": 1440, "height": 900})
        errs = []; pg.on("pageerror", lambda e: errs.append(str(e)))
        pg.goto(f"http://127.0.0.1:{PORT}/"); pg.wait_for_timeout(800)
        check("url records the project", pg.evaluate("location.hash") == "#rl-portal",
              pg.evaluate("location.hash"))

        conv = os.path.join(ROOT, "convention-app")
        label = [o for o in pg.locator("#proj option").all_text_contents() if "Convention" in o][0]
        pg.select_option("#proj", label=label); pg.wait_for_timeout(400)
        for i in range(pg.locator("#rail .plate").count()):
            if "offline-queue-retry" in (pg.locator("#rail .plate").nth(i).get_attribute("aria-label") or ""):
                pg.locator("#rail .plate").nth(i).click(); break
        pg.wait_for_timeout(400)
        check("url records the branch too",
              pg.evaluate("location.hash") == "#convention-app/offline-queue-retry",
              pg.evaluate("location.hash"))
        before = pg.inner_text("#advCounts")

        git(conv, "checkout", "-q", "offline-queue-retry")
        with open(os.path.join(conv, "retry.js"), "a") as f: f.write("// x\n")
        git(conv, "add", "-A"); git(conv, "commit", "-qm", "serve-test commit")
        pg.reload(); pg.wait_for_timeout(800)

        check("still on the same project", pg.inner_text("#mapTitle") == "Convention App", pg.inner_text("#mapTitle"))
        check("still on the same branch", pg.inner_text("#advSubject") == "offline-queue-retry", pg.inner_text("#advSubject"))
        after = pg.inner_text("#advCounts")
        check("refresh shows the new commit", before != after, f"{before} -> {after}")
        check("commit message is on the page", "serve-test commit" in pg.content())
        check("no errors over http", not errs, errs)

        pg.goto(f"http://127.0.0.1:{PORT}/#does-not-exist/nope"); pg.wait_for_timeout(700)
        check("bad url falls back to the default", pg.inner_text("#mapTitle") == "Repo Lines Portal",
              pg.inner_text("#mapTitle"))

        print("\n-- pinning from the page --")
        pg.goto(f"http://127.0.0.1:{PORT}/"); pg.wait_for_timeout(700)
        check("pin control is visible over http", pg.locator("#pinBtn").is_visible())
        check("the default project shows as pinned",
              pg.locator("#pinBtn").get_attribute("aria-pressed") == "true")
        label = [o for o in pg.locator("#proj option").all_text_contents() if "Convention" in o][0]
        pg.select_option("#proj", label=label); pg.wait_for_timeout(300)
        check("other projects show unpinned",
              pg.locator("#pinBtn").get_attribute("aria-pressed") == "false")
        # the button updates when the POST comes back, so poll rather than
        # guessing at a sleep long enough to cover it
        def pressed_becomes(want):
            try:
                pg.wait_for_function(
                    "want => document.getElementById('pinBtn').getAttribute('aria-pressed') === want",
                    arg=want, timeout=5000)
                return True
            except Exception:
                return False

        pg.locator("#pinBtn").click()
        check("clicking pins the project", pressed_becomes("true"),
              pg.locator("#pinBtn").get_attribute("aria-pressed") + " / " + pg.locator("#pinBtn").get_attribute("title"))
        check("the pin reaches the model",
              json.loads(get("/model.json")[2])["defaultProject"] == "convention-app")
        cfg = json.load(open(os.path.join(HOME, "config.json")))
        check("and survives on disk", cfg.get("defaultProject") == "convention-app", cfg)
        pg.locator("#pinBtn").click()
        check("clicking again unpins", pressed_becomes("false")
              and json.loads(get("/model.json")[2])["defaultProject"] is None)
        br.close()

    print("\n-- the write endpoint stays narrow --")
    import urllib.error
    def post(payload, raw=None):
        data = raw if raw is not None else json.dumps(payload).encode()
        rq = urllib.request.Request(f"http://127.0.0.1:{PORT}/config", data=data, method="POST")
        try:
            with urllib.request.urlopen(rq) as r: return r.status
        except urllib.error.HTTPError as e: return e.code
    check("a valid pin is accepted", post({"defaultProject": "rl-portal"}) == 200)
    check("an unknown project is rejected", post({"defaultProject": "not-a-project"}) == 400)
    check("extra keys are rejected", post({"defaultProject": "rl-portal", "port": 9}) == 400)
    check("a non-string value is rejected", post({"defaultProject": 5}) == 400)
    check("a non-json body is rejected", post(None, raw=b"hello") == 400)
    rq = urllib.request.Request(f"http://127.0.0.1:{PORT}/model.json", data=b"{}", method="POST")
    try:
        urllib.request.urlopen(rq); check("posting anywhere else is refused", False)
    except urllib.error.HTTPError as e:
        check("posting anywhere else is refused", e.code == 405, e.code)
finally:
    # SIGINT cannot cross to a child on Windows; terminate() works everywhere
    srv.terminate(); srv.wait(timeout=5)

print(f"\n  {ok}/{ok+fail} server checks passed")
sys.exit(1 if fail else 0)
