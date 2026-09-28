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
    ok: dayZeroTease.indexOf("{days}") === -1 && dayZeroTease.indexOf("0 gün") === -1 && dayZeroTease === "Kurcalama, ayıcık bekçi 🐻",
    detail: dayZeroTease,
  }));

  // 2. The locked countdown flips to the unlocked card live, without reloading.
  await openApp(page, { now: "2026-10-03T23:59:57", signedIn: true, storage: {} });
  await page.tap(".nav-btn[data-tab=\"birthday-view\"]");
  await wait(page, 100);
  const beforeFlip = await page.eval(() => !!document.querySelector(".bday-view--locked"));
  await wait(page, 5000);
  const afterFlip = await page.eval(() => ({
    locked: !!document.querySelector(".bday-view--locked"),
    unlocked: !!document.querySelector(".bday-view--unlocked"),
  }));
  await check("birthday: the locked countdown flips live to the unlocked card at midnight (no reload)", () => ({
    ok: beforeFlip === true && afterFlip.locked === false && afterFlip.unlocked === true,
    detail: JSON.stringify({ beforeFlip, afterFlip }),
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

  // 3. Gate already played this year -> auto-opens once; the next open (same year) does not.
  await openApp(page, { now: "2026-10-04T00:01:00", signedIn: true, storage: { "meryem-gate-played-year": "2026" } });
  const opened1 = await waitUntilOverlayOpen(page);
  const dump1 = await page.storageDump();
  await check("birthday: gate already played this year — the surprise auto-opens once and stores the seen-year flag", () => ({
    ok: opened1 === true && dump1["meryem-birthday-seen-year"] === "2026",
    detail: JSON.stringify({ opened1, dump1 }),
  }));
  await openApp(page, { now: "2026-10-04T00:01:00", signedIn: true, keepStorage: true });
  await wait(page, 400);
  const opened2 = await page.eval(() => document.getElementById("birthday-overlay").hidden === false);
  await check("birthday: reopening the same year does not auto-open again", () => ({
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

  // 5. Preview mode's own auto-open logic, isolated from the (now real) gate package's own flow:
  // with the gate forced clear, this module still opens the surprise and still persists nothing.
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
    return {
      opened: document.getElementById("birthday-overlay").hidden === false,
      seenYearStored: (function () { try { return localStorage.getItem("meryem-birthday-seen-year"); } catch (e) { return "ERR"; } })(),
    };
  });
  await check("birthday: preview mode opens the surprise (gate clear) but stores nothing (seen-year no-op)", () => ({
    ok: previewResult.opened === true && previewResult.seenYearStored == null,
    detail: JSON.stringify(previewResult),
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

  await page.tap("#bday-scene3-continue");
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
  await waitUntilOverlayOpen(page);
  await page.tap("#bday-scene0-continue");
  await blowAllCandlesByTap(page);
  await page.tap("#bday-scene1-continue");
  await wait(page, 150);
  await page.tap("#bday-scene2-continue"); // skip balloons without popping
  await wait(page, 150);
  await page.tap("#bday-gift-open-btn");
  await wait(page, 650);
  for (let i = 0; i < 8; i++) {
    await page.tap(".bday-letter");
    await wait(page, 60);
  }
  await wait(page, 150);
  await page.tap("#bday-scene3-continue");
  await wait(page, 300);
  const slideshowResult = await page.eval(() => ({
    polaroidCount: document.querySelectorAll(".bday-polaroid").length,
    activeCount: document.querySelectorAll(".bday-polaroid.is-active").length,
  }));
  await check("birthday: the slideshow shows one polaroid per photo memory (3-memory fixture)", () => ({
    ok: slideshowResult.polaroidCount === 3 && slideshowResult.activeCount === 1,
    detail: JSON.stringify(slideshowResult),
  }));
}

export const mutants = [
  {
    id: "birthday-seen-year-guard",
    file: "js/birthday.js",
    find: "if (seenYear === String(birthdayYear())) return;",
    replace: "if (false) return;",
    expect: "birthday: reopening the same year does not auto-open again",
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
      await page.tap("#bday-scene3-continue");
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
      await page.tap("#bday-scene3-continue");
      await wait(page, 300);
    },
  },
];
