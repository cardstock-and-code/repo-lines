import json, sys, pathlib
from playwright.sync_api import sync_playwright

HTML = pathlib.Path("/home/claude/out/repo-lines.html").as_uri()
SHOTS = pathlib.Path("/home/claude/shots"); SHOTS.mkdir(exist_ok=True)

results = []
def check(name, cond, detail=""):
    results.append((bool(cond), name, detail))
    print(("  PASS  " if cond else "  FAIL  ") + name + ((" :: " + str(detail)) if detail and not cond else ""))

with sync_playwright() as pw:
    b = pw.chromium.launch()
    pg = b.new_page(viewport={"width": 1440, "height": 940}, device_scale_factor=2)

    errors = []
    pg.on("pageerror", lambda e: errors.append(str(e)))
    # this sandbox blocks fonts.googleapis.com; a webfont that fails to load is
    # not an application error, the CSS stack falls back
    pg.on("console", lambda m: errors.append("console." + m.type + ": " + m.text)
          if m.type == "error" and "Failed to load resource" not in m.text else None)
    pg.goto(HTML); pg.wait_for_timeout(700)

    print("\n-- load --")
    model = json.load(open("/home/claude/out/repo-lines.json"))
    want = [p["key"] for p in model["projects"]].index("sr-portal")
    check("opens on the pinned default project", pg.input_value("#proj") == str(want),
          pg.input_value("#proj") + " wanted " + str(want))
    check("dropdown is alphabetical", [o.strip().split("  ")[0] for o in pg.locator("#proj option").all_text_contents()]
          == sorted([p["label"] for p in model["projects"]]),
          pg.locator("#proj option").all_text_contents())
    check("no JS errors on load", not errors, errors)
    check("title renders", pg.inner_text("#mapTitle") == "S&R Portal", pg.inner_text("#mapTitle"))
    check("svg drawn", pg.locator("#map path.linepath").count() == 4,
          pg.locator("#map path.linepath").count())   # merged line hidden until expanded
    check("status rail has a plate per line", pg.locator("#rail .plate").count() == 5, pg.locator("#rail .plate").count())
    railbox = pg.locator("#rail").bounding_box()
    check("status rail is inside the viewport", railbox["x"] + railbox["width"] <= 1440, railbox)

    opts = pg.locator("#proj option").all_text_contents()
    check("dropdown lists all 5 projects", len(opts) == 5, opts)
    check("live count shown in dropdown", any("working)" in o for o in opts), opts)

    print("\n-- global sessions sidebar --")
    n = pg.locator(".session").count()
    check("all 5 sessions listed regardless of project", n == 5, n)
    check("header shows live/total", pg.inner_text("#sessCount") == "2 live / 5", pg.inner_text("#sessCount"))
    groups = pg.locator(".groupname").all_text_contents()
    check("grouped by state, working first", groups[0].startswith("Working now"), groups)
    check("all three groups present", len(groups) == 3, groups)
    check("live pulses", pg.locator(".pulse.live").count() == 2)
    check("idle pulse", pg.locator(".pulse.idle").count() == 1)
    check("ended pulses", pg.locator(".pulse.ended").count() == 2)

    labels = pg.locator(".session .proj").all_text_contents()
    check("every card names its project", all(l.strip() for l in labels), labels)
    check("a card from another project is listed",
          any("S&R Site" in l for l in labels), labels)
    check("unscanned session marked", any("Outside" in l for l in labels), labels)

    cards = pg.locator(".session")
    check("sessions in this project marked here", pg.locator(".session.here").count() == 3,
          pg.locator(".session.here").count())
    check("sessions elsewhere marked away", pg.locator(".session.away").count() == 2,
          pg.locator(".session.away").count())
    check("collision notice shown", "one file" in pg.inner_text(".notice").lower(), pg.inner_text(".notice")[:60])
    check("collision notice names its project", "portal" in pg.inner_text(".notice").lower(),
          pg.inner_text(".notice")[:80])
    check("collision file highlighted", pg.locator(".touching span.hot").count() >= 2)

    print("\n-- advisory defaults to trunk --")
    check("trunk advisory", pg.inner_text("#advStatus").lower() == "trunk line", pg.inner_text("#advStatus"))
    check("subject is main", pg.inner_text("#advSubject") == "main")

    pg.screenshot(path=str(SHOTS / "01-overview.png"), full_page=True)

    print("\n-- selecting a line via terminus plate --")
    plates = pg.locator("#rail .plate")
    stacked_idx = None
    for i in range(plates.count()):
        if "store-run-receipts" in (plates.nth(i).get_attribute("aria-label") or ""):
            stacked_idx = i
    check("stacked plate has aria-label", stacked_idx is not None)
    plates.nth(stacked_idx).click(); pg.wait_for_timeout(350)
    check("advisory switched to stacked", "stacked" in pg.inner_text("#advStatus").lower(), pg.inner_text("#advStatus"))
    check("names its base branch", "phase-25-payroll" in pg.inner_text("#advBody"))
    check("explains the ambiguity", "cannot prove" in pg.inner_text("#advBody"))
    check("clear button appears", pg.locator(".clearbtn").count() == 1)
    dimmed = pg.evaluate("Array.from(document.querySelectorAll('#map path.linepath')).map(p=>p.style.opacity)")
    check("other lines dimmed on select", sorted(dimmed).count("0.15") == 3, dimmed)
    pg.screenshot(path=str(SHOTS / "02-stacked-selected.png"), full_page=True)

    print("\n-- session click drives selection --")
    pg.locator(".clearbtn").click(); pg.wait_for_timeout(200)
    check("cleared back to trunk", pg.inner_text("#advStatus").lower() == "trunk line")
    idle_card = pg.locator(".session").filter(has_text="laundry-bin-rework").first
    idle_card.click(); pg.wait_for_timeout(300)
    check("clicking Codex selects its branch", "update before merging" in pg.inner_text("#advStatus").lower(), pg.inner_text("#advStatus"))
    check("session shows pressed state", pg.locator('.session[aria-pressed="true"]').count() == 1)
    check("drift advice mentions bringing main in", "Bring main into this line" in pg.inner_text("#advBody"))
    pg.screenshot(path=str(SHOTS / "03-drift-selected.png"), full_page=True)

    print("\n-- cross-project jump from the sidebar --")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    away = pg.locator(".session.away").filter(has_text="estimate-form").first
    check("an away card exists to click", away.count() == 1)
    away.click(); pg.wait_for_timeout(450)
    check("jumped to the other project", pg.inner_text("#mapTitle") == "S&R Site", pg.inner_text("#mapTitle"))
    check("dropdown followed the jump", pg.input_value("#proj") == str(
        [q["key"] for q in model["projects"]].index("sr-site")))
    check("its branch got selected", pg.inner_text("#advSubject") == "estimate-form", pg.inner_text("#advSubject"))
    check("that card now reads as here", pg.locator(".session.here").filter(has_text="estimate-form").count() == 1)
    pg.screenshot(path=str(SHOTS / "08-cross-project-jump.png"), full_page=True)
    pg.select_option("#proj", index=[q["key"] for q in model["projects"]].index("sr-portal"))
    pg.wait_for_timeout(300)

    print("\n-- escape clears --")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(200)
    check("escape resets selection", pg.inner_text("#advStatus").lower() == "trunk line")
    check("no lines dimmed after reset",
          "0.15" not in pg.evaluate("Array.from(document.querySelectorAll('#map path.linepath')).map(p=>p.style.opacity)"))

    print("\n-- clear-to-merge line --")
    for i in range(plates.count()):
        if "phase-25-payroll" in (plates.nth(i).get_attribute("aria-label") or ""):
            plates.nth(i).click(); break
    pg.wait_for_timeout(300)
    check("clear advisory", pg.inner_text("#advStatus").lower() == "clear to merge", pg.inner_text("#advStatus"))
    check("says fast-forward", "fast-forward" in pg.inner_text("#advBody"))
    pg.keyboard.press("Escape")

    print("\n-- tooltip on a commit --")
    dots = pg.locator("#map circle.hit")
    dots.nth(3).hover(); pg.wait_for_timeout(250)
    check("tooltip visible", "on" in (pg.locator("#tip").get_attribute("class") or ""))
    check("tooltip has commit subject", len(pg.inner_text("#tip .msg")) > 3, pg.inner_text("#tip .msg"))
    check("tooltip meta has sha + author", "saul" in pg.inner_text("#tip .meta") or "claude" in pg.inner_text("#tip .meta"),
          pg.inner_text("#tip .meta"))
    pg.screenshot(path=str(SHOTS / "04-tooltip.png"), clip={"x": 0, "y": 60, "width": 1200, "height": 560})

    print("\n-- keyboard access --")
    pg.keyboard.press("Escape")
    pg.evaluate("document.querySelectorAll('#rail .plate')[1].focus()")
    check("plate is focusable", pg.evaluate("document.activeElement.className") == "plate")
    pg.keyboard.press("Enter"); pg.wait_for_timeout(250)
    check("enter selects the line", pg.locator(".clearbtn").count() == 1)
    pg.keyboard.press("Escape")

    print("\n-- switching projects --")
    IDX = {p["key"]: i for i, p in enumerate(model["projects"])}
    pg.select_option("#proj", index=IDX["convention-app"]); pg.wait_for_timeout(400)
    check("title switched", pg.inner_text("#mapTitle") == "Convention App", pg.inner_text("#mapTitle"))
    pg.locator(".closedrow").click(); pg.wait_for_timeout(350)
    check("merged line drawn as dashes", pg.locator("#map path.ghost").count() == 1)
    check("sidebar unchanged by project switch", pg.locator(".session").count() == 5,
          pg.locator(".session").count())
    for i in range(pg.locator("#rail .plate").count()):
        if "sms-template-cleanup" in (pg.locator("#rail .plate").nth(i).get_attribute("aria-label") or ""):
            pg.locator("#rail .plate").nth(i).click(); break
    pg.wait_for_timeout(300)
    check("merged advisory", pg.inner_text("#advStatus").lower() == "closed", pg.inner_text("#advStatus"))
    pg.screenshot(path=str(SHOTS / "05-convention.png"), full_page=True)

    print("\n-- empty repo edge case --")
    pg.select_option("#proj", index=IDX["empty-repo"]); pg.wait_for_timeout(400)
    check("empty state shown", "nothing to draw" in pg.inner_text("#emptySlot").lower())
    check("legend hidden when nothing drawn", pg.locator("#legend").is_hidden())
    check("advisory explains", "no commits yet" in pg.inner_text("#advBody"), pg.inner_text("#advBody"))
    check("still no JS errors", not errors, errors)
    pg.screenshot(path=str(SHOTS / "06-empty.png"), full_page=True)

    print("\n-- master-named trunk --")
    pg.select_option("#proj", index=IDX["master-repo"]); pg.wait_for_timeout(400)
    check("master detected as trunk", pg.inner_text("#advSubject") == "master", pg.inner_text("#advSubject"))
    check("advice uses master, not main", "main" not in pg.inner_text("#advBody"), pg.inner_text("#advBody")[:120])

    pg.select_option("#proj", index=IDX["sr-portal"]); pg.wait_for_timeout(400)

    print("\n-- map fits without scrollbars --")
    for vw, vh in [(1440, 900), (1280, 720), (1920, 1080)]:
        pg.set_viewport_size({"width": vw, "height": vh}); pg.wait_for_timeout(300)
        r = pg.evaluate("""(()=>{const m=document.getElementById('mapScroll');
            return {x:m.scrollWidth>m.clientWidth+1, y:m.scrollHeight>m.clientHeight+1,
                    page:document.documentElement.scrollHeight>window.innerHeight+1}})()""")
        check(f"no map scrollbars at {vw}x{vh}", not r["x"] and not r["y"], r)
        check(f"page does not scroll at {vw}x{vh}", not r["page"], r)
    pg.set_viewport_size({"width": 1440, "height": 940}); pg.wait_for_timeout(300)

    print("\n-- closed branches collapse --")
    if pg.locator("#rail .plate .pb").all_text_contents().count("phase-24-pwa"):
        pg.locator(".closedrow").click(); pg.wait_for_timeout(350)   # start collapsed
    names = [e.strip() for e in pg.locator("#rail .plate .pb").all_text_contents()]
    check("open branches are named", "laundry-bin-rework" in names, names)
    check("closed ones are folded into one row", any("closed branch" in n for n in names), names)
    check("and are not drawn", "phase-24-pwa" not in names, names)
    before = pg.locator("#rail .plate").count()
    pg.locator(".closedrow").click(); pg.wait_for_timeout(400)
    after = [e.strip() for e in pg.locator("#rail .plate .pb").all_text_contents()]
    check("expanding reveals them", "phase-24-pwa" in after, after)
    check("closed rows say which branch", all(n.strip() for n in after), after)
    pg.locator(".closedrow").click(); pg.wait_for_timeout(400)
    check("and collapse again", pg.locator("#rail .plate").count() == before)

    print("\n-- wheel zoom and drag pan --")
    fit = pg.evaluate("document.getElementById('map').getAttribute('viewBox')")
    pg.evaluate("""()=>document.getElementById('mapScroll').dispatchEvent(
        new WheelEvent('wheel',{deltaY:-400,clientX:600,clientY:300,bubbles:true,cancelable:true}))""")
    pg.wait_for_timeout(250)
    zoomed = pg.evaluate("document.getElementById('map').getAttribute('viewBox')")
    check("wheel zooms in", zoomed != fit, f"{fit} -> {zoomed}")
    check("zoom badge appears", "on" in (pg.locator("#zoomBadge").get_attribute("class") or ""))
    check("cursor invites panning", "zoomed" in (pg.locator("#mapScroll").get_attribute("class") or ""))
    box = pg.locator("#mapScroll").bounding_box()
    cx, cy = box["x"]+box["width"]/2, box["y"]+box["height"]/2
    pg.mouse.move(cx, cy); pg.mouse.down(); pg.mouse.move(cx-150, cy, steps=6); pg.mouse.up()
    pg.wait_for_timeout(250)
    check("drag pans the view", pg.evaluate("document.getElementById('map').getAttribute('viewBox')") != zoomed)
    check("still no scrollbars while zoomed",
          not pg.evaluate("""(()=>{const m=document.getElementById('mapScroll');
              return m.scrollWidth>m.clientWidth+1||m.scrollHeight>m.clientHeight+1})()"""))
    pg.mouse.dblclick(cx, cy); pg.wait_for_timeout(300)
    check("double-click returns to fit",
          pg.evaluate("document.getElementById('map').getAttribute('viewBox')") == fit)
    check("zoom cannot go below fit",
          pg.evaluate("""(()=>{for(let i=0;i<10;i++)zoomAt(1/1.18,600,300);
              const v=document.getElementById('map').getAttribute('viewBox');
              return v===fitView.x+' '+fitView.y+' '+fitView.w+' '+fitView.h})()"""))

    print("\n-- resizable panes --")
    d = lambda: pg.evaluate("""(()=>({side:Math.round(document.querySelector('.side').getBoundingClientRect().width),
        adv:Math.round(document.getElementById('advisory').getBoundingClientRect().height)}))()""")
    start = d()
    hb = pg.locator("#splitSide").bounding_box()
    pg.mouse.move(hb["x"]+0.5, hb["y"]+hb["height"]/2); pg.mouse.down()
    pg.mouse.move(hb["x"]-110, hb["y"]+hb["height"]/2, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    check("sidebar widens by dragging", d()["side"] > start["side"] + 60, (start, d()))
    hb2 = pg.locator("#splitAdv").bounding_box()
    pg.mouse.move(hb2["x"]+hb2["width"]/2, hb2["y"]+0.5); pg.mouse.down()
    pg.mouse.move(hb2["x"]+hb2["width"]/2, hb2["y"]-120, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    check("advice panel grows by dragging", d()["adv"] > start["adv"] + 60, (start, d()))
    kept = d()
    pg.reload(); pg.wait_for_timeout(800)
    check("sizes survive a refresh", abs(d()["side"]-kept["side"]) <= 2 and abs(d()["adv"]-kept["adv"]) <= 4,
          (kept, d()))
    hb = pg.locator("#splitSide").bounding_box()
    pg.mouse.move(hb["x"]+0.5, hb["y"]+hb["height"]/2); pg.mouse.down()
    pg.mouse.move(1438, hb["y"]+hb["height"]/2, steps=8); pg.mouse.up(); pg.wait_for_timeout(300)
    check("sidebar cannot be crushed away", d()["side"] >= 240, d())
    pg.locator("#splitSide").dblclick(); pg.wait_for_timeout(250)
    pg.locator("#splitAdv").dblclick(); pg.wait_for_timeout(250)
    check("double-click resets both", abs(d()["side"]-322) <= 2, d())
    check("no errors from resizing", not errors, errors)

    print("\n-- mobile --")
    pg.select_option("#proj", index=IDX["sr-portal"]); pg.wait_for_timeout(300)
    m = b.new_page(viewport={"width": 390, "height": 844}, device_scale_factor=3)
    m.goto(HTML); m.wait_for_timeout(600)
    check("single column on mobile",
          m.evaluate("getComputedStyle(document.querySelector('.main')).gridTemplateColumns").count(" ") == 0)
    check("no horizontal page overflow",
          m.evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"),
          m.evaluate("document.documentElement.scrollWidth"))
    check("map fits without scrolling", not m.evaluate(
        "document.getElementById('mapScroll').scrollWidth > document.getElementById('mapScroll').clientWidth + 1"))
    mapw = m.evaluate("document.getElementById('mapScroll').clientWidth")
    check("map gets most of the width on mobile", mapw > 300, mapw)
    check("status rail stacks below the map",
          m.evaluate("getComputedStyle(document.querySelector('.rail .plate')).position") == "static")
    check("plates name their branch",
          m.evaluate("getComputedStyle(document.querySelector('.rail .plate .pb')).display") == "block")
    check("all plates still reachable on mobile", m.locator("#rail .plate").count() == 5)
    m.screenshot(path=str(SHOTS / "07-mobile.png"), full_page=True)

    print("\n-- teaching layer --")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    check("diagram explains how to read itself", "left to right as time" in pg.inner_text("#legendRead"),
          pg.inner_text("#legendRead")[:60])
    check("legend names the trunk by its real name", "main" in pg.inner_text("#legendRead"))
    nterms = pg.locator(".t").count()
    check("askable terms present on first paint", nterms >= 8, nterms)
    check("worktree is askable in the sidebar", pg.locator('.session .t[data-term="worktree"]').count() >= 1)
    check("uncommitted is askable in the sidebar", pg.locator('.session .t[data-term="uncommitted"]').count() >= 1)

    w = pg.locator('.t[data-term="worktree"]').first
    w.hover(); pg.wait_for_timeout(300)
    check("glossary opens on hover", "on" in (pg.locator("#gloss").get_attribute("class") or ""))
    gt = pg.inner_text("#gloss")
    check("glossary defines worktree plainly", "second folder" in gt.lower(), gt[:70])
    check("glossary reassures about deletion", "does not delete" in gt.lower())
    box = pg.locator("#gloss").bounding_box()
    check("glossary stays inside the viewport",
          box["x"] >= 0 and box["y"] >= 0 and box["x"]+box["width"] <= 1441 and box["y"]+box["height"] <= 941, box)
    pg.mouse.move(5, 5); pg.wait_for_timeout(250)
    check("glossary closes on mouse out", "on" not in (pg.locator("#gloss").get_attribute("class") or ""))

    w.focus(); pg.wait_for_timeout(250)
    check("glossary opens on keyboard focus", "on" in (pg.locator("#gloss").get_attribute("class") or ""))
    check("terms are real buttons", pg.evaluate("document.activeElement.tagName.toLowerCase()") == "button")
    pg.locator("#mapTitle").click(); pg.wait_for_timeout(200)

    print("\n-- hover teaches the numbers --")
    plate = None
    for i in range(pg.locator("#rail .plate").count()):
        if "laundry" in (pg.locator("#rail .plate").nth(i).get_attribute("aria-label") or ""):
            plate = pg.locator("#rail .plate").nth(i); break
    plate.hover(); pg.wait_for_timeout(300)
    tiptext = pg.inner_text("#tip")
    check("hovering the counts explains them", "has moved 6 ahead" in tiptext, tiptext)
    check("and says what to do", "before merging" in tiptext, tiptext)

    for i in range(pg.locator("#rail .plate").count()):
        lbl = pg.locator("#rail .plate").nth(i).get_attribute("aria-label") or ""
        if "phase-24-pwa" in lbl or "sms-template" in lbl:
            pg.locator("#rail .plate").nth(i).hover(); pg.wait_for_timeout(250)
            check("merged plate reassures about deleting", "Safe to delete" in pg.inner_text("#tip"), pg.inner_text("#tip"))
            break

    print("\n-- merge order --")
    for i in range(pg.locator("#rail .plate").count()):
        if "store-run-receipts" in (pg.locator("#rail .plate").nth(i).get_attribute("aria-label") or ""):
            pg.locator("#rail .plate").nth(i).click(); break
    pg.wait_for_timeout(350)
    steps = pg.locator("#advBody .plan li .act").all_text_contents()
    check("stacked branch gets a sequence", len(steps) == 4, steps)
    check("base branch merges first", steps[0].startswith("Merge phase-25-payroll"), steps[0])
    check("then this branch updates", "Update store-run-receipts" in steps[1], steps[1])
    check("then this branch merges", "Merge store-run-receipts" in steps[2], steps[2])
    check("and cleanup is last", steps[3].startswith("Delete"), steps[3])
    reasons = pg.locator("#advBody .plan li .rea").all_text_contents()
    check("every step says why", all(r.strip() for r in reasons), reasons)
    check("reason explains the ordering", "cannot go first" in reasons[0], reasons[0])
    check("steps are numbered visually",
          pg.evaluate("getComputedStyle(document.querySelector('#advBody .plan li'),'::before').content") != "none")
    check("terms inside advice are askable", pg.locator("#advBody .t").count() >= 4,
          pg.locator("#advBody .t").count())
    pg.screenshot(path=str(SHOTS / "10-teaching.png"), full_page=True)

    print("\n-- steps collapse unless order matters --")
    check("stacked branch opens its steps",
          pg.locator("#advBody .plan[open]").count() == 1)
    check("summary counts the steps", "4 steps" in pg.inner_text("#advBody .plan summary").lower(),
          pg.inner_text("#advBody .plan summary"))
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    pg.select_option("#proj", index=IDX["convention-app"]); pg.wait_for_timeout(400)
    for i in range(pg.locator("#rail .plate").count()):
        if "offline-queue-retry" in (pg.locator("#rail .plate").nth(i).get_attribute("aria-label") or ""):
            pg.locator("#rail .plate").nth(i).click(); break
    pg.wait_for_timeout(350)
    check("a plain branch keeps its steps folded away",
          pg.locator("#advBody .plan").count() == 1 and pg.locator("#advBody .plan[open]").count() == 0)
    pg.locator("#advBody .plan summary").click(); pg.wait_for_timeout(250)
    check("but they open on click", pg.locator("#advBody .plan[open]").count() == 1)
    pg.select_option("#proj", index=IDX["sr-portal"]); pg.wait_for_timeout(400)

    print("\n-- advice never squeezes the map --")
    for vw, vh in [(1440, 900), (1280, 720), (1512, 800)]:
        pg.set_viewport_size({"width": vw, "height": vh}); pg.wait_for_timeout(250)
        for i in range(pg.locator("#rail .plate").count()):
            if "laundry" in (pg.locator("#rail .plate").nth(i).get_attribute("aria-label") or ""):
                pg.locator("#rail .plate").nth(i).click(); break
        pg.wait_for_timeout(350)
        m = pg.evaluate("Math.round(document.querySelector('.mapwrap').getBoundingClientRect().height)")
        check(f"map keeps room at {vw}x{vh}", m >= 260, f"{m}px")
        pg.keyboard.press("Escape"); pg.wait_for_timeout(120)
    pg.set_viewport_size({"width": 1440, "height": 940}); pg.wait_for_timeout(250)

    print("\n-- drifted branch sequence --")
    pg.keyboard.press("Escape"); pg.wait_for_timeout(150)
    for i in range(pg.locator("#rail .plate").count()):
        if "laundry" in (pg.locator("#rail .plate").nth(i).get_attribute("aria-label") or ""):
            pg.locator("#rail .plate").nth(i).click(); break
    pg.wait_for_timeout(300)
    st2 = pg.locator("#advBody .plan li .act").all_text_contents()
    check("drifted branch updates before merging", st2[0].startswith("Update laundry"), st2)
    check("collision surfaces as a step", any("overlap" in x for x in st2), st2)
    check("does not tell you to fix yourself", not any("overlap with laundry-bin-rework" in x for x in st2), st2)
    pg.keyboard.press("Escape")

    print("\n-- trunk and merged lines get no orders --")
    check("trunk has no step list", pg.locator("#advBody .plan").count() == 0)

    print("\n-- layout holds with many sessions --")
    import copy as _copy
    big = _copy.deepcopy(model)
    base = big["sessions"][:]
    for i in range(9):
        c = _copy.deepcopy(base[i % len(base)])
        c["branch"] = "busywork-" + str(i)
        c["state"] = ["live", "idle", "ended"][i % 3]
        c["when"] = str(i + 2) + " min ago"
        big["sessions"].append(c)
    src = pathlib.Path("/home/claude/out/repo-lines.html").read_text()
    a = src.index("const MODEL = ") + len("const MODEL = ")
    z = src.index(";\n", a)
    stress = pathlib.Path("/home/claude/out/_stress.html")
    stress.write_text(src[:a] + json.dumps(big).replace("<", "\\u003c") + src[z:])
    sp = b.new_page(viewport={"width": 1440, "height": 900})
    sperr = []
    sp.on("pageerror", lambda e: sperr.append(str(e)))
    sp.goto(stress.as_uri()); sp.wait_for_timeout(600)
    check("14 sessions all render", sp.locator(".session").count() == 14, sp.locator(".session").count())
    check("page itself does not scroll",
          not sp.evaluate("document.documentElement.scrollHeight > window.innerHeight + 1"))
    check("session list scrolls instead",
          sp.evaluate("(()=>{const g=document.getElementById('sessionGroups');return g.scrollHeight>g.clientHeight})()"))
    check("advice strip stays on screen",
          sp.evaluate("document.getElementById('advisory').getBoundingClientRect().bottom <= window.innerHeight + 1"))
    check("map still readable", sp.evaluate("document.getElementById('map').getBoundingClientRect().width > 400"))
    check("no errors under load", not sperr, sperr)
    sp.screenshot(path=str(SHOTS / "09-many-sessions.png"))
    sp.close()

    print("\n-- contrast sanity --")
    dim = pg.evaluate("getComputedStyle(document.querySelector('.advisory .why')).color")
    check("secondary text is not pure grey mush", dim == "rgb(103, 116, 138)", dim)

    b.close()

ok = sum(1 for r in results if r[0]); tot = len(results)
print("\n=========================================")
print(f"  {ok}/{tot} checks passed")
print("=========================================")
for good, name, detail in results:
    if not good: print("  FAILED:", name, "::", detail)
sys.exit(0 if ok == tot else 1)
