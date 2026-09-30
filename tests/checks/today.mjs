/**
 * meryem-app tests — checks/today.mjs
 *
 * Covers the Today (Bugün) package: the time-of-day greeting bear, the "days together" pill and
 * its next-milestone line, the daily message + shuffle (unchanged Firestore-free logic), the
 * to-do list's empty state (bear + heart-shaped checkbox CSS), and the removal of the old
 * countdown code now that js/dates.js owns it entirely.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { openApp } from "../harness.mjs";

export const name = "today";

export async function run({ page, check, root }) {
  // 1. Greeting bucket + bear mood/pose follow the time of day
  const buckets = [
    { now: "2026-09-20T08:00:00", bucket: "morning" },
    { now: "2026-09-20T14:00:00", bucket: "afternoon" },
    { now: "2026-09-20T20:00:00", bucket: "evening" },
    { now: "2026-09-20T23:30:00", bucket: "night" },
  ];
  const greetingInfo = [];
  for (const b of buckets) {
    await openApp(page, { signedIn: true, now: b.now });
    await page.eval(() => new Promise((r) => setTimeout(r, 200)));
    const info = await page.eval((bucket) => {
      var svg = document.querySelector("#today-greeting svg.kawaii-bear");
      var textEl = document.querySelector("#today-greeting .bgn-greeting-text");
      var text = textEl ? textEl.textContent : "";
      var lines = svg ? svg.querySelectorAll("line") : [];
      var handYs = [];
      for (var i = 0; i < lines.length; i++) handYs.push(Math.round(Number(lines[i].getAttribute("y2"))));
      var zEl = svg ? svg.querySelector(".kawaii-bear-z") : null;
      return {
        hasSvg: !!svg,
        mood: svg ? svg.getAttribute("data-mood") : null,
        hasHeart: !!(svg && svg.querySelector(".kawaii-bear-heart")),
        hasZ: !!zEl,
        // Rendered pixel height of the bigger 'z' glyph, not just its DOM presence — a bear drawn
        // too small makes the same markup effectively invisible on a real phone screen (the
        // defect this guards). Measured with the first bear: 9px at 80px (the too-small
        // regression) vs 11px at the night bucket's own 100px (the fix) — 10 is the cut. With the
        // baby-faced bear (7294832): 8px at 60px, 10px at 80px, 13px at 100px.
        zHeight: zEl ? zEl.getBoundingClientRect().height : 0,
        wave: handYs.indexOf(150) !== -1 && handYs.indexOf(208) !== -1,
        textInBucket: !!(window.CONTENT && window.CONTENT.greetings[bucket] && window.CONTENT.greetings[bucket].indexOf(text) !== -1),
      };
    }, b.bucket);
    greetingInfo.push(Object.assign({ bucket: b.bucket }, info));
  }
  const expectedMood = { morning: "happy", afternoon: "normal", evening: "love", night: "sleepy" };
  const byBucket = (name) => greetingInfo.find((g) => g.bucket === name);
  const greetingOk = greetingInfo.every((g) => g.hasSvg && g.mood === expectedMood[g.bucket] && g.textInBucket)
    && byBucket("morning").wave
    && byBucket("afternoon").hasHeart
    && byBucket("night").hasZ
    && byBucket("night").zHeight >= 10;
  await check("today: greeting bucket and bear mood follow the time of day (08:00 morning happy+wave, 14:00 afternoon normal+heart, 20:00 evening love, 23:30 night sleepy), and the night bear is drawn big enough for its 'z' to actually read on screen", () => ({
    ok: greetingOk,
    detail: JSON.stringify(greetingInfo),
  }));

  // 2. Together count + next-milestone line are exact for the spec example
  await openApp(page, { signedIn: true, now: "2026-10-04T10:00:00" });
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
  const together = await page.eval(() => {
    var loveDate = CONFIG.loveDate;
    var now = appNow();
    var days = Math.floor((now.getTime() - loveDate.getTime()) / 86400000);
    var nextMilestone = (Math.floor(days / 100) + 1) * 100;
    var expectedMilestoneText = nextMilestone + ". günümüze " + (nextMilestone - days) + " gün kaldı 💕";
    var daysEl = document.querySelector(".bgn-together-days");
    var milestoneEl = document.querySelector(".bgn-milestone");
    return {
      expectedDays: days,
      expectedMilestoneText: expectedMilestoneText,
      renderedDays: daysEl ? daysEl.textContent : null,
      renderedMilestoneText: milestoneEl ? milestoneEl.textContent : null,
    };
  });
  await check("today: the together count is exact for 2026-10-04T10:00 (260) and the next-milestone line reads 300. günümüze 40 gün kaldı 💕", () => ({
    ok: together.expectedDays === 260
      && together.renderedDays === "260"
      && together.expectedMilestoneText === "300. günümüze 40 gün kaldı 💕"
      && together.renderedMilestoneText === together.expectedMilestoneText,
    detail: JSON.stringify(together),
  }));

  // 2b. The milestone always points at the NEXT hundred, even exactly on a hundred-day boundary —
  // catches an off-by-one that the 260 example above would not (e.g. re-announcing the day just
  // reached instead of the one still ahead).
  await openApp(page, { signedIn: true, now: "2026-04-27T00:00:00" });
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
  const boundary = await page.eval(() => ({
    days: Math.floor((appNow().getTime() - CONFIG.loveDate.getTime()) / 86400000),
    renderedMilestoneText: (document.querySelector(".bgn-milestone") || {}).textContent || null,
  }));
  await check("today: the next-milestone line points at the next hundred on an exact boundary (100 days -> 200. günümüze 100 gün kaldı 💕)", () => ({
    ok: boundary.days === 100 && boundary.renderedMilestoneText === "200. günümüze 100 gün kaldı 💕",
    detail: JSON.stringify(boundary),
  }));

  // 2c. B1: the greeting, the together pill and the daily message refresh LIVE when midnight
  // arrives with the app already open. Opens before midnight and waits in real time (the injected
  // clock keeps ticking) until appNow() has crossed into her birthday; js/birthday.js's tick then
  // dispatches 'meryem:birthday-unlocked' and daily.js must re-render. Sentinels written before
  // the crossing prove the handler really ran; nothing here dispatches the event by hand, so the
  // check covers the whole chain. After the crossing it is her birthday, so the birthday greeting
  // and the birthday message are what must appear (m18).
  await openApp(page, {
    signedIn: true,
    now: "2026-10-03T23:59:55",
    storage: { "meryem-gate-played-year": "2026", "meryem-birthday-seen-year": "2026" },
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
  const beforeTogetherDays = await page.eval(() => document.querySelector(".bgn-together-days").textContent);
  await page.eval(() => {
    document.getElementById("daily-message").textContent = "__SENTINEL__";
    document.querySelector("#today-greeting .bgn-greeting-text").textContent = "__SENTINEL__";
  });
  await page.eval(() => new Promise((r) => setTimeout(r, 8000)));
  const liveRefresh = await page.eval(() => {
    var greetingText = document.querySelector("#today-greeting .bgn-greeting-text").textContent;
    return {
      isBirthdayUnlocked: isBirthdayUnlocked(),
      msg: document.getElementById("daily-message").textContent,
      expectedMsg: CONTENT.greetings.birthdayMessage,
      greeting: greetingText,
      greetingIsBirthday: CONTENT.greetings.birthday.indexOf(greetingText) !== -1,
      expectedDays: Math.floor((appNow().getTime() - CONFIG.loveDate.getTime()) / 86400000),
      renderedDays: document.querySelector(".bgn-together-days").textContent,
    };
  });
  await check("today: the greeting, together pill and daily message refresh live when midnight arrives with the app open", () => ({
    ok: liveRefresh.isBirthdayUnlocked === true
      && liveRefresh.msg === liveRefresh.expectedMsg
      && liveRefresh.greetingIsBirthday === true
      && Number(liveRefresh.renderedDays) === liveRefresh.expectedDays
      && liveRefresh.expectedDays === Number(beforeTogetherDays) + 1,
    detail: JSON.stringify({ beforeTogetherDays, liveRefresh }),
  }));

  // 2d. m18: on her birthday (all day) Bugün shows a party-hat bear, a birthday greeting and the
  // birthday message; the next day it is back to the ordinary bucket line and the daily message.
  const birthdayToday = {};
  for (const [key, now] of [["on", "2026-10-04T15:00:00"], ["after", "2026-10-05T15:00:00"]]) {
    await openApp(page, {
      signedIn: true,
      now,
      storage: { "meryem-gate-played-year": "2026", "meryem-birthday-seen-year": "2026" },
    });
    await page.eval(() => new Promise((r) => setTimeout(r, 200)));
    birthdayToday[key] = await page.eval(() => {
      var greetingText = document.querySelector("#today-greeting .bgn-greeting-text").textContent;
      return {
        greetingIsBirthday: CONTENT.greetings.birthday.indexOf(greetingText) !== -1,
        greetingIsAfternoon: CONTENT.greetings.afternoon.indexOf(greetingText) !== -1,
        bearHasHat: !!document.querySelector("#today-greeting .kawaii-bear-hat"),
        msgIsBirthday: document.getElementById("daily-message").textContent === CONTENT.greetings.birthdayMessage,
        msgIsDaily: document.getElementById("daily-message").textContent === getDailyMessage(),
      };
    });
  }
  await check("today: on 4 Oct the greeting, bear and message are the birthday ones, and on 5 Oct the ordinary ones", () => ({
    ok: birthdayToday.on.greetingIsBirthday && birthdayToday.on.bearHasHat && birthdayToday.on.msgIsBirthday
      && birthdayToday.after.greetingIsAfternoon && !birthdayToday.after.bearHasHat && birthdayToday.after.msgIsDaily,
    detail: JSON.stringify(birthdayToday),
  }));

  // 3. Daily message is non-empty and shuffle changes it
  await openApp(page, { signedIn: true });
  await page.eval(() => new Promise((r) => setTimeout(r, 150)));
  const before = await page.text("#daily-message");
  await page.tap("#shuffle-btn");
  await page.eval(() => new Promise((r) => setTimeout(r, 400)));
  const after = await page.text("#daily-message");
  await check("today: the daily message is non-empty and shuffle changes it", () => ({
    ok: typeof before === "string" && before.trim().length > 0 && after !== before,
    detail: JSON.stringify({ before, after }),
  }));

  // 4. No countdown code remains in daily.js — that responsibility moved to js/dates.js
  const dailySrc = readFileSync(join(root, "js", "daily.js"), "utf8");
  const banned = [
    "updateCountdowns", "renderElapsed", "renderBirthdayCountdown", "_countdownInterval",
    "countdown-meet", "countdown-love", "countdown-her-bday", "countdown-his-bday", "function pad(",
  ];
  const foundBanned = banned.filter((s) => dailySrc.indexOf(s) !== -1);
  await check("today: no countdown code remains in daily.js (functions, interval, #countdown-* ids)", () => ({
    ok: foundBanned.length === 0,
    detail: foundBanned.join(", "),
  }));

  // 5. To-do empty state renders (text + bear) — the Firestore stub always yields an empty todo
  // list (fixtures/firebase-stub.js only ever seeds __STUB_MEMORIES, never a todos equivalent), so
  // the empty state is what every run of this suite actually exercises.
  await openApp(page, { signedIn: true });
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
  const empty = await page.eval(() => {
    var emptyEl = document.querySelector("#todo-list .todo-empty");
    var bear = document.querySelector("#todo-list svg.kawaii-bear");
    return { hasEmptyText: !!emptyEl && emptyEl.textContent.trim().length > 0, hasBear: !!bear };
  });
  await check("today: to-do empty state renders with text and a bear", () => ({
    ok: empty.hasEmptyText && empty.hasBear,
    detail: JSON.stringify(empty),
  }));

  // 6. The to-do checkbox is heart-shaped via a CSS mask, not a plain circle. Built as a detached
  // fixture matching the real markup (label.todo-check > input + span.checkmark) since the stub
  // above means a real .checkmark never renders in this suite.
  const heartCheckbox = await page.eval(() => {
    var wrap = document.createElement("div");
    wrap.innerHTML = '<label class="todo-check"><input type="checkbox"><span class="checkmark"></span></label>';
    document.getElementById("today-view").appendChild(wrap);
    var cm = wrap.querySelector(".checkmark");
    var beforeStyle = getComputedStyle(cm, "::before");
    var mask = beforeStyle.getPropertyValue("mask-image") || beforeStyle.getPropertyValue("-webkit-mask-image") || "";
    var result = { hasMask: !!mask && mask !== "none", parentBorderRadius: getComputedStyle(cm).borderRadius };
    wrap.remove();
    return result;
  });
  await check("today: the to-do checkbox is heart-shaped via a CSS mask, not a plain circle", () => ({
    ok: heartCheckbox.hasMask,
    detail: JSON.stringify(heartCheckbox),
  }));

  // 7. The to-do checkbox stays in the keyboard tab order (no tabindex="-1") and shows a visible
  // focus ring drawn on the painted .checkmark sibling, since the real <input> is itself invisible
  // (style.css: opacity 0, 0x0). Two halves, because a DOM fixture alone cannot catch a regression
  // in the real renderTodos() template (the Firestore stub never renders a real item — see check 5
  // — so a fixture that just hand-copies today's markup would stay green even if the ACTUAL
  // template in daily.js regressed): (a) read the real template's own checkbox line straight out
  // of daily.js's source and confirm it carries no tabindex="-1"; (b) build a fixture with that
  // same (tabindex-free) shape and confirm the CSS focus ring actually paints on it. Headless
  // Chromium never gives the tab OS-level window focus, so document.hasFocus() is false and
  // :focus/:focus-visible never match for STYLING purposes even though .focus() still sets
  // document.activeElement (measured directly: matches(':focus') was false until this emulation
  // was enabled) — Emulation.setFocusEmulationEnabled is CDP's own fix for exactly this, forcing
  // the page to believe it is focused. Enabled only for this check and turned back off after, so
  // it cannot change what any other check or screenshot sees.
  const checkboxSrcLine = dailySrc.split("\n").find((l) => l.indexOf('type="checkbox"') !== -1) || "";
  const checkboxSrcOk = checkboxSrcLine !== "" && checkboxSrcLine.indexOf("tabindex") === -1;

  await openApp(page, { signedIn: true });
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: true });
  await page.eval(() => new Promise((r) => setTimeout(r, 150)));
  const checkboxFocus = await page.eval(() => {
    var wrap = document.createElement("div");
    wrap.innerHTML = '<label class="todo-check"><input type="checkbox"><span class="checkmark"></span></label>';
    document.getElementById("today-view").appendChild(wrap);
    var input = wrap.querySelector("input");
    input.focus();
    var beforeStyle = getComputedStyle(wrap.querySelector(".checkmark"), "::before");
    var result = {
      tabIndexNotNegative: input.tabIndex !== -1,
      isFocused: document.activeElement === input,
      outlineStyle: beforeStyle.outlineStyle,
      outlineWidth: beforeStyle.outlineWidth,
    };
    wrap.remove();
    return result;
  });
  await page.send("Emulation.setFocusEmulationEnabled", { enabled: false });
  await check("today: the to-do checkbox is keyboard-focusable (no tabindex=-1 in source or DOM) and shows a visible focus ring", () => ({
    ok: checkboxSrcOk && checkboxFocus.tabIndexNotNegative && checkboxFocus.isFocused
      && checkboxFocus.outlineStyle !== "none" && parseFloat(checkboxFocus.outlineWidth) > 0,
    detail: JSON.stringify({ checkboxSrcLine: checkboxSrcLine.trim(), checkboxSrcOk, checkboxFocus }),
  }));
}

export const mutants = [
  {
    id: "today-days-formula",
    file: "js/daily.js",
    find: "Math.floor((now.getTime() - CONFIG.loveDate.getTime()) / 86400000)",
    replace: "Math.floor((now.getTime() - CONFIG.loveDate.getTime()) / 86400000) + 1",
    expect: "today: the together count is exact for 2026-10-04T10:00 (260) and the next-milestone line reads 300. günümüze 40 gün kaldı 💕",
  },
  {
    id: "today-milestone-formula",
    file: "js/daily.js",
    find: "var nextMilestone = (Math.floor(days / 100) + 1) * 100;",
    replace: "var nextMilestone = Math.floor(days / 100) * 100;",
    expect: "today: the next-milestone line points at the next hundred on an exact boundary (100 days -> 200. günümüze 100 gün kaldı 💕)",
  },
  {
    id: "today-morning-wave",
    file: "js/daily.js",
    find: "morning: { mood: 'happy', arms: 'wave' },",
    replace: "morning: { mood: 'happy', arms: 'down' },",
    expect: "today: greeting bucket and bear mood follow the time of day (08:00 morning happy+wave, 14:00 afternoon normal+heart, 20:00 evening love, 23:30 night sleepy), and the night bear is drawn big enough for its 'z' to actually read on screen",
  },
  {
    id: "today-night-bear-size-reverted",
    file: "js/daily.js",
    // bearSVG's default size became 120px with the baby-faced bear, so dropping `size` no longer
    // shrinks the night bear; the mutant draws it too small directly instead (z measured 8px).
    find: "night: { mood: 'sleepy', arms: 'down', size: 100 }",
    replace: "night: { mood: 'sleepy', arms: 'down', size: 60 }",
    expect: "today: greeting bucket and bear mood follow the time of day (08:00 morning happy+wave, 14:00 afternoon normal+heart, 20:00 evening love, 23:30 night sleepy), and the night bear is drawn big enough for its 'z' to actually read on screen",
  },
  {
    id: "today-countdown-code-reintroduced",
    file: "js/daily.js",
    find: "function renderTodos() {",
    replace: "function renderTodos() { /* updateCountdowns */",
    expect: "today: no countdown code remains in daily.js (functions, interval, #countdown-* ids)",
  },
  {
    id: "today-empty-state-bear-removed",
    file: "js/daily.js",
    find: "'<div class=\"bgn-todo-empty-bear\">' + bearSVG({ mood: 'pleading', arms: 'down', size: 60 }) + '</div>' +",
    replace: "'<div class=\"bgn-todo-empty-bear\"></div>' +",
    expect: "today: to-do empty state renders with text and a bear",
  },
  {
    id: "today-heart-checkbox-mask-removed",
    file: "css/bugun.css",
    // Removes BOTH the standard and -webkit- prefixed mask-image declarations. Removing just the
    // unprefixed one first (an earlier version of this mutant) still left the -webkit- one active,
    // and Chromium honours that alone — the mutation changed nothing a browser could see, so the
    // check correctly stayed green. Only killing both actually removes the heart mask.
    find: "  -webkit-mask-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'/%3E%3C/svg%3E\");\n  mask-image: url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z'/%3E%3C/svg%3E\");",
    replace: "",
    expect: "today: the to-do checkbox is heart-shaped via a CSS mask, not a plain circle",
  },
  {
    id: "today-checkbox-tabindex-reintroduced",
    file: "js/daily.js",
    find: "'<input type=\"checkbox\"' + (t.done ? ' checked' : '') + '>' +",
    replace: "'<input type=\"checkbox\"' + (t.done ? ' checked' : '') + ' tabindex=\"-1\">' +",
    expect: "today: the to-do checkbox is keyboard-focusable (no tabindex=-1 in source or DOM) and shows a visible focus ring",
  },
  {
    id: "today-checkbox-focus-ring-removed",
    file: "css/bugun.css",
    find: "#today-view .todo-check input:focus-visible + .checkmark::before {\n  outline: 2px solid var(--rose-strong);\n  outline-offset: 3px;\n}",
    replace: "",
    expect: "today: the to-do checkbox is keyboard-focusable (no tabindex=-1 in source or DOM) and shows a visible focus ring",
  },
  {
    id: "today-milestone-kaldi-suffix",
    file: "js/daily.js",
    find: "'<p class=\"bgn-milestone\">' + nextMilestone + '. günümüze ' + daysToMilestone + ' gün kaldı 💕</p>';",
    replace: "'<p class=\"bgn-milestone\">' + nextMilestone + '. günümüze ' + daysToMilestone + ' gün</p>';",
    expect: "today: the together count is exact for 2026-10-04T10:00 (260) and the next-milestone line reads 300. günümüze 40 gün kaldı 💕",
  },
  {
    id: "today-birthday-unlock-listener",
    file: "js/daily.js",
    find: "  document.addEventListener('meryem:birthday-unlocked', function () {\n    renderGreeting();\n    renderTogether();\n    var msgEl = document.getElementById('daily-message');\n    if (msgEl) msgEl.textContent = todaysMessage();\n  });",
    replace: "",
    expect: "today: the greeting, together pill and daily message refresh live when midnight arrives with the app open",
  },
  {
    id: "today-birthday-greeting-dropped",
    file: "js/daily.js",
    find: "if (isHerBirthdayToday() && birthdayLines && birthdayLines.length) bucket = 'birthday';",
    replace: "",
    expect: "today: on 4 Oct the greeting, bear and message are the birthday ones, and on 5 Oct the ordinary ones",
  },
  {
    id: "today-birthday-message-dropped",
    file: "js/daily.js",
    find: "if (isHerBirthdayToday() && CONTENT.greetings && CONTENT.greetings.birthdayMessage) {",
    replace: "if (false) {",
    expect: "today: on 4 Oct the greeting, bear and message are the birthday ones, and on 5 Oct the ordinary ones",
  },
];

export const shots = [
  { name: "morning", open: { signedIn: true, now: "2026-09-20T08:30:00" } },
  { name: "afternoon", open: { signedIn: true, now: "2026-09-20T14:00:00" } },
  { name: "evening", open: { signedIn: true, now: "2026-09-20T20:00:00" } },
  { name: "night", open: { signedIn: true, now: "2026-09-20T23:30:00" } },
  // Not 2026-10-04 (the 260-day spec example): that date IS her birthday, so opening the app then
  // auto-launches the birthday gate overlay on top of this view — fine for the correctness check
  // (which reads the DOM under it), useless for a design screenshot of the Today view itself.
  { name: "milestone-boundary", open: { signedIn: true, now: "2026-04-27T00:00:00" } },
  { name: "reduced-motion", open: { signedIn: true, now: "2026-09-20T08:30:00", reducedMotion: true } },
];
