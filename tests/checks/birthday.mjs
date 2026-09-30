/**
 * meryem-app tests — checks/birthday.mjs
 *
 * Covers the 🎁 tab (locked countdown / unlocked ready card, live flip at midnight, the nav-icon
 * glow), maybeAutoOpenBirthday()'s three guards (already seen, a due gate, preview mode's
 * no-persist), and every scene of the overlay surprise: title, cake (lit-candle staging, tap and
 * mic-RMS blow-out via a spied getUserMedia/AudioContext, confetti, melody), balloons (all 8
 * wishes), gift+letter (typed paragraphs, tap-to-finish, the signature), slideshow (skip with no
 * photos / one polaroid per photo memory), end, and the × close button. The blow-sustain logic is
 * proven directly against window.birthdayBlowDetector() with synthetic RMS frames — no real mic.
 */
import { openApp, sleep } from "../harness.mjs";

export const name = "birthday";

const PHOTO_DATA_URL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==";
const THREE_MEMORIES = [
  { id: "m1", title: "Kahve", date: "2026-01-01", note: "", lat: null, lng: null, source: "gallery", thumbnail: PHOTO_DATA_URL, photo: PHOTO_DATA_URL },
  { id: "m2", title: "Sahil", date: "2026-02-01", note: "", lat: null, lng: null, source: "gallery", thumbnail: PHOTO_DATA_URL, photo: PHOTO_DATA_URL },
  { id: "m3", title: "", date: "2026-03-01", note: "", lat: null, lng: null, source: "gallery", thumbnail: PHOTO_DATA_URL, photo: PHOTO_DATA_URL },
];

const wait = (page, ms) => page.eval((n) => new Promise((r) => setTimeout(r, n)), ms);

/** Scrolls `selector` into view first — the coupon booklet (scene or 🎁-tab) and the letter's
 *  Devam button (below 8 paragraphs) sit below the 390x844 viewport's fold, where a plain
 *  page.tap() silently hits nothing (words.mjs's own scrollIntoView precedent). On the phone the
 *  overlay scrolls to them; measured 2026-10-01 at 390x844 and 360x780. */
async function tapInView(page, selector) {
  await page.eval((sel) => {
    var el = document.querySelector(sel);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", inline: "center" });
  }, selector);
  await page.tap(selector);
}

async function waitUntilOverlayOpen(page, timeoutMs = 3000) {
  const start = Date.now();
  let opened = false;
  while (Date.now() - start < timeoutMs) {
    opened = await page.eval(() => document.getElementById("birthday-overlay").hidden === false);
    if (opened) break;
    await sleep(120);
  }
  return opened;
}

/** Advances a freshly-opened overlay from scene 0 through cake/balloons/gift+letter/coupons (and
 *  the voice scene too, when the fixture makes one present) to the slideshow — the sequence every
 *  slideshow-specific check (m1, M7, M19) shares. */
async function reachSlideshow(page, { hasVoice = false } = {}) {
  await waitUntilOverlayOpen(page);
  await page.tap("#bday-scene0-continue");
  await blowAllCandlesByTap(page);
  await page.tap("#bday-scene1-continue");
  await wait(page, 150);
  await page.tap("#bday-scene2-continue");
  await wait(page, 150);
  await page.tap("#bday-gift-open-btn");
  await wait(page, 650);
  for (let i = 0; i < 8; i++) {
    await page.tap(".bday-letter");
    await wait(page, 60);
  }
  await wait(page, 150);
  await tapInView(page, "#bday-scene3-continue");
  await wait(page, 150);
  if (hasVoice) {
    await page.tap("#bday-scene-voice-continue");
    await wait(page, 150);
  }
  await page.tap("#bday-scene-coupons-continue");
  await wait(page, 300);
}

/**
 * Reads the boxes of the top tier and all 5 candles and reports, per candle, whether its own box
 * sits horizontally inside the tier's span and its bottom edge lands within 6px (vertically) of
 * the tier's own top surface — the defect this guards against: candles floating beside the tier
 * rather than standing on it.
 */
async function candleTierFit(page) {
  const raw = await page.eval(() => {
    const tier = document.querySelector(".bday-cake-layer--top").getBoundingClientRect();
    const candles = Array.prototype.map.call(document.querySelectorAll(".bday-candle"), (el) => {
      const r = el.getBoundingClientRect();
      return { left: r.left, right: r.right, bottom: r.bottom };
    });
    return { tier: { left: tier.left, right: tier.right, top: tier.top }, candles };
  });
  const fits = raw.candles.map((c) =>
    c.left >= raw.tier.left - 0.5 && c.right <= raw.tier.right + 0.5 && Math.abs(c.bottom - raw.tier.top) <= 6);
  return { ok: raw.candles.length === 5 && fits.every(Boolean), raw, fits };
}

/** Waits for all 5 candles to be lit (the staged reveal), then taps each in order. */
async function blowAllCandlesByTap(page) {
  await wait(page, 2200); // 5 * 420ms stagger, plus margin
  for (let i = 0; i < 5; i++) {
    await page.tap(`.bday-candle[data-candle="${i}"]`);
    await wait(page, 80);
  }
  await wait(page, 150);
}

export async function run({ page, check }) {
  // 1. Locked before 4 Oct: no auto-open, no glow, ~1 minute on the clock, tap shows a tease.
  await openApp(page, { now: "2026-10-03T23:59:00", signedIn: true, storage: {} });
  await wait(page, 250);
  const locked1 = await page.eval(() => ({
    overlayHidden: document.getElementById("birthday-overlay").hidden,
    lockedVisible: !!document.querySelector(".bday-view--locked"),
    days: document.getElementById("bday-cd-days").textContent,
    hours: document.getElementById("bday-cd-hours").textContent,
    minutes: document.getElementById("bday-cd-minutes").textContent,
    navGlow: document.querySelector(".nav-btn--gift").classList.contains("is-glowing"),
    triggerIsButton: document.getElementById("bday-gift-trigger").tagName === "BUTTON",
    triggerAriaLabel: document.getElementById("bday-gift-trigger").getAttribute("aria-label"),
  }));
  await check("birthday: locked before 4 Oct — no auto-open, no nav glow, ~1 minute on the clock, a real labelled button", () => ({
    ok: locked1.overlayHidden === true && locked1.lockedVisible === true && locked1.navGlow === false
      && locked1.days === "0" && locked1.hours === "00" && Number(locked1.minutes) <= 1
      && locked1.triggerIsButton === true && !!locked1.triggerAriaLabel,
    detail: JSON.stringify(locked1),
  }));

  await page.tap(".nav-btn[data-tab=\"birthday-view\"]");
  await wait(page, 100);
  await page.tap("#bday-gift-trigger");
  await wait(page, 60);
  const teaseText = await page.text("#bday-tease");
  const subtitleContrast = await page.eval(() => window.__app.readable(document.querySelector(".bday-lock-subtitle")));
  await check("birthday: tapping the locked gift shakes it and shows a random tease line", () => ({
    ok: typeof teaseText === "string" && teaseText.length > 0,
    detail: teaseText,
  }));
  await check("birthday: the locked subtitle reaches 4.5:1 contrast", () => ({
    ok: subtitleContrast >= 4.5,
    detail: String(subtitleContrast),
  }));

  // On the eve (days === 0), the two {days}-interpolated teases would read "daha 0 gün var" — a
  // stubbed Math.random()=>0 always picks pool index 0, so this proves the {days} lines are
  // excluded from the pool rather than just hoping 14 taps happen to avoid them.
  const dayZeroTease = await page.eval(() => {
    var orig = Math.random;
    Math.random = function () { return 0; };
    document.getElementById("bday-gift-trigger").click();
    var text = document.getElementById("bday-tease").textContent;
    Math.random = orig;
    return text;
  });
  await check("birthday: on the eve (days=0) the {days}-interpolated teases are excluded — no '0 gün' wording", () => ({
    ok: dayZeroTease.indexOf("{days}") === -1 && dayZeroTease.indexOf("0 gün") === -1 && dayZeroTease === "Kurcalama, ayıcık bekçi 🐻",
    detail: dayZeroTease,
  }));

  const unitLabels = await page.eval(() => Array.prototype.map.call(document.querySelectorAll("#bday-countdown .countdown-unit-label"), (el) => el.textContent));
  await check("birthday: the 🎁 countdown's unit labels are lowercase (gün/saat/dakika/saniye), matching Tarihler's own widget (m12)", () => ({
    ok: JSON.stringify(unitLabels) === JSON.stringify(["gün", "saat", "dakika", "saniye"]),
    detail: JSON.stringify(unitLabels),
  }));

  // 2. The locked countdown flips to the unlocked card live, without reloading — and passing
  // midnight while the app is OPEN also fires meryem:birthday-unlocked and starts the due gate
  // (B1): before this fix, only the 🎁 tab's own view flipped; the gate stayed silent until her
  // next reload, and its finale then replayed the whole surprise a second time.
  await openApp(page, { now: "2026-10-03T23:59:57", signedIn: true, storage: {} });
  await page.tap(".nav-btn[data-tab=\"birthday-view\"]");
  await wait(page, 100);
  const beforeFlip = await page.eval(() => !!document.querySelector(".bday-view--locked"));
  await page.eval(() => {
    window.__bdayUnlockedEventFired = false;
    document.addEventListener("meryem:birthday-unlocked", function () { window.__bdayUnlockedEventFired = true; });
  });
  await wait(page, 5000);
  const afterFlip = await page.eval(() => ({
    locked: !!document.querySelector(".bday-view--locked"),
    unlocked: !!document.querySelector(".bday-view--unlocked"),
    eventFired: window.__bdayUnlockedEventFired === true,
    gateOverlayVisible: document.getElementById("gate-overlay") ? document.getElementById("gate-overlay").hidden === false : false,
  }));
  await check("birthday: the locked countdown flips live to the unlocked card at midnight (no reload)", () => ({
    ok: beforeFlip === true && afterFlip.locked === false && afterFlip.unlocked === true,
    detail: JSON.stringify({ beforeFlip, afterFlip }),
  }));
  await check("birthday: passing midnight while the app is already open fires meryem:birthday-unlocked and starts the due gate (B1)", () => ({
    ok: afterFlip.eventFired === true && afterFlip.gateOverlayVisible === true,
    detail: JSON.stringify(afterFlip),
  }));

  // Freshly unlocked (never opened this year) — the ready card reads CONTENT.birthday.ready's
  // title and firstTime, not the hardcoded literals it used to carry.
  const readyFirstTime = await page.eval(() => ({
    titleText: document.querySelector(".bday-ready-title").textContent,
    subtitleText: document.querySelector(".bday-ready-subtitle").textContent,
    expectedTitle: CONTENT.birthday.ready.title,
    expectedSubtitle: CONTENT.birthday.ready.firstTime,
  }));
  await check("birthday: the unlocked ready card (not opened yet this year) reads CONTENT.birthday.ready.title/.firstTime", () => ({
    ok: readyFirstTime.titleText === readyFirstTime.expectedTitle && readyFirstTime.subtitleText === readyFirstTime.expectedSubtitle,
    detail: JSON.stringify(readyFirstTime),
  }));

  // 3. Gate already played this year -> auto-opens once. M2: the seen-year flag is written on
  // CLOSE, not the moment it opens — so an interrupted surprise (a call, iOS evicting the
  // backgrounded app) gets re-offered on the next load instead of silently vanishing behind a
  // "yeniden aç" card.
  await openApp(page, { now: "2026-10-04T00:01:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" } });
  const opened1 = await waitUntilOverlayOpen(page);
  const dumpWhileOpen = await page.storageDump();
  await check("birthday: gate already played this year — the surprise auto-opens once", () => ({
    ok: opened1 === true,
    detail: String(opened1),
  }));
  await check("birthday: the seen-year flag is not written while the surprise is still open (M2)", () => ({
    ok: dumpWhileOpen["meryem-birthday-seen-year"] == null,
    detail: JSON.stringify(dumpWhileOpen),
  }));
  await page.tap("#bday-close-btn");
  await wait(page, 150);
  const dumpAfterClose = await page.storageDump();
  await check("birthday: closing the surprise writes the seen-year flag (M2)", () => ({
    ok: dumpAfterClose["meryem-birthday-seen-year"] === "2026",
    detail: JSON.stringify(dumpAfterClose),
  }));
  await openApp(page, { now: "2026-10-04T00:01:00", signedIn: true, keepStorage: true });
  await wait(page, 400);
  const opened2 = await page.eval(() => document.getElementById("birthday-overlay").hidden === false);
  await check("birthday: reopening after a real close does not auto-open again", () => ({
    ok: opened2 === false,
    detail: String(opened2),
  }));

  // Already opened this year — the ready card's subtitle switches to CONTENT.birthday.ready.again.
  const readyAgain = await page.eval(() => ({
    subtitleText: document.querySelector(".bday-ready-subtitle").textContent,
    expectedSubtitle: CONTENT.birthday.ready.again,
  }));
  await check("birthday: the unlocked ready card (already opened this year) reads CONTENT.birthday.ready.again", () => ({
    ok: readyAgain.subtitleText === readyAgain.expectedSubtitle,
    detail: JSON.stringify(readyAgain),
  }));

  // M2: reloading WITHOUT closing (an interrupted surprise — a call, iOS backgrounding it away)
  // re-offers it on the next load, because nothing marks it "seen" until a real close does.
  await openApp(page, { now: "2026-10-04T00:01:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await openApp(page, { now: "2026-10-04T00:01:00", signedIn: true, keepStorage: true });
  const reopenedAfterInterruption = await waitUntilOverlayOpen(page);
  await check("birthday: reloading before closing (an interrupted surprise) re-offers it on the next load (M2)", () => ({
    ok: reopenedAfterInterruption === true,
    detail: String(reopenedAfterInterruption),
  }));

  // 4. A due gate defers the birthday auto-open entirely (the gate owns opening it). The real
  // js/gate.js (another package) may itself auto-play here since storage is fresh — that is its
  // own contract, not this check's concern, so the reset below clears it out of the way before
  // this module's own function is exercised directly.
  await openApp(page, { now: "2026-10-04T00:01:00", signedIn: true, storage: {} });
  await wait(page, 300); // let any natural open (birthday's or the gate's own) settle first
  const gateBlocked = await page.eval(() => {
    var overlay = document.getElementById("birthday-overlay");
    overlay.hidden = true;
    overlay.innerHTML = "";
    var gateOverlay = document.getElementById("gate-overlay");
    if (gateOverlay) { gateOverlay.hidden = true; gateOverlay.innerHTML = ""; }
    var appContent = document.getElementById("app-content");
    if (appContent) appContent.removeAttribute("inert");
    document.body.style.overflow = "";
    try { localStorage.removeItem("meryem-birthday-seen-year"); } catch (e) {}
    window.isGateDue = function () { return true; };
    window.maybeAutoOpenBirthday();
    return document.getElementById("birthday-overlay").hidden;
  });
  await check("birthday: maybeAutoOpenBirthday() defers to a due gate (window.isGateDue) and does not open", () => ({
    ok: gateBlocked === true,
    detail: String(gateBlocked),
  }));
  const glowWhenDeferred = await page.eval(() => {
    window.initBirthday(); // isGateDue is still stubbed true from above
    return document.querySelector(".nav-btn--gift").classList.contains("is-glowing");
  });
  await check("birthday: unlocked + not seen this year + a due gate still shows the gift-tab glow", () => ({
    ok: glowWhenDeferred === true,
    detail: String(glowWhenDeferred),
  }));

  // B1: with the gate due, tapping #bday-open-btn on the ready card starts the gate instead of
  // jumping straight to the birthday overlay (isGateDue is still stubbed true from above).
  const openBtnGateAwareResult = await page.eval(() => {
    window.__bdayGateStartCalled = false;
    window.startGateIfDue = function () { window.__bdayGateStartCalled = true; };
    document.getElementById("bday-open-btn").click();
    return {
      gateStartCalled: window.__bdayGateStartCalled,
      birthdayOverlayHidden: document.getElementById("birthday-overlay").hidden,
    };
  });
  await check("birthday: with the gate due, tapping #bday-open-btn starts the gate instead of opening the surprise directly (B1)", () => ({
    ok: openBtnGateAwareResult.gateStartCalled === true && openBtnGateAwareResult.birthdayOverlayHidden === true,
    detail: JSON.stringify(openBtnGateAwareResult),
  }));

  // 5. Preview mode's own auto-open logic, isolated from the (now real) gate package's own flow:
  // with the gate forced clear, this module still opens the surprise and still persists nothing —
  // including after a REAL close, which is the only thing that proves TIME_PREVIEW_PROTECTED_KEYS
  // still guards the flag now that M2 moved the write to close time instead of open time.
  await openApp(page, { query: "?onizleme=dogumgunu", signedIn: true, storage: {} });
  await wait(page, 300); // let any natural gate/birthday auto-play (real gate.js) settle first
  const previewResult = await page.eval(() => {
    var bOverlay = document.getElementById("birthday-overlay");
    bOverlay.hidden = true;
    bOverlay.innerHTML = "";
    var gOverlay = document.getElementById("gate-overlay");
    if (gOverlay) { gOverlay.hidden = true; gOverlay.innerHTML = ""; }
    var appContent = document.getElementById("app-content");
    if (appContent) appContent.removeAttribute("inert");
    document.body.style.overflow = "";
    try { localStorage.removeItem("meryem-birthday-seen-year"); } catch (e) {}
    window.isGateDue = function () { return false; };
    window.maybeAutoOpenBirthday();
    return { opened: document.getElementById("birthday-overlay").hidden === false };
  });
  await check("birthday: preview mode opens the surprise (gate clear)", () => ({
    ok: previewResult.opened === true,
    detail: JSON.stringify(previewResult),
  }));
  await page.tap("#bday-close-btn");
  await wait(page, 150);
  const seenYearAfterPreviewClose = await page.eval(() => {
    try { return localStorage.getItem("meryem-birthday-seen-year"); } catch (e) { return "ERR"; }
  });
  await check("birthday: preview mode stores nothing even after a real close — the seen-year write stays preview-protected under M2 (M2)", () => ({
    ok: seenYearAfterPreviewClose == null,
    detail: String(seenYearAfterPreviewClose),
  }));

  // 6. The blow-sustain detector: pure logic, synthetic RMS frames, no microphone.
  await openApp(page, { signedIn: true });
  const detectorTrace = await page.eval(() => {
    var d = window.birthdayBlowDetector({ threshold: 0.2, sustainMs: 300 });
    return [
      d.feed(0.05, 0),
      d.feed(0.25, 100),
      d.feed(0.25, 200),
      d.feed(0.25, 350),
      d.feed(0.25, 420), // 320ms sustained above threshold -> trips
      d.feed(0.25, 450), // rearmed, freshly above -> not yet
      d.feed(0.01, 500), // drops below -> resets
      d.feed(0.25, 520), // freshly above again
      d.feed(0.25, 900), // 380ms sustained -> trips for the next candle
    ];
  });
  await check("birthday: the blow detector trips only after the sustained window, and rearms for the next candle", () => ({
    ok: JSON.stringify(detectorTrace) === JSON.stringify([false, false, false, false, true, false, false, false, true]),
    detail: JSON.stringify(detectorTrace),
  }));

  // 7. mic:'deny' — tap-to-blow still works end to end: afterBlow, confetti, an AudioContext.
  await openApp(page, { now: "2026-10-04T00:05:00", signedIn: true, mic: "deny", storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await page.eval(() => {
    window.__bdayAudioCtxCreated = false;
    var Orig = window.AudioContext || window.webkitAudioContext;
    if (Orig) {
      var Spy = function () { window.__bdayAudioCtxCreated = true; return new Orig(); };
      window.AudioContext = Spy;
      window.webkitAudioContext = Spy;
    }
  });
  await page.tap("#bday-scene0-continue");
  await wait(page, 100);
  const cakeButtons = await page.eval(() => ({
    candleIsButton: document.querySelector(".bday-candle").tagName === "BUTTON",
    candleAriaLabel: document.querySelector(".bday-candle").getAttribute("aria-label"),
  }));
  const candleBox = await page.box(".bday-candle");
  await check("birthday: candle tap targets are at least 32px wide (up from the original 26px)", () => ({
    ok: candleBox.width >= 32,
    detail: String(candleBox.width),
  }));
  const fitLit = await candleTierFit(page);
  await check("birthday: all 5 lit candles stand on the top tier's surface, inside its width", () => ({
    ok: fitLit.ok,
    detail: JSON.stringify(fitLit.raw),
  }));
  await blowAllCandlesByTap(page);
  const fitBlownOut = await candleTierFit(page);
  await check("birthday: all 5 candles still stand on the top tier's surface after blowing them out", () => ({
    ok: fitBlownOut.ok,
    detail: JSON.stringify(fitBlownOut.raw),
  }));
  const denyResult = await page.eval(() => ({
    afterBlowVisible: document.getElementById("bday-after-blow").hidden === false,
    confettiCanvas: !!document.querySelector(".fx-confetti-canvas"),
    audioCtxCreated: window.__bdayAudioCtxCreated === true,
    wishTextHidden: document.getElementById("bday-wish-text").hidden === true,
  }));
  await check("birthday: mic denied — tapping all 5 candles still finishes (afterBlow shown, confetti, an AudioContext)", () => ({
    ok: cakeButtons.candleIsButton === true && !!cakeButtons.candleAriaLabel
      && denyResult.afterBlowVisible && denyResult.confettiCanvas && denyResult.audioCtxCreated,
    detail: JSON.stringify({ cakeButtons, denyResult }),
  }));
  await check("birthday: finishing early hides the wish text immediately, instead of leaving it overlapping the after-blow celebration", () => ({
    ok: denyResult.wishTextHidden === true,
    detail: JSON.stringify(denyResult),
  }));

  // Regression: the cake scene's own un-cancelled reveal timer used to fire ~4.2s after the scene
  // rendered and re-surface "Mumları üfle!" (with a re-enabled mic button) UNDER the after-blow
  // celebration already showing. Cross that mark and confirm nothing resurfaces.
  await wait(page, 1500);
  const noResurfaceResult = await page.eval(() => ({
    blowUiHidden: document.getElementById("bday-blow-ui").hidden === true,
    wishTextHidden: document.getElementById("bday-wish-text").hidden === true,
    afterBlowStillVisible: document.getElementById("bday-after-blow").hidden === false,
  }));
  await check("birthday: past the scene's original ~4.2s reveal mark, the blow prompt never resurfaces under the after-blow celebration", () => ({
    ok: noResurfaceResult.blowUiHidden === true && noResurfaceResult.wishTextHidden === true && noResurfaceResult.afterBlowStillVisible === true,
    detail: JSON.stringify(noResurfaceResult),
  }));

  // 8. Balloons -> gift/letter -> slideshow-skipped -> end, continuing from the deny run above.
  await page.tap("#bday-scene1-continue");
  await wait(page, 150);
  const balloonsPromptResult = await page.eval(() => ({
    promptText: document.querySelector(".bday-scene--balloons .bday-scene-subtitle").textContent,
    expectedPrompt: CONTENT.birthday.balloonsPrompt,
  }));
  await check("birthday: the balloons scene prompt reads CONTENT.birthday.balloonsPrompt", () => ({
    ok: balloonsPromptResult.promptText === balloonsPromptResult.expectedPrompt,
    detail: JSON.stringify(balloonsPromptResult),
  }));
  for (let i = 0; i < 8; i++) {
    await page.tap(`.bday-balloon[data-balloon="${i}"]`);
    await wait(page, 40);
  }
  await wait(page, 150);
  const balloonsResult = await page.eval(() => ({
    wishCount: document.querySelectorAll(".bday-balloon-wish").length,
    counterText: document.getElementById("bday-balloon-counter").textContent,
  }));
  await check("birthday: popping all balloons reveals all 8 wishes", () => ({
    ok: balloonsResult.wishCount === 8 && balloonsResult.counterText.indexOf("8 / 8") === 0,
    detail: JSON.stringify(balloonsResult),
  }));
  const wishBox = await page.box(".bday-balloon-wish");
  await check("birthday: a popped balloon's wish card is a legible full-width card, not a narrow cramped column", () => ({
    ok: wishBox.width >= 180,
    detail: JSON.stringify(wishBox),
  }));

  await page.tap("#bday-scene2-continue");
  await wait(page, 150);
  await page.tap("#bday-gift-open-btn");
  await wait(page, 650);
  for (let i = 0; i < 8; i++) {
    await page.tap(".bday-letter");
    await wait(page, 60);
  }
  await wait(page, 150);
  const expectedSignature = await page.eval(() => CONTENT.birthday.letter.signature);
  const letterResult = await page.eval(() => ({
    signatureHidden: document.getElementById("bday-letter-signature").hidden,
    signatureText: document.getElementById("bday-letter-signature").textContent,
    continueVisible: document.getElementById("bday-scene3-continue").hidden === false,
  }));
  await check("birthday: the letter ends with CONTENT.birthday.letter.signature", () => ({
    ok: letterResult.signatureHidden === false && letterResult.signatureText === expectedSignature && letterResult.continueVisible === true,
    detail: JSON.stringify({ letterResult, expectedSignature }),
  }));

  await tapInView(page, "#bday-scene3-continue");
  await wait(page, 150);
  await page.tap("#bday-scene-coupons-continue");
  await wait(page, 200);
  const afterLetterContinue = await page.eval(() => ({
    slideshowPresent: !!document.querySelector(".bday-scene--slideshow"),
    endPresent: !!document.querySelector(".bday-scene--end"),
  }));
  await check("birthday: the slideshow scene is skipped entirely when there are no photo memories", () => ({
    ok: afterLetterContinue.slideshowPresent === false && afterLetterContinue.endPresent === true,
    detail: JSON.stringify(afterLetterContinue),
  }));

  await page.tap("#bday-end-btn");
  await wait(page, 150);
  const afterEndClose = await page.eval(() => ({
    overlayHidden: document.getElementById("birthday-overlay").hidden,
    bodyOverflow: document.body.style.overflow,
    birthdayTabActive: document.getElementById("birthday-view").classList.contains("is-active"),
  }));
  await check("birthday: the End scene's button closes the overlay, restores scroll, and shows the gift tab", () => ({
    ok: afterEndClose.overlayHidden === true && afterEndClose.bodyOverflow === "" && afterEndClose.birthdayTabActive === true,
    detail: JSON.stringify(afterEndClose),
  }));

  // 9. mic:'fake' — after all candles are blown, every captured getUserMedia track has ended.
  await openApp(page, { now: "2026-10-04T00:05:00", signedIn: true, mic: "fake", storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await page.tap("#bday-scene0-continue");
  // #bday-mic-btn sits inside #bday-blow-ui, which stays [hidden] until the wish-text beat has
  // played (5 candles lit at 420ms apiece, then the wish shows, then the blow UI reveals) — wait
  // past that reveal, not just past the candles lighting, before this test's mic-button tap.
  await wait(page, 4600);
  await page.eval(() => {
    window.__bdayCapturedStreams = [];
    var orig = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = function (constraints) {
      return orig(constraints).then(function (stream) {
        window.__bdayCapturedStreams.push(stream);
        return stream;
      });
    };
  });
  await page.tap("#bday-mic-btn");
  await wait(page, 200);
  for (let i = 0; i < 5; i++) {
    await page.tap(`.bday-candle[data-candle="${i}"]`);
    await wait(page, 80);
  }
  await wait(page, 150);
  const fakeResult = await page.eval(() => {
    var streams = window.__bdayCapturedStreams || [];
    return {
      streamCount: streams.length,
      allEnded: streams.length > 0 && streams.every((s) => s.getTracks().every((t) => t.readyState === "ended")),
    };
  });
  await check("birthday: mic:'fake' — every captured getUserMedia track has ended once the candles are out", () => ({
    ok: fakeResult.streamCount > 0 && fakeResult.allEnded,
    detail: JSON.stringify(fakeResult),
  }));

  // 10. The × close button restores the app mid-scene, and the gift-tab glow logic is sound.
  await openApp(page, { now: "2026-10-04T00:07:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await page.tap("#bday-scene0-continue");
  await wait(page, 200);

  // Accessibility: matches js/gate.js's own contract for the identical role="dialog"
  // aria-modal="true" overlay — #app-content inert, the overlay named, Tab trapped inside it.
  const overlayA11y = await page.eval(() => ({
    appInert: document.getElementById("app-content").hasAttribute("inert"),
    overlayAriaLabel: document.getElementById("birthday-overlay").getAttribute("aria-label"),
  }));
  await check("birthday: the open overlay inerts #app-content and names itself for assistive tech", () => ({
    ok: overlayA11y.appInert === true && typeof overlayA11y.overlayAriaLabel === "string" && overlayA11y.overlayAriaLabel.length > 0,
    detail: JSON.stringify(overlayA11y),
  }));
  const trapResult = await page.eval(() => {
    var overlay = document.getElementById("birthday-overlay");
    var nodes = overlay.querySelectorAll("button, [tabindex]");
    var visible = Array.prototype.filter.call(nodes, function (el) {
      return !el.disabled && el.getAttribute("tabindex") !== "-1" && el.getClientRects().length > 0;
    });
    var first = visible[0];
    var last = visible[visible.length - 1];
    last.focus();
    var ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    last.dispatchEvent(ev);
    return { wrapped: document.activeElement === first, prevented: ev.defaultPrevented };
  });
  await check("birthday: Tab from the last focusable control in the overlay wraps to the first (focus trap)", () => ({
    ok: trapResult.wrapped === true && trapResult.prevented === true,
    detail: JSON.stringify(trapResult),
  }));

  const closeButtonInfo = await page.eval(() => ({
    isButton: document.getElementById("bday-close-btn").tagName === "BUTTON",
    ariaLabel: document.getElementById("bday-close-btn").getAttribute("aria-label"),
  }));
  await page.tap("#bday-close-btn");
  await wait(page, 150);
  const afterXClose = await page.eval(() => ({
    overlayHidden: document.getElementById("birthday-overlay").hidden,
    overlayEmpty: document.getElementById("birthday-overlay").innerHTML === "",
    bodyOverflow: document.body.style.overflow,
    appUsable: getComputedStyle(document.getElementById("app-content")).display !== "none",
  }));
  await check("birthday: the × close button restores the app (overlay hidden+empty, scroll restored, aria-label \"Kapat\")", () => ({
    ok: closeButtonInfo.isButton === true && closeButtonInfo.ariaLabel === "Kapat"
      && afterXClose.overlayHidden === true && afterXClose.overlayEmpty === true
      && afterXClose.bodyOverflow === "" && afterXClose.appUsable === true,
    detail: JSON.stringify({ closeButtonInfo, afterXClose }),
  }));

  // 11. Slideshow with photo memories: one polaroid per photo, auto-cycling from the first.
  await openApp(page, { now: "2026-10-04T00:09:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" }, memories: THREE_MEMORIES });
  await reachSlideshow(page);
  const slideshowResult = await page.eval(() => ({
    polaroidCount: document.querySelectorAll(".bday-polaroid").length,
    activeCount: document.querySelectorAll(".bday-polaroid.is-active").length,
  }));
  await check("birthday: the slideshow shows one polaroid per photo memory (3-memory fixture)", () => ({
    ok: slideshowResult.polaroidCount === 3 && slideshowResult.activeCount === 1,
    detail: JSON.stringify(slideshowResult),
  }));
  const previewBgResult = await page.eval(() => {
    var img = document.querySelector(".bday-polaroid img");
    var cs = getComputedStyle(img);
    return { backgroundImage: cs.backgroundImage, backgroundColor: cs.backgroundColor };
  });
  await check("birthday: each slideshow photo shows a blush-background thumbnail preview behind the full image (M19)", () => ({
    ok: previewBgResult.backgroundImage.indexOf("url(") === 0 && previewBgResult.backgroundColor !== "rgba(0, 0, 0, 0)",
    detail: JSON.stringify(previewBgResult),
  }));

  // 12. m1: a crafted photo URL (a quote-breakout payload) never executes as injected markup —
  // src/alt are set as DOM properties in the post-render loop, never concatenated into the HTML
  // string. The sentinel is armed BEFORE the scene renders (not reset afterwards) so a real
  // regression — the payload executing the instant the <img> is inserted — cannot be missed by
  // reading it too late.
  const XSS_PAYLOAD_URL = "data:image/png;base64,AAA\" onerror=\"window.__bdayXssFired=true\" x=\"";
  const XSS_MEMORY = [
    { id: "x1", title: "Zarar", date: "2026-01-01", note: "", lat: null, lng: null, source: "gallery", thumbnail: XSS_PAYLOAD_URL, photo: XSS_PAYLOAD_URL },
  ];
  await openApp(page, { now: "2026-10-04T00:21:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" }, memories: XSS_MEMORY });
  await page.eval(() => { window.__bdayXssFired = false; });
  await reachSlideshow(page);
  await wait(page, 200);
  const xssResult = await page.eval(() => ({
    xssFired: window.__bdayXssFired === true,
    imgCount: document.querySelectorAll(".bday-polaroid img").length,
    imgSrc: document.querySelector(".bday-polaroid img").getAttribute("src"),
  }));
  await check("birthday: a crafted photo URL (quote-breakout payload) never executes as markup (m1)", () => ({
    ok: xssResult.xssFired === false && xssResult.imgCount === 1 && xssResult.imgSrc === XSS_PAYLOAD_URL,
    detail: JSON.stringify(xssResult),
  }));

  // 13. M7 + M19: Firestore delivers memories newest-first (orderBy('date','desc'), firebase.js);
  // the slideshow reverses them to tell her story chronologically, and a camera/picker filename
  // ("IMG_4821") never shows as a caption while a real title still does.
  const SLIDESHOW_ORDER_MEMORIES = [
    { id: "s1", title: "En yeni", date: "2026-03-01", note: "", lat: null, lng: null, source: "gallery", thumbnail: PHOTO_DATA_URL, photo: PHOTO_DATA_URL },
    { id: "s2", title: "IMG_4821", date: "2026-02-01", note: "", lat: null, lng: null, source: "gallery", thumbnail: PHOTO_DATA_URL, photo: PHOTO_DATA_URL },
    { id: "s3", title: "En eski", date: "2026-01-01", note: "", lat: null, lng: null, source: "gallery", thumbnail: PHOTO_DATA_URL, photo: PHOTO_DATA_URL },
  ];
  await openApp(page, { now: "2026-10-04T00:23:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" }, memories: SLIDESHOW_ORDER_MEMORIES });
  await reachSlideshow(page);
  const slideshowOrderResult = await page.eval(() => {
    var figs = document.querySelectorAll(".bday-polaroid");
    return {
      alts: Array.prototype.map.call(figs, (f) => f.querySelector("img").getAttribute("alt")),
      captions: Array.prototype.map.call(figs, (f) => !!f.querySelector("figcaption")),
    };
  });
  await check("birthday: the slideshow shows photos oldest-first, reversing Firestore's newest-first order (M19)", () => ({
    ok: JSON.stringify(slideshowOrderResult.alts) === JSON.stringify(["En eski", "IMG_4821", "En yeni"]),
    detail: JSON.stringify(slideshowOrderResult),
  }));
  await check("birthday: a camera/picker filename ('IMG_4821') is never shown as a slideshow caption; a real title still is (M7)", () => ({
    ok: JSON.stringify(slideshowOrderResult.captions) === JSON.stringify([true, false, true]),
    detail: JSON.stringify(slideshowOrderResult),
  }));

  // M5: under reduced motion the slideshow still advances (instantly, no transition) instead of
  // staying frozen on the first photo forever — this was lost content, not reduced motion.
  await openApp(page, { now: "2026-10-04T00:24:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" }, memories: THREE_MEMORIES, reducedMotion: true });
  await reachSlideshow(page);
  const activeBefore = await page.eval(() => Array.prototype.findIndex.call(document.querySelectorAll(".bday-polaroid"), (f) => f.classList.contains("is-active")));
  await wait(page, 2800);
  const activeAfter = await page.eval(() => Array.prototype.findIndex.call(document.querySelectorAll(".bday-polaroid"), (f) => f.classList.contains("is-active")));
  await check("birthday: under reduced motion the slideshow still advances past the first photo — lost content, not motion (M5)", () => ({
    ok: activeBefore === 0 && activeAfter !== activeBefore,
    detail: JSON.stringify({ activeBefore, activeAfter }),
  }));

  // 14. m9: Escape closes the birthday overlay, matching the letter-reader's own contract.
  await openApp(page, { now: "2026-10-04T00:25:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await page.tap("#bday-scene0-continue");
  await wait(page, 150);
  await page.eval(() => {
    document.getElementById("birthday-overlay").dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  await wait(page, 150);
  const afterEscape = await page.eval(() => document.getElementById("birthday-overlay").hidden);
  await check("birthday: pressing Escape closes the birthday overlay (m9)", () => ({
    ok: afterEscape === true,
    detail: String(afterEscape),
  }));

  // 15. m14: the title scene's background balloons are a fixed, unclipped full-viewport layer
  // (the old absolute layer was cut off mid-screen by .bday-scene--title's own overflow:hidden
  // box), with the scene's own content lifted above it so the balloons never cover the title/bears
  // /button. .bday-close-btn (position:fixed, unaffected by this fix) already proves fixed
  // positioning escapes the overlay's scroll container correctly in every other shot.
  await openApp(page, { now: "2026-10-04T00:27:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await wait(page, 150);
  const balloonLayerResult = await page.eval(() => {
    var scene = document.querySelector(".bday-scene--title");
    var layer = document.querySelector(".bday-bg-balloons");
    var title = document.querySelector(".bday-title-script");
    var sceneCs = getComputedStyle(scene);
    var layerCs = getComputedStyle(layer);
    var layerBox = layer.getBoundingClientRect();
    return {
      sceneOverflow: sceneCs.overflow,
      layerPosition: layerCs.position,
      layerHeight: layerBox.height,
      viewportHeight: window.innerHeight,
      titleZIndex: getComputedStyle(title).zIndex,
    };
  });
  await check("birthday: the title scene's background balloons are a fixed, unclipped full-viewport layer, with the scene content stacked above it (m14)", () => ({
    ok: balloonLayerResult.sceneOverflow !== "hidden" && balloonLayerResult.layerPosition === "fixed"
      && Math.abs(balloonLayerResult.layerHeight - balloonLayerResult.viewportHeight) < 2
      && balloonLayerResult.titleZIndex === "1",
    detail: JSON.stringify(balloonLayerResult),
  }));

  // 16. M1: navigator.audioSession.type follows the scene on iOS — 'playback' for the Devam
  // gesture (so the ring/silent switch does not mute the melody, WebKit bug 237322),
  // 'play-and-record' only while the mic listens, back to 'playback' once blowing finishes (the
  // melody itself deferred ~400ms so the route has time to flip back before it plays), and 'auto'
  // once the whole surprise closes. Real iOS audio-session ROUTING is unverified from here (no
  // iPhone available) — this proves birthday.js drives the property and the delay at the right
  // moments, which is what M1's fix actually changed.
  await openApp(page, { now: "2026-10-04T00:29:00", signedIn: true, mic: "fake", storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await page.eval(() => {
    navigator.audioSession = { _t: "auto", get type() { return this._t; }, set type(v) { this._t = v; } };
    window.__bdayOscCount = 0;
  });
  await page.tap("#bday-scene0-continue");
  await wait(page, 100);
  const audioAfterContinue = await page.eval(() => navigator.audioSession.type);
  await page.eval(() => {
    var Orig = window.AudioContext || window.webkitAudioContext;
    var origCreateOsc = Orig.prototype.createOscillator;
    Orig.prototype.createOscillator = function () {
      window.__bdayOscCount++;
      return origCreateOsc.apply(this, arguments);
    };
  });
  await wait(page, 4600); // reach the blow-UI reveal, as the mic:'fake' flow above does
  await page.tap("#bday-mic-btn");
  await wait(page, 150);
  const audioAfterMicStart = await page.eval(() => navigator.audioSession.type);
  for (let i = 0; i < 5; i++) {
    await page.tap(`.bday-candle[data-candle="${i}"]`);
    await wait(page, 80);
  }
  await wait(page, 150);
  const audioAfterFinishBlowing = await page.eval(() => navigator.audioSession.type);
  const oscSoonAfterBlow = await page.eval(() => window.__bdayOscCount);
  await check("birthday: navigator.audioSession.type follows the scene — playback for the opener, play-and-record while the mic listens, playback once blowing finishes (M1)", () => ({
    ok: audioAfterContinue === "playback" && audioAfterMicStart === "play-and-record" && audioAfterFinishBlowing === "playback",
    detail: JSON.stringify({ audioAfterContinue, audioAfterMicStart, audioAfterFinishBlowing }),
  }));
  await check("birthday: the post-blow melody is deferred, not started the instant the last candle is out (M1)", () => ({
    ok: oscSoonAfterBlow === 0,
    detail: String(oscSoonAfterBlow),
  }));
  await wait(page, 500);
  const oscAfterDelay = await page.eval(() => window.__bdayOscCount);
  await check("birthday: the deferred melody does start, about 400ms after the last candle (M1)", () => ({
    ok: oscAfterDelay > 0,
    detail: String(oscAfterDelay),
  }));
  await page.tap("#bday-close-btn");
  await wait(page, 150);
  const audioAfterClose = await page.eval(() => navigator.audioSession.type);
  await check("birthday: closing the surprise resets navigator.audioSession.type to 'auto' (M1)", () => ({
    ok: audioAfterClose === "auto",
    detail: String(audioAfterClose),
  }));

  // 17. m15: opening the letter, a SINGLE tap fills every remaining paragraph (not just the
  // current one), the "Bitirmek için dokun" hint then hides, and the Devam button is centred like
  // every other scene's.
  await openApp(page, { now: "2026-10-04T00:31:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await page.tap("#bday-scene0-continue");
  await blowAllCandlesByTap(page);
  await page.tap("#bday-scene1-continue");
  await wait(page, 150);
  await page.tap("#bday-scene2-continue");
  await wait(page, 150);
  await page.tap("#bday-gift-open-btn");
  await wait(page, 650);
  await page.tap(".bday-letter"); // a single tap
  await wait(page, 150);
  const letterSingleTapResult = await page.eval(() => {
    var expected = CONTENT.birthday.letter.paragraphs;
    var actual = Array.prototype.map.call(document.querySelectorAll(".bday-letter-p"), (p) => p.textContent);
    return {
      allFilled: JSON.stringify(actual) === JSON.stringify(expected),
      hintHidden: document.getElementById("bday-letter-hint").hidden === true,
      signatureVisible: document.getElementById("bday-letter-signature").hidden === false,
    };
  });
  await check("birthday: one tap on the letter fills every remaining paragraph at once, not just the current one (m15)", () => ({
    ok: letterSingleTapResult.allFilled === true,
    detail: JSON.stringify(letterSingleTapResult),
  }));
  await check("birthday: the \"Bitirmek için dokun\" hint hides once the letter has finished (m15)", () => ({
    ok: letterSingleTapResult.hintHidden === true && letterSingleTapResult.signatureVisible === true,
    detail: JSON.stringify(letterSingleTapResult),
  }));
  const continueBtnCenterResult = await page.eval(() => {
    var btn = document.getElementById("bday-scene3-continue").getBoundingClientRect();
    var letter = document.getElementById("bday-letter").getBoundingClientRect();
    return { btnCenter: btn.left + btn.width / 2, letterCenter: letter.left + letter.width / 2 };
  });
  await check("birthday: the letter's Devam button is centred, like every other scene's (m15)", () => ({
    ok: Math.abs(continueBtnCenterResult.btnCenter - continueBtnCenterResult.letterCenter) < 3,
    detail: JSON.stringify(continueBtnCenterResult),
  }));

  // 18. m4: candle/balloon/gift/guard touch targets set touch-action:manipulation and disable
  // text-select/callout, so a burst of rapid taps (5 candles, 8 balloons) never risks the iOS
  // text-selection bubble or a double-tap zoom.
  const touchTargetsResult = await page.eval(() => {
    var selectors = ["bday-candle", "bday-balloon", "bday-gift-open-btn", "bday-guard"];
    var out = {};
    selectors.forEach(function (cls) {
      var probe = document.createElement("button");
      probe.className = cls;
      document.body.appendChild(probe);
      var cs = getComputedStyle(probe);
      out[cls] = { touchAction: cs.touchAction, userSelect: cs.userSelect };
      document.body.removeChild(probe);
    });
    return out;
  });
  await check("birthday: candle/balloon/gift/guard touch targets set touch-action:manipulation and disable text-select/callout (m4)", () => ({
    ok: Object.keys(touchTargetsResult).every((k) => touchTargetsResult[k].touchAction === "manipulation" && touchTargetsResult[k].userSelect === "none"),
    detail: JSON.stringify(touchTargetsResult),
  }));
  const voiceCouponTouchTargetsResult = await page.eval(() => {
    var selectors = ["bday-voice-play", "bday-coupon"];
    var out = {};
    selectors.forEach(function (cls) {
      var probe = document.createElement("button");
      probe.className = cls;
      document.body.appendChild(probe);
      var cs = getComputedStyle(probe);
      out[cls] = { touchAction: cs.touchAction, userSelect: cs.userSelect };
      document.body.removeChild(probe);
    });
    return out;
  });
  await check("birthday: the voice-play heart and coupon cards also set touch-action:manipulation and disable text-select/callout", () => ({
    ok: Object.keys(voiceCouponTouchTargetsResult).every((k) => voiceCouponTouchTargetsResult[k].touchAction === "manipulation" && voiceCouponTouchTargetsResult[k].userSelect === "none"),
    detail: JSON.stringify(voiceCouponTouchTargetsResult),
  }));

  // 19. Voice-message scene: skipped entirely with no recording; shown, playable and stops the
  // music box first, when one exists at audio/sesli-mesaj.* (a real 0.3s WAV fixture, faked
  // present at the network level — see harness.mjs's setVoiceAudioFixture()).
  await openApp(page, { now: "2026-10-04T00:05:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await page.tap("#bday-scene0-continue");
  await blowAllCandlesByTap(page);
  await page.tap("#bday-scene1-continue");
  await wait(page, 150);
  await page.tap("#bday-scene2-continue");
  await wait(page, 150);
  await page.tap("#bday-gift-open-btn");
  await wait(page, 650);
  for (let i = 0; i < 8; i++) {
    await page.tap(".bday-letter");
    await wait(page, 60);
  }
  await wait(page, 150);
  await tapInView(page, "#bday-scene3-continue");
  await wait(page, 150);
  const noVoiceResult = await page.eval(() => ({
    voicePresent: !!document.querySelector(".bday-scene--voice"),
    couponsPresent: !!document.querySelector(".bday-scene--coupons"),
  }));
  await check("birthday: with no recording at audio/sesli-mesaj.*, the voice scene is skipped entirely — straight to coupons", () => ({
    ok: noVoiceResult.voicePresent === false && noVoiceResult.couponsPresent === true,
    detail: JSON.stringify(noVoiceResult),
  }));

  await openApp(page, { now: "2026-10-04T00:05:00", signedIn: true, voiceAudio: "wav", storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await page.tap("#bday-scene0-continue");
  await blowAllCandlesByTap(page);
  await page.tap("#bday-scene1-continue");
  await wait(page, 150);
  await page.tap("#bday-scene2-continue");
  await wait(page, 150);
  await page.tap("#bday-gift-open-btn");
  await wait(page, 650);
  for (let i = 0; i < 8; i++) {
    await page.tap(".bday-letter");
    await wait(page, 60);
  }
  await wait(page, 150);
  // Force the music box back on right before entering the voice scene — proves the scene's own
  // defensive stopMelody() call, not just the (already-true) fact that earlier scenes stop it too.
  await page.eval(() => { window.birthdayTestStartMelody(); });
  const melodyForcedOn = await page.eval(() => window.birthdayTestIsMelodyPlaying());
  await tapInView(page, "#bday-scene3-continue");
  await wait(page, 150);
  const voiceSceneResult = await page.eval(() => {
    var titleEl = document.querySelector(".bday-voice-title");
    var hintEl = document.querySelector(".bday-scene--voice .bday-scene-subtitle");
    return {
      present: !!document.querySelector(".bday-scene--voice"),
      titleText: titleEl ? titleEl.textContent : null,
      expectedTitle: CONTENT.birthday.voice.title,
      hintText: hintEl ? hintEl.textContent : null,
      expectedHint: CONTENT.birthday.voice.hint,
      playAriaLabel: document.getElementById("bday-voice-play").getAttribute("aria-label"),
      expectedPlayLabel: CONTENT.birthday.voice.play,
      audioAutoplay: document.getElementById("bday-voice-audio").autoplay,
      melodyStillPlaying: window.birthdayTestIsMelodyPlaying(),
    };
  });
  await check("birthday: the voice scene shows CONTENT.birthday.voice title/hint, a labelled play button, and no autoplay", () => ({
    ok: voiceSceneResult.present === true && voiceSceneResult.titleText === voiceSceneResult.expectedTitle
      && voiceSceneResult.hintText === voiceSceneResult.expectedHint && voiceSceneResult.playAriaLabel === voiceSceneResult.expectedPlayLabel
      && voiceSceneResult.audioAutoplay === false,
    detail: JSON.stringify(voiceSceneResult),
  }));
  await check("birthday: entering the voice scene stops a still-playing music box first (M1-style defensive stopMelody)", () => ({
    ok: melodyForcedOn === true && voiceSceneResult.melodyStillPlaying === false,
    detail: JSON.stringify({ melodyForcedOn, melodyStillPlaying: voiceSceneResult.melodyStillPlaying }),
  }));

  // The progress ring sits around the heart: same centre, and the ring fills the 96px button.
  const voiceRing = await page.eval(() => {
    var ring = document.querySelector(".bday-voice-ring").getBoundingClientRect();
    var heart = document.getElementById("bday-voice-heart").getBoundingClientRect();
    var btn = document.getElementById("bday-voice-play").getBoundingClientRect();
    return {
      dx: Math.abs((ring.left + ring.width / 2) - (heart.left + heart.width / 2)),
      dy: Math.abs((ring.top + ring.height / 2) - (heart.top + heart.height / 2)),
      ringW: ring.width, btnW: btn.width,
    };
  });
  await check("birthday: the voice progress ring is centred on the heart and fills the play button", () => ({
    ok: voiceRing.dx <= 2 && voiceRing.dy <= 3 && Math.abs(voiceRing.ringW - voiceRing.btnW) <= 1,
    detail: JSON.stringify(voiceRing),
  }));

  await page.tap("#bday-voice-play");
  await wait(page, 150);
  const playingResult = await page.eval(() => ({
    paused: document.getElementById("bday-voice-audio").paused,
    isPlayingClass: document.getElementById("bday-voice-play").classList.contains("is-playing"),
    ariaLabel: document.getElementById("bday-voice-play").getAttribute("aria-label"),
    expectedPauseLabel: CONTENT.birthday.voice.pause,
  }));
  await check("birthday: tapping the heart button plays the recording and swaps the aria-label to CONTENT.birthday.voice.pause", () => ({
    ok: playingResult.paused === false && playingResult.isPlayingClass === true && playingResult.ariaLabel === playingResult.expectedPauseLabel,
    detail: JSON.stringify(playingResult),
  }));

  await page.tap("#bday-voice-play");
  await wait(page, 150);
  const pausedResult = await page.eval(() => ({
    paused: document.getElementById("bday-voice-audio").paused,
    isPlayingClass: document.getElementById("bday-voice-play").classList.contains("is-playing"),
    ariaLabel: document.getElementById("bday-voice-play").getAttribute("aria-label"),
    expectedPlayLabel: CONTENT.birthday.voice.play,
  }));
  await check("birthday: tapping the heart button again pauses it and swaps the aria-label back to CONTENT.birthday.voice.play", () => ({
    ok: pausedResult.paused === true && pausedResult.isPlayingClass === false && pausedResult.ariaLabel === pausedResult.expectedPlayLabel,
    detail: JSON.stringify(pausedResult),
  }));

  // A live reference stashed on window survives the scene's own markup being torn down, so the
  // SAME <audio> element's .paused/.currentTime can be read back after it leaves the DOM —
  // proving the scene's cleanup actually paused and released it, not just that the app moved on.
  await page.tap("#bday-voice-play"); // resume, so leaving the scene has something real to pause/release
  await wait(page, 150);
  await page.eval(() => { window.__bdayVoiceAudioRef = document.getElementById("bday-voice-audio"); });
  const preLeaveState = await page.eval(() => ({
    continueAvailable: document.getElementById("bday-scene-voice-continue").hidden === false,
    wasPlaying: window.__bdayVoiceAudioRef.paused === false,
  }));
  await page.tap("#bday-scene-voice-continue");
  await wait(page, 150);
  const afterLeavingVoice = await page.eval(() => ({
    couponsPresent: !!document.querySelector(".bday-scene--coupons"),
    audioPaused: window.__bdayVoiceAudioRef.paused === true,
    audioReset: window.__bdayVoiceAudioRef.currentTime === 0,
  }));
  await check("birthday: Devam is available on the voice scene without waiting for playback to finish, and advances to coupons", () => ({
    ok: preLeaveState.continueAvailable === true && afterLeavingVoice.couponsPresent === true,
    detail: JSON.stringify({ preLeaveState, afterLeavingVoice }),
  }));
  await check("birthday: leaving the voice scene pauses and releases (resets) the audio element", () => ({
    ok: preLeaveState.wasPlaying === true && afterLeavingVoice.audioPaused === true && afterLeavingVoice.audioReset === true,
    detail: JSON.stringify({ preLeaveState, afterLeavingVoice }),
  }));

  // Closing the whole overlay while the voice scene is playing pauses/releases it too (not just a
  // scene-to-scene change) — same stash-a-live-reference technique, a fresh overlay open.
  await openApp(page, { now: "2026-10-04T00:05:00", signedIn: true, voiceAudio: "wav", storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await page.tap("#bday-scene0-continue");
  await blowAllCandlesByTap(page);
  await page.tap("#bday-scene1-continue");
  await wait(page, 150);
  await page.tap("#bday-scene2-continue");
  await wait(page, 150);
  await page.tap("#bday-gift-open-btn");
  await wait(page, 650);
  for (let i = 0; i < 8; i++) {
    await page.tap(".bday-letter");
    await wait(page, 60);
  }
  await wait(page, 150);
  await tapInView(page, "#bday-scene3-continue");
  await wait(page, 150);
  await page.tap("#bday-voice-play");
  await wait(page, 150);
  await page.eval(() => { window.__bdayVoiceAudioRef2 = document.getElementById("bday-voice-audio"); });
  const wasPlayingBeforeClose = await page.eval(() => window.__bdayVoiceAudioRef2.paused === false);
  await page.tap("#bday-close-btn");
  await wait(page, 150);
  const afterOverlayClose = await page.eval(() => ({
    overlayHidden: document.getElementById("birthday-overlay").hidden,
    audioPaused: window.__bdayVoiceAudioRef2.paused === true,
  }));
  await check("birthday: closing the whole overlay while the voice message plays also pauses/releases it", () => ({
    ok: wasPlayingBeforeClose === true && afterOverlayClose.overlayHidden === true && afterOverlayClose.audioPaused === true,
    detail: JSON.stringify({ wasPlayingBeforeClose, afterOverlayClose }),
  }));

  // 20. Love coupons: the booklet scene, an in-page confirm (never window.confirm/alert), a
  // persisted stamp with today's date, "Sonra" as a no-op, preview mode's no-persist guarantee,
  // and the always-visible 🎁-tab list.
  await openApp(page, { now: "2026-10-04T00:05:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" } });
  await waitUntilOverlayOpen(page);
  await page.tap("#bday-scene0-continue");
  await blowAllCandlesByTap(page);
  await page.tap("#bday-scene1-continue");
  await wait(page, 150);
  await page.tap("#bday-scene2-continue");
  await wait(page, 150);
  await page.tap("#bday-gift-open-btn");
  await wait(page, 650);
  for (let i = 0; i < 8; i++) {
    await page.tap(".bday-letter");
    await wait(page, 60);
  }
  await wait(page, 150);
  await tapInView(page, "#bday-scene3-continue");
  await wait(page, 150);
  const couponsSceneResult = await page.eval(() => ({
    count: document.querySelectorAll("#bday-coupon-booklet .bday-coupon").length,
    titleText: document.querySelector(".bday-coupons-title").textContent,
    expectedTitle: CONTENT.birthday.coupons.title,
  }));
  await check("birthday: the coupons scene shows all 8 items from CONTENT.birthday.coupons.items under CONTENT.birthday.coupons.title", () => ({
    ok: couponsSceneResult.count === 8 && couponsSceneResult.titleText === couponsSceneResult.expectedTitle,
    detail: JSON.stringify(couponsSceneResult),
  }));

  await page.eval(() => {
    window.__bdayConfirmCalled = false;
    var orig = window.confirm;
    window.confirm = function () { window.__bdayConfirmCalled = true; return orig ? orig.apply(window, arguments) : false; };
  });
  await tapInView(page, '#bday-coupon-booklet [data-coupon="hug"]');
  await wait(page, 150);
  const confirmDialogResult = await page.eval(() => ({
    visible: document.getElementById("bday-coupon-confirm").hidden === false,
    titleText: document.getElementById("bday-coupon-confirm-title").textContent,
    textContent: document.querySelector(".bday-coupon-confirm-text").textContent,
    expectedConfirmText: CONTENT.birthday.coupons.confirm,
    yesLabel: document.getElementById("bday-coupon-confirm-yes").textContent,
    noLabel: document.getElementById("bday-coupon-confirm-no").textContent,
    expectedYes: CONTENT.birthday.coupons.yes,
    expectedNo: CONTENT.birthday.coupons.no,
    windowConfirmCalled: window.__bdayConfirmCalled,
  }));
  await check("birthday: tapping a coupon opens an in-page confirm (never window.confirm) reading CONTENT.birthday.coupons text", () => ({
    ok: confirmDialogResult.visible === true && confirmDialogResult.titleText === "Sınırsız sarılma"
      && confirmDialogResult.textContent === confirmDialogResult.expectedConfirmText
      && confirmDialogResult.yesLabel === confirmDialogResult.expectedYes && confirmDialogResult.noLabel === confirmDialogResult.expectedNo
      && confirmDialogResult.windowConfirmCalled === false,
    detail: JSON.stringify(confirmDialogResult),
  }));

  await page.tap("#bday-coupon-confirm-no");
  await wait(page, 150);
  const afterNoResult = await page.eval(() => ({
    dialogHidden: document.getElementById("bday-coupon-confirm").hidden,
    couponUsed: document.querySelector('#bday-coupon-booklet [data-coupon="hug"]').classList.contains("is-used"),
    stored: (function () { try { return localStorage.getItem("meryem-coupons-used"); } catch (e) { return "ERR"; } })(),
  }));
  await check('birthday: "Sonra" is a no-op — the dialog closes, nothing is stamped, nothing is stored', () => ({
    ok: afterNoResult.dialogHidden === true && afterNoResult.couponUsed === false && afterNoResult.stored == null,
    detail: JSON.stringify(afterNoResult),
  }));

  await tapInView(page, '#bday-coupon-booklet [data-coupon="hug"]');
  await wait(page, 150);
  await page.tap("#bday-coupon-confirm-yes");
  await wait(page, 150);
  const afterYesResult = await page.eval(() => {
    var stampEl = document.querySelector('#bday-coupon-booklet [data-coupon="hug"] .bday-coupon-stamp');
    var tabEl = document.querySelector('#bday-coupon-booklet-tab [data-coupon="hug"]');
    var stored = null;
    try { stored = JSON.parse(localStorage.getItem("meryem-coupons-used") || "{}"); } catch (e) {}
    return {
      dialogHidden: document.getElementById("bday-coupon-confirm").hidden,
      isUsed: document.querySelector('#bday-coupon-booklet [data-coupon="hug"]').classList.contains("is-used"),
      stampHidden: stampEl.hidden,
      stampText: stampEl.textContent,
      expectedUsedLabel: CONTENT.birthday.coupons.used,
      tabSyncedLive: tabEl ? tabEl.classList.contains("is-used") : false,
      stored: stored,
    };
  });
  // Matches the product code exact separator: a no-break space, a middle dot, a
  // no-break space (js/birthday.js, same convention CONTENT.js documents at its own top).
  const expectedStampText = "Kullan\u0131ld\u0131" + "\u00a0\u00b7\u00a0" + "04.10.2026";
  await check("birthday: \"Evet\" stamps CONTENT.birthday.coupons.used + today's date (dd.mm.yyyy) and persists {id:'YYYY-MM-DD'} via storageSet", () => ({
    ok: afterYesResult.dialogHidden === true && afterYesResult.isUsed === true && afterYesResult.stampHidden === false
      && afterYesResult.expectedUsedLabel === "Kullan\u0131ld\u0131" && afterYesResult.stampText === expectedStampText
      && afterYesResult.stored && afterYesResult.stored.hug === "2026-10-04",
    detail: JSON.stringify({ ...afterYesResult, expectedStampText }),
  }));
  await check("birthday: the stamp reaches the 🎁-tab list live, without needing a reload (same data-coupon id, different container)", () => ({
    ok: afterYesResult.tabSyncedLive === true,
    detail: JSON.stringify(afterYesResult),
  }));

  // A real close (M2's seen-year write) before reloading — otherwise the surprise auto-reopens on
  // the next load (maybeAutoOpenBirthday(), section 3 above) and covers the 🎁-tab entirely, which
  // is not what "stays stamped after reload" or "the tab always lists all 8" mean to exercise.
  await page.tap("#bday-close-btn");
  await wait(page, 150);

  await openApp(page, { now: "2026-10-04T00:06:00", signedIn: true, keepStorage: true });
  await page.tap(".nav-btn[data-tab=\"birthday-view\"]");
  await wait(page, 150);
  const stampAfterReload = await page.eval(() => {
    var el = document.querySelector('#bday-coupon-booklet-tab [data-coupon="hug"] .bday-coupon-stamp');
    return { present: !!el, hidden: el ? el.hidden : null, isUsed: !!document.querySelector('#bday-coupon-booklet-tab [data-coupon="hug"].is-used') };
  });
  await check("birthday: a stamped coupon stays stamped after reload (real localStorage persistence)", () => ({
    ok: stampAfterReload.present === true && stampAfterReload.hidden === false && stampAfterReload.isUsed === true,
    detail: JSON.stringify(stampAfterReload),
  }));

  const tabCouponsResult = await page.eval(() => {
    var titleEl = document.querySelector(".bday-coupons-tab-title");
    return {
      count: document.querySelectorAll("#bday-coupon-booklet-tab .bday-coupon").length,
      usedCount: document.querySelectorAll("#bday-coupon-booklet-tab .bday-coupon.is-used").length,
      sectionTitle: titleEl ? titleEl.textContent : null,
      expectedTitle: CONTENT.birthday.coupons.title,
    };
  });
  await check("birthday: the 🎁 tab always lists all 8 coupons with their state under the ready card, while unlocked", () => ({
    ok: tabCouponsResult.count === 8 && tabCouponsResult.usedCount === 1 && tabCouponsResult.sectionTitle === tabCouponsResult.expectedTitle,
    detail: JSON.stringify(tabCouponsResult),
  }));

  // The tab's coupon list flows with the page: no inner scroll box nested inside the scrolling tab.
  const tabBooklet = await page.eval(() => {
    var el = document.getElementById("bday-coupon-booklet-tab");
    var cs = getComputedStyle(el);
    return { overflowY: cs.overflowY, maxHeight: cs.maxHeight, clientHeight: el.clientHeight, scrollHeight: el.scrollHeight };
  });
  await check("birthday: the 🎁 tab's coupon list is not an inner scroll box", () => ({
    ok: tabBooklet.overflowY === "visible" && tabBooklet.maxHeight === "none" && tabBooklet.scrollHeight <= tabBooklet.clientHeight + 1,
    detail: JSON.stringify(tabBooklet),
  }));

  await tapInView(page, '#bday-coupon-booklet-tab [data-coupon="hug"]');
  await wait(page, 150);
  const usedTapIsNoop = await page.eval(() => {
    var dialog = document.getElementById("bday-coupon-confirm");
    return dialog ? dialog.hidden : true;
  });
  await check("birthday: tapping an already-used coupon is a no-op — no confirm dialog reopens", () => ({
    ok: usedTapIsNoop === true,
    detail: String(usedTapIsNoop),
  }));

  // Preview mode: stamps on screen but persists nothing (the in-memory shadow), same guarantee
  // words.js's own jar/letters already have.
  await openApp(page, { query: "?onizleme=dogumgunu", signedIn: true, storage: {} });
  await wait(page, 300); // let any natural gate/birthday auto-play settle first
  await page.eval(() => {
    var bOverlay = document.getElementById("birthday-overlay");
    if (bOverlay) { bOverlay.hidden = true; bOverlay.innerHTML = ""; }
    var gOverlay = document.getElementById("gate-overlay");
    if (gOverlay) { gOverlay.hidden = true; gOverlay.innerHTML = ""; }
    var appContent = document.getElementById("app-content");
    if (appContent) appContent.removeAttribute("inert");
    document.body.style.overflow = "";
  });
  await page.tap(".nav-btn[data-tab=\"birthday-view\"]");
  await wait(page, 150);
  await tapInView(page, '#bday-coupon-booklet-tab [data-coupon="trip"]');
  await wait(page, 150);
  await page.tap("#bday-coupon-confirm-yes");
  await wait(page, 150);
  const previewCouponResult = await page.eval(() => ({
    isUsedOnScreen: document.querySelector('#bday-coupon-booklet-tab [data-coupon="trip"]').classList.contains("is-used"),
    stored: (function () { try { return localStorage.getItem("meryem-coupons-used"); } catch (e) { return "ERR"; } })(),
  }));
  await check("birthday: preview mode stamps a coupon on screen but stores nothing (in-memory shadow)", () => ({
    ok: previewCouponResult.isUsedOnScreen === true && previewCouponResult.stored == null,
    detail: JSON.stringify(previewCouponResult),
  }));

  // 21. Reduced motion: the voice ring/heart-pulse and the coupon confirm's entrance animation
  // drop out (playback and the dialog itself still work) — the same rule every other scene follows.
  await openApp(page, { now: "2026-10-04T00:05:00", signedIn: true, voiceAudio: "wav", storage: { "meryem-gate-played-year": "2026" }, reducedMotion: true });
  await waitUntilOverlayOpen(page);
  await page.tap("#bday-scene0-continue");
  await blowAllCandlesByTap(page);
  await page.tap("#bday-scene1-continue");
  await wait(page, 150);
  await page.tap("#bday-scene2-continue");
  await wait(page, 150);
  await page.tap("#bday-gift-open-btn");
  await wait(page, 650);
  for (let i = 0; i < 8; i++) {
    await page.tap(".bday-letter");
    await wait(page, 60);
  }
  await wait(page, 150);
  await tapInView(page, "#bday-scene3-continue");
  await wait(page, 150);
  await page.tap("#bday-voice-play");
  await wait(page, 150);
  const reducedVoiceResult = await page.eval(() => ({
    // transitionProperty, not transitionDuration: the site-wide reduced-motion reset (style.css)
    // already forces every element's transition-duration to .01ms with !important regardless of
    // this rule, so duration alone can't tell the two apart — property can, since only this
    // app's own rule (transition: none) resets it away from "stroke-dashoffset".
    ringTransitionProperty: getComputedStyle(document.getElementById("bday-voice-ring-progress")).transitionProperty,
    heartAnimationName: getComputedStyle(document.getElementById("bday-voice-heart")).animationName,
    isPlaying: document.getElementById("bday-voice-play").classList.contains("is-playing"),
  }));
  await check("birthday: reduced motion — the voice ring/heart drop their animation, and playback still works", () => ({
    ok: reducedVoiceResult.isPlaying === true && reducedVoiceResult.ringTransitionProperty === "none" && reducedVoiceResult.heartAnimationName === "none",
    detail: JSON.stringify(reducedVoiceResult),
  }));

  await page.tap("#bday-scene-voice-continue");
  await wait(page, 150);
  await tapInView(page, '#bday-coupon-booklet [data-coupon="hug"]');
  await wait(page, 150);
  const reducedConfirmResult = await page.eval(() => ({
    visible: document.getElementById("bday-coupon-confirm").hidden === false,
    cardAnimationName: getComputedStyle(document.querySelector(".bday-coupon-confirm-card")).animationName,
  }));
  await check("birthday: reduced motion — the coupon confirm dialog shows instantly, no entrance animation", () => ({
    ok: reducedConfirmResult.visible === true && reducedConfirmResult.cardAnimationName === "none",
    detail: JSON.stringify(reducedConfirmResult),
  }));
}

export const mutants = [
  {
    id: "birthday-voice-ring-offcentre",
    file: "css/birthday.css",
    find: "  width: 100%;\n  height: 100%;\n  transform: rotate(-90deg);",
    replace: "  transform: rotate(-90deg);",
    expect: "birthday: the voice progress ring is centred on the heart and fills the play button",
  },
  {
    id: "birthday-tab-coupons-inner-scroll",
    file: "css/birthday.css",
    find: "  max-height: none;\n  overflow: visible;\n}",
    replace: "}",
    expect: "birthday: the 🎁 tab's coupon list is not an inner scroll box",
  },
  {
    id: "birthday-seen-year-guard",
    file: "js/birthday.js",
    find: "if (seenYear === String(birthdayYear())) return;",
    replace: "if (false) return;",
    expect: "birthday: reopening after a real close does not auto-open again",
  },
  {
    id: "birthday-gate-due-guard",
    file: "js/birthday.js",
    find: "if (window.isGateDue && window.isGateDue()) return;",
    replace: "if (false) return;",
    expect: "birthday: maybeAutoOpenBirthday() defers to a due gate (window.isGateDue) and does not open",
  },
  {
    id: "birthday-blow-detector-sustain",
    file: "js/birthday.js",
    find: "if (tMs - aboveSinceMs >= sustainMs) {",
    replace: "if (tMs - aboveSinceMs >= 0) {",
    expect: "birthday: the blow detector trips only after the sustained window, and rearms for the next candle",
  },
  {
    id: "birthday-letter-signature-hidden",
    file: "js/birthday.js",
    find: "if (sig) sig.hidden = false;",
    replace: "if (sig) sig.hidden = true;",
    expect: "birthday: the letter ends with CONTENT.birthday.letter.signature",
  },
  {
    id: "birthday-candle-lit-guard",
    file: "js/birthday.js",
    find: "if (!btn || !btn.classList.contains('is-lit')) return;",
    replace: "if (!btn || btn.classList.contains('is-lit')) return;",
    expect: "birthday: mic denied — tapping all 5 candles still finishes (afterBlow shown, confetti, an AudioContext)",
  },
  {
    id: "birthday-close-restores-scroll",
    file: "js/birthday.js",
    find: "document.body.style.overflow = '';",
    replace: "document.body.style.overflow = 'hidden';",
    expect: "birthday: the × close button restores the app (overlay hidden+empty, scroll restored, aria-label \"Kapat\")",
  },
  {
    id: "birthday-nav-glow-condition",
    file: "js/birthday.js",
    find: "navBtn.classList.toggle('is-glowing', isBirthdayUnlocked() && !seen);",
    replace: "navBtn.classList.toggle('is-glowing', false);",
    expect: "birthday: unlocked + not seen this year + a due gate still shows the gift-tab glow",
  },
  {
    id: "birthday-dayzero-tease-filter",
    file: "js/birthday.js",
    find: "var pool = r.days > 0 ? teases : teases.filter(function (t) { return t.indexOf('{days}') === -1; });",
    replace: "var pool = teases;",
    expect: "birthday: on the eve (days=0) the {days}-interpolated teases are excluded — no '0 gün' wording",
  },
  {
    id: "birthday-cake-reveal-timers-cancelled",
    file: "js/birthday.js",
    find: "_bdayCakeTimers.forEach(clearTimeout);",
    replace: "",
    expect: "birthday: past the scene's original ~4.2s reveal mark, the blow prompt never resurfaces under the after-blow celebration",
  },
  {
    id: "birthday-finish-blowing-hides-wish-text",
    file: "js/birthday.js",
    find: "if (wishTextEl) wishTextEl.hidden = true;",
    replace: "",
    expect: "birthday: finishing early hides the wish text immediately, instead of leaving it overlapping the after-blow celebration",
  },
  {
    id: "birthday-balloon-wish-full-row",
    file: "js/birthday.js",
    find: "slot.className = 'bday-balloon-slot bday-balloon-slot--revealed';",
    replace: "",
    expect: "birthday: a popped balloon's wish card is a legible full-width card, not a narrow cramped column",
  },
  {
    id: "birthday-candle-touch-target",
    file: "css/birthday.css",
    find: "width: 34px;",
    replace: "width: 26px;",
    expect: "birthday: candle tap targets are at least 32px wide (up from the original 26px)",
  },
  {
    id: "birthday-candle-top-tier-fit",
    file: "css/birthday.css",
    find: "width: 226px;",
    replace: "width: 140px;",
    expect: "birthday: all 5 lit candles stand on the top tier's surface, inside its width",
  },
  {
    id: "birthday-ready-card-content-literal",
    file: "js/birthday.js",
    find: "var readySubtitle = (seen ? ready.again : ready.firstTime) || (seen",
    replace: "var readySubtitle = (seen",
    expect: "birthday: the unlocked ready card (not opened yet this year) reads CONTENT.birthday.ready.title/.firstTime",
  },
  {
    id: "birthday-balloons-prompt-content-literal",
    file: "js/birthday.js",
    find: "'<p class=\"bday-scene-subtitle\">' + bdayEsc(balloonsPrompt) + '</p>' +",
    replace: "'<p class=\"bday-scene-subtitle\">Birini seç, bir dilek çıksın 🎈</p>' +",
    expect: "birthday: the balloons scene prompt reads CONTENT.birthday.balloonsPrompt",
  },
  {
    id: "birthday-overlay-inert-appcontent",
    file: "js/birthday.js",
    find: "if (appContent) appContent.setAttribute('inert', '');",
    replace: "",
    expect: "birthday: the open overlay inerts #app-content and names itself for assistive tech",
  },
  {
    id: "birthday-overlay-focus-trap",
    file: "js/birthday.js",
    find: "overlay.addEventListener('keydown', bdayOverlayKeydown);",
    replace: "",
    expect: "birthday: Tab from the last focusable control in the overlay wraps to the first (focus trap)",
  },
  {
    id: "birthday-countdown-labels-lowercase",
    file: "js/birthday.js",
    find: "{ key: 'days', label: 'gün' },",
    replace: "{ key: 'days', label: 'Gün' },",
    expect: "birthday: the 🎁 countdown's unit labels are lowercase (gün/saat/dakika/saniye), matching Tarihler's own widget (m12)",
  },
  {
    id: "birthday-tick-gate-on-unlock",
    file: "js/birthday.js",
    find: "if (typeof window.startGateIfDue === 'function') window.startGateIfDue();",
    replace: "",
    expect: "birthday: passing midnight while the app is already open fires meryem:birthday-unlocked and starts the due gate (B1)",
  },
  {
    id: "birthday-tick-unlock-event-dispatched",
    file: "js/birthday.js",
    find: "document.dispatchEvent(new CustomEvent('meryem:birthday-unlocked'));",
    replace: "",
    expect: "birthday: passing midnight while the app is already open fires meryem:birthday-unlocked and starts the due gate (B1)",
  },
  {
    id: "birthday-open-btn-gate-aware",
    file: "js/birthday.js",
    find: "if (window.isGateDue && window.isGateDue()) window.startGateIfDue();\n      else openBirthdaySurprise();",
    replace: "openBirthdaySurprise();",
    expect: "birthday: with the gate due, tapping #bday-open-btn starts the gate instead of opening the surprise directly (B1)",
  },
  {
    id: "birthday-seenyear-written-on-close",
    file: "js/birthday.js",
    find: "storageSet('meryem-birthday-seen-year', String(birthdayYear()));",
    replace: "",
    expect: "birthday: closing the surprise writes the seen-year flag (M2)",
  },
  {
    id: "birthday-seenyear-not-written-on-open",
    file: "js/birthday.js",
    find: "_bdayReturnFocusEl = document.activeElement;",
    replace: "storageSet('meryem-birthday-seen-year', String(birthdayYear())); _bdayReturnFocusEl = document.activeElement;",
    expect: "birthday: the seen-year flag is not written while the surprise is still open (M2)",
  },
  {
    id: "birthday-slideshow-advances-under-reduced-motion",
    file: "js/birthday.js",
    find: "if (frames.length > 1) {",
    replace: "if (frames.length > 1 && !prefersReducedMotion()) {",
    expect: "birthday: under reduced motion the slideshow still advances past the first photo — lost content, not motion (M5)",
  },
  {
    id: "birthday-slideshow-camera-filename-caption-filter",
    file: "js/birthday.js",
    find: "var showCaption = !!title && !BDAY_CAMERA_FILENAME_RE.test(title.trim());",
    replace: "var showCaption = !!title;",
    expect: "birthday: a camera/picker filename ('IMG_4821') is never shown as a slideshow caption; a real title still is (M7)",
  },
  {
    id: "birthday-slideshow-chronological-order",
    file: "js/birthday.js",
    find: "var photos = all.filter(function (m) { return !!getMemoryPhotoUrlSafe(m); }).reverse();",
    replace: "var photos = all.filter(function (m) { return !!getMemoryPhotoUrlSafe(m); });",
    expect: "birthday: the slideshow shows photos oldest-first, reversing Firestore's newest-first order (M19)",
  },
  {
    id: "birthday-slideshow-photo-src-dom-property-not-concatenated",
    file: "js/birthday.js",
    find: "img.src = url;",
    replace: "img.outerHTML = '<img src=\"' + url + '\">';",
    expect: "birthday: a crafted photo URL (quote-breakout payload) never executes as markup (m1)",
  },
  {
    id: "birthday-slideshow-thumbnail-background-preview",
    file: "js/birthday.js",
    find: "if (thumb) img.style.backgroundImage = 'url(' + JSON.stringify(thumb) + ')';",
    replace: "",
    expect: "birthday: each slideshow photo shows a blush-background thumbnail preview behind the full image (M19)",
  },
  {
    id: "birthday-escape-closes-overlay",
    file: "js/birthday.js",
    find: "if (e.key === 'Escape') { closeBirthdaySurprise(); return; }",
    replace: "",
    expect: "birthday: pressing Escape closes the birthday overlay (m9)",
  },
  {
    id: "birthday-title-scene-balloons-unclipped",
    file: "css/birthday.css",
    find: "position: fixed;\n  inset: 0;\n  z-index: 0;\n  pointer-events: none;\n  overflow: hidden;\n}\n\n.bday-hat-bears,\n.bday-scene--title .bday-title-script,\n.bday-scene--title .bday-continue-btn {\n  position: relative;\n  z-index: 1;\n}",
    replace: "position: absolute;\n  inset: 0;\n  pointer-events: none;\n  overflow: hidden;\n}",
    expect: "birthday: the title scene's background balloons are a fixed, unclipped full-viewport layer, with the scene content stacked above it (m14)",
  },
  {
    id: "birthday-audio-session-playback-on-open",
    file: "js/birthday.js",
    find: "bdaySetAudioSession('playback');\n      ensureAudioContext();",
    replace: "ensureAudioContext();",
    expect: "birthday: navigator.audioSession.type follows the scene — playback for the opener, play-and-record while the mic listens, playback once blowing finishes (M1)",
  },
  {
    id: "birthday-audio-session-play-and-record",
    file: "js/birthday.js",
    find: "bdaySetAudioSession('play-and-record');",
    replace: "",
    expect: "birthday: navigator.audioSession.type follows the scene — playback for the opener, play-and-record while the mic listens, playback once blowing finishes (M1)",
  },
  {
    id: "birthday-audio-session-playback-after-blow",
    file: "js/birthday.js",
    find: "stopMicAndAnalyser();\n    bdaySetAudioSession('playback');",
    replace: "stopMicAndAnalyser();",
    expect: "birthday: navigator.audioSession.type follows the scene — playback for the opener, play-and-record while the mic listens, playback once blowing finishes (M1)",
  },
  {
    id: "birthday-melody-deferred-after-blow",
    file: "js/birthday.js",
    find: "_bdayMelodyTimeoutId = setTimeout(function () {\n      _bdayMelodyTimeoutId = null;\n      playMelody();\n    }, 400);",
    replace: "playMelody();",
    expect: "birthday: the post-blow melody is deferred, not started the instant the last candle is out (M1)",
  },
  {
    id: "birthday-audio-session-reset-on-close",
    file: "js/birthday.js",
    find: "bdaySetAudioSession('auto');",
    replace: "",
    expect: "birthday: closing the surprise resets navigator.audioSession.type to 'auto' (M1)",
  },
  {
    id: "birthday-letter-single-tap-skip-all",
    file: "js/birthday.js",
    find: "if (_bdayLetterSkipAll) {",
    replace: "if (false) {",
    expect: "birthday: one tap on the letter fills every remaining paragraph at once, not just the current one (m15)",
  },
  {
    id: "birthday-letter-hint-hides-on-finish",
    file: "js/birthday.js",
    find: "if (hintEl) hintEl.hidden = true;",
    replace: "",
    expect: "birthday: the \"Bitirmek için dokun\" hint hides once the letter has finished (m15)",
  },
  {
    id: "birthday-letter-continue-btn-centered",
    file: "css/birthday.css",
    find: ".bday-letter .bday-continue-btn {\n  display: block;\n  margin-left: auto;\n  margin-right: auto;\n}",
    replace: "",
    expect: "birthday: the letter's Devam button is centred, like every other scene's (m15)",
  },
  {
    id: "birthday-touch-targets-manipulation",
    file: "css/birthday.css",
    find: ".bday-candle,\n.bday-balloon,\n.bday-gift-open-btn,\n.bday-guard {\n  -webkit-touch-callout: none;\n  -webkit-user-select: none;\n  user-select: none;\n  touch-action: manipulation;\n}",
    replace: "",
    expect: "birthday: candle/balloon/gift/guard touch targets set touch-action:manipulation and disable text-select/callout (m4)",
  },
  {
    id: "birthday-voice-touch-targets-manipulation",
    file: "css/birthday.css",
    find: ".bday-voice-play,\n.bday-coupon {\n  -webkit-touch-callout: none;\n  -webkit-user-select: none;\n  user-select: none;\n  touch-action: manipulation;\n}",
    replace: "",
    expect: "birthday: the voice-play heart and coupon cards also set touch-action:manipulation and disable text-select/callout",
  },
  {
    // Always including the voice scene shifts every later scene's position by one — an earlier
    // section's reachSlideshow() (a hardcoded #bday-scene-coupons-continue tap right after the
    // letter) hits the now-present voice scene instead and throws, crashing the whole module
    // before this file's own dedicated "skipped entirely" check ever runs — hence this mutant's
    // real, reliable signature is the module-level failure, not that later check by name.
    id: "birthday-voice-scene-only-when-found",
    file: "js/birthday.js",
    find: "if (voiceUrl) scenes.push(makeRenderSceneVoice(voiceUrl));",
    replace: "scenes.push(makeRenderSceneVoice(voiceUrl));",
    expect: "birthday: module ran to the end",
  },
  {
    id: "birthday-voice-stops-melody-on-mount",
    file: "js/birthday.js",
    find: "so her voice never has to compete with it. */\n      stopMelody();",
    replace: "so her voice never has to compete with it. */",
    expect: "birthday: entering the voice scene stops a still-playing music box first (M1-style defensive stopMelody)",
  },
  {
    id: "birthday-voice-play-toggle-class",
    file: "js/birthday.js",
    find: "playBtn.classList.toggle('is-playing', isPlaying);",
    replace: "",
    expect: "birthday: tapping the heart button plays the recording and swaps the aria-label to CONTENT.birthday.voice.pause",
  },
  {
    id: "birthday-voice-aria-label-swap",
    file: "js/birthday.js",
    find: "playBtn.setAttribute('aria-label', isPlaying ? pauseLabel : playLabel);",
    replace: "playBtn.setAttribute('aria-label', playLabel);",
    expect: "birthday: tapping the heart button plays the recording and swaps the aria-label to CONTENT.birthday.voice.pause",
  },
  {
    id: "birthday-voice-no-autoplay",
    file: "js/birthday.js",
    find: 'id="bday-voice-audio" preload="none" src="',
    replace: 'id="bday-voice-audio" autoplay preload="none" src="',
    expect: "birthday: the voice scene shows CONTENT.birthday.voice title/hint, a labelled play button, and no autoplay",
  },
  {
    id: "birthday-voice-cleanup-pauses-audio",
    file: "js/birthday.js",
    find: "return function cleanup() {\n        audio.pause();\n        try { audio.currentTime = 0; } catch (e) { /* metadata not loaded yet — nothing to reset */ }\n      };",
    replace: "return function cleanup() {};",
    expect: "birthday: leaving the voice scene pauses and releases (resets) the audio element",
  },
  {
    id: "birthday-coupons-scene-list-from-content",
    file: "js/birthday.js",
    find: "return items.map(function (item) { return bdayCouponItemMarkup(item, used[item.id] || null); }).join('');",
    replace: "return '';",
    expect: "birthday: the coupons scene shows all 8 items from CONTENT.birthday.coupons.items under CONTENT.birthday.coupons.title",
  },
  {
    id: "birthday-coupon-yes-applies-stamp",
    file: "js/birthday.js",
    find: "bdayApplyCouponStampToDom(item.id, iso);\n      bdayCloseCouponConfirm();",
    replace: "bdayCloseCouponConfirm();",
    expect: "birthday: \"Evet\" stamps CONTENT.birthday.coupons.used + today's date (dd.mm.yyyy) and persists {id:'YYYY-MM-DD'} via storageSet",
  },
  {
    id: "birthday-coupon-no-is-noop",
    file: "js/birthday.js",
    find: "function onNo() { bdayCloseCouponConfirm(); }",
    replace: "function onNo() { var iso = bdayMarkCouponUsed(item.id); bdayApplyCouponStampToDom(item.id, iso); bdayCloseCouponConfirm(); }",
    expect: 'birthday: "Sonra" is a no-op — the dialog closes, nothing is stamped, nothing is stored',
  },
  {
    id: "birthday-coupon-date-format-ddmmyyyy",
    file: "js/birthday.js",
    find: "return parts[2] + '.' + parts[1] + '.' + parts[0];",
    replace: "return parts[0] + '.' + parts[1] + '.' + parts[2];",
    expect: "birthday: \"Evet\" stamps CONTENT.birthday.coupons.used + today's date (dd.mm.yyyy) and persists {id:'YYYY-MM-DD'} via storageSet",
  },
  {
    id: "birthday-coupon-storage-key-literal",
    file: "js/birthday.js",
    find: "var BDAY_COUPONS_KEY = 'meryem-coupons-used';",
    replace: "var BDAY_COUPONS_KEY = 'meryem-coupons-used-x';",
    expect: "birthday: \"Evet\" stamps CONTENT.birthday.coupons.used + today's date (dd.mm.yyyy) and persists {id:'YYYY-MM-DD'} via storageSet",
  },
  {
    id: "birthday-coupon-preview-mode-no-persist",
    file: "js/birthday.js",
    find: "if (isPreviewMode()) {\n      _bdayCouponsShadow = obj;\n      return;\n    }",
    replace: "",
    expect: "birthday: preview mode stamps a coupon on screen but stores nothing (in-memory shadow)",
  },
  {
    id: "birthday-coupon-used-tap-is-noop",
    file: "js/birthday.js",
    find: "if (!btn || btn.classList.contains('is-used')) return;",
    replace: "if (!btn) return;",
    expect: "birthday: tapping an already-used coupon is a no-op — no confirm dialog reopens",
  },
  {
    id: "birthday-coupons-tab-section-under-ready-card",
    file: "js/birthday.js",
    find: "'<div class=\"bday-coupons-tab-section\">' +\n          '<h3 class=\"bday-coupons-tab-title\">' + bdayEsc(couponsTitle) + '</h3>' +\n          '<div class=\"bday-coupon-booklet bday-coupon-booklet--tab\" id=\"bday-coupon-booklet-tab\">' + bdayCouponsListMarkup() + '</div>' +\n        '</div>' +",
    replace: "",
    expect: "birthday: the 🎁 tab always lists all 8 coupons with their state under the ready card, while unlocked",
  },
  {
    id: "birthday-voice-ring-reduced-motion",
    file: "css/birthday.css",
    find: ".bday-voice-ring-progress {\n    transition: none;\n  }",
    replace: "",
    expect: "birthday: reduced motion — the voice ring/heart drop their animation, and playback still works",
  },
  {
    id: "birthday-voice-heart-reduced-motion",
    file: "css/birthday.css",
    find: ".bday-voice-play.is-playing .bday-voice-heart {\n    animation: none;\n  }",
    replace: "",
    expect: "birthday: reduced motion — the voice ring/heart drop their animation, and playback still works",
  },
  {
    id: "birthday-coupon-confirm-reduced-motion",
    file: "css/birthday.css",
    find: ".bday-coupon-confirm-card {\n    animation: none;\n  }",
    replace: "",
    expect: "birthday: reduced motion — the coupon confirm dialog shows instantly, no entrance animation",
  },
];

export const shots = [
  { name: "locked", open: { signedIn: true, now: "2026-10-03T12:00:00" }, act: async (page) => { await page.tap(".nav-btn[data-tab=\"birthday-view\"]"); } },
  {
    name: "locked-tease",
    open: { signedIn: true, now: "2026-10-03T12:00:00" },
    act: async (page) => {
      await page.tap(".nav-btn[data-tab=\"birthday-view\"]");
      await wait(page, 100);
      await page.tap("#bday-gift-trigger");
    },
  },
  {
    name: "locked-reduced-motion",
    open: { signedIn: true, now: "2026-10-03T12:00:00", reducedMotion: true },
    act: async (page) => { await page.tap(".nav-btn[data-tab=\"birthday-view\"]"); },
  },
  {
    name: "unlocked-ready",
    // Both flags seeded: gate already played (so it doesn't auto-play over this shot) and the
    // surprise already seen this year (so maybeAutoOpenBirthday doesn't reopen it either).
    open: { signedIn: true, now: "2026-10-04T00:05:00", storage: { "meryem-gate-played-year": "2026", "meryem-birthday-seen-year": "2026" } },
    act: async (page) => { await page.tap(".nav-btn[data-tab=\"birthday-view\"]"); },
  },
  {
    name: "scene-title",
    open: { signedIn: true, now: "2026-10-04T00:05:00", storage: { "meryem-gate-played-year": "2026" } },
    act: async (page) => { await waitUntilOverlayOpen(page); await wait(page, 1400); },
  },
  {
    name: "scene-cake-blowui",
    open: { signedIn: true, now: "2026-10-04T00:05:00", storage: { "meryem-gate-played-year": "2026" } },
    act: async (page) => {
      await waitUntilOverlayOpen(page);
      await page.tap("#bday-scene0-continue");
      await wait(page, 4600);
    },
  },
  {
    name: "scene-cake-afterblow",
    open: { signedIn: true, now: "2026-10-04T00:05:00", storage: { "meryem-gate-played-year": "2026" } },
    act: async (page) => {
      await waitUntilOverlayOpen(page);
      await page.tap("#bday-scene0-continue");
      await blowAllCandlesByTap(page);
    },
  },
  {
    name: "scene-balloons",
    open: { signedIn: true, now: "2026-10-04T00:05:00", storage: { "meryem-gate-played-year": "2026" } },
    act: async (page) => {
      await waitUntilOverlayOpen(page);
      await page.tap("#bday-scene0-continue");
      await blowAllCandlesByTap(page);
      await page.tap("#bday-scene1-continue");
      await wait(page, 150);
      await page.tap("[data-balloon=\"0\"]");
      await page.tap("[data-balloon=\"3\"]");
      await wait(page, 150);
    },
  },
  {
    name: "scene-gift-letter",
    open: { signedIn: true, now: "2026-10-04T00:05:00", storage: { "meryem-gate-played-year": "2026" } },
    act: async (page) => {
      await waitUntilOverlayOpen(page);
      await page.tap("#bday-scene0-continue");
      await blowAllCandlesByTap(page);
      await page.tap("#bday-scene1-continue");
      await wait(page, 150);
      await page.tap("#bday-scene2-continue");
      await wait(page, 150);
      await page.tap("#bday-gift-open-btn");
      await wait(page, 700);
      // Fully typed, signature and Devam visible — the finished state, not a mid-type frame.
      for (let i = 0; i < 8; i++) {
        await page.tap(".bday-letter");
        await wait(page, 60);
      }
      await wait(page, 150);
    },
  },
  {
    name: "scene-voice",
    open: { signedIn: true, now: "2026-10-04T00:05:00", storage: { "meryem-gate-played-year": "2026" }, voiceAudio: "wav" },
    act: async (page) => {
      await waitUntilOverlayOpen(page);
      await page.tap("#bday-scene0-continue");
      await blowAllCandlesByTap(page);
      await page.tap("#bday-scene1-continue");
      await wait(page, 150);
      await page.tap("#bday-scene2-continue");
      await wait(page, 150);
      await page.tap("#bday-gift-open-btn");
      await wait(page, 700);
      for (let i = 0; i < 8; i++) {
        await page.tap(".bday-letter");
        await wait(page, 60);
      }
      await wait(page, 150);
      await tapInView(page, "#bday-scene3-continue");
      await wait(page, 200);
      await page.tap("#bday-voice-play");
      await wait(page, 150);
    },
  },
  {
    name: "scene-coupons",
    open: { signedIn: true, now: "2026-10-04T00:05:00", storage: { "meryem-gate-played-year": "2026" } },
    act: async (page) => {
      await waitUntilOverlayOpen(page);
      await page.tap("#bday-scene0-continue");
      await blowAllCandlesByTap(page);
      await page.tap("#bday-scene1-continue");
      await wait(page, 150);
      await page.tap("#bday-scene2-continue");
      await wait(page, 150);
      await page.tap("#bday-gift-open-btn");
      await wait(page, 700);
      for (let i = 0; i < 8; i++) {
        await page.tap(".bday-letter");
        await wait(page, 60);
      }
      await wait(page, 150);
      await tapInView(page, "#bday-scene3-continue");
      await wait(page, 200);
    },
  },
  {
    name: "coupon-confirm",
    open: { signedIn: true, now: "2026-10-04T00:05:00", storage: { "meryem-gate-played-year": "2026" } },
    act: async (page) => {
      await waitUntilOverlayOpen(page);
      await page.tap("#bday-scene0-continue");
      await blowAllCandlesByTap(page);
      await page.tap("#bday-scene1-continue");
      await wait(page, 150);
      await page.tap("#bday-scene2-continue");
      await wait(page, 150);
      await page.tap("#bday-gift-open-btn");
      await wait(page, 700);
      for (let i = 0; i < 8; i++) {
        await page.tap(".bday-letter");
        await wait(page, 60);
      }
      await wait(page, 150);
      await tapInView(page, "#bday-scene3-continue");
      await wait(page, 200);
      await tapInView(page, '#bday-coupon-booklet [data-coupon="hug"]');
      await wait(page, 150);
    },
  },
  {
    name: "tab-coupons-used",
    open: {
      signedIn: true, now: "2026-10-04T00:05:00",
      storage: { "meryem-gate-played-year": "2026", "meryem-birthday-seen-year": "2026", "meryem-coupons-used": JSON.stringify({ hug: "2026-10-04", dinner: "2026-10-04" }) },
    },
    act: async (page) => { await page.tap(".nav-btn[data-tab=\"birthday-view\"]"); },
  },
  {
    name: "scene-slideshow",
    open: { signedIn: true, now: "2026-10-04T00:05:00", storage: { "meryem-gate-played-year": "2026" }, memories: THREE_MEMORIES },
    act: async (page) => {
      await waitUntilOverlayOpen(page);
      await page.tap("#bday-scene0-continue");
      await blowAllCandlesByTap(page);
      await page.tap("#bday-scene1-continue");
      await wait(page, 150);
      await page.tap("#bday-scene2-continue");
      await wait(page, 150);
      await page.tap("#bday-gift-open-btn");
      await wait(page, 700);
      for (let i = 0; i < 8; i++) {
        await page.tap(".bday-letter");
        await wait(page, 60);
      }
      await wait(page, 150);
      await tapInView(page, "#bday-scene3-continue");
      await wait(page, 150);
      await page.tap("#bday-scene-coupons-continue");
      await wait(page, 300);
    },
  },
  {
    name: "scene-end",
    open: { signedIn: true, now: "2026-10-04T00:05:00", storage: { "meryem-gate-played-year": "2026" } },
    act: async (page) => {
      await waitUntilOverlayOpen(page);
      await page.tap("#bday-scene0-continue");
      await blowAllCandlesByTap(page);
      await page.tap("#bday-scene1-continue");
      await wait(page, 150);
      await page.tap("#bday-scene2-continue");
      await wait(page, 150);
      await page.tap("#bday-gift-open-btn");
      await wait(page, 700);
      for (let i = 0; i < 8; i++) {
        await page.tap(".bday-letter");
        await wait(page, 60);
      }
      await wait(page, 150);
      await tapInView(page, "#bday-scene3-continue");
      await wait(page, 150);
      await page.tap("#bday-scene-coupons-continue");
      await wait(page, 300);
    },
  },
];
