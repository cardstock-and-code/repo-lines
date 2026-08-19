'use strict';

/* Injected as a JS literal, so the only thing that can break out is a closing
   script tag or a line separator. Neutralise both. */
function payload(model) {
  return JSON.stringify(model)
    .replace(/</g, '\\u003c')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

function render(model) {
  return TEMPLATE.replace('"__MODEL__"', payload(model));
}

const TEMPLATE = String.raw`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Repo Lines — where the code stands</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@400;450;600&display=swap" rel="stylesheet">
<style>
:root{
  --ground:#0e131d; --panel:#161d2a; --panel-2:#1c2432;
  --rule:#28323f; --rule-soft:#1f2836;
  --ink:#e7ecf3; --ink-mid:#9aa8bd; --ink-dim:#67748a;
  --trunk:#ded7c8; --caution:#f0c04a; --alert:#ef6f6f;
  --sig:"Barlow Condensed","Arial Narrow",sans-serif;
  --body:"IBM Plex Sans",system-ui,sans-serif;
  --mono:"IBM Plex Mono",ui-monospace,monospace;
}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{background:var(--ground);color:var(--ink);font-family:var(--body);font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
.shell{display:grid;grid-template-rows:auto minmax(0,1fr) 1px var(--advh,auto);height:100vh;height:100dvh;overflow:hidden}

/* header */
.topbar{display:flex;align-items:center;gap:22px;flex-wrap:wrap;padding:14px 22px;border-bottom:1px solid var(--rule);background:var(--panel)}
.wordmark{display:flex;align-items:center;gap:9px}
.wordmark .bullet{width:11px;height:11px;border-radius:50%;background:var(--trunk);box-shadow:0 0 0 3px var(--panel),0 0 0 4px var(--rule)}
.wordmark .name{font-family:var(--sig);font-weight:700;font-size:22px;letter-spacing:.11em;text-transform:uppercase}
.wordmark .sub{font-family:var(--sig);font-weight:400;font-size:14px;letter-spacing:.16em;text-transform:uppercase;color:var(--ink-dim)}
.picker{margin-left:auto;display:flex;align-items:center;gap:10px}
.picker label{font-family:var(--sig);font-size:13px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-dim)}
.picker select{appearance:none;background:var(--panel-2);color:var(--ink);border:1px solid var(--rule);border-radius:3px;padding:8px 34px 8px 12px;font-family:var(--body);font-size:14px;cursor:pointer;
 background-image:linear-gradient(45deg,transparent 50%,var(--ink-mid) 50%),linear-gradient(135deg,var(--ink-mid) 50%,transparent 50%);
 background-position:calc(100% - 17px) 52%,calc(100% - 12px) 52%;background-size:5px 5px,5px 5px;background-repeat:no-repeat}
.picker select:focus-visible{outline:2px solid #4fbfef;outline-offset:2px}
.picker .pin{display:flex;align-items:center;justify-content:center;width:34px;height:34px;background:var(--panel-2);border:1px solid var(--rule);border-radius:3px;cursor:pointer;padding:0}
.picker .pin[hidden]{display:none}
.picker .pin svg{width:15px;height:15px;fill:var(--ink-dim)}
.picker .pin:hover svg{fill:var(--ink-mid)}
.picker .pin.on{border-color:rgba(79,191,239,.5)}
.picker .pin.on svg{fill:#4fbfef}
.picker .pin:focus-visible{outline:2px solid #4fbfef;outline-offset:2px}
.freshness{display:flex;gap:8px;flex-wrap:wrap}
.chip{display:flex;align-items:center;gap:7px;border:1px solid var(--rule);border-radius:2px;padding:5px 10px;background:var(--panel-2)}
.chip .k{font-family:var(--sig);font-size:12px;letter-spacing:.13em;text-transform:uppercase;color:var(--ink-dim)}
.chip .v{font-family:var(--mono);font-size:12px;color:var(--ink-mid)}
.chip.stale{border-color:rgba(240,192,74,.4)}
.chip.stale .v{color:var(--caution)}

/* body */
.main{display:grid;grid-template-columns:minmax(0,1fr) 1px var(--sidew,322px);min-height:0;overflow:hidden}
.mapwrap{border-right:1px solid var(--rule);display:flex;flex-direction:column;min-width:0;min-height:0;overflow:hidden}
.maphead{display:flex;align-items:baseline;gap:14px;flex-wrap:wrap;padding:16px 22px 10px}
.maphead h1{margin:0;font-family:var(--sig);font-weight:600;font-size:26px;letter-spacing:.03em}
.maphead .path{font-family:var(--mono);font-size:12.5px;color:var(--ink-dim)}
.maphead .hint{margin-left:auto;font-size:12.5px;color:var(--ink-dim)}
.maphead .since{flex-basis:100%;font-size:12.5px;color:var(--ink-dim);margin-top:-2px}
.maphead .since[hidden]{display:none}
.maphead .since b{font-weight:600;color:var(--ink-mid)}
.mapstage{display:flex;align-items:stretch;min-width:0;flex:1;min-height:0}
/* The diagram is fitted to this box rather than overflowing it, so there is
   nothing to scroll: zooming changes the viewBox instead. */
.mapscroll{overflow:hidden;padding:0 0 8px 22px;flex:1;min-width:0;min-height:0;position:relative;touch-action:none}
.mapscroll svg{width:100%;height:100%;display:block}
.mapscroll.zoomed{cursor:grab}
.mapscroll.grabbing{cursor:grabbing}
.zoombadge{position:absolute;right:14px;bottom:12px;display:flex;align-items:center;gap:9px;
  background:rgba(10,14,22,.85);border:1px solid var(--rule);border-radius:2px;padding:4px 10px;
  font-family:var(--mono);font-size:11px;color:var(--ink-mid);opacity:0;transition:opacity .15s;pointer-events:none}
.zoombadge.on{opacity:1}
.zoombadge .hintkey{color:var(--ink-dim)}
svg.map{display:block}
/* status stays put while the diagram scrolls: the plates are the point */
.rail{width:186px;flex:none;border-left:1px solid var(--rule-soft);margin-left:8px;padding:8px 10px 12px 10px;
  display:flex;flex-direction:column;gap:7px;overflow-y:auto;min-height:0;scrollbar-width:thin;scrollbar-color:var(--rule) transparent}
.rail .plate{position:relative;width:100%;min-height:40px;flex:none;background:var(--panel-2);border:1.5px solid var(--rule);border-radius:2px;
 padding:0 10px;display:flex;flex-direction:column;justify-content:center;cursor:pointer;text-align:left;font:inherit;color:inherit}
.rail .plate:hover{background:#232d3e}
.rail .plate:focus-visible{outline:2px solid #4fbfef;outline-offset:2px}
.rail .plate .pn{font-family:var(--sig);font-size:14px;font-weight:600;letter-spacing:.07em;text-transform:uppercase;line-height:1.15}
.rail .plate .pc{font-family:var(--mono);font-size:10.5px;color:var(--ink-dim);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rail .plate[aria-pressed="true"]{background:#26303f}
.rail .plate .pb{display:block;font-family:var(--mono);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rail .plate .pn{color:var(--ink-dim)}
.rail .closedrow{border-style:dashed;border-color:var(--rule);background:transparent}
.rail .closedrow .pb{color:var(--ink-mid);font-family:var(--sig);font-size:13px;letter-spacing:.06em;text-transform:uppercase}
.rail .closedrow:hover{background:var(--panel-2)}
.rail .closedrow.open{border-style:solid}
.emptystate{padding:36px 22px 44px;color:var(--ink-mid);max-width:60ch}
.emptystate strong{display:block;font-family:var(--sig);font-size:19px;letter-spacing:.05em;text-transform:uppercase;color:var(--ink);margin-bottom:8px}
.warnrow{padding:0 22px 14px;color:var(--ink-dim);font-size:12.5px}
.warnrow div{margin-top:4px}
.legend{display:flex;gap:20px;flex-wrap:wrap;padding:10px 22px 18px;border-top:1px solid var(--rule-soft);margin-top:auto}
.legend .item{display:flex;align-items:center;gap:8px;font-size:12.5px;color:var(--ink-mid)}
.legend .sw{width:14px;height:14px;border-radius:50%;border:2.5px solid var(--ink-mid);background:var(--ground);flex:none}
.legend .sw.filled{background:var(--ink-mid)}
.legend .sw.sq{border-radius:2px;transform:rotate(45deg);width:12px;height:12px}
.legend .sw.now{border-color:#4fbfef;box-shadow:0 0 0 3px rgba(79,191,239,.18)}
.legend .sw.gap{border:none;background:none;font-family:var(--mono);color:var(--ink-mid);width:auto}
.legend .legend-read{flex-basis:100%;color:var(--ink-dim);font-size:12.5px;padding-top:4px}

/* sidebar */
.side{background:var(--panel);display:flex;flex-direction:column;min-width:0;min-height:0}
.side h2,.side .sidesub{flex:none}
#sessionGroups{overflow-y:auto;min-height:0;flex:1;scrollbar-width:thin;scrollbar-color:var(--rule) transparent}
#sessionGroups::-webkit-scrollbar{width:9px}
#sessionGroups::-webkit-scrollbar-thumb{background:var(--rule);border-radius:5px}
#noticeSlot{flex:none}
.side h2{margin:0;padding:18px 18px 4px;font-family:var(--sig);font-weight:600;font-size:15px;letter-spacing:.17em;text-transform:uppercase;color:var(--ink-dim);display:flex;align-items:baseline;gap:8px}
.side h2 .count{font-family:var(--mono);font-size:11.5px;letter-spacing:0;text-transform:none;color:var(--ink-dim);margin-left:auto}
.sidesub{padding:0 18px 12px;font-size:12.5px;color:var(--ink-dim)}
.groupname{padding:12px 18px 6px;font-family:var(--sig);font-size:12.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-dim);display:flex;align-items:baseline;gap:7px}
.groupname::after{content:"";flex:1;height:1px;background:var(--rule-soft)}
.groupname.first{padding-top:2px}
.sessions{list-style:none;margin:0;padding:0 12px 14px;display:flex;flex-direction:column;gap:8px}
.emptyside{padding:0 18px 18px;color:var(--ink-dim);font-size:13px}
.session{width:100%;text-align:left;background:var(--panel-2);border:1px solid var(--rule);border-left:3px solid var(--rule);border-radius:3px;padding:11px 12px;cursor:pointer;color:inherit;font:inherit;display:block}
.session:hover{background:#212a3a}
.session:focus-visible{outline:2px solid #4fbfef;outline-offset:2px}
.session[aria-pressed="true"]{background:#26303f;border-color:var(--ink-dim)}
.session .row1{display:flex;align-items:center;gap:8px}
.session .agent{font-family:var(--sig);font-size:15px;font-weight:600;letter-spacing:.06em;text-transform:uppercase}
.session .pulse{width:8px;height:8px;border-radius:50%;flex:none;background:#4fd1a5}
.session .pulse.live{animation:beat 2.4s ease-in-out infinite}
.session .pulse.idle{background:var(--ink-dim)}
.session .pulse.ended{background:transparent;border:1.5px solid var(--ink-dim)}
.session.dimmed{opacity:.5}
@keyframes beat{0%,100%{opacity:1}50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){.session .pulse.live{animation:none}}
.session .when{margin-left:auto;font-family:var(--mono);font-size:11.5px;color:var(--ink-dim)}
.session .proj{display:flex;align-items:center;gap:6px;margin-top:6px;font-family:var(--sig);font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink-mid)}
.session .proj .dot{width:7px;height:7px;border-radius:50%;flex:none;background:var(--ink-dim)}
.session .proj .go{margin-left:auto;font-family:var(--body);font-size:11px;letter-spacing:0;text-transform:none;color:var(--ink-dim);opacity:0;transition:opacity .12s}
.session:hover .proj .go,.session:focus-visible .proj .go{opacity:1}
.session.here{border-left-width:3px}
.session.away{opacity:.9}
.session .branch{font-family:var(--mono);font-size:12.5px;margin-top:4px;word-break:break-all}
.session .tree{font-family:var(--mono);font-size:11.5px;color:var(--ink-dim);margin-top:2px;word-break:break-all}
.session .note{font-size:12.5px;color:var(--ink-mid);margin-top:5px}
.session .touching{margin-top:8px;padding-top:8px;border-top:1px solid var(--rule-soft);font-family:var(--mono);font-size:11px;color:var(--ink-dim)}
.session .touching span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.session .touching span.hot{color:var(--caution)}
.session .touching .tlabel{font-family:var(--body);font-size:11px;color:var(--ink-dim);margin-bottom:3px}
.session .tree .t{font-family:var(--body);font-size:11px;color:var(--ink-mid)}
.notice{margin:0 12px 16px;border:1px solid rgba(240,192,74,.35);border-left:3px solid var(--caution);background:rgba(240,192,74,.07);border-radius:3px;padding:11px 12px}
.notice h3{margin:0 0 6px;font-family:var(--sig);font-size:13px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--caution)}
.notice p{margin:0;font-size:13px;color:var(--ink-mid)}
.notice code{font-family:var(--mono);font-size:11.5px;color:var(--ink)}
.elsewhere{margin:0 12px 18px;border-top:1px solid var(--rule-soft);padding-top:12px}
.elsewhere h3{margin:0 0 7px;font-family:var(--sig);font-size:12.5px;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-dim)}
.elsewhere .row{font-size:12.5px;color:var(--ink-mid);margin-bottom:6px}
.elsewhere .row code{font-family:var(--mono);font-size:11px;color:var(--ink-dim);display:block}

/* advisory */
/* The advice can run long on a stacked branch. Cap it and let it scroll, so a
   wordy explanation can never squeeze the map down to a sliver. */
/* Drag handles. Deliberately thin, with a wider invisible grab area, so they
   read as a seam rather than a piece of furniture. */
.split{position:relative;background:var(--rule-soft);flex:none;z-index:5}
.split::after{content:"";position:absolute;background:transparent}
.split-v{width:1px;cursor:col-resize}
.split-v::after{inset:0 -4px}
.split-h{height:1px;cursor:row-resize}
.split-h::after{inset:-4px 0}
.split:hover,.split.dragging{background:#4fbfef}
.split:focus-visible{outline:2px solid #4fbfef;outline-offset:1px}
body.resizing{cursor:inherit;user-select:none}
body.resizing iframe,body.resizing .mapscroll{pointer-events:none}

.advisory{border-top:none;background:var(--panel);padding:15px 22px 18px;display:grid;grid-template-columns:auto minmax(0,1fr);gap:18px;align-items:start;min-height:0;max-height:var(--advmax,42vh);overflow-y:auto;scrollbar-width:thin;scrollbar-color:var(--rule) transparent}
.advisory::-webkit-scrollbar{width:9px}
.advisory::-webkit-scrollbar-thumb{background:var(--rule);border-radius:5px}
.advisory .marker{width:4px;align-self:stretch;border-radius:2px;background:var(--ink-dim);min-height:52px}
.advisory .head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin-bottom:5px}
.advisory .status{font-family:var(--sig);font-size:15px;font-weight:700;letter-spacing:.17em;text-transform:uppercase}
.advisory .subject{font-family:var(--mono);font-size:13px;color:var(--ink-mid)}
.advisory .counts{margin-left:auto;font-family:var(--mono);font-size:12px;color:var(--ink-dim)}
.advisory p{margin:0;max-width:80ch;color:var(--ink-mid);font-size:14px}
.advisory p+p{margin-top:7px}
.advisory .why{color:var(--ink-dim);font-size:13px;margin-top:9px}
.advisory code{font-family:var(--mono);font-size:12px;color:var(--ink)}
.clearbtn{background:none;border:1px solid var(--rule);border-radius:2px;color:var(--ink-dim);font-family:var(--sig);font-size:12px;letter-spacing:.13em;text-transform:uppercase;padding:4px 9px;cursor:pointer;margin-left:10px}

/* a term you can ask about: dotted underline, explained on hover or focus */
.t{border-bottom:1px dotted currentColor;cursor:help;color:var(--ink);text-decoration:none;background:none;border-left:0;border-right:0;border-top:0;font:inherit;padding:0}
.t:hover,.t:focus-visible{color:#fff;border-bottom-style:solid}
.t:focus-visible{outline:2px solid #4fbfef;outline-offset:2px;border-radius:1px}

/* the order things have to happen in */
.plan{margin-top:12px;border-top:1px solid var(--rule-soft);padding-top:11px}
.plan summary{list-style:none;cursor:pointer;display:flex;align-items:baseline;gap:9px;padding:1px 0;user-select:none}
.plan summary::-webkit-details-marker{display:none}
.plan summary::before{content:"";width:0;height:0;border-left:5px solid var(--ink-dim);border-top:4px solid transparent;border-bottom:4px solid transparent;transition:transform .13s;transform-origin:2px 50%;flex:none}
.plan[open] summary::before{transform:rotate(90deg)}
.plan summary:hover .ptitle,.plan summary:focus-visible .ptitle{color:var(--ink)}
.plan summary:focus-visible{outline:2px solid #4fbfef;outline-offset:3px;border-radius:2px}
.plan .ptitle{font-family:var(--sig);font-size:12.5px;font-weight:600;letter-spacing:.15em;text-transform:uppercase;color:var(--ink-dim)}
.plan .pcount{font-family:var(--mono);font-size:11px;color:var(--ink-dim)}
.plan ol{margin:9px 0 0;padding:0;list-style:none;counter-reset:step;display:flex;flex-direction:column;gap:7px;max-width:80ch}
.plan li{counter-increment:step;display:grid;grid-template-columns:22px minmax(0,1fr);gap:10px;align-items:baseline}
.plan li::before{content:counter(step);font-family:var(--mono);font-size:11px;color:var(--ink-dim);border:1px solid var(--rule);border-radius:50%;width:20px;height:20px;display:flex;align-items:center;justify-content:center;align-self:start;margin-top:1px}
.plan .act{color:var(--ink);font-size:13.5px}
.plan .rea{color:var(--ink-dim);font-size:12.5px;display:block}
.plan .last::before{border-color:var(--ink-dim);color:var(--ink-mid)}
.clearbtn:hover{color:var(--ink);border-color:var(--ink-dim)}
.clearbtn:focus-visible{outline:2px solid #4fbfef;outline-offset:2px}

/* svg */
.linepath{fill:none;stroke-width:5;stroke-linecap:round;stroke-linejoin:round}
.linepath.ghost{stroke-dasharray:2 9}
.commit circle,.commit rect{stroke-width:3.5}
.branchlabel{font-family:var(--sig);font-size:15px;font-weight:600;letter-spacing:.09em;text-transform:uppercase}
.plate .pname{font-family:var(--sig);font-size:14px;font-weight:600;letter-spacing:.07em;text-transform:uppercase}
.plate .pcount{font-family:var(--mono);font-size:11px}
.gapmark{font-family:var(--mono);font-size:15px}
.hit{cursor:pointer;fill:transparent}
.hit:focus{outline:none}
.focusring{fill:none;stroke-width:2;opacity:.85}

.gloss{position:fixed;z-index:60;background:#0a0e16;border:1px solid var(--rule);border-left:3px solid #4fbfef;border-radius:3px;padding:11px 13px;max-width:330px;opacity:0;pointer-events:none;transition:opacity .12s}
.gloss.on{opacity:1}
.gloss .g-term{font-family:var(--sig);font-size:14px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#4fbfef;margin-bottom:5px}
.gloss .g-short{font-size:13.5px;color:var(--ink);margin-bottom:6px}
.gloss .g-long{font-size:12.5px;color:var(--ink-mid);line-height:1.45}

.tip{position:fixed;pointer-events:none;z-index:50;background:#0a0e16;border:1px solid var(--rule);border-radius:3px;padding:8px 10px;max-width:300px;opacity:0;transition:opacity .12s}
.tip.on{opacity:1}
.tip .msg{font-size:13px;color:var(--ink)}
.tip .meta{font-family:var(--mono);font-size:11px;color:var(--ink-dim);margin-top:4px}

.skip{position:absolute;left:-9999px}
.skip:focus{left:12px;top:12px;z-index:99;background:var(--panel-2);border:1px solid var(--rule);padding:8px 12px;border-radius:3px;color:var(--ink)}

@media (max-width:700px){
  .mapstage{flex-direction:column;align-items:stretch}
  .rail{width:auto;height:auto!important;border-left:none;margin:12px 22px 0;display:flex;flex-wrap:wrap;gap:8px}
  .rail .plate{position:static;height:auto;padding:8px 10px;flex:1 1 46%;min-width:0}
  .rail .plate .pb{display:block}
  .wordmark .sub{display:none}
  .wordmark .name{font-size:19px}
  .topbar{gap:14px}
  .maphead h1{font-size:22px}
}
@media (max-width:900px){
  .split{display:none}
  .shell{height:auto;overflow:visible;grid-template-rows:auto auto auto auto}
  .main{grid-template-columns:1fr}
  .advisory{max-height:none;overflow-y:visible}
  .main{grid-template-columns:1fr;overflow:visible}
  .mapwrap{overflow-y:visible}
  #sessionGroups{overflow-y:visible}
  .mapwrap{border-right:none;border-bottom:1px solid var(--rule)}
  .picker{margin-left:0;width:100%}
  .picker select{flex:1}
  .maphead .hint{display:none}
}
</style>
</head>
<body>
<a class="skip" href="#advisory">Skip to the advice</a>
<div class="shell">
  <header class="topbar">
    <div class="wordmark">
      <span class="bullet"></span>
      <span class="name">Repo Lines</span>
      <span class="sub">where the code stands</span>
    </div>
    <div class="picker">
      <label for="proj">Project</label>
      <select id="proj"></select>
      <button id="pinBtn" class="pin" type="button" hidden aria-pressed="false"
        title="Open this project first next time"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M14.5 2.5l7 7-4.2 1.2-2.6 5.6-3.2-3.2-6.3 6.3-1.6-1.6 6.3-6.3-3.2-3.2 5.6-2.6z"/></svg></button>
    </div>
    <div class="freshness" id="fresh"></div>
  </header>

  <div class="main">
    <section class="mapwrap">
      <div class="maphead">
        <h1 id="mapTitle">—</h1>
        <span class="path" id="mapPath"></span>
        <span class="hint">Click any line or session to read its advice</span>
        <div class="since" id="since" hidden></div>
      </div>
      <div class="mapstage">
        <div class="mapscroll" id="mapScroll"><svg class="map" id="map" role="img" aria-label="Branch diagram"></svg><div class="zoombadge" id="zoomBadge"><span id="zoomLevel">100%</span><span class="hintkey">drag to pan · double-click to fit</span></div></div>
        <div class="rail" id="rail"></div>
      </div>
      <div id="emptySlot"></div>
      <div class="warnrow" id="warnSlot"></div>
      <div class="legend" id="legend">
        <div class="item"><span class="sw filled"></span> Commit</div>
        <div class="item"><span class="sw"></span> Where a line splits or rejoins</div>
        <div class="item"><span class="sw now"></span> Latest commit on the line</div>
        <div class="item"><span class="sw sq"></span> Merged and closed</div>
        <div class="item"><span class="sw gap">//</span> Older commits not shown</div>
        <div class="item legend-read" id="legendRead"></div>
      </div>
    </section>

    <div class="split split-v" id="splitSide" role="separator" aria-orientation="vertical"
         aria-label="Resize the session panel" tabindex="0" title="Drag to resize · double-click to reset"></div>
    <aside class="side">
      <h2>All sessions <span class="count" id="sessCount"></span></h2>
      <div class="sidsub sidesub" id="sessSub"></div>
      <div id="sessionGroups"></div>
      <div id="noticeSlot"></div>
    </aside>
  </div>

  <div class="split split-h" id="splitAdv" role="separator" aria-orientation="horizontal"
       aria-label="Resize the advice panel" tabindex="0" title="Drag to resize · double-click to reset"></div>
  <section class="advisory" id="advisory" aria-live="polite">
    <div class="marker" id="advMarker"></div>
    <div>
      <div class="head">
        <span class="status" id="advStatus">—</span>
        <span class="subject" id="advSubject"></span>
        <span class="counts" id="advCounts"></span>
      </div>
      <div id="advBody"></div>
    </div>
  </section>
</div>
<div class="tip" id="tip"><div class="msg"></div><div class="meta"></div></div>
<div class="gloss" id="gloss" role="tooltip"><div class="g-term"></div><div class="g-short"></div><div class="g-long"></div></div>

<script>
const MODEL = "__MODEL__";

const X0=88, Y0=54, DY=76, R=22;
const DX_MAX=54, DX_MIN=26;
let DX = DX_MAX;
const px = x => X0 + x*DX;
const py = l => Y0 + l*DY;
let LANE = new Map();
const lane = l => LANE.has(l.id) ? LANE.get(l.id) : l.lane;
const $ = id => document.getElementById(id);
const NS = "http://www.w3.org/2000/svg";
function el(t,a,p){const n=document.createElementNS(NS,t);for(const k in a)n.setAttribute(k,a[k]);if(p)p.appendChild(n);return n;}
function shortPath(p){
  const parts = String(p).split("/").filter(Boolean);
  return parts.length<=2 ? p : "…/"+parts.slice(-2).join("/");
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

let projIndex = 0, selected = null;
/* Closed branches are history, not decisions. They stay out of the picture until
   asked for, which is what keeps the diagram short enough to fit. */
let showClosed = false;
let view = null;        // current viewBox {x,y,w,h}
let fitView = null;     // the whole-content box, for "fit" and for reset
let panning = null;

function shownLines(){
  const all = proj().lines || [];
  return showClosed ? all : all.filter(l => l.status !== "merged");
}
function closedCount(){ return (proj().lines||[]).filter(l => l.status === "merged").length; }

/* Hiding lanes leaves gaps, so renumber what is left into consecutive rows. */
function laneMap(){
  const m = new Map();
  shownLines().slice().sort((a,b)=>a.lane-b.lane).forEach((l,i)=>m.set(l.id,i));
  return m;
}
const proj = () => MODEL.projects[projIndex];
const lineById = id => (proj().lines||[]).find(l => l.id === id);

/* ---------- map ---------- */
function draw(keepView){
  const p = proj(), svg = $("map");
  svg.innerHTML = "";
  const rail = $("rail");
  rail.innerHTML = "";
  LANE = laneMap();
  const lines = shownLines();
  if(!lines.length){ fitView = view = null; renderRail([]); return; }

  DX = DX_MAX;   // one fixed drawing scale; zooming moves the viewBox instead
  const maxX = Math.max(...lines.flatMap(l => l.commits.map(c=>c.x)));
  const maxLane = Math.max(...lines.map(lane));

  const W = px(maxX)+56, H = py(maxLane)+40;
  fitView = {x:0, y:0, w:W, h:H};
  if(!keepView || !view) view = {...fitView};
  applyView();

  // A branch whose parent is hidden must attach to something that is on screen,
  // or the curve is drawn to a lane that no longer exists.
  const visLine = id => lines.find(x => x.id === id) || lines.find(x => x.trunk) || lines[0];

  lines.forEach(l => el("line",{x1:24,y1:py(lane(l)),x2:W-24,y2:py(lane(l)),stroke:"#1c2431","stroke-width":1},svg));

  const gL=el("g",{},svg), gD=el("g",{},svg), gT=el("g",{},svg), gH=el("g",{},svg);
  const plates = [];

  lines.forEach(l => {
    const y = py(lane(l));
    const dim = selected && selected !== l.id;
    const merged = l.status === "merged";
    const baseOp = merged ? .45 : 1;
    const op = dim ? .15 : baseOp;

    const first = l.commits[0], last = l.commits[l.commits.length-1];
    let d;
    if(l.trunk){
      d = "M "+(px(first.x)-34)+" "+y+" L "+(px(last.x)+30)+" "+y;
    } else {
      const par = visLine(l.from.line);
      const fx = px(l.from.x), fy = py(lane(par)), tx = px(first.x);
      d = "M "+fx+" "+fy+" C "+(fx+R)+" "+fy+" "+(tx-R)+" "+y+" "+tx+" "+y+" L "+px(last.x)+" "+y;
      if(l.mergeTo){
        const mp = visLine(l.mergeTo.line);
        const mx = px(l.mergeTo.x), my = py(lane(mp));
        d += " M "+px(last.x)+" "+y+" C "+(px(last.x)+R)+" "+y+" "+(mx-R)+" "+my+" "+mx+" "+my;
      }
    }
    const path = el("path",{d,class:"linepath"+(merged?" ghost":""),stroke:l.color},gL);
    path.style.opacity = op;

    l.commits.forEach((c,i) => {
      if(c.gapBefore){
        const gm = el("text",{x:px(c.x)-DX/2,y:y+5,class:"gapmark",fill:"#67748a","text-anchor":"middle"},gT);
        gm.textContent = "//"; gm.style.opacity = op;
        const gh = el("rect",{x:px(c.x)-DX/2-11,y:y-13,width:22,height:26,class:"hit"},gH);
        gh.addEventListener("mouseenter",e=>tipAt(e,c.gapBefore+" earlier commit"+(c.gapBefore>1?"s":"")+" not shown","the page draws the most recent stretch"));
        gh.addEventListener("mousemove",moveTip); gh.addEventListener("mouseleave",hideTip);
      }
      const isHead = i===l.commits.length-1 && !merged;
      const g = el("g",{class:"commit"},gD); g.style.opacity = op;
      if(isHead) el("circle",{cx:px(c.x),cy:y,r:11,fill:l.color,opacity:.16},g);
      if(merged){
        const s=6.5;
        el("rect",{x:px(c.x)-s,y:y-s,width:s*2,height:s*2,rx:1.5,transform:"rotate(45 "+px(c.x)+" "+y+")",fill:"#0e131d",stroke:l.color},g);
      } else if(c.junction){
        el("circle",{cx:px(c.x),cy:y,r:7,fill:"#0e131d",stroke:l.color},g);
      } else {
        el("circle",{cx:px(c.x),cy:y,r:6.5,fill:l.color,stroke:"#0e131d","stroke-width":2},g);
      }
      const h = el("circle",{cx:px(c.x),cy:y,r:14,class:"hit"},gH);
      h.addEventListener("mouseenter",e=>tipAt(e,c.m,
        l.name+" · "+c.sha+" · "+c.who+" · "+c.when+(isHead?"  (latest here)":"")));
      h.addEventListener("mousemove",moveTip);
      h.addEventListener("mouseleave",hideTip);
      h.addEventListener("click",()=>select(l.id));
    });

    if(!l.trunk){
      const nearEdge = px(first.x) > W*0.66;
      const t = el("text",{
        x: nearEdge ? px(first.x)+4 : px(first.x)-4,
        y: y-19, class:"branchlabel", fill:l.color,
        "text-anchor": nearEdge ? "end" : "start"
      },gT);
      t.textContent = l.name; t.style.opacity = op;
    }

    const tone = l.status==="caution" ? "#f0c04a" : l.color;
    const plate = document.createElement("button");
    plate.type = "button";
    plate.className = "plate";
    plate.style.borderColor = tone;
    plate.style.opacity = dim ? .3 : 1;
    plate.setAttribute("aria-pressed", String(selected === l.id));
    plate.setAttribute("aria-label", l.name+" — "+l.advisory.status+", "+l.advisory.counts);
    plate.dataset.line = l.id;
    // the branch name is the thing you are looking for, so it leads
    plate.innerHTML =
      '<span class="pb" style="color:'+(l.trunk?"#e7ecf3":tone)+'">'+esc(l.name)+'</span>'+
      '<span class="pn">'+esc(l.trunk?"TRUNK":plateLabel(l))+'</span>'+
      '<span class="pc">'+esc(l.trunk ? "the deployed line"
        : merged ? "merged · closed"
        : l.ahead+" ahead · "+l.behind+" behind")+'</span>';
    plate.addEventListener("click",()=>select(l.id));

    // the numbers are the jargon-densest thing on screen, so hovering them teaches
    if(!l.trunk && !merged){
      const explain = l.behind === 0
        ? l.ahead+" new commit"+(l.ahead===1?"":"s")+" here, and "+p_trunk()+" has not moved since this split off. Nothing to reconcile."
        : l.ahead+" new commit"+(l.ahead===1?"":"s")+" here; "+p_trunk()+" has moved "+l.behind+" ahead. Pull "+p_trunk()+" in before merging.";
      plate.addEventListener("mouseenter", e => tipAt(e, explain, l.name+" · "+l.advisory.status));
      plate.addEventListener("mousemove", moveTip);
      plate.addEventListener("mouseleave", hideTip);
    } else if(l.trunk){
      plate.addEventListener("mouseenter", e => tipAt(e,
        "The line everything comes back to. What sits here is what runs when you deploy.",
        l.name));
      plate.addEventListener("mousemove", moveTip);
      plate.addEventListener("mouseleave", hideTip);
    } else {
      plate.addEventListener("mouseenter", e => tipAt(e,
        "Already merged into "+p_trunk()+". Safe to delete: the commits are in "+p_trunk()+" now.",
        l.name));
      plate.addEventListener("mousemove", moveTip);
      plate.addEventListener("mouseleave", hideTip);
    }
    plates.push(plate);

    // a small cap so the line reads as ending, not as cut off
    const cap = el("line",{x1:px(last.x)+10,y1:y,x2:px(last.x)+22,y2:y,
      stroke:l.color,"stroke-width":2,"stroke-linecap":"round"},gL);
    cap.style.opacity = dim ? .15 : (merged? .3 : .5);
  });

  renderRail(plates);
}

/* The rail used to pin each plate to its lane's y position, which meant a tall
   diagram forced a tall rail and the whole column scrolled. It is a plain list
   now: same order, no scrollbar. */
function renderRail(plates){
  const rail = $("rail");
  rail.innerHTML = "";
  rail.style.height = "";
  for(const b of plates) rail.appendChild(b);

  const n = closedCount();
  if(!n) return;
  const row = document.createElement("button");
  row.type = "button";
  row.className = "plate closedrow" + (showClosed ? " open" : "");
  row.setAttribute("aria-expanded", String(showClosed));
  row.innerHTML = '<span class="pb">'+n+' closed branch'+(n===1?"":"es")+'</span>'+
                  '<span class="pc">'+(showClosed ? "hide them" : "already merged · show")+'</span>';
  row.addEventListener("click", () => { showClosed = !showClosed; selected = null; draw(); renderAdvisory(); });
  rail.appendChild(row);
}

/* ---------- zoom and pan ---------- */
function applyView(){
  const svg = $("map");
  if(!view){ svg.removeAttribute("viewBox"); return; }
  svg.setAttribute("viewBox", view.x+" "+view.y+" "+view.w+" "+view.h);
  svg.setAttribute("preserveAspectRatio","xMidYMid meet");
  const z = fitView ? fitView.w / view.w : 1;
  $("mapScroll").classList.toggle("zoomed", z > 1.02);
  const zl = $("zoomLevel");
  if(zl){ zl.textContent = Math.round(z*100)+"%"; zl.parentElement.classList.toggle("on", z > 1.02); }
}

function zoomAt(factor, clientX, clientY){
  if(!view || !fitView) return;
  const svg = $("map"), r = svg.getBoundingClientRect();
  // keep whatever is under the pointer under the pointer
  const fx = Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  const fy = Math.min(1, Math.max(0, (clientY - r.top) / r.height));
  const ax = view.x + fx*view.w, ay = view.y + fy*view.h;
  const minW = fitView.w / 8;
  const w = Math.min(fitView.w, Math.max(minW, view.w / factor));
  const h = view.h * (w / view.w);
  view = {w, h, x: ax - fx*w, y: ay - fy*h};
  clampView();
  applyView();
}

function clampView(){
  if(!view || !fitView) return;
  if(view.w >= fitView.w) { view.x = (fitView.w - view.w)/2; }
  else view.x = Math.min(Math.max(view.x, 0), fitView.w - view.w);
  if(view.h >= fitView.h) { view.y = (fitView.h - view.h)/2; }
  else view.y = Math.min(Math.max(view.y, 0), fitView.h - view.h);
}

function resetView(){ if(fitView){ view = {...fitView}; applyView(); } }

function p_trunk(){ return proj().trunk || "main"; }

function plateLabel(l){
  return l.status==="merged"?"CLOSED":l.status==="clear"?"CLEAR":
         l.status==="caution"?"UPDATE FIRST":l.status==="stacked"?"STACKED":"NOTHING NEW";
}

/* ---------- tooltip ---------- */
const tip = $("tip");
function tipAt(e,msg,meta){
  tip.querySelector(".msg").textContent = msg;
  tip.querySelector(".meta").textContent = meta;
  tip.classList.add("on"); moveTip(e);
}
function moveTip(e){
  let x=e.clientX+14, y=e.clientY+14;
  if(x+310>window.innerWidth) x=Math.max(8,e.clientX-310);
  if(y+120>window.innerHeight) y=Math.max(8,e.clientY-120);
  tip.style.left=x+"px"; tip.style.top=y+"px";
}
function hideTip(){ tip.classList.remove("on"); }

/* ---------- sidebar ---------- */
/* Every session everywhere, not just this project's. Grouped by whether it is
   working, resting, or finished, since that is the first thing you want to know. */
function renderSide(){
  const all = MODEL.sessions || [];
  const host = $("sessionGroups");
  host.innerHTML = "";

  const live = all.filter(s=>s.state==="live").length;
  $("sessCount").textContent = all.length ? live+" live / "+all.length : "";
  $("sessSub").innerHTML = all.length
    ? teach("Across every project. Click one to jump to its branch. Dotted words explain themselves.")
    : "";

  if(!all.length){
    host.innerHTML = '<ul class="sessions"><li class="emptyside">'+
      'Nothing has checked in. Run <code>repo-lines session start</code> inside a worktree and it will show up here.'+
      '</li></ul>';
  }

  const groups = [
    ["Working now", all.filter(s=>s.state==="live")],
    ["Resting",     all.filter(s=>s.state==="idle")],
    ["Finished",    all.filter(s=>s.state==="ended")],
  ];

  let firstGroup = true;
  for(const [title, list] of groups){
    if(!list.length) continue;
    const h = document.createElement("div");
    h.className = "groupname" + (firstGroup ? " first" : "");
    h.textContent = title + " · " + list.length;
    host.appendChild(h);
    firstGroup = false;

    const ul = document.createElement("ul");
    ul.className = "sessions";
    for(const s of list) ul.appendChild(sessionCard(s));
    host.appendChild(ul);
  }

  $("noticeSlot").innerHTML = "";
  for(const p of MODEL.projects){
    if(!p.notice) continue;
    const scope = MODEL.projects.length > 1 ? esc(p.label)+" — " : "";
    $("noticeSlot").insertAdjacentHTML("beforeend",
      '<div class="notice"><h3>'+scope+esc(p.notice.title)+'</h3><p>'+teach(p.notice.body)+'</p></div>');
  }
}

function sessionCard(s){
  const pi = s.project ? MODEL.projects.findIndex(p=>p.key===s.project) : -1;
  const line = pi>=0 ? (MODEL.projects[pi].lines||[]).find(l=>l.id===s.branch) : null;
  const isHere = pi === projIndex;
  const isSelected = isHere && selected === s.branch;

  const li = document.createElement("li");
  const b = document.createElement("button");
  b.type = "button";
  b.className = "session " + (isHere ? "here" : "away") +
    (selected && !isSelected ? " dimmed" : "");
  b.setAttribute("aria-pressed", String(isSelected));
  b.style.borderLeftColor = line ? line.color : "var(--rule)";

  const projLabel = s.projectLabel || "Outside " + esc(MODEL.root);
  const go = !s.known ? "not scanned"
    : isHere ? (line ? "show on map" : "no line drawn")
    : "open project";

  b.innerHTML =
    '<div class="row1">'+
      '<span class="pulse '+esc(s.state)+'"></span>'+
      '<span class="agent">'+esc(s.agent)+'</span>'+
      '<span class="when">'+esc(s.when)+'</span>'+
    '</div>'+
    '<div class="proj">'+
      '<span class="dot" style="background:'+(line?line.color:"#67748a")+'"></span>'+
      '<span>'+esc(projLabel)+'</span>'+
      '<span class="go">'+esc(go)+'</span>'+
    '</div>'+
    '<div class="branch" style="color:'+(line?line.color:"#67748a")+'">'+esc(s.branch||"detached")+'</div>'+
    '<div class="tree" title="'+esc(s.worktree)+'">'+
      '<button type="button" class="t" data-term="worktree">worktree</button> '+
      esc(shortPath(s.worktree))+'</div>'+
    (s.note?'<div class="note">'+esc(s.note)+'</div>':'')+
    ((s.touching&&s.touching.length)?
      '<div class="touching">'+
      '<span class="tlabel"><button type="button" class="t" data-term="uncommitted">uncommitted</button> right now</span>'+
      s.touching.map(f=>'<span class="'+(s.clash?'hot':'')+'">'+esc(f)+'</span>').join('')+
      (s.moreDirty?'<span>+'+s.moreDirty+' more</span>':'')+'</div>':'');

  if(s.known && line){
    b.addEventListener("click",()=>jumpTo(pi, s.branch));
  } else if(s.known){
    b.addEventListener("click",()=>jumpTo(pi, null));
  }
  li.appendChild(b);
  return li;
}

/* A session card is a hyperlink: switch project if needed, then highlight
   that branch. */
function jumpTo(pi, branch){
  if(pi < 0) return;
  if(pi !== projIndex){
    projIndex = pi;
    $("proj").value = String(pi);
    load(branch);
    return;
  }
  select(branch);
}

/* ---------- glossary ---------- */
/* The advice uses words like "behind" and "worktree" to do its explaining, which
   only helps if you already have those words. So every one of them is askable. */
const GLOSS = MODEL.glossary || {};
const GLOSS_KEYS = Object.keys(GLOSS).sort((a,b)=>b.length-a.length);

function teach(html){
  if(!GLOSS_KEYS.length) return html;
  // Only the first mention of a term is marked up, per block of prose. Underlining
  // every instance turns a paragraph into a minefield of dotted lines.
  const used = new Set();
  return html.replace(/(<[^>]+>)|([^<]+)/g, (m, tag, text) => {
    if(tag) return tag;
    let out = "", rest = text;
    // walk left to right so the earliest mention wins, whichever term it is
    while(rest.length){
      let best = null;
      for(const k of GLOSS_KEYS){
        if(used.has(k)) continue;
        const re = new RegExp("(?<![\\w-])(" + k.replace(/[-\/\\^$*+?.()|[\]{}]/g,"\\$&") + ")(?![\\w-])", "i");
        const hit = re.exec(rest);
        if(hit && (!best || hit.index < best.index)) best = { k, index: hit.index, match: hit[1] };
      }
      if(!best){ out += rest; break; }
      used.add(best.k);
      out += rest.slice(0, best.index) +
        '<button type="button" class="t" data-term="'+best.k+'">'+best.match+'</button>';
      rest = rest.slice(best.index + best.match.length);
    }
    return out;
  });
}

const gloss = $("gloss");
let glossPinned = false;

function showGloss(target, key){
  const g = GLOSS[key];
  if(!g) return;
  gloss.querySelector(".g-term").textContent = g.term;
  gloss.querySelector(".g-short").textContent = g.short;
  gloss.querySelector(".g-long").textContent = g.long;
  gloss.classList.add("on");
  const r = target.getBoundingClientRect();
  const gr = gloss.getBoundingClientRect();
  let x = r.left, y = r.bottom + 8;
  if(x + gr.width > window.innerWidth - 12) x = Math.max(12, window.innerWidth - gr.width - 12);
  if(y + gr.height > window.innerHeight - 12) y = Math.max(12, r.top - gr.height - 8);
  gloss.style.left = x + "px";
  gloss.style.top = y + "px";
}
function hideGloss(){ if(!glossPinned) gloss.classList.remove("on"); }

document.addEventListener("mouseover", e => {
  const t = e.target.closest(".t");
  if(t){ glossPinned = false; showGloss(t, t.dataset.term); }
});
document.addEventListener("mouseout", e => { if(e.target.closest(".t")) hideGloss(); });
document.addEventListener("focusin", e => {
  const t = e.target.closest(".t");
  if(t){ glossPinned = true; showGloss(t, t.dataset.term); }
});
document.addEventListener("focusout", e => {
  if(e.target.closest(".t")){ glossPinned = false; hideGloss(); }
});
document.addEventListener("click", e => {
  const t = e.target.closest(".t");
  if(t){ e.preventDefault(); glossPinned = !glossPinned; if(glossPinned) showGloss(t, t.dataset.term); else hideGloss(); }
});

/* ---------- advisory ---------- */
function renderAdvisory(){
  const p = proj();
  if(!p.lines || !p.lines.length){
    $("advMarker").style.background = "#67748a";
    $("advStatus").textContent = "Nothing to advise";
    $("advStatus").style.color = "#67748a";
    $("advSubject").textContent = p.label;
    $("advCounts").textContent = "";
    $("advBody").innerHTML = "<p>"+esc(p.empty || "No branches were found here.")+"</p>";
    return;
  }
  const l = (selected && lineById(selected)) || p.lines[0];
  const a = l.advisory;
  $("advMarker").style.background = a.tone;
  $("advStatus").textContent = a.status;
  $("advStatus").style.color = a.tone;
  $("advSubject").textContent = l.name;
  $("advCounts").innerHTML = teach(esc(a.counts));
  const body = $("advBody");
  let html = a.body.map(t=>"<p>"+teach(t)+"</p>").join("") + '<p class="why">'+teach(a.why)+'</p>';

  if(l.steps && l.steps.length){
    /* Open it only when the order is the thing that could bite: a branch built on
       another branch, or an overlap with someone else. A plain merge does not
       need four steps taking up the screen. */
    const ordered = l.status === "stacked" || l.steps.some(st=>/overlap/i.test(st.do));
    html += '<details class="plan"'+(ordered?" open":"")+'>'+
      '<summary><span class="ptitle">In this order</span>'+
      '<span class="pcount">'+l.steps.length+' step'+(l.steps.length===1?"":"s")+'</span></summary>'+
      '<ol>' +
      l.steps.map((st,i) =>
        '<li'+(i===l.steps.length-1?' class="last"':'')+'>'+
        '<div><span class="act">'+teach(esc(st.do))+'</span>'+
        '<span class="rea">'+teach(esc(st.why))+'</span></div></li>').join('') +
      '</ol></details>';
  }
  body.innerHTML = html;

  if(selected){
    const btn = document.createElement("button");
    btn.className="clearbtn"; btn.type="button"; btn.textContent="Show whole project";
    btn.addEventListener("click",()=>select(null));
    body.querySelector(".why").appendChild(btn);
  }
}

/* ---------- shell ---------- */
function select(id){
  selected = (selected === id) ? null : id;
  draw(); renderSide(); renderAdvisory(); writeHash();
}

function renderFresh(){
  const s = MODEL.sections, now = Date.now();
  const rows = [["Branch layout",s.branches],["Working files",s.working],["Sessions",s.sessions]];
  $("fresh").innerHTML = rows.map(([k,v]) => {
    const mins = (now - Date.parse(v.at))/60000;
    const limit = v.trustFor.indexOf("hour")>-1 ? 60 : parseFloat(v.trustFor) || 10;
    const stale = mins > limit;
    const age = mins < 1 ? Math.max(1,Math.round(mins*60))+" sec" : Math.round(mins)+" min";
    return '<span class="chip'+(stale?" stale":"")+'" title="Trust this for about '+esc(v.trustFor)+'">'+
      '<span class="k">'+k+'</span><span class="v">'+age+'</span></span>';
  }).join("");
}

/* One sentence naming what the picture is, for the times the metaphor does not
   land on its own. */
function renderLegendRead(){
  const p = proj();
  const el2 = $("legendRead");
  if(!el2) return;
  if(!p.lines || !p.lines.length){ el2.innerHTML = ""; return; }
  const open = p.lines.filter(l=>!l.trunk && l.status!=="merged").length;
  el2.innerHTML = teach(
    "Read it left to right as time. The top line is the " + esc(p.trunk) + " trunk; "+
    "each line below is a branch, drawn from where it split off. " +
    (open ? open+" of them "+(open===1?"is":"are")+" still open." : "None are still open.")
  );
}

function renderWarnings(){
  const p = proj(), rows = [];
  (p.warnings||[]).forEach(w => rows.push(w));
  if(p.closedInline && p.closedInline.length)
    rows.push("Also closed, and already identical to "+esc(p.trunk)+", so not drawn: "+p.closedInline.map(esc).join(", ")+".");
  (MODEL.skipped||[]).forEach(s => rows.push("Could not read "+esc(s.path)+"."));
  $("warnSlot").innerHTML = rows.map(r=>"<div>"+r+"</div>").join("");
  $("emptySlot").innerHTML = (!p.lines || !p.lines.length)
    ? '<div class="emptystate"><strong>Nothing to draw</strong>'+esc(p.empty||"No branches found.")+'</div>' : "";
  $("legend").style.display = (p.lines && p.lines.length) ? "" : "none";
}

/* Served from localhost, every refresh rescans. Keeping the choice in the URL
   means a refresh gives you new data on the same view, instead of throwing you
   back to the default project. */
function readHash(){
  const raw = decodeURIComponent((location.hash||"").replace(/^#/,""));
  if(!raw) return null;
  const [key, branch] = raw.split("/");
  const i = MODEL.projects.findIndex(p=>p.key===key);
  return i < 0 ? null : { index:i, branch: branch||null };
}

function writeHash(){
  const p = MODEL.projects[projIndex];
  if(!p) return;
  const next = "#" + encodeURIComponent(p.key) + (selected ? "/"+encodeURIComponent(selected) : "");
  if(location.hash !== next) history.replaceState(null,"",next);
}

function load(preselect){
  const p = proj();
  selected = (preselect && (p.lines||[]).some(l=>l.id===preselect)) ? preselect : null;
  $("mapTitle").textContent = p.label;
  $("mapPath").textContent = p.path;
  renderSince(p);
  renderFresh(); renderWarnings(); renderLegendRead(); draw(); renderSide(); renderAdvisory();
  refreshPin();
  $("mapScroll").scrollLeft = 0;
  writeHash();
}

/* One line answering "did anything move while I wasn't looking". Absent until
   there is a snapshot old enough to be worth comparing against. */
function renderSince(p){
  const el = $("since");
  const s = MODEL.since;
  const text = s && s.projects ? s.projects[p.key] : null;
  if(!text){ el.hidden = true; return; }
  el.hidden = false;
  el.innerHTML = "<b>" + esc(s.since) + ":</b> " + esc(text);
}

/* ---------- pinning the default project ----------
   Only meaningful over http: the button POSTs to the serve process, which is
   the one place a write can land. On a file:// page it stays hidden and the
   CLI ("repo-lines default <name>") remains the way to pin. */
const pinBtn = $("pinBtn");
if(/^https?:$/.test(location.protocol)) pinBtn.hidden = false;

function pinnedHere(){
  const p = MODEL.projects[projIndex];
  const want = String(MODEL.defaultProject || "").toLowerCase();
  return !!p && !!want &&
    (p.key.toLowerCase() === want || (p.label||"").toLowerCase() === want);
}

function refreshPin(){
  if(pinBtn.hidden) return;
  const on = pinnedHere();
  pinBtn.classList.toggle("on", on);
  pinBtn.setAttribute("aria-pressed", String(on));
  pinBtn.title = on
    ? "This project opens first. Click to stop pinning it."
    : "Open this project first next time";
}

pinBtn.addEventListener("click", async () => {
  const p = MODEL.projects[projIndex];
  if(!p) return;
  const next = pinnedHere() ? null : p.key;
  try {
    const r = await fetch("/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ defaultProject: next }),
    });
    if(!r.ok) throw new Error();
    MODEL.defaultProject = next;
    refreshPin();
  } catch {
    pinBtn.title = "Could not save the pin — is the server still running?";
  }
});

const sel = $("proj");
MODEL.projects.forEach((p,i) => {
  const o=document.createElement("option");
  o.value=String(i);
  const live=(MODEL.sessions||[]).filter(s=>s.project===p.key && s.state==="live").length;
  o.textContent = p.label + (live? "  ("+live+" working)":"");
  sel.appendChild(o);
});
const fromUrl = readHash();
projIndex = fromUrl ? fromUrl.index
  : Math.min(Math.max(0, MODEL.defaultIndex || 0), Math.max(0, MODEL.projects.length-1));
sel.value = String(projIndex);
sel.addEventListener("change",()=>{ projIndex = Number(sel.value); load(); });

if(!MODEL.projects.length){
  document.querySelector(".main").innerHTML =
    '<div class="emptystate"><strong>No repositories found</strong>Nothing under '+esc(MODEL.root)+
    ' looks like a git repository. Run it again with <code>--root</code> pointed at your code folder.</div>';
} else {
  load(fromUrl ? fromUrl.branch : null);
}
/* Pasting a bookmarked url into an already-open tab only changes the hash, which
   is not a navigation. Follow it manually. */
/* ---------- resizable panes ---------- */
/* Sizes are a per-machine preference, not part of the snapshot, so they live in
   localStorage and survive every regeneration. */
const PANE_KEY = "repo-lines:panes";
const SIDE_MIN = 240, SIDE_MAX_FRAC = .55, ADV_MIN = 96, ADV_MAX_FRAC = .7;
/* Defaults scale with the viewport instead of assuming a big desktop: a 24%
   sidebar caps at the old 322px, and short laptops give the advice strip a
   lower ceiling so the map keeps room to breathe. A dragged size still wins. */
const paneDefaults = () => ({
  side: Math.min(322, Math.round(window.innerWidth * .24)),
  adv: null,
});
let panes = (() => {
  try { return {...paneDefaults(), ...JSON.parse(localStorage.getItem(PANE_KEY) || "{}")}; }
  catch { return {...paneDefaults()}; }
})();

function savePanes(){
  try { localStorage.setItem(PANE_KEY, JSON.stringify(panes)); } catch { /* private mode */ }
}

function applyPanes(){
  const root = document.documentElement;
  const maxSide = Math.max(SIDE_MIN, window.innerWidth * SIDE_MAX_FRAC);
  const side = Math.min(maxSide, Math.max(SIDE_MIN, panes.side || paneDefaults().side));
  root.style.setProperty("--sidew", side + "px");
  if(panes.adv){
    const maxAdv = window.innerHeight * ADV_MAX_FRAC;
    const advh = Math.min(maxAdv, Math.max(ADV_MIN, panes.adv));
    root.style.setProperty("--advh", advh + "px");
    // a deliberate drag beats the default ceiling, but never the hard one
    root.style.setProperty("--advmax", advh + "px");
  } else {
    root.style.removeProperty("--advh");
    // 42vh of advice is fine on a desktop but buries the map on a 720px
    // laptop, so short viewports get a lower default ceiling
    root.style.setProperty("--advmax", (window.innerHeight <= 820 ? 32 : 42) + "vh");
  }
}

function dragSplit(handle, onMove, onReset){
  handle.addEventListener("pointerdown", e => {
    if(e.button !== 0) return;
    e.preventDefault();
    handle.setPointerCapture(e.pointerId);
    handle.classList.add("dragging");
    document.body.classList.add("resizing");
    const move = ev => { onMove(ev); applyPanes(); };
    const up = ev => {
      handle.classList.remove("dragging");
      document.body.classList.remove("resizing");
      try { handle.releasePointerCapture(ev.pointerId); } catch {}
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      handle.removeEventListener("pointercancel", up);
      savePanes();
      draw(true);
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
    handle.addEventListener("pointercancel", up);
  });
  handle.addEventListener("dblclick", () => { onReset(); applyPanes(); savePanes(); draw(true); });
  // keyboard: the handle is focusable, so arrows should move it
  handle.addEventListener("keydown", e => {
    const step = e.shiftKey ? 40 : 12;
    const horiz = handle.getAttribute("aria-orientation") === "vertical";
    const k = e.key;
    if(horiz && k === "ArrowLeft")  panes.side = (panes.side||322) + step;
    else if(horiz && k === "ArrowRight") panes.side = (panes.side||322) - step;
    else if(!horiz && k === "ArrowUp")   panes.adv = (panes.adv || $("advisory").offsetHeight) + step;
    else if(!horiz && k === "ArrowDown") panes.adv = (panes.adv || $("advisory").offsetHeight) - step;
    else return;
    e.preventDefault(); applyPanes(); savePanes(); draw(true);
  });
}

applyPanes();
dragSplit($("splitSide"),
  e => { panes.side = window.innerWidth - e.clientX; },
  () => { panes.side = paneDefaults().side; });
dragSplit($("splitAdv"),
  e => { panes.adv = window.innerHeight - e.clientY; },
  () => { panes.adv = null; });
window.addEventListener("resize", applyPanes);

(function(){
  const box = $("mapScroll");
  box.addEventListener("wheel", e => {
    if(!fitView) return;
    e.preventDefault();
    zoomAt(e.deltaY < 0 ? 1.18 : 1/1.18, e.clientX, e.clientY);
  }, {passive:false});

  box.addEventListener("pointerdown", e => {
    if(!view || !fitView || view.w >= fitView.w) return;   // nothing to pan at fit
    if(e.button !== 0 || e.target.closest(".hit,.plate")) return;
    panning = {x:e.clientX, y:e.clientY, vx:view.x, vy:view.y};
    box.setPointerCapture(e.pointerId);
    box.classList.add("grabbing");
  });
  box.addEventListener("pointermove", e => {
    if(!panning) return;
    const r = $("map").getBoundingClientRect();
    view.x = panning.vx - (e.clientX - panning.x) * (view.w / r.width);
    view.y = panning.vy - (e.clientY - panning.y) * (view.h / r.height);
    clampView(); applyView();
  });
  const stop = e => { if(panning){ panning = null; box.classList.remove("grabbing");
    try{ box.releasePointerCapture(e.pointerId); }catch{} } };
  box.addEventListener("pointerup", stop);
  box.addEventListener("pointercancel", stop);
  box.addEventListener("dblclick", () => resetView());
})();

window.addEventListener("hashchange", () => {
  const h = readHash();
  const want = h ? h.index : Math.min(Math.max(0, MODEL.defaultIndex || 0), Math.max(0, MODEL.projects.length-1));
  const branch = h ? h.branch : null;
  if(want === projIndex && branch === selected) return;
  projIndex = want;
  $("proj").value = String(projIndex);
  load(branch);
});
window.addEventListener("keydown", e => { if(e.key==="Escape" && selected) select(null); });
let rt; window.addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => draw(true), 120); });
</script>
</body>
</html>`;

module.exports = { render };
