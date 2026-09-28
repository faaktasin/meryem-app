/**
 * meryem-app tests — checks/dates.mjs
 *
 * Covers the Tarihler (Dates) view: the getNextBirthdayCountdown() midnight bug fix, her
 * birthday's countdown → celebration switch (numbers hidden, celebration shown, no confetti),
 * his birthday's countdown → short "today" line, the two since-counters' exact elapsed time and
 * next-milestone line, tick-to-tick node identity (textContent only, never innerHTML), and body
 * text contrast on the new elements.
 *
 * Countdown assertions are done by RECONSTRUCTING the target/anchor instant from the on-screen
 * days/hours/minutes/seconds and appNow() (both read in the same page.eval), then comparing that
 * to an expected epoch computed from Europe/Istanbul wall-clock time (UTC+3, no DST) — never by
 * asserting an exact digit, which the small, real latency between injecting `now` and reading the
 * DOM would make flaky.
 */
import { openApp, sleep } from "../harness.mjs";

export const name = "dates";

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Epoch ms for a Europe/Istanbul local wall-clock instant (Istanbul has been UTC+3 with no DST
 *  since 2016 — matches the timezone every openApp() call runs under). */
function istanbulEpoch(y, mo, d, h, mi, s) {
  return Date.UTC(y, mo - 1, d, h || 0, mi || 0, s || 0) - ISTANBUL_OFFSET_MS;
}

/** The inverse: an ISO local-datetime string openApp(){now} accepts, for a given epoch. */
function isoFromEpoch(epochMs) {
  const d = new Date(epochMs + ISTANBUL_OFFSET_MS); // shift so UTC getters read Istanbul wall-clock
  const p = (n) => (n < 10 ? "0" + n : String(n));
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}:${p(d.getUTCSeconds())}`;
}

/** Preview-protected flags seeded on every open so the gate/birthday overlays (owned by other
 *  packages) never pop up over the dates tab mid-check, whatever `now` lands on. */
function seedFlags(nowIso) {
  const y = String(nowIso ? Number(nowIso.slice(0, 4)) : new Date().getFullYear());
  return { "meryem-gate-played-year": y, "meryem-birthday-seen-year": y };
}

async function openDates(page, opts) {
  await openApp(page, { signedIn: true, storage: seedFlags(opts.now), ...opts });
  await page.tap('.nav-btn[data-tab="dates-view"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 150)));
  await page.settle(); // finishes the .view fade-in — without it, ink()'s opacity walk mid-fade
  // under-reports contrast (an ancestor still animating opacity toward 1 at read time)
}

async function readCountdown(page, prefix) {
  return page.eval((p) => {
    const g = (u) => {
      const el = document.querySelector(`[data-dts-unit="${p}-${u}"]`);
      return el ? Number(el.textContent) : NaN;
    };
    return { now: appNow().getTime(), days: g("days"), hours: g("hours"), minutes: g("minutes"), seconds: g("seconds") };
  }, prefix);
}

const remainingMs = (u) => u.days * 86400000 + u.hours * 3600000 + u.minutes * 60000 + u.seconds * 1000;

export async function run({ page, check }) {
  // 1. The data.js bug fix itself: today:true for the whole calendar day, false the day before.
  await openDates(page, { now: "2026-10-04T23:59:00" });
  const todayLate = await page.eval(() => getNextBirthdayCountdown(10, 4));
  await openDates(page, { now: "2026-10-03T23:59:00" });
  const dayBefore = await page.eval(() => getNextBirthdayCountdown(10, 4));
  await check("dates: getNextBirthdayCountdown returns today:true on the birthday and false the day before", () => ({
    ok: todayLate.today === true && dayBefore.today === false,
    detail: JSON.stringify({ todayLate, dayBefore }),
  }));

  // 2. Her birthday, sub-minute countdown the day before (exercises the exact fix boundary).
  await openDates(page, { now: "2026-10-03T23:59:30" });
  const herLate = await readCountdown(page, "her");
  const herLateOk = Math.abs(herLate.now + remainingMs(herLate) - istanbulEpoch(2026, 10, 4, 0, 0, 0)) <= 2000;
  await check("dates: her countdown reaches midnight of her birthday, not ~364 days, at 23:59:30 the day before", () => ({
    ok: herLateOk,
    detail: JSON.stringify(herLate),
  }));

  // 3. Her birthday itself: celebration shown, numbers hidden, no confetti canvas.
  await openDates(page, { now: "2026-10-04T10:00:00" });
  const herCeleb = await page.eval(() => ({
    unitsHidden: document.getElementById("countdown-her-bday").hidden,
    celebHidden: document.querySelector(".dts-celebration") ? document.querySelector(".dts-celebration").hidden : null,
    titleText: document.querySelector(".dts-celebration-title") ? document.querySelector(".dts-celebration-title").textContent : null,
    confettiCanvases: document.querySelectorAll(".fx-confetti-canvas").length,
  }));
  await check("dates: her card shows the celebration on her birthday (numbers hidden, confetti-free)", () => ({
    ok: herCeleb.unitsHidden === true && herCeleb.celebHidden === false && !!herCeleb.titleText && herCeleb.confettiCanvases === 0,
    detail: JSON.stringify(herCeleb),
  }));

  // 4. His birthday countdown lands on 26 May 2027 from 4 Oct 2026 (this year's already passed).
  const hisRes = await readCountdown(page, "his"); // still on the 2026-10-04T10:00 page from #3
  const hisOk = Math.abs(hisRes.now + remainingMs(hisRes) - istanbulEpoch(2027, 5, 26, 0, 0, 0)) <= 2000;
  await check("dates: his birthday countdown lands on 26 May 2027 (this year's has already passed)", () => ({
    ok: hisOk,
    detail: JSON.stringify(hisRes),
  }));

  // 5. His birthday, "today": a short line instead of numbers — no full celebration treatment.
  await openDates(page, { now: "2027-05-26T09:00:00" });
  const hisToday = await page.eval(() => ({
    unitsHidden: document.getElementById("countdown-his-bday").hidden,
    lineHidden: document.querySelector(".dts-today-line") ? document.querySelector(".dts-today-line").hidden : null,
    lineText: document.querySelector(".dts-today-line") ? document.querySelector(".dts-today-line").textContent : null,
  }));
  await check("dates: his birthday shows a short line instead of numbers on the day", () => ({
    ok: hisToday.unitsHidden === true && hisToday.lineHidden === false && !!hisToday.lineText,
    detail: JSON.stringify(hisToday),
  }));

  // 6. Since-counters: exact elapsed time against CONFIG.firstMeetDate / CONFIG.loveDate.
  await openDates(page, { now: "2026-06-15T12:00:00" });
  const meetRes = await readCountdown(page, "meet");
  const meetOk = Math.abs(meetRes.now - remainingMs(meetRes) - istanbulEpoch(2026, 3, 10, 0, 0, 0)) <= 2000;
  const loveRes = await readCountdown(page, "love");
  const loveOk = Math.abs(loveRes.now - remainingMs(loveRes) - istanbulEpoch(2026, 1, 17, 0, 0, 0)) <= 2000;
  await check("dates: since-counters show the exact elapsed time since firstMeetDate/loveDate", () => ({
    ok: meetOk && loveOk,
    detail: JSON.stringify({ meetRes, loveRes }),
  }));

  // 7. Next-milestone line: pick `now` so exactly 260 elapsed days have passed since firstMeetDate.
  const now260 = isoFromEpoch(istanbulEpoch(2026, 3, 10, 12, 0, 0) + 260 * 86400000);
  await openDates(page, { now: now260 });
  const milestoneText = await page.eval(() => document.querySelectorAll(".dts-milestone")[0].textContent);
  await check("dates: the next-milestone line reads '300. güne 40 gün kaldı' at 260 elapsed days", () => ({
    ok: milestoneText.indexOf("300. güne 40 gün kaldı") !== -1,
    detail: milestoneText,
  }));

  // 8. Node identity: the same second-span survives a tick — an expando property (which only
  //    survives if the node itself is never replaced) persists, while its text changes.
  await openDates(page, { now: "2026-06-15T12:00:00" });
  const before = await page.eval(() => {
    const el = document.querySelector('[data-dts-unit="meet-seconds"]');
    el.__dtsTestMark = "kept";
    return el.textContent;
  });
  await sleep(2200);
  const after = await page.eval(() => {
    const el = document.querySelector('[data-dts-unit="meet-seconds"]');
    return { mark: el.__dtsTestMark, text: el.textContent };
  });
  await check("dates: seconds tick via textContent only — node identity survives across ticks", () => ({
    ok: after.mark === "kept" && after.text !== before,
    detail: JSON.stringify({ before, after }),
  }));

  // 9a. Contrast of the celebration TITLE, measured gradient-aware — never via readable(), which
  //     walks up to the first ancestor with a solid background-color and is blind to a gradient
  //     (harness.mjs:150-151 documents this). .dts-card-gift paints --paper -> --blush at 135deg,
  //     and luminance is monotonic along that interpolation (both stops are lighter than the dark
  //     title ink, so the true worst point for a dark-on-light ratio is one of the two stops, never
  //     a point between them) — so measuring the title's own ink against BOTH stops directly covers
  //     every pixel the title could ever sit on, including points readable() would never reach.
  await openDates(page, { now: "2026-10-04T10:00:00" });
  const titleContrast = await page.eval(() => {
    function tokenRgb(name) {
      const d = document.createElement("div");
      d.style.cssText = "position:absolute;visibility:hidden;background-color:var(" + name + ")";
      document.body.appendChild(d);
      const c = window.__app.parse(getComputedStyle(d).backgroundColor);
      d.remove();
      return c;
    }
    const el = document.querySelector(".dts-celebration-title");
    const ink = window.__app.ink(el);
    return {
      onPaper: window.__app.contrast(ink, tokenRgb("--paper")),
      onBlush: window.__app.contrast(ink, tokenRgb("--blush")),
    };
  });
  await check("dates: the celebration title reaches 4.5:1 at both ends of the .dts-card-gift gradient (--paper and --blush), not just readable()'s ancestor-walk", () => ({
    ok: titleContrast.onPaper >= 4.5 && titleContrast.onBlush >= 4.5,
    detail: JSON.stringify(titleContrast),
  }));

  // 9b. Contrast on this package's own text (shell.mjs already covers .countdown-unit-label).
  await openDates(page, { now: "2026-06-15T12:00:00" });
  const contrastNormal = await page.eval(() => ({
    milestones: [...document.querySelectorAll(".dts-milestone")].map((el) => window.__app.readable(el)),
  }));
  await openDates(page, { now: "2026-10-04T10:00:00" });
  const contrastCeleb = await page.eval(() => ({ celebSub: window.__app.readable(document.querySelector(".dts-celebration-sub")) }));
  await openDates(page, { now: "2027-05-26T09:00:00" });
  const contrastToday = await page.eval(() => ({ todayLine: window.__app.readable(document.querySelector(".dts-today-line")) }));
  const failures = Object.entries({ ...contrastNormal, ...contrastCeleb, ...contrastToday }).flatMap(([k, v]) =>
    (Array.isArray(v) ? v : [v]).filter((n) => n < 4.5).map((n) => `${k} ${n.toFixed(2)}`)
  );
  await check("dates: body text on the new elements (milestone line, celebration sub, his-today line) reaches 4.5:1 contrast", () => ({
    ok: failures.length === 0,
    detail: failures.join(" ; ") || JSON.stringify({ contrastNormal, contrastCeleb, contrastToday }),
  }));

  // 10. No console errors from this package's own build/tick.
  await check("dates: no console errors from initDates/tick", () => ({
    ok: !page.errors.some((e) => /initDates|dates\.js/i.test(e)),
    detail: page.errors.slice(0, 5).join(" ; "),
  }));
}

export const mutants = [
  {
    id: "dates-today-midnight-bug",
    file: "js/data.js",
    find: "var isToday = now.getMonth() === (month - 1) && now.getDate() === day;",
    replace: "var isToday = false;",
    expect: "dates: getNextBirthdayCountdown returns today:true on the birthday and false the day before",
  },
  {
    id: "dates-celebration-never-shows",
    file: "js/dates.js",
    find: "her.celeb.hidden = false;",
    replace: "her.celeb.hidden = true;",
    expect: "dates: her card shows the celebration on her birthday (numbers hidden, confetti-free)",
  },
  {
    id: "dates-his-today-never-shows",
    file: "js/dates.js",
    find: "his.today.hidden = false;",
    replace: "his.today.hidden = true;",
    expect: "dates: his birthday shows a short line instead of numbers on the day",
  },
  {
    id: "dates-milestone-off-by-one",
    file: "js/dates.js",
    find: "var next = (Math.floor(elapsedDays / 100) + 1) * 100;",
    replace: "var next = Math.floor(elapsedDays / 100) * 100;",
    expect: "dates: the next-milestone line reads '300. güne 40 gün kaldı' at 260 elapsed days",
  },
  {
    id: "dates-seconds-replaces-node",
    file: "js/dates.js",
    find: "if (refs.seconds) refs.seconds.textContent = pad2(res.seconds);",
    replace: "if (refs.seconds) { var _n = refs.seconds.cloneNode(true); _n.textContent = pad2(res.seconds); refs.seconds.parentNode.replaceChild(_n, refs.seconds); refs.seconds = _n; }",
    expect: "dates: seconds tick via textContent only — node identity survives across ticks",
  },
  {
    id: "dates-celebration-title-contrast",
    file: "css/dates.css",
    find: "color: var(--berry);",
    replace: "color: var(--rose-strong);",
    expect: "dates: the celebration title reaches 4.5:1 at both ends of the .dts-card-gift gradient (--paper and --blush), not just readable()'s ancestor-walk",
  },
];

export const shots = [
  { name: "normal", open: { signedIn: true, now: "2026-06-15T12:00:00", storage: seedFlags("2026-06-15T12:00:00") }, act: async (page) => { await page.tap('.nav-btn[data-tab="dates-view"]'); } },
  {
    name: "her-birthday",
    open: { signedIn: true, now: "2026-10-04T10:00:00", storage: seedFlags("2026-10-04T10:00:00") },
    act: async (page) => {
      await page.tap('.nav-btn[data-tab="dates-view"]');
      await page.eval(() => new Promise((r) => setTimeout(r, 300)));
    },
  },
  {
    name: "his-today",
    open: { signedIn: true, now: "2027-05-26T09:00:00", storage: seedFlags("2027-05-26T09:00:00") },
    act: async (page) => { await page.tap('.nav-btn[data-tab="dates-view"]'); },
  },
  {
    name: "reduced-motion",
    open: { signedIn: true, now: "2026-10-04T10:00:00", storage: seedFlags("2026-10-04T10:00:00"), reducedMotion: true },
    act: async (page) => { await page.tap('.nav-btn[data-tab="dates-view"]'); },
  },
];
