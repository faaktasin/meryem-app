/**
 * meryem-app tests — checks/words.mjs
 *
 * Covers js/words.js + css/words.css: the quote/line deck (next/prev, a synthetic swipe,
 * favourites persisted + filtered), the jar of reasons (draw-without-replacement + reshuffle),
 * the 8 letter envelopes (open/close/Escape/persist/birthday-lock), and the reduced-motion
 * guards on the jar's flying note and the letter's flap/paper reveal.
 */
import { openApp } from "../harness.mjs";

export const name = "words";

/** Polls until #wz-deck exists (initWords() has run — it renders regardless of tab visibility). */
async function waitForWordsRendered(page) {
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline) {
    const ready = await page.eval(() => !!document.getElementById("wz-deck"));
    if (ready) return;
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("words-root never rendered");
}

/** Switches to the Sözler tab so its content has real layout (page.tap needs a non-zero box). */
async function gotoWords(page) {
  await waitForWordsRendered(page);
  await tap(page, '.nav-btn[data-tab="words-view"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 120)));
}

/**
 * page.tap() hit-tests at the element's CURRENT bounding rect with no auto-scroll — three stacked
 * sections (deck, jar, an 8-item letters grid) easily exceed the 390x844 viewport, so a later grid
 * item (e.g. the last envelope) sits below the fold and a raw page.tap silently hits nothing.
 * Scrolling it into view first is what a real finger would do anyway.
 */
async function tap(page, selector) {
  await page.eval((sel) => {
    var el = document.querySelector(sel);
    if (el && el.scrollIntoView) el.scrollIntoView({ block: "center", inline: "center" });
  }, selector);
  await page.tap(selector);
}

export async function run({ page, check }) {
  // 1. next/prev buttons and a synthetic pointer swipe all change the current card
  await openApp(page, { signedIn: true });
  await gotoWords(page);
  const text0 = await page.text("#wz-card-text");
  const pos0 = await page.text("#wz-deck-pos");
  const total = pos0.split(" / ")[1];

  await tap(page, "#wz-next-btn");
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  const text1 = await page.text("#wz-card-text");
  const pos1 = await page.text("#wz-deck-pos");

  await tap(page, "#wz-prev-btn");
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  const text2 = await page.text("#wz-card-text");
  const pos2 = await page.text("#wz-deck-pos");

  await page.eval(() => {
    var deckEl = document.getElementById("wz-deck");
    var base = { pointerId: 1, bubbles: true };
    deckEl.dispatchEvent(new PointerEvent("pointerdown", Object.assign({ clientX: 300, clientY: 400 }, base)));
    deckEl.dispatchEvent(new PointerEvent("pointermove", Object.assign({ clientX: 200, clientY: 400 }, base)));
    deckEl.dispatchEvent(new PointerEvent("pointerup", Object.assign({ clientX: 200, clientY: 400 }, base)));
    return true;
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  const text3 = await page.text("#wz-card-text");
  const pos3 = await page.text("#wz-deck-pos");

  await check("words: next/prev and a synthetic swipe change the card", () => ({
    ok: text1 !== text0 && pos1 === `2 / ${total}`
      && text2 === text0 && pos2 === pos0
      && text3 !== text0 && pos3 === pos1,
    detail: JSON.stringify({ text0, text1, text2, text3, pos0, pos1, pos2, pos3 }),
  }));

  // 2. favourite survives a reload, and the filter shows only favourites
  await openApp(page, { signedIn: true });
  await gotoWords(page);
  const favText0 = await page.text("#wz-card-text");
  await tap(page, "#wz-fav-btn");
  const pressedAfterTap = await page.eval(() => document.getElementById("wz-fav-btn").getAttribute("aria-pressed"));
  const favDump1 = JSON.parse((await page.storageDump())["meryem-fav-quotes"] || "[]");

  await openApp(page, { signedIn: true, keepStorage: true });
  await gotoWords(page);
  const favText0AfterReload = await page.text("#wz-card-text");
  const pressedAfterReload = await page.eval(() => document.getElementById("wz-fav-btn").getAttribute("aria-pressed"));
  await tap(page, "#wz-fav-toggle");
  await page.eval(() => new Promise((r) => setTimeout(r, 80)));
  const filteredPos = await page.text("#wz-deck-pos");
  const filteredText = await page.text("#wz-card-text");

  await check("words: favourite survives a reload and the filter shows only favourites", () => ({
    ok: pressedAfterTap === "true" && favDump1.length === 1
      && favText0AfterReload === favText0 && pressedAfterReload === "true"
      && filteredPos === "1 / 1" && filteredText === favText0,
    detail: JSON.stringify({ favText0, pressedAfterTap, favDump1, favText0AfterReload, pressedAfterReload, filteredPos, filteredText }),
  }));

  // 3. N jar draws give all N reasons once each; draw N+1 reshuffles
  await openApp(page, { signedIn: true, reducedMotion: true });
  await gotoWords(page);
  const reasonsTotal = await page.eval(() => CONTENT.words.reasons.length);
  for (let i = 0; i < reasonsTotal; i++) {
    await tap(page, "#wz-jar-btn");
  }
  const drawnAt50 = JSON.parse((await page.storageDump())["meryem-jar-drawn"] || "[]");
  const counterAt50 = await page.text("#wz-jar-counter");
  await tap(page, "#wz-jar-btn");
  const drawnAt51 = JSON.parse((await page.storageDump())["meryem-jar-drawn"] || "[]");
  const counterAt51 = await page.text("#wz-jar-counter");
  const reshuffleVisible = await page.eval(() => !document.getElementById("wz-jar-reshuffle").hidden);

  await check("words: the jar draws every reason once before it reshuffles", () => ({
    ok: drawnAt50.length === reasonsTotal && new Set(drawnAt50).size === reasonsTotal
      && counterAt50 === `${reasonsTotal} / ${reasonsTotal}`
      && drawnAt51.length === 1 && counterAt51 === `1 / ${reasonsTotal}` && reshuffleVisible === true,
    detail: JSON.stringify({ reasonsTotal, drawnAt50Length: drawnAt50.length, distinct: new Set(drawnAt50).size, counterAt50, drawnAt51, counterAt51, reshuffleVisible }),
  }));

  // 4. a letter opens, shows its first paragraph, closes with Escape, and is marked opened after reload
  await openApp(page, { signedIn: true, now: "2026-05-01T09:00:00" });
  await gotoWords(page);
  const expectedFirstParagraph = await page.eval(() => {
    var letter = CONTENT.words.letters.filter(function (l) { return l.id === "miss"; })[0];
    return letter.body[0];
  });
  await tap(page, '.wz-envelope[data-letter-id="miss"]');
  const openedState = await page.eval(() => ({
    hidden: document.getElementById("wz-letter-reader").hidden,
    role: document.getElementById("wz-letter-reader").getAttribute("role"),
    firstParagraph: document.querySelector("#wz-letter-body p") ? document.querySelector("#wz-letter-body p").textContent : null,
    focusIsClose: document.activeElement && document.activeElement.id === "wz-letter-close",
  }));

  // 4b. m2: the letter reader's own scroll container contains overscroll instead of chaining a
  // bounce/scroll through to whatever sits behind the (opaque) overlay on iOS Safari 16+.
  const letterOverscroll = await page.eval(() => getComputedStyle(document.getElementById("wz-letter-paper")).getPropertyValue("overscroll-behavior-y"));
  await check("words: the letter reader's scroll container contains overscroll (no chaining behind the overlay)", () => ({
    ok: letterOverscroll === "contain",
    detail: JSON.stringify({ letterOverscroll }),
  }));

  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await page.eval(() => new Promise((r) => setTimeout(r, 50)));
  const closedState = await page.eval(() => ({
    hidden: document.getElementById("wz-letter-reader").hidden,
    focusReturned: document.activeElement && document.activeElement.getAttribute && document.activeElement.getAttribute("data-letter-id") === "miss",
  }));

  await openApp(page, { signedIn: true, now: "2026-05-01T09:00:00", keepStorage: true });
  await gotoWords(page);
  const afterReloadOpened = await page.eval(() => {
    var btn = document.querySelector('.wz-envelope[data-letter-id="miss"]');
    return {
      hasOpenedClass: btn.classList.contains("wz-envelope--opened"),
      statusText: btn.querySelector(".wz-envelope-status").textContent,
    };
  });

  await check("words: a letter opens, shows its first paragraph, closes with Escape and is marked opened after reload", () => ({
    ok: openedState.hidden === false && openedState.role === "dialog"
      && openedState.firstParagraph === expectedFirstParagraph && openedState.focusIsClose === true
      && closedState.hidden === true && closedState.focusReturned === true
      && afterReloadOpened.hasOpenedClass === true && afterReloadOpened.statusText === "okundu ✓",
    detail: JSON.stringify({ openedState, closedState, afterReloadOpened, expectedFirstParagraph }),
  }));

  // 5. the birthday letter is locked at 23:00 the day before and opens at 09:00 on the day
  await openApp(page, { signedIn: true, now: "2026-10-03T23:00:00" });
  await gotoWords(page);
  const lockedState = await page.eval(() => ({
    locked: document.querySelector('.wz-envelope[data-letter-id="bday"]').classList.contains("wz-envelope--locked"),
  }));
  await tap(page, '.wz-envelope[data-letter-id="bday"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  const stillClosed = await page.eval(() => document.getElementById("wz-letter-reader") === null
    || document.getElementById("wz-letter-reader").hidden === true);

  // Two other packages auto-play a full-screen overlay the instant the birthday unlocks (the
  // Gate's question sequence, then the Birthday surprise) unless this year's play is already
  // flagged done — seed both flags so neither covers our taps here; they are each a different
  // package's concern, not this one's.
  await openApp(page, {
    signedIn: true,
    now: "2026-10-04T09:00:00",
    storage: { "meryem-gate-played-year": "2026", "meryem-birthday-seen-year": "2026" },
  });
  await gotoWords(page);
  const unlockedState = await page.eval(() => ({
    locked: document.querySelector('.wz-envelope[data-letter-id="bday"]').classList.contains("wz-envelope--locked"),
  }));
  const expectedBdayFirstParagraph = await page.eval(() => {
    var letter = CONTENT.words.letters.filter(function (l) { return l.id === "bday"; })[0];
    return letter.body[0];
  });
  await tap(page, '.wz-envelope[data-letter-id="bday"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  const opensNow = await page.eval(() => ({
    hidden: document.getElementById("wz-letter-reader") ? document.getElementById("wz-letter-reader").hidden : null,
    firstParagraph: document.querySelector("#wz-letter-body p") ? document.querySelector("#wz-letter-body p").textContent : null,
  }));

  await check("words: the bday letter is locked at 2026-10-03T23:00 and opens at 2026-10-04T09:00", () => ({
    ok: lockedState.locked === true && stillClosed === true
      && unlockedState.locked === false && opensNow.hidden === false && opensNow.firstParagraph === expectedBdayFirstParagraph,
    detail: JSON.stringify({ lockedState, stillClosed, unlockedState, opensNow }),
  }));

  // 5b. B1: the bday envelope unlocks LIVE when midnight arrives with the app already open. Opens
  // before midnight and waits in real time (the injected clock keeps ticking) until appNow() has
  // crossed into her birthday; js/birthday.js's tick then dispatches 'meryem:birthday-unlocked'
  // and words.js must re-render the grid. Nothing here dispatches the event by hand — the check
  // covers the whole chain, and dropping words.js's listener leaves the envelope locked.
  await openApp(page, {
    signedIn: true,
    now: "2026-10-03T23:59:55",
    storage: { "meryem-gate-played-year": "2026", "meryem-birthday-seen-year": "2026" },
  });
  await gotoWords(page);
  const preMidnight = await page.eval(() => {
    var btn = document.querySelector('.wz-envelope[data-letter-id="bday"]');
    return { locked: btn.classList.contains("wz-envelope--locked"), emoji: btn.querySelector(".wz-envelope-emoji").textContent };
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 8000)));
  const liveUnlocked = await page.eval(() => {
    var btn = document.querySelector('.wz-envelope[data-letter-id="bday"]');
    return {
      locked: btn.classList.contains("wz-envelope--locked"),
      emoji: btn.querySelector(".wz-envelope-emoji").textContent,
      status: btn.querySelector(".wz-envelope-status").textContent,
      ariaLabel: btn.getAttribute("aria-label"),
      isBirthdayUnlocked: isBirthdayUnlocked(),
    };
  });
  await check("words: the bday envelope unlocks live on 'meryem:birthday-unlocked' with no reload (letters grid re-renders)", () => ({
    ok: preMidnight.locked === true && preMidnight.emoji === "🔒"
      && liveUnlocked.isBirthdayUnlocked === true
      && liveUnlocked.locked === false && liveUnlocked.emoji !== "🔒"
      && liveUnlocked.status !== "Kilitli" && liveUnlocked.ariaLabel.indexOf("kilitli") === -1,
    detail: JSON.stringify({ preMidnight, liveUnlocked }),
  }));

  // 6. reduced motion: the jar's flying note never appears, and the letter's flap/paper open
  // instantly instead of after the normal deferred delay
  await openApp(page, { signedIn: true, reducedMotion: false });
  await gotoWords(page);
  await tap(page, "#wz-jar-btn");
  const jarNormalFlyCount = await page.eval(() => document.querySelectorAll(".wz-note-fly").length);

  await openApp(page, { signedIn: true, reducedMotion: true });
  await gotoWords(page);
  await tap(page, "#wz-jar-btn");
  const jarReducedFlyCount = await page.eval(() => document.querySelectorAll(".wz-note-fly").length);

  await openApp(page, { signedIn: true, reducedMotion: false, now: "2026-05-01T09:00:00" });
  await gotoWords(page);
  await tap(page, '.wz-envelope[data-letter-id="sad"]');
  const letterNormalEarly = await page.eval(() => ({
    flap: document.getElementById("wz-letter-flap").classList.contains("wz-letter-flap--open"),
    paper: document.getElementById("wz-letter-paper").classList.contains("wz-letter-paper--up"),
  }));

  await openApp(page, { signedIn: true, reducedMotion: true, now: "2026-05-01T09:00:00" });
  await gotoWords(page);
  await tap(page, '.wz-envelope[data-letter-id="sad"]');
  const letterReducedEarly = await page.eval(() => ({
    flap: document.getElementById("wz-letter-flap").classList.contains("wz-letter-flap--open"),
    paper: document.getElementById("wz-letter-paper").classList.contains("wz-letter-paper--up"),
  }));

  await check("words: reduced motion shows the jar note and letter without animation delay", () => ({
    ok: jarNormalFlyCount === 1 && jarReducedFlyCount === 0
      && letterNormalEarly.flap === false && letterNormalEarly.paper === false
      && letterReducedEarly.flap === true && letterReducedEarly.paper === true,
    detail: JSON.stringify({ jarNormalFlyCount, jarReducedFlyCount, letterNormalEarly, letterReducedEarly }),
  }));

  // 7. no console errors across a Sözler tour (deck, jar, letters)
  await openApp(page, { signedIn: true });
  await gotoWords(page);
  await tap(page, "#wz-next-btn");
  await tap(page, "#wz-fav-btn");
  await tap(page, "#wz-jar-btn");
  await tap(page, '.wz-envelope[data-letter-id="laugh"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  await tap(page, "#wz-letter-close");
  const tourErrors = page.errors.slice();
  await check("words: no console errors while using the Sözler tab", () => ({
    ok: tourErrors.length === 0,
    detail: tourErrors.slice(0, 5).join(" ; "),
  }));

  // 8. body text reaches 4.5:1 contrast. reducedMotion: true so the letter's flap/paper reach
  // their final (opacity: 1) state the instant it opens, instead of racing a 460ms CSS delay.
  await openApp(page, { signedIn: true, reducedMotion: true });
  await gotoWords(page);
  const contrastMain = await page.eval(() => ({
    cardText: window.__app.readable(document.querySelector(".wz-card-text")),
    cardMeta: window.__app.readable(document.querySelector(".wz-card-meta")) || 5,
    deckPos: window.__app.readable(document.querySelector("#wz-deck-pos")),
    jarHint: window.__app.readable(document.querySelector("#wz-jar-hint")),
    jarCounter: window.__app.readable(document.querySelector("#wz-jar-counter")),
    envelopeTitle: window.__app.readable(document.querySelector(".wz-envelope-title")),
    favToggle: window.__app.readable(document.querySelector("#wz-fav-toggle span")),
  }));
  await tap(page, "#wz-fav-toggle"); // pressed state: rose-strong fill, white text
  const contrastToggle = await page.eval(() => ({
    favTogglePressed: window.__app.readable(document.querySelector("#wz-fav-toggle span")),
  }));
  await tap(page, '.wz-envelope[data-letter-id="proud"]');
  const contrastLetter = await page.eval(() => ({
    title: window.__app.readable(document.querySelector(".wz-letter-title")),
    body: window.__app.readable(document.querySelector(".wz-letter-body p")),
  }));
  const contrastAll = { ...contrastMain, ...contrastToggle, ...contrastLetter };
  const contrastFailures = Object.entries(contrastAll).filter(([, v]) => v < 4.5);
  await check("words: body text in Sözler reaches 4.5:1 contrast", () => ({
    ok: contrastFailures.length === 0,
    detail: contrastFailures.length ? contrastFailures.map(([k, v]) => `${k} ${v.toFixed(2)}`).join(" ; ") : JSON.stringify(contrastAll),
  }));

  // 9. the full-screen letter reader locks body scroll while open (mirrors js/app.js's
  // openModal()/closeModal(), which set/restore document.body.style.overflow the same way)
  await openApp(page, { signedIn: true, now: "2026-05-01T09:00:00" });
  await gotoWords(page);
  const overflowBeforeOpen = await page.eval(() => document.body.style.overflow);
  await tap(page, '.wz-envelope[data-letter-id="miss"]');
  const overflowWhileOpen = await page.eval(() => document.body.style.overflow);
  await page.send("Input.dispatchKeyEvent", { type: "keyDown", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await page.send("Input.dispatchKeyEvent", { type: "keyUp", key: "Escape", code: "Escape", windowsVirtualKeyCode: 27, nativeVirtualKeyCode: 27 });
  await page.eval(() => new Promise((r) => setTimeout(r, 50)));
  const overflowAfterClose = await page.eval(() => document.body.style.overflow);

  await check("words: the letter reader locks body scroll while open and restores it on close", () => ({
    ok: overflowBeforeOpen === "" && overflowWhileOpen === "hidden" && overflowAfterClose === "",
    detail: JSON.stringify({ overflowBeforeOpen, overflowWhileOpen, overflowAfterClose }),
  }));

  // 10. birthday preview mode (?onizleme=dogumgunu) never persists favourites/jar/letters for
  // real — a rehearsal on Furkan's own device must not mark the real 'bday' letter as opened
  // before she gets to it herself. Preview mode always lands appNow() on her next birthday, so
  // without seeding this year's play-flags the Gate/Birthday packages would auto-play their own
  // full-screen overlay over Sözler the instant the tab renders (same reasoning as check 5's
  // comment above) and our taps below would silently hit that overlay instead.
  await openApp(page, { signedIn: true });
  const previewYear = await page.eval(() => {
    var now = new Date();
    var bday = new Date(now.getFullYear(), 9, 4); // her birthday, month index 9 = October
    return now.getTime() >= bday.getTime() ? now.getFullYear() + 1 : now.getFullYear();
  });
  await openApp(page, {
    signedIn: true,
    query: "?onizleme=dogumgunu",
    storage: {
      "meryem-gate-played-year": String(previewYear),
      "meryem-birthday-seen-year": String(previewYear),
    },
  });
  await gotoWords(page);
  await tap(page, "#wz-fav-btn");
  await tap(page, "#wz-jar-btn");
  await tap(page, '.wz-envelope[data-letter-id="miss"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  const previewDump = await page.storageDump();

  await check("words: preview mode never persists favourites/jar/letters for real", () => ({
    ok: !previewDump["meryem-fav-quotes"] && !previewDump["meryem-jar-drawn"] && !previewDump["meryem-letters-opened"],
    detail: JSON.stringify(previewDump),
  }));

  // 11. Seni Sevme Nedenlerim: the jar and its bear read as one centred group, with a hint under
  // it that tells her to tap (2026-09-28 polish — the bear used to float off to the right on its
  // own, unbalancing the card, and nothing told her the jar was tappable).
  await openApp(page, { signedIn: true });
  await gotoWords(page);
  const groupBox = await page.box("#wz-jar-group");
  const jarCardBox = await page.box(".wz-jar");
  const groupCenter = groupBox.x + groupBox.width / 2;
  const jarCardCenter = jarCardBox.x + jarCardBox.width / 2;
  const hintText = await page.text("#wz-jar-hint");
  const expectedHint = await page.eval(() => CONTENT.words.ui.jarHint);

  await check("words: the jar+bear group is centred in the card and the jar hint is shown", () => ({
    ok: Math.abs(groupCenter - jarCardCenter) <= 10 && hintText === expectedHint,
    detail: JSON.stringify({ groupCenter, jarCardCenter, diff: Math.abs(groupCenter - jarCardCenter), hintText, expectedHint }),
  }));

  // 12. favEmpty/jarReshuffled read live from CONTENT.words.ui, not a hardcoded copy of it — the
  // two texts are identical today, so only swapping CONTENT's live value in-page can tell "reads
  // CONTENT" apart from "reads its own frozen fallback string".
  await openApp(page, { signedIn: true });
  await gotoWords(page);
  await page.eval(() => { CONTENT.words.ui.favEmpty = "TEST-FAV-EMPTY-SENTINEL"; });
  await tap(page, "#wz-fav-toggle");
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  const sentinelEmptyText = await page.text("#wz-deck-empty");

  await openApp(page, { signedIn: true, reducedMotion: true });
  await gotoWords(page);
  await page.eval(() => { CONTENT.words.ui.jarReshuffled = "TEST-JAR-RESHUFFLED-SENTINEL"; });
  const reasonsTotalForSentinel = await page.eval(() => CONTENT.words.reasons.length);
  for (let i = 0; i < reasonsTotalForSentinel + 1; i++) {
    await tap(page, "#wz-jar-btn");
  }
  const sentinelReshuffleText = await page.text("#wz-jar-reshuffle");

  await check("words: favEmpty and jarReshuffled text come from CONTENT.words.ui, not a hardcoded copy", () => ({
    ok: sentinelEmptyText === "TEST-FAV-EMPTY-SENTINEL" && sentinelReshuffleText === "TEST-JAR-RESHUFFLED-SENTINEL",
    detail: JSON.stringify({ sentinelEmptyText, sentinelReshuffleText }),
  }));

  // 13. the favourites filter is a pill <button aria-pressed>, not a raw checkbox, and it still
  // drives the same filter as before.
  await openApp(page, { signedIn: true });
  await gotoWords(page);
  const toggleBefore = await page.eval(() => {
    var btn = document.getElementById("wz-fav-toggle");
    return { tag: btn.tagName, pressed: btn.getAttribute("aria-pressed") };
  });
  await tap(page, "#wz-fav-btn"); // favourite the current card so the filter has exactly one to show
  await tap(page, "#wz-fav-toggle");
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  const toggleAfterOn = await page.eval(() => document.getElementById("wz-fav-toggle").getAttribute("aria-pressed"));
  const filteredPosOn = await page.text("#wz-deck-pos");
  await tap(page, "#wz-fav-toggle");
  await page.eval(() => new Promise((r) => setTimeout(r, 60)));
  const toggleAfterOff = await page.eval(() => document.getElementById("wz-fav-toggle").getAttribute("aria-pressed"));

  await check("words: the favourites toggle is a pill button whose aria-pressed flips with the filter", () => ({
    ok: toggleBefore.tag === "BUTTON" && toggleBefore.pressed === "false"
      && toggleAfterOn === "true" && filteredPosOn === "1 / 1" && toggleAfterOff === "false",
    detail: JSON.stringify({ toggleBefore, toggleAfterOn, filteredPosOn, toggleAfterOff }),
  }));
}

export const mutants = [
  {
    id: "words-fav-key",
    file: "js/words.js",
    find: "var FAV_KEY = 'meryem-fav-quotes';",
    replace: "var FAV_KEY = 'meryem-fav-quotes-x';",
    expect: "words: favourite survives a reload and the filter shows only favourites",
  },
  {
    id: "words-jar-remaining-filter",
    file: "js/words.js",
    find: "if (drawn.indexOf(i) === -1) remaining.push(i);",
    replace: "if (drawn.indexOf(i) !== -1) remaining.push(i);",
    expect: "words: the jar draws every reason once before it reshuffles",
  },
  {
    id: "words-letter-escape",
    file: "js/words.js",
    find: "if (e.key === 'Escape') closeLetterReader();",
    replace: "if (e.key === 'Escap') closeLetterReader();",
    expect: "words: a letter opens, shows its first paragraph, closes with Escape and is marked opened after reload",
  },
  {
    id: "words-bday-lock-invert",
    file: "js/words.js",
    find: "letter.birthdayOnly === true && !isBirthdayUnlocked();",
    replace: "letter.birthdayOnly === true && isBirthdayUnlocked();",
    expect: "words: the bday letter is locked at 2026-10-03T23:00 and opens at 2026-10-04T09:00",
  },
  {
    id: "words-jar-reduced-motion-guard",
    file: "js/words.js",
    find: "if (!prefersReducedMotion()) {\n      spawnFlyingNote();\n    }",
    replace: "if (true) {\n      spawnFlyingNote();\n    }",
    expect: "words: reduced motion shows the jar note and letter without animation delay",
  },
  {
    id: "words-letter-scroll-lock",
    file: "js/words.js",
    find: "  function openLetterReader(letter, openerBtn) {\n    document.body.style.overflow = 'hidden';\n",
    replace: "  function openLetterReader(letter, openerBtn) {\n",
    expect: "words: the letter reader locks body scroll while open and restores it on close",
  },
  {
    id: "words-preview-persist-guard",
    file: "js/words.js",
    find: "  function writeList(key, arr) {\n    if (isPreviewMode()) {",
    replace: "  function writeList(key, arr) {\n    if (false) {",
    expect: "words: preview mode never persists favourites/jar/letters for real",
  },
  {
    id: "words-jar-group-centering",
    file: "css/words.css",
    find: "  align-items: flex-end;\n  align-self: center;\n}",
    replace: "  align-items: flex-end;\n  align-self: flex-start;\n}",
    expect: "words: the jar+bear group is centred in the card and the jar hint is shown",
  },
  {
    id: "words-fav-empty-ignores-content",
    file: "js/words.js",
    find: "emptyEl.textContent = (CONTENT.words.ui && CONTENT.words.ui.favEmpty) || DEFAULT_FAV_EMPTY;",
    replace: "emptyEl.textContent = DEFAULT_FAV_EMPTY;",
    expect: "words: favEmpty and jarReshuffled text come from CONTENT.words.ui, not a hardcoded copy",
  },
  {
    id: "words-fav-toggle-aria-pressed",
    file: "js/words.js",
    find: "      var next = !favOnly;\n      this.setAttribute('aria-pressed', next ? 'true' : 'false');\n      setFavOnly(next);",
    replace: "      var next = !favOnly;\n      setFavOnly(next);",
    expect: "words: the favourites toggle is a pill button whose aria-pressed flips with the filter",
  },
  {
    id: "words-birthday-unlock-listener",
    file: "js/words.js",
    find: "  document.addEventListener('meryem:birthday-unlocked', renderLettersGrid);\n\n  /* ── Init",
    replace: "  /* ── Init",
    expect: "words: the bday envelope unlocks live on 'meryem:birthday-unlocked' with no reload (letters grid re-renders)",
  },
  {
    id: "words-letter-reader-overscroll",
    file: "css/words.css",
    find: "  overflow-y: auto;\n  overscroll-behavior: contain;\n  flex: 1;\n}",
    replace: "  overflow-y: auto;\n  flex: 1;\n}",
    expect: "words: the letter reader's scroll container contains overscroll (no chaining behind the overlay)",
  },
];

export const shots = [
  { name: "deck", open: { signedIn: true }, act: async (page) => { await gotoWords(page); } },
  {
    name: "deck-favorited",
    open: { signedIn: true },
    act: async (page) => { await gotoWords(page); await tap(page, "#wz-fav-btn"); },
  },
  {
    name: "favorites-filter",
    open: { signedIn: true },
    act: async (page) => { await gotoWords(page); await tap(page, "#wz-fav-btn"); await tap(page, "#wz-fav-toggle"); },
  },
  { name: "jar-idle", open: { signedIn: true }, act: async (page) => { await gotoWords(page); } },
  {
    name: "jar-drawn",
    open: { signedIn: true },
    act: async (page) => { await gotoWords(page); await tap(page, "#wz-jar-btn"); await page.eval(() => new Promise((r) => setTimeout(r, 250))); },
  },
  {
    name: "jar-reshuffled",
    open: { signedIn: true, reducedMotion: true },
    act: async (page) => {
      await gotoWords(page);
      const total = await page.eval(() => CONTENT.words.reasons.length);
      for (let i = 0; i < total + 1; i++) await tap(page, "#wz-jar-btn");
    },
  },
  { name: "letters-locked", open: { signedIn: true, now: "2026-10-03T23:00:00" }, act: async (page) => { await gotoWords(page); } },
  {
    name: "letters-unlocked",
    open: { signedIn: true, now: "2026-10-04T09:00:00", storage: { "meryem-gate-played-year": "2026", "meryem-birthday-seen-year": "2026" } },
    act: async (page) => { await gotoWords(page); },
  },
  {
    name: "reader-open",
    open: { signedIn: true },
    act: async (page) => { await gotoWords(page); await tap(page, '.wz-envelope[data-letter-id="miss"]'); await page.eval(() => new Promise((r) => setTimeout(r, 550))); },
  },
  {
    name: "reduced-motion-reader",
    open: { signedIn: true, reducedMotion: true },
    act: async (page) => { await gotoWords(page); await tap(page, '.wz-envelope[data-letter-id="miss"]'); },
  },
];
