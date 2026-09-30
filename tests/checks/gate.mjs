/**
 * meryem-app tests — checks/gate.mjs
 *
 * Covers the "beni ne kadar seviyorsun" gate: due/not-due timing, the growing-Yes/shrinking-No
 * question with its press-4 hop-away escalation, No's label/mood progression, the love meter's
 * one-way slider, the birthday finale's openBirthdaySurprise hook, completion persisting the
 * played-year flag and un-hiding the header replay button, preview mode's every-load/no-persist
 * behaviour, reduced motion, contrast, and the redrawn hug's arm geometry.
 */
import { openApp, sleep } from "../harness.mjs";

export const name = "gate";

const NOT_DUE_NOW = "2026-10-03T23:59:00";
const DUE_NOW = "2026-10-04T00:01:00";

async function waitUntil(fn, timeoutMs) {
  const deadline = Date.now() + (timeoutMs || 2500);
  let last;
  for (;;) {
    last = await fn();
    if (last) return last;
    if (Date.now() >= deadline) return last;
    await sleep(40);
  }
}

async function overlayHidden(page) {
  return page.eval(() => document.getElementById("gate-overlay").hidden);
}

async function yesAndSkip(page) {
  await page.tap(".gate-btn-yes");
  await page.eval(() => new Promise((r) => setTimeout(r, 40)));
  await page.tap(".gate-reply");
  await page.eval(() => new Promise((r) => setTimeout(r, 40)));
}

async function fillMeterToMax(page) {
  for (let i = 0; i < 12; i++) {
    const v = await page.eval(() => Number(document.getElementById("gate-meter-slider").getAttribute("aria-valuenow")));
    if (v >= 100) break;
    await page.tap(".gate-btn-more");
    await page.settle();
  }
}

export async function run({ page, check }) {
  // 1. Not due before her birthday starts
  await openApp(page, { signedIn: true, now: NOT_DUE_NOW });
  await page.eval(() => new Promise((r) => setTimeout(r, 300))); // auth stub + initFeatures settle
  await check("gate: not due before her birthday, overlay stays hidden", async () => {
    const hidden = await overlayHidden(page);
    return { ok: hidden === true, detail: "hidden=" + hidden };
  });

  // 2. Due and visible right after her birthday starts
  await openApp(page, { signedIn: true, now: DUE_NOW });
  const becameVisible = await waitUntil(async () => (await overlayHidden(page)) === false, 2500);
  await check("gate: due and visible right after her birthday starts", async () => ({
    ok: becameVisible === true,
    detail: "hidden=" + (await overlayHidden(page)),
  }));
  await check("gate: body scroll is locked while the gate is open", async () => {
    const overflow = await page.eval(() => document.body.style.overflow);
    return { ok: overflow === "hidden", detail: overflow };
  });

  // 2b. The tiled-heart background layer reads full-bleed (edge to edge, ignoring #gate-overlay's
  //     own side padding) with a small tile — read back from the live computed style/geometry
  //     (Constitution 2.6), not asserted from the source. A prior version painted the pattern on
  //     the padded, centred .gate-shell instead, which cut it off in a hard line ~20px in from
  //     each screen edge (2026-09-28 review).
  const bgPattern = await page.eval(() => {
    const el = document.querySelector("#gate-overlay .gate-bg-pattern");
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    const tiles = cs.backgroundSize.split(",").map((layer) => layer.trim().split(/\s+/).map(parseFloat));
    return {
      left: r.left, right: r.right, vw: document.documentElement.clientWidth,
      layerCount: tiles.length, maxTilePx: Math.max.apply(null, tiles.flat()),
    };
  });
  await check("gate: the heart-pattern layer is full-bleed with a small tile", () => ({
    ok: !!bgPattern && bgPattern.left === 0 && bgPattern.right === bgPattern.vw
      && bgPattern.layerCount >= 2 && bgPattern.maxTilePx > 0 && bgPattern.maxTilePx <= 48,
    detail: JSON.stringify(bgPattern),
  }));

  // 3. Opener question is showing — drive 25 real No taps, sampling growth/shrink/label/mood,
  //    and (from the 4th press) the no-overlap / stays-in-viewport guarantee.
  const yesSizes = [];
  const noHeights = [];
  const labels = [];
  const moods = [];
  let intersectAfter4 = null, withinViewportAfter4 = null, final25 = null;

  for (let n = 1; n <= 25; n++) {
    await page.tap(".gate-btn-no");
    await page.settle();
    const s = await page.eval(() => {
      const yes = document.querySelector(".gate-btn-yes");
      const no = document.querySelector(".gate-btn-no");
      const bearSvg = document.querySelector(".gate-bear-slot svg");
      const yr = yes.getBoundingClientRect();
      const nr = no.getBoundingClientRect();
      return {
        yesWidth: yr.width, yesRect: { left: yr.left, right: yr.right, top: yr.top, bottom: yr.bottom },
        noHeight: nr.height, noRect: { left: nr.left, right: nr.right, top: nr.top, bottom: nr.bottom },
        label: no.textContent, mood: bearSvg && bearSvg.getAttribute("data-mood"),
        vw: document.documentElement.clientWidth, vh: document.documentElement.clientHeight,
      };
    });
    if (n <= 5) { yesSizes.push(s.yesWidth); noHeights.push(s.noHeight); }
    labels.push(s.label);
    moods.push(s.mood);
    if (n === 4 || n === 25) {
      const overlaps = s.noRect.left < s.yesRect.right && s.noRect.right > s.yesRect.left
        && s.noRect.top < s.yesRect.bottom && s.noRect.bottom > s.yesRect.top;
      const inViewport = s.noRect.left >= 0 && s.noRect.top >= 0 && s.noRect.right <= s.vw && s.noRect.bottom <= s.vh;
      if (n === 4) { intersectAfter4 = overlaps; withinViewportAfter4 = inViewport; }
      if (n === 25) final25 = { noHeight: s.noHeight, yesWidth: s.yesWidth, vw: s.vw, overlaps, inViewport };
    }
  }

  await check("gate: 5 No presses grow Yes and shrink No each time", () => {
    const yesGrows = yesSizes.every((w, i) => i === 0 || w > yesSizes[i - 1]);
    const noShrinks = noHeights.every((h, i) => i === 0 || h < noHeights[i - 1]);
    return { ok: yesGrows && noShrinks, detail: JSON.stringify({ yesSizes, noHeights }) };
  });

  await check("gate: No's label follows CONTENT.gate.noLabels", async () => {
    const expected = await page.eval(() => CONTENT.gate.noLabels);
    const ok = labels.every((l, i) => l === expected[Math.min(i + 1, expected.length - 1)]);
    return { ok, detail: JSON.stringify({ labels: labels.slice(0, 6), expected }) };
  });

  await check("gate: the bear's mood worsens with presses", () => {
    const expected = moods.map((_, i) => {
      const n = i + 1;
      if (n <= 2) return "pleading";
      if (n <= 4) return "teary";
      return "crying";
    });
    const ok = moods.every((m, i) => m === expected[i]);
    return { ok, detail: JSON.stringify({ moods: moods.slice(0, 8), expected: expected.slice(0, 8) }) };
  });

  await check("gate: after the 4th press No never overlaps Yes and stays in the viewport", () => ({
    ok: intersectAfter4 === false && withinViewportAfter4 === true,
    detail: JSON.stringify({ intersectAfter4, withinViewportAfter4 }),
  }));

  await check("gate: after 25 presses No is still >=24px tall and Yes fits the viewport", () => ({
    ok: !!final25 && final25.noHeight >= 24 && final25.yesWidth <= final25.vw - 32
      && final25.overlaps === false && final25.inViewport === true,
    detail: JSON.stringify(final25),
  }));

  // 3b. Yes and the hopping No resist iOS's long-press callout/selection and double-tap zoom
  // (m4). -webkit-touch-callout has no computed-style readback in a headless Chromium browser, so
  // only touch-action and user-select — the two properties that actually change measurable
  // browser behaviour (double-tap zoom, text selection) — are read back here; -webkit-touch-callout
  // is applied via the same .gate-btn rule and left unverified by this check (Constitution 4.6).
  const yesNoTouch = await page.eval(() => {
    const yes = getComputedStyle(document.querySelector(".gate-btn-yes"));
    const no = getComputedStyle(document.querySelector(".gate-btn-no"));
    return {
      yesTouchAction: yes.touchAction, yesUserSelect: yes.userSelect,
      noTouchAction: no.touchAction, noUserSelect: no.userSelect,
    };
  });
  await check("gate: Yes and the hopping No have touch-action:manipulation and user-select:none", () => ({
    ok: yesNoTouch.yesTouchAction === "manipulation" && yesNoTouch.yesUserSelect === "none"
      && yesNoTouch.noTouchAction === "manipulation" && yesNoTouch.noUserSelect === "none",
    detail: JSON.stringify(yesNoTouch),
  }));

  // 4. Say yes through the rest of the automatic birthday sequence to reach the finale, spying
  //    openBirthdaySurprise beforehand (per the task: spy it before finishing).
  await page.eval(() => { window.__gateSpy = false; window.openBirthdaySurprise = function () { window.__gateSpy = true; }; });
  await yesAndSkip(page); // finishes the (maxed-out) opener question
  await yesAndSkip(page); // birthday[0]
  await yesAndSkip(page); // pool 1
  await yesAndSkip(page); // pool 2
  await yesAndSkip(page); // pool 3

  // meter step
  const meterInitial = await page.eval(() => ({
    disabled: document.querySelector(".gate-meter-actions .gate-btn-yes").disabled,
    value: Number(document.getElementById("gate-meter-slider").getAttribute("aria-valuenow")),
  }));

  // '+ daha çok' resists the same long-press callout/selection and double-tap zoom (m4).
  const moreTouch = await page.eval(() => {
    const cs = getComputedStyle(document.querySelector(".gate-btn-more"));
    return { touchAction: cs.touchAction, userSelect: cs.userSelect };
  });
  await check("gate: '+ daha çok' has touch-action:manipulation and user-select:none", () => ({
    ok: moreTouch.touchAction === "manipulation" && moreTouch.userSelect === "none",
    detail: JSON.stringify(moreTouch),
  }));
  const sliderBox = await page.box("#gate-meter-slider");
  const cx = sliderBox.x + sliderBox.width / 2;
  const midY = sliderBox.y + sliderBox.height * 0.4;
  const bottomY = sliderBox.y + sliderBox.height - 6;

  // raise it partway via a REAL CDP drag (mousedown/mousemove/mouseup, same primitive page.tap uses)
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: midY, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: midY });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: midY, button: "left", clickCount: 1 });
  await page.settle();
  const afterRaise = await page.eval(() => Number(document.getElementById("gate-meter-slider").getAttribute("aria-valuenow")));

  // attempt to decrease via a real drag toward the bottom — must be ignored
  await page.send("Input.dispatchMouseEvent", { type: "mousePressed", x: cx, y: bottomY, button: "left", clickCount: 1 });
  await page.send("Input.dispatchMouseEvent", { type: "mouseMoved", x: cx, y: bottomY });
  await page.send("Input.dispatchMouseEvent", { type: "mouseReleased", x: cx, y: bottomY, button: "left", clickCount: 1 });
  await page.settle();
  const afterDragDown = await page.eval(() => Number(document.getElementById("gate-meter-slider").getAttribute("aria-valuenow")));

  // attempt to decrease via ArrowLeft — must be ignored
  await page.eval(() => {
    var el = document.getElementById("gate-meter-slider");
    el.focus();
    el.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowLeft", bubbles: true, cancelable: true }));
  });
  const afterArrowLeft = await page.eval(() => Number(document.getElementById("gate-meter-slider").getAttribute("aria-valuenow")));

  let contDisabledBeforeMax = null;
  const firstV = await page.eval(() => Number(document.getElementById("gate-meter-slider").getAttribute("aria-valuenow")));
  if (firstV < 100) contDisabledBeforeMax = await page.eval(() => document.querySelector(".gate-meter-actions .gate-btn-yes").disabled);
  await fillMeterToMax(page);
  const afterMax = await page.eval(() => ({
    value: Number(document.getElementById("gate-meter-slider").getAttribute("aria-valuenow")),
    contDisabled: document.querySelector(".gate-meter-actions .gate-btn-yes").disabled,
    label: document.querySelector(".gate-meter-label").textContent,
  }));

  await check("gate: the love meter cannot decrease and only enables its button at max", () => ({
    ok: meterInitial.disabled === true && afterRaise > 0 && afterDragDown === afterRaise && afterArrowLeft === afterRaise
      && afterMax.value === 100 && afterMax.contDisabled === false && contDisabledBeforeMax === true
      && afterMax.label === "Sonsuz ∞",
    detail: JSON.stringify({ meterInitial, afterRaise, afterDragDown, afterArrowLeft, afterMax, contDisabledBeforeMax }),
  }));

  await page.tap(".gate-meter-actions .gate-btn-yes"); // continue past the meter
  await page.settle();
  await yesAndSkip(page); // birthday[1]

  // finale
  const finaleReady = await waitUntil(() => page.eval(() => !!document.querySelector(".gate-finale-btn")), 1500);
  await page.tap(".gate-finale-btn");
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));

  const afterFinale = await page.eval(() => ({
    spy: window.__gateSpy,
    flag: (function () { try { return localStorage.getItem("meryem-gate-played-year"); } catch (e) { return null; } })(),
    overlayHidden: document.getElementById("gate-overlay").hidden,
    replayHidden: document.getElementById("gate-replay-btn").hidden,
  }));
  await check("gate: the birthday finale calls openBirthdaySurprise", () => ({
    ok: finaleReady === true && afterFinale.spy === true,
    detail: JSON.stringify(afterFinale),
  }));
  await check("gate: completing the gate stores the flag and un-hides the replay button", () => ({
    ok: afterFinale.flag === "2026" && afterFinale.replayHidden === false && afterFinale.overlayHidden === true,
    detail: JSON.stringify(afterFinale),
  }));

  // 5. Reopening the same session/year shows no gate
  await openApp(page, { signedIn: true, now: DUE_NOW, keepStorage: true });
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  await check("gate: the next open (same year) shows no gate", async () => {
    const hidden = await overlayHidden(page);
    return { ok: hidden === true, detail: "hidden=" + hidden };
  });

  // 6. Preview mode: due on every load, and stores nothing even after a full playthrough
  await openApp(page, { signedIn: true, query: "?onizleme=dogumgunu" });
  const previewVisible = await waitUntil(async () => (await overlayHidden(page)) === false, 2000);
  await check("gate: preview mode shows the gate every load and stores nothing", () => ({
    ok: previewVisible === true,
    detail: "visible=" + previewVisible,
  }));
  // preview is always "due" (storageSet no-ops there), so this is the automatic BIRTHDAY-shaped
  // play (startGateIfDue, not replayGate): opener + birthday[0] + 3 pool = 5 questions, then the
  // meter, then birthday[1], then the finale.
  await yesAndSkip(page); // opener
  await yesAndSkip(page); // birthday[0]
  await yesAndSkip(page); // pool 1
  await yesAndSkip(page); // pool 2
  await yesAndSkip(page); // pool 3
  await fillMeterToMax(page);
  await page.tap(".gate-meter-actions .gate-btn-yes");
  await page.eval(() => new Promise((r) => setTimeout(r, 40)));
  await yesAndSkip(page); // birthday[1]
  const finaleReady2 = await waitUntil(() => page.eval(() => !!document.querySelector(".gate-finale-btn")), 1500);
  await page.tap(".gate-finale-btn");
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  const previewStorage = await page.storageDump();
  await check("gate: preview mode never persists the played-year flag", () => ({
    ok: finaleReady2 === true && !previewStorage["meryem-gate-played-year"],
    detail: JSON.stringify(previewStorage),
  }));

  await openApp(page, { signedIn: true, query: "?onizleme=dogumgunu", keepStorage: true });
  const previewVisibleAgain = await waitUntil(async () => (await overlayHidden(page)) === false, 2000);
  await check("gate: preview mode shows the gate again on the very next load", () => ({
    ok: previewVisibleAgain === true,
    detail: "visible=" + previewVisibleAgain,
  }));

  // 7. Replay button: seed the flag so it is visible without a real playthrough, well past due.
  // Also seed the birthday feature's own "seen" flag — birthday.js's independent auto-open
  // correctly backs off only while isGateDue() is true (see js/birthday.js maybeAutoOpenBirthday),
  // and this scenario deliberately makes the gate NOT due, so without this it would legitimately
  // open its own full-screen overlay on top of the header and shadow the replay button beneath it.
  await openApp(page, {
    signedIn: true,
    now: "2026-11-01T12:00:00",
    storage: { "meryem-gate-played-year": "2026", "meryem-birthday-seen-year": "2026" },
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  const beforeReplay = await page.eval(() => ({
    overlayHidden: document.getElementById("gate-overlay").hidden,
    replayHidden: document.getElementById("gate-replay-btn").hidden,
  }));
  await page.tap("#gate-replay-btn");
  await page.eval(() => new Promise((r) => setTimeout(r, 80)));
  const afterReplayTap = await page.eval(() => ({
    overlayHidden: document.getElementById("gate-overlay").hidden,
    questionText: document.querySelector(".gate-question-text") ? document.querySelector(".gate-question-text").textContent : null,
    openerText: CONTENT.gate.opener.q,
  }));
  await check("gate: replayGate() works from the header button", () => ({
    ok: beforeReplay.overlayHidden === true && beforeReplay.replayHidden === false
      && afterReplayTap.overlayHidden === false && afterReplayTap.questionText === afterReplayTap.openerText,
    detail: JSON.stringify({ beforeReplay, afterReplayTap }),
  }));

  // 8. Reduced motion: no heart burst on Yes, and the press-4 hop still keeps No clear of Yes
  await openApp(page, { signedIn: true, now: DUE_NOW, reducedMotion: true });
  await waitUntil(async () => (await overlayHidden(page)) === false, 2000);
  const burstBefore = await page.eval(() => document.querySelectorAll(".fx-heart-burst").length);
  await page.tap(".gate-btn-yes");
  await page.eval(() => new Promise((r) => setTimeout(r, 40)));
  const burstAfter = await page.eval(() => document.querySelectorAll(".fx-heart-burst").length);
  await check("gate: reduced motion skips the heart burst on Yes", () => ({
    ok: burstBefore === 0 && burstAfter === 0,
    detail: JSON.stringify({ burstBefore, burstAfter }),
  }));
  await page.tap(".gate-reply");
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  for (let n = 0; n < 4; n++) { await page.tap(".gate-btn-no"); }
  await page.settle();
  const reducedHop = await page.eval(() => {
    const yes = document.querySelector(".gate-btn-yes").getBoundingClientRect();
    const no = document.querySelector(".gate-btn-no").getBoundingClientRect();
    return {
      noPosition: getComputedStyle(document.querySelector(".gate-btn-no")).position,
      overlaps: no.left < yes.right && no.right > yes.left && no.top < yes.bottom && no.bottom > yes.top,
    };
  });
  await check("gate: reduced motion still hops No clear of Yes after the 4th press", () => ({
    ok: reducedHop.noPosition === "fixed" && reducedHop.overlaps === false,
    detail: JSON.stringify(reducedHop),
  }));

  // 9. The redrawn hug: read the actual rendered geometry back (Constitution 2.6) — each arm's
  //    hand must land clear of BOTH bears' heads (a real head-circle radius, not a sign check) but
  //    not so far past the far head that it reads as belly/hip height instead of shoulder/back.
  //    Renders hugSVG() into the live document (getCTM() needs real layout) so both figures'
  //    independent translate+rotate transforms are applied exactly as the browser would apply
  //    them. getCTM() lands in the SVG's own RENDERED-pixel space (scaled by width/viewBox, not
  //    the raw viewBox numbers — verified empirically, not assumed), so each head's radius is
  //    measured the same way (centre-to-rim, through the same transform) rather than read off the
  //    source's "r" attribute — the two bounds below are then expressed as a ratio of that
  //    measured radius, immune to whatever scale getCTM happens to use.
  const hugGeom = await page.eval(() => {
    const holder = document.createElement("div");
    holder.style.position = "fixed";
    holder.style.left = "-9999px";
    holder.style.top = "0";
    document.body.appendChild(holder);
    holder.innerHTML = hugSVG({ size: 200 });
    const svg = holder.querySelector("svg");
    const all = (sel) => Array.prototype.slice.call(svg.querySelectorAll(sel));
    const pt = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p; };
    // Rendered-pixel space: every point is pushed through its own element's screen matrix, so the
    // figures' translate+rotate transforms are applied exactly as the browser applies them.
    const toScreen = (el, x, y) => pt(x, y).matrixTransform(el.getScreenCTM());
    const inFill = (el, s) => el.isPointInFill(pt(s.x, s.y).matrixTransform(el.getScreenCTM().inverse()));
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    const bboxCentre = (el) => { const b = el.getBBox(); return toScreen(el, b.x + b.width / 2, b.y + b.height / 2); };
    // Points along an element's outline, in screen space: a path by arc length, a circle by angle.
    const outline = (el, n) => {
      const out = [];
      if (el.tagName.toLowerCase() === "circle") {
        const cx = Number(el.getAttribute("cx")), cy = Number(el.getAttribute("cy")), r = Number(el.getAttribute("r"));
        for (let i = 0; i < n; i++) out.push(toScreen(el, cx + r * Math.cos((2 * Math.PI * i) / n), cy + r * Math.sin((2 * Math.PI * i) / n)));
      } else {
        const len = el.getTotalLength();
        for (let i = 0; i <= n; i++) { const q = el.getPointAtLength((len * i) / n); out.push(toScreen(el, q.x, q.y)); }
      }
      return out;
    };
    const heads = all("path.kawaii-bear-head");
    const bodies = all("ellipse.kawaii-bear-hug-body");
    const headC = heads.map(bboxCentre);
    const bodyC = bodies.map(bboxCentre);
    const nearest = (c, list) => (dist(c, list[0]) < dist(c, list[1]) ? 0 : 1);
    const inAnyHead = (s) => heads.some((h) => inFill(h, s));

    // Eyes: every sample of each ^^ arc sits inside its OWN head and inside NEITHER the other head.
    const eyes = all('.kawaii-bear-face path[stroke-width="3.4"]').map((e) => {
      const pts = outline(e, 8);
      const own = nearest(bboxCentre(e), headC);
      return { inOwn: pts.filter((s) => inFill(heads[own], s)).length, inOther: pts.filter((s) => inFill(heads[1 - own], s)).length, n: pts.length };
    });
    // How much of one head's outline lies inside the other head: 0 = tangent, 1 = coincident.
    const headOverlap = heads.length === 2 ? outline(heads[0], 60).filter((s) => inFill(heads[1], s)).length / 61 : null;

    // Ears: the share of each outer ear's rim that lies OUTSIDE its own head (0 = swallowed by it).
    const earsOuter = all(".kawaii-bear-ear > circle:first-child").map((c) => {
      const pts = outline(c, 24);
      const own = nearest(bboxCentre(c), headC);
      return { outside: pts.filter((s) => !inFill(heads[own], s)).length / pts.length, centreInOther: inFill(heads[1 - own], bboxCentre(c)) };
    });
    const earsInner = all(".kawaii-bear-ear > circle:last-child").length;

    // Arms + paws: each arm starts under its own bear's chin and ends in a paw on the OTHER bear's
    // shoulder. The paw must lie on the other body, clear of every head (rim included), above the
    // body's middle (shoulder, not belly); no point of the arm may sit below the body's middle.
    const arms = all("path.kawaii-bear-hug-arm");
    const paws = all("circle.kawaii-bear-hug-paw");
    const armInfo = arms.map((a) => {
      const pts = outline(a, 20);
      const own = nearest(pts[0], bodyC);
      const paw = paws.find((p) => dist(bboxCentre(p), pts[pts.length - 1]) < 6);
      const pc = paw ? bboxCentre(paw) : null;
      return {
        hasPaw: !!paw,
        pawOnFarBody: !!paw && inFill(bodies[1 - own], pc) && !inFill(bodies[own], pc),
        pawRimInHeads: paw ? outline(paw, 16).filter(inAnyHead).length : -1,
        armEndInHead: inAnyHead(pts[pts.length - 1]),
        armLowestY: Math.max.apply(null, pts.map((s) => s.y)),
        bodyMiddleY: bodyC[1 - own].y,
        pawAboveMiddle: !!paw && pc.y < bodyC[1 - own].y,
      };
    });
    // Hearts: exactly one, above both heads and between them.
    const hearts = all(".kawaii-bear-heart").map(bboxCentre);
    const heartInfo = hearts.map((h) => ({
      aboveHeads: headC.length === 2 && h.y < Math.min(headC[0].y, headC[1].y),
      between: headC.length === 2 && h.x > Math.min(headC[0].x, headC[1].x) && h.x < Math.max(headC[0].x, headC[1].x),
    }));
    document.body.removeChild(holder);
    return {
      headCount: heads.length, bodyCount: bodies.length, eyes, headOverlap,
      earsOuter, earsInner, armCount: arms.length, pawCount: paws.length, armInfo, heartCount: hearts.length, heartInfo,
    };
  });
  // Each arm's paw rests on the far bear's shoulder: on that body, clear of every head, above the
  // body's middle; and no arm point dips below that middle (the old ey=70 bug landed at belly/hip).
  await check("gate: hugSVG's arms rest at shoulder height, clear of both faces", () => ({
    ok: hugGeom.headCount === 2 && hugGeom.bodyCount === 2 && hugGeom.armCount === 2 && hugGeom.pawCount === 2
      && hugGeom.armInfo.length === 2
      && hugGeom.armInfo.every((a) => a.hasPaw && a.pawOnFarBody && a.pawRimInHeads === 0 && !a.armEndInHead
        && a.pawAboveMiddle && a.armLowestY < a.bodyMiddleY),
    detail: JSON.stringify(hugGeom.armInfo),
  }));

  // Both faces stay fully visible: every ^^ eye lies wholly inside its own head and touches neither
  // the other head; the heads themselves may touch at the cheek but not bury each other (the old
  // bug buried the right bear's head over about half of the left bear's face).
  const HEAD_OVERLAP_MAX = 0.12;
  await check("gate: hugSVG's heads clear each other's face, touching at most lightly at the cheek", () => ({
    ok: hugGeom.headOverlap !== null && hugGeom.headOverlap <= HEAD_OVERLAP_MAX
      && hugGeom.eyes.length === 4 && hugGeom.eyes.every((e) => e.inOwn === e.n && e.inOther === 0),
    detail: JSON.stringify({ headOverlap: hugGeom.headOverlap, eyes: hugGeom.eyes }),
  }));

  // Both bears' ears must actually show: each ear circle (with its cream inner circle) pokes
  // outside its own head instead of sitting hidden behind it (M3, 2026-09-28 review — "two bald
  // round heads"), and is not buried under the OTHER head either.
  const EAR_OUTSIDE_MIN = 0.35;
  await check("gate: hugSVG's ears (with their cream inner circle) extend outside the head circle", () => ({
    ok: hugGeom.earsOuter.length === 4 && hugGeom.earsInner === 4
      && hugGeom.earsOuter.every((e) => e.outside >= EAR_OUTSIDE_MIN && !e.centreInOther),
    detail: JSON.stringify({ earsInner: hugGeom.earsInner, earsOuter: hugGeom.earsOuter }),
  }));

  // One heart, floating above the two heads and between them.
  await check("gate: hugSVG carries exactly one heart, above and between the two heads", () => ({
    ok: hugGeom.heartCount === 1 && hugGeom.heartInfo[0].aboveHeads && hugGeom.heartInfo[0].between,
    detail: JSON.stringify({ heartCount: hugGeom.heartCount, heartInfo: hugGeom.heartInfo }),
  }));

  // 10. Contrast (window.__app.readable(), installed by harness.mjs on every goto)
  await openApp(page, { signedIn: true, now: DUE_NOW });
  await waitUntil(async () => (await overlayHidden(page)) === false, 2000);
  const contrastQuestion = await page.eval(() => window.__app.readable(document.querySelector(".gate-question-text")));
  await page.tap(".gate-btn-yes");
  await page.eval(() => new Promise((r) => setTimeout(r, 40)));
  const contrastReply = await page.eval(() => window.__app.readable(document.querySelector(".gate-reply")));
  await check("gate: question text and reply text reach 4.5:1 contrast", () => ({
    ok: contrastQuestion >= 4.5 && contrastReply >= 4.5,
    detail: JSON.stringify({ contrastQuestion, contrastReply }),
  }));
}

export const mutants = [
  {
    id: "gate-due-inequality",
    file: "js/gate.js",
    find: "storageGet(GATE_FLAG_KEY) !== String(birthdayYear())",
    replace: "storageGet(GATE_FLAG_KEY) === String(birthdayYear())",
    expect: "gate: due and visible right after her birthday starts",
  },
  {
    // The JS side intentionally no longer clamps the height itself (see _applyNoScale) — this
    // CSS rule is the ONE real floor, so this is where the guard actually lives.
    id: "gate-no-height-floor",
    file: "css/gate.css",
    find: "min-height: 24px; /* the real floor — gate.js computes height unclamped and lets this win */",
    replace: "min-height: 4px;",
    expect: "gate: after 25 presses No is still >=24px tall and Yes fits the viewport",
  },
  {
    id: "gate-mood-never-crying",
    file: "js/gate.js",
    find: "if (n <= 4) return 'teary';",
    replace: "if (n <= 40) return 'teary';",
    expect: "gate: the bear's mood worsens with presses",
  },
  {
    id: "gate-hop-no-avoidance",
    file: "js/gate.js",
    find: "var x = minX, y = minY, tries = 0, ok = false;",
    replace: "var x = yesRect.left, y = yesRect.top, ok = true, tries = HOP_MAX_TRIES;",
    expect: "gate: after the 4th press No never overlaps Yes and stays in the viewport",
  },
  {
    id: "gate-replay-btn-visibility",
    file: "js/gate.js",
    find: "btn.hidden = !(flagPresent || (_completedThisSession && isPreviewMode()));",
    replace: "btn.hidden = true;",
    expect: "gate: completing the gate stores the flag and un-hides the replay button",
  },
  {
    // Reintroduces the original bug: the pattern back on the padded, centred .gate-shell instead
    // of its own full-bleed layer — cut off ~20px in from each edge, not left:0.
    id: "gate-bg-pattern-inset",
    file: "css/gate.css",
    find: "  position: absolute;\n  inset: 0;\n  z-index: -1;",
    replace: "  position: static;\n  z-index: -1;",
    expect: "gate: the heart-pattern layer is full-bleed with a small tile",
  },
  {
    // Reintroduces the original bug's other half: big (~120px-class) hearts instead of a small tile.
    id: "gate-bg-pattern-large-tile",
    file: "css/gate.css",
    find: "background-size: 44px 44px, 44px 44px;",
    replace: "background-size: 96px 96px, 96px 96px;",
    expect: "gate: the heart-pattern layer is full-bleed with a small tile",
  },
  {
    // Pushes the two figures together (HUG_CX 75 -> 105): the heads bury each other's faces.
    id: "gate-hug-head-overlap",
    file: "js/bears.js",
    find: "var HUG_CX = 79;",
    replace: "var HUG_CX = 108;",
    expect: "gate: hugSVG's heads clear each other's face, touching at most lightly at the cheek",
  },
  {
    // Both ears moved inside the head (the shared head builder): swallowed by the head shape, the M3 bug.
    id: "gate-hug-ears-hidden",
    file: "js/bears.js",
    find: "svg += _bearEar(id, 'l', 32, 40, 27, 12.5, outlineW);\n  svg += _bearEar(id, 'r', 168, 40, 27, 12.5, outlineW);",
    replace: "svg += _bearEar(id, 'l', 90, 50, 27, 12.5, outlineW);\n  svg += _bearEar(id, 'r', 110, 50, 27, 12.5, outlineW);",
    expect: "gate: hugSVG's ears (with their cream inner circle) extend outside the head circle",
  },
  {
    // Keeps the ear COUNT right (4 outer + 4 inner) but drags the left ears down into the head - proves the check gates on position, not on presence.
    id: "gate-hug-ear-geometry",
    file: "js/bears.js",
    find: "svg += _bearEar(id, 'l', 32, 40, 27, 12.5, outlineW);",
    replace: "svg += _bearEar(id, 'l', 60, 70, 27, 12.5, outlineW);",
    expect: "gate: hugSVG's ears (with their cream inner circle) extend outside the head circle",
  },
  {
    // m4: touch-action is the one property of the four that changes measurable browser behaviour
    // (double-tap zoom) and has a computed-style readback — the anchor is unique to .gate-btn
    // (.gate-meter-heart's own touch-action is "none", a different value/string).
    id: "gate-btn-touch-action",
    file: "css/gate.css",
    find: "  touch-action: manipulation;",
    replace: "  touch-action: auto;",
    expect: "gate: Yes and the hopping No have touch-action:manipulation and user-select:none",
  },
  {
    id: "gate-meter-monotonic",
    file: "js/gate.js",
    find: "if (v <= _state.meterValue) return; /* only goes up — a lower attempt is silently ignored */",
    replace: "if (false) return;",
    expect: "gate: the love meter cannot decrease and only enables its button at max",
  },
  {
    // Paws up at eye height (HUG_PAW_Y 136 -> 84): each paw lands on the far bear's face.
    id: "gate-hug-arm-face-height",
    file: "js/bears.js",
    find: "var HUG_PAW_Y = 136;",
    replace: "var HUG_PAW_Y = 84;",
    expect: "gate: hugSVG's arms rest at shoulder height, clear of both faces",
  },
  {
    // Paws down at belly height (HUG_PAW_Y 136 -> 162): a bar across the bellies, not a hug round the shoulders.
    id: "gate-hug-arm-belly-overshoot",
    file: "js/bears.js",
    find: "var HUG_PAW_Y = 136;",
    replace: "var HUG_PAW_Y = 162;",
    expect: "gate: hugSVG's arms rest at shoulder height, clear of both faces",
  },
  {
    // The heart moved from above the heads to below them.
    id: "gate-hug-heart-below",
    file: "js/bears.js",
    find: "translate(130,-2) scale(0.62)",
    replace: "translate(130,150) scale(0.62)",
    expect: "gate: hugSVG carries exactly one heart, above and between the two heads",
  },
  {
    id: "gate-reduced-motion-burst",
    file: "js/gate.js",
    find: "if (!prefersReducedMotion()) fxHeartBurst(yesBtn); /* reduced motion: no burst at all */",
    replace: "fxHeartBurst(yesBtn);",
    expect: "gate: reduced motion skips the heart burst on Yes",
  },
];

export const shots = [
  { name: "due", open: { signedIn: true, now: DUE_NOW } },
  {
    name: "no-pressed",
    open: { signedIn: true, now: DUE_NOW },
    act: async (page) => {
      for (let n = 0; n < 6; n++) await page.tap(".gate-btn-no");
      await page.settle();
    },
  },
  {
    name: "meter",
    open: { signedIn: true, now: DUE_NOW },
    act: async (page) => {
      await yesAndSkip(page); // opener
      await yesAndSkip(page); // birthday[0]
      await yesAndSkip(page); // pool 1
      await yesAndSkip(page); // pool 2
      await yesAndSkip(page); // pool 3 — now on the meter
      await page.tap(".gate-btn-more");
      await page.tap(".gate-btn-more");
      await page.tap(".gate-btn-more");
      await page.settle();
    },
  },
  {
    name: "finale",
    open: { signedIn: true, now: DUE_NOW },
    act: async (page) => {
      await yesAndSkip(page);
      await yesAndSkip(page);
      await yesAndSkip(page);
      await yesAndSkip(page);
      await yesAndSkip(page);
      await fillMeterToMax(page);
      await page.tap(".gate-meter-actions .gate-btn-yes");
      await page.eval(() => new Promise((r) => setTimeout(r, 40)));
      await yesAndSkip(page);
      await page.eval(() => new Promise((r) => setTimeout(r, 60)));
    },
  },
  { name: "reduced-motion-due", open: { signedIn: true, now: DUE_NOW, reducedMotion: true } },
];
