/**
 * meryem-app tests — checks/habits.mjs
 *
 * Takip, stage 2: the numbers (js/habits.js, exposed as window.habitsCore), the Firestore helpers
 * (js/firebase.js) and the stub they run against (tests/fixtures/firebase-stub.js).
 *
 * Every number is checked against a HAND-COMPUTED value written into this file with its
 * arithmetic beside it; none is taken from the code under test. Fixed clocks come from
 * openApp({ now }) (Europe/Istanbul). Calendar facts the arithmetic rests on:
 *   2026-10-01 is a Thursday, so Oct 2026 weekends are 3-4, 10-11, 17-18, 24-25, 31 (a Saturday);
 *   Oct 2026 has 22 weekdays; Feb 2027 starts on a Monday, has 28 days and 20 weekdays.
 *
 * The habit list (CONFIG.habits): spor and kuran are joint (both), arapca and cicek are Meryem's,
 * projeler is Furkan's, erken (Erken çıkış) is Furkan's and due Monday-Friday only. So on a
 * weekday Furkan has 4 boxes and Meryem 4; on a weekend Furkan has 3 and Meryem 4.
 */
import { openApp, sleep } from "../harness.mjs";

export const name = "habits";

const ISTANBUL_OFFSET_MS = 3 * 60 * 60 * 1000;
const istanbulEpoch = (y, mo, d, h, mi) => Date.UTC(y, mo - 1, d, h || 0, mi || 0, 0) - ISTANBUL_OFFSET_MS;

const U = "users/test-uid/";
const MONTHS = U + "habitMonths";
const LOG = U + "habitLog";

// ── builders (test side) ────────────────────────────────────────────────────────────────────
const pad = (n) => String(n).padStart(2, "0");
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const isWeekday = (y, m, d) => { const w = new Date(y, m - 1, d).getDay(); return w >= 1 && w <= 5; };

/** spec: [[itemId, person, [dayOfMonth, ...]], ...] -> a month document ({days:{...}}) */
function mk(month, spec) {
  const days = {};
  for (const [item, person, list] of spec) {
    for (const d of list) {
      const key = `${month}-${pad(d)}`;
      if (!days[key]) days[key] = {};
      if (!days[key][item]) days[key][item] = {};
      days[key][item][person] = true;
    }
  }
  return { days };
}

const near = (a, b) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-9);

// ── page side ───────────────────────────────────────────────────────────────────────────────
const T = (s) => ({ d: s }); // a Date argument, built in the page as a local date
const I = (id) => ({ item: id }); // a CONFIG.habits entry by id

/** Calls window.habitsCore[fn](...args) in the page; {d:'YYYY-MM-DD'} and {item:'id'} are revived. */
function core(page, fn, ...args) {
  return page.eval((f, a) => {
    const rv = (v) => {
      if (v && typeof v === "object" && typeof v.d === "string") return new Date(+v.d.slice(0, 4), +v.d.slice(5, 7) - 1, +v.d.slice(8, 10));
      if (v && typeof v === "object" && typeof v.item === "string") return CONFIG.habits.find((h) => h.id === v.item);
      return v;
    };
    return window.habitsCore[f].apply(null, a.map(rv));
  }, fn, args);
}

async function until(fn, ms = 4000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    if (Date.now() > end) return v;
    await sleep(80);
  }
}

async function open(page, now, extra = {}) {
  const y = now.slice(0, 4);
  await openApp(page, { now, storage: { "meryem-gate-played-year": y, "meryem-birthday-seen-year": y }, ...extra });
  await until(() => page.eval(() => !!(window.habitsCore && window.habitsCore.state().month)));
}

/** Opens the app on the Takip tab. `me` seeds the stored identity (null = a fresh device). */
async function openTakip(page, now, me, extra = {}) {
  const y = now.slice(0, 4);
  const storage = { "meryem-gate-played-year": y, "meryem-birthday-seen-year": y };
  if (me) storage["meryem-habits-me"] = me;
  await openApp(page, { now, storage, ...extra });
  await until(() => page.eval(() => !!(window.habitsCore && window.habitsCore.state().month)));
  await sleep(150);
  await page.tap('.nav-btn[data-tab="habits-view"]');
  await page.settle();
  await sleep(200);
}

/** Scrolls the element to the middle of the screen, then taps it for real. */
async function tapIn(page, sel) {
  await page.eval((s) => document.querySelector(s).scrollIntoView({ block: "center" }), sel);
  await sleep(60);
  await page.tap(sel);
  await sleep(250);
}

const stateOf = (page) => page.eval(() => window.habitsCore.state());
const listeners = (page) => page.eval(() => window.__stubListeners());

// ── the hand-computed month: Thursday 15 Oct 2026 ───────────────────────────────────────────
// Ticks (days of October). Future days (16, 20, 30, 31) are in the data on purpose.
//   Furkan  spor 1-10,14 (+16,20 future)   kuran 1-15 (+31 future)   projeler 1-5
//           erken 1,2,3,5,6,7  (3 is a Saturday: not due, must not count)
//   Meryem  spor 1-12 (+20 future)   kuran 1-15   arapca 1-12   cicek 1-3 (+30 future)
const M1 = mk("2026-10", [
  ["spor", "furkan", [...range(1, 10), 14, 16, 20]],
  ["kuran", "furkan", [...range(1, 15), 31]],
  ["projeler", "furkan", range(1, 5)],
  ["erken", "furkan", [1, 2, 3, 5, 6, 7]],
  ["spor", "meryem", [...range(1, 12), 20]],
  ["kuran", "meryem", range(1, 15)],
  ["arapca", "meryem", range(1, 12)],
  ["cicek", "meryem", [1, 2, 3, 30]],
]);

// ── stage 4 fixtures: four months for "Aydan aya", and a log of eight entries ─────────────────
const NOV_D = mk("2026-11", [
  ["spor", "meryem", range(1, 25)], ["spor", "furkan", range(1, 20)], ["kuran", "meryem", range(1, 30)], ["kuran", "furkan", range(1, 28)],
  ["arapca", "meryem", range(1, 22)], ["cicek", "meryem", range(1, 10)], ["projeler", "furkan", range(1, 26)], ["erken", "furkan", [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 30]],
]);
const DEC_D = mk("2026-12", [
  ["spor", "meryem", range(1, 31)], ["spor", "furkan", range(1, 12)], ["kuran", "meryem", range(1, 31)], ["kuran", "furkan", range(1, 31)],
  ["arapca", "meryem", range(1, 28)], ["cicek", "meryem", range(1, 31)], ["projeler", "furkan", range(1, 15)],
]);
const JAN_D = mk("2027-01", [["kuran", "meryem", [1, 2, 3, 4, 5]], ["kuran", "furkan", [1, 2, 3, 4]], ["spor", "meryem", [1, 2, 3, 4, 5]], ["spor", "furkan", [1, 2, 3]], ["arapca", "meryem", [1, 2, 3]]]);
const MOM_MONTHS = { "2026-10": M1, "2026-11": NOV_D, "2026-12": DEC_D, "2027-01": JAN_D };
const LE = (d, h, mi) => istanbulEpoch(2026, 10, d, h, mi);
const logEntry = (id, extra) => ({ id, month: "2026-10", day: "2026-10-15", item: "spor", person: "furkan", value: true, by: "furkan", ...extra });
const LOG8 = [
  logEntry("a", { item: "arapca", person: "meryem", by: "meryem", at: { __ts: LE(15, 10, 0) }, atLocal: LE(15, 10, 0) }),
  logEntry("b", { at: null, atLocal: LE(15, 21, 4) }),
  logEntry("c", { item: "kuran", at: { __ts: LE(15, 8, 30) }, atLocal: LE(15, 8, 30) }),
  logEntry("e", { item: "cicek", person: "meryem", by: "meryem", at: null, atLocal: LE(15, 9, 0) }),
  logEntry("f", { item: "kuran", value: false, at: { __ts: LE(15, 7, 0) }, atLocal: LE(15, 7, 0) }),
  logEntry("g", { day: "2026-10-14", at: { __ts: LE(14, 22, 10) }, atLocal: LE(14, 22, 10) }),
  logEntry("h", { day: "2026-10-14", item: "projeler", at: { __ts: LE(14, 21, 0) }, atLocal: LE(14, 21, 0) }),
  logEntry("i", { day: "2026-10-13", at: { __ts: LE(13, 20, 0) }, atLocal: LE(13, 20, 0) }),
];
const NOV_LOG = { id: "d", month: "2026-11", day: "2026-11-09", item: "kuran", person: "meryem", value: true, by: "meryem", at: { __ts: istanbulEpoch(2026, 11, 9, 20, 15) }, atLocal: istanbulEpoch(2026, 11, 9, 20, 15) };

const N_CARDS = "habits: every stat card number equals its monthSummary field through the one rounding helper (15 Oct, a past month, Şubat 2027)";
const N_LEAD = "habits: the lead line names the leader with the rounded gap, says Başa baş on a tie and is empty before anything is due";
const N_STREAKCARD = "habits: the streak card shows the current streak on the running month and that month's longest on a past one";
const N_DAILY = "habits: the daily chart has one point per due day up to today for each person, none after, and each y follows perDay";
const N_BARS = "habits: the per-item bars print the item percentages per owner and a dash when nothing is due";
const N_MOM = "habits: month over month shows every month from 2026-10 to the current with each month's summary values";
const N_REPORT = "habits: the report card is absent on the running month, present on a past month and on the 1st for the month before";
const N_LOGVIEW = "habits: the log lists newest first, keeps a null-at row marked bekliyor, collapses to 5 and expands";
const N_LOGSWITCH = "habits: the log follows the viewed month and a fresh tick lands at its top";
const N_FIT = "habits: the new cards fit 360 and 390 px wide with no horizontal page scroll";
const N_CONTRAST2 = "habits: the words on the stat cards, charts, report card and log reach 4.5:1";

const N_WEEKDAY = "habits: Erken çıkış is due Monday to Friday only and a weekend tick never counts";
const N_FUTURE = "habits: a tick dated after today never counts, in any number";
const N_JOINT = "habits: Birlikte counts a joint item-day only when both ticked";
const N_PERSON = "habits: person percentages are per person (15 Oct)";
const N_STREAK = "habits: the current streak runs across the month boundary (30 Oct to 2 Nov)";
const N_APPNOW = "habits: the tracked month follows appNow() (rehearsal clock), not the raw Date";
const N_ME = "habits: Ben kimim? appears once on a fresh device, is remembered and can be changed";
const N_LOCK = "habits: your own boxes are tappable, the partner's are locked and a tap on them writes nothing";
const N_TICK = "habits: a tick writes the month document and a log entry with by, an untick writes false";
const N_HEART = "habits: the joint heart lights only when both ticked (today's panel and the calendar)";
const N_WEEKEND = "habits: Erken çıkış is absent on a Saturday in today's panel and undue in the day sheet";
const N_NAV = "habits: the navigator lists exactly the months from 2026-10 to the current and none after";
const N_FUTURE_DAY = "habits: a future day is dimmed and not tappable, today and past days open the day sheet";
const N_SHEET = "habits: a past day's sheet groups Birlikte / Meryem / Furkan and its edit lands in that day's month document";
const N_PASTMONTH = "habits: a past month can be browsed and a tick there lands in that month's document and log";
const N_LEAK = "habits: switching months back and forth leaves no listener behind";
const N_PREVSUB = "habits: the previous month is subscribed too, so a streak crosses the 1st without any card";
const N_SOON = "habits: before the start date the page says 1 Ekim'de başlıyoruz and shows no box";
const N_RINGS = "habits: calendar rings follow each person's day percentage and the heart marks the joint days";
const N_CONTRAST = "habits: the words on the tinted rows and the calendar reach 4.5:1";
const N_ROLL = "habits: midnight with the Takip tab open moves today's panel to the new day and month";
const N_ERR = "habits: no page errors on the Takip screens";
const N_LOG = "habits: subscribeHabitLog lists newest first and keeps an entry whose server time is still empty";

export async function run({ page, check, root }) {
  // ── 0. static facts ───────────────────────────────────────────────────────────────────────
  await open(page, "2026-10-15T12:00:00");

  await check("habits: CONFIG lists the six habits with their owners, weekday rule, start date and note", async () => {
    const got = await page.eval(() => ({
      start: CONFIG.habitsStart,
      people: CONFIG.people,
      habits: CONFIG.habits.map((h) => [h.id, h.label, h.owners.join("+"), h.weekdaysOnly, h.since, h.until === undefined, h.note]),
    }));
    const want = [
      ["spor", "Spor", "furkan+meryem", false, "2026-10-01", true, "Spor yapacağız"],
      ["kuran", "Kuran (en az 1 sayfa)", "furkan+meryem", false, "2026-10-01", true, "En az 1 sf Kuran okucaz"],
      ["arapca", "Arapça tekrarı (en az 15 dk)", "meryem", false, "2026-10-01", true, "Min 15 dk Arapça tekrarı yapacağım"],
      ["cicek", "Çiçek yapımı", "meryem", false, "2026-10-01", true, "Çiçek yapmaya başlıcam"],
      ["projeler", "Projeleri geliştirme", "furkan", false, "2026-10-01", true, "Sen elindeki projeleri geliştirmeye başlayıp belli bir seviyeye getireceksin"],
      ["erken", "Erken çıkış (fazla mesai yok)", "furkan", true, "2026-10-01", true, "Fazla mesai yok işten erken çıkacaksın 🤗"],
    ];
    return {
      ok: got.start === "2026-10" && got.people.furkan === "Furkan" && got.people.meryem === "Meryem" && JSON.stringify(got.habits) === JSON.stringify(want),
      detail: JSON.stringify(got).slice(0, 300),
    };
  });

  await check("habits: js/habits.js is loaded before js/app.js and initHabits is dispatched by initFeatures", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const html = readFileSync(join(root, "index.html"), "utf8");
    const local = [...html.matchAll(/<script\s+src="(js\/[^"]+)"/g)].map((m) => m[1]);
    const app = readFileSync(join(root, "js", "app.js"), "utf8");
    const at = local.indexOf("js/habits.js");
    return { ok: at >= 0 && at < local.indexOf("js/app.js") && /names = \[[^\]]*'initHabits'/.test(app), detail: local.join(", ") };
  });

  // ── 1. calendar helpers ───────────────────────────────────────────────────────────────────
  await check("habits: calendar helpers - keys, month length (31/30/28/29), navigation, monthsFrom", async () => {
    const got = {
      day: await core(page, "dayKey", T("2026-10-05")),
      month: await core(page, "monthKey", T("2026-10-05")),
      oct: await core(page, "daysInMonth", "2026-10"),
      nov: await core(page, "daysInMonth", "2026-11"),
      feb27: await core(page, "daysInMonth", "2027-02"),
      feb28: await core(page, "daysInMonth", "2028-02"),
      prevJan: await core(page, "prevMonth", "2027-01"),
      nextDec: await core(page, "nextMonth", "2026-12"),
      prevOct: await core(page, "prevMonth", "2026-10"),
      nextOct: await core(page, "nextMonth", "2026-10"),
      five: await core(page, "monthsFrom", "2026-10", T("2027-02-10")),
      one: await core(page, "monthsFrom", "2026-10", T("2026-10-31")),
      none: await core(page, "monthsFrom", "2026-10", T("2026-09-20")),
    };
    const want = {
      day: "2026-10-05", month: "2026-10", oct: 31, nov: 30, feb27: 28, feb28: 29,
      prevJan: "2026-12", nextDec: "2027-01", prevOct: "2026-09", nextOct: "2026-11",
      five: ["2026-10", "2026-11", "2026-12", "2027-01", "2027-02"], one: ["2026-10"], none: [],
    };
    return { ok: JSON.stringify(got) === JSON.stringify(want), detail: JSON.stringify(got) };
  });

  await check("habits: isDue - never after today, never before since, never after until", async () => {
    const synth = { id: "x", owners: ["furkan"], weekdaysOnly: false, since: "2026-10-01", until: "2026-10-10" };
    const got = [
      await core(page, "isDue", I("spor"), T("2026-10-15"), T("2026-10-15")), // today itself: due
      await core(page, "isDue", I("spor"), T("2026-10-16"), T("2026-10-15")), // tomorrow: not
      await core(page, "isDue", I("spor"), T("2026-09-30"), T("2026-10-15")), // before since: not
      await core(page, "isDue", synth, T("2026-10-10"), T("2026-10-15")), // until day itself: due
      await core(page, "isDue", synth, T("2026-10-11"), T("2026-10-15")), // after until: not
    ];
    return { ok: JSON.stringify(got) === JSON.stringify([true, false, false, true, false]), detail: JSON.stringify(got) };
  });

  // ── 2. mid-month (Thu 15 Oct 2026) ────────────────────────────────────────────────────────
  // Due days through the 15th: 15 calendar days; weekends are 3,4,10,11 so 11 weekdays.
  //   Furkan boxes due = spor 15 + kuran 15 + projeler 15 + erken 11 = 56
  //   Meryem boxes due = spor 15 + kuran 15 + arapca 15 + cicek 15  = 60
  //   joint item-days  = spor 15 + kuran 15 = 30
  // Furkan ticked & due: spor 1-10,14 = 11; kuran 15; projeler 5; erken 1,2,5,6,7 = 5 -> 36
  // Meryem ticked & due: spor 12; kuran 15; arapca 12; cicek 3 -> 42
  const mid = T("2026-10-15");
  await check(N_PERSON, async () => {
    const f = await core(page, "personPercent", "furkan", "2026-10", M1, mid); // 36 / 56
    const m = await core(page, "personPercent", "meryem", "2026-10", M1, mid); // 42 / 60
    return { ok: near(f, 36 * 100 / 56) && near(m, 70) && near(f, 64.28571428571429), detail: `furkan ${f} (want 64.2857), meryem ${m} (want 70)` };
  });

  await check(N_JOINT, async () => {
    // both ticked: spor 1-10 = 10, kuran 1-15 = 15 -> 25 of 30. (Either-one-ticked would be
    // spor 1-12,14 = 13 plus 15 = 28 of 30.)
    const b = await core(page, "birliktePercent", "2026-10", M1, mid);
    return { ok: near(b, 25 * 100 / 30), detail: `birlikte ${b} (want 83.3333)` };
  });

  await check("habits: item percentages (15 Oct); an item that is not the person's is null", async () => {
    const got = {
      sporF: await core(page, "itemPercent", I("spor"), "furkan", "2026-10", M1, mid), // 11/15
      sporM: await core(page, "itemPercent", I("spor"), "meryem", "2026-10", M1, mid), // 12/15
      kuranF: await core(page, "itemPercent", I("kuran"), "furkan", "2026-10", M1, mid), // 15/15
      arapcaM: await core(page, "itemPercent", I("arapca"), "meryem", "2026-10", M1, mid), // 12/15
      cicekM: await core(page, "itemPercent", I("cicek"), "meryem", "2026-10", M1, mid), // 3/15
      projeF: await core(page, "itemPercent", I("projeler"), "furkan", "2026-10", M1, mid), // 5/15
      arapcaF: await core(page, "itemPercent", I("arapca"), "furkan", "2026-10", M1, mid), // not his
    };
    const want = { sporF: 1100 / 15, sporM: 80, kuranF: 100, arapcaM: 80, cicekM: 20, projeF: 500 / 15, arapcaF: null };
    const ok = Object.keys(want).every((k) => near(got[k], want[k]));
    return { ok, detail: JSON.stringify(got) };
  });

  await check(N_WEEKDAY, async () => {
    // Erken çıkış, 15 Oct: weekdays 1,2,5,6,7,8,9,12,13,14,15 = 11 due; ticked 1,2,5,6,7 = 5 (the
    // Saturday tick on the 3rd is ignored) -> 5/11. Without the weekday rule it would be 6/15.
    const erken = await core(page, "itemPercent", I("erken"), "furkan", "2026-10", M1, mid);
    const due = [
      await core(page, "isDue", I("erken"), T("2026-10-02"), mid), // Friday
      await core(page, "isDue", I("erken"), T("2026-10-03"), mid), // Saturday
      await core(page, "isDue", I("erken"), T("2026-10-04"), mid), // Sunday
      await core(page, "isDue", I("erken"), T("2026-10-05"), mid), // Monday
      await core(page, "isDue", I("spor"), T("2026-10-03"), mid), // an every-day item on a Saturday
    ];
    return {
      ok: near(erken, 500 / 11) && JSON.stringify(due) === JSON.stringify([true, false, false, true, true]),
      detail: `erken ${erken} (want 45.4545), due ${JSON.stringify(due)}`,
    };
  });

  await check(N_FUTURE, async () => {
    // M1 holds ticks on days 16, 20, 30, 31. The same numbers as without them (the asserts above
    // use M1 as is); here the data is compared with a copy cleaned of every tick after the 15th.
    const clean = JSON.parse(JSON.stringify(M1));
    for (const k of Object.keys(clean.days)) if (k > "2026-10-15") delete clean.days[k];
    const sumA = await core(page, "monthSummary", "2026-10", M1, mid);
    const sumB = await core(page, "monthSummary", "2026-10", clean, mid);
    const sameNumbers = JSON.stringify(sumA) === JSON.stringify(sumB);
    const f = await core(page, "personPercent", "furkan", "2026-10", M1, mid);
    const joint = await core(page, "birliktePercent", "2026-10", M1, mid);
    return { ok: sameNumbers && near(f, 36 * 100 / 56) && near(joint, 25 * 100 / 30), detail: `identical to the cleaned data: ${sameNumbers}; furkan ${f}; birlikte ${joint}` };
  });

  await check("habits: longest streak within a month, and the current streak when yesterday was missed", async () => {
    // Furkan complete (every due box ticked) on 1-5, so the longest is 5; the 6th lacks projeler.
    // Meryem complete on 1-3 (cicek stops after the 3rd) -> 3. On the 15th: today is open, the 14th
    // is not complete for either of them -> current streak 0.
    const got = {
      lf: await core(page, "longestStreak", "furkan", "2026-10", M1, mid),
      lm: await core(page, "longestStreak", "meryem", "2026-10", M1, mid),
      cf: await core(page, "currentStreak", "furkan", { "2026-10": M1 }, mid),
      cm: await core(page, "currentStreak", "meryem", { "2026-10": M1 }, mid),
    };
    return { ok: got.lf === 5 && got.lm === 3 && got.cf === 0 && got.cm === 0, detail: JSON.stringify(got) };
  });

  await check("habits: monthSummary - cards, leader, best item, joint days and the daily series (15 Oct)", async () => {
    const s = await core(page, "monthSummary", "2026-10", M1, mid);
    // jointDays: spor both on 1-10, kuran both on 1-15 -> days where BOTH joint items were done
    // by both = 1-10 = 10.  leader: 36*60 = 2160 < 42*56 = 2352 -> meryem.
    // best item (all owners together): kuran 30/30 = 100 beats spor 23/30 = 76.7.
    // perDay: d1 both 4/4; d3 (Sat) furkan 3/3 (his weekend erken tick ignored), meryem 4/4; d6 furkan 3/4,
    // meryem 3/4; d11 (Sun) furkan 1/3, meryem 3/4; d14 furkan 2/4, meryem 1/4; d15 1/4 and 1/4.
    const day = (n) => s.perDay[n - 1];
    const want = [
      [1, 100, 100], [3, 100, 100], [6, 75, 75], [11, 100 / 3, 75], [14, 50, 25], [15, 25, 25], [16, null, null], [20, null, null], [31, null, null],
    ];
    const daysOk = want.every(([n, f, m]) => near(day(n).furkan, f) && near(day(n).meryem, m));
    const ok =
      s.month === "2026-10" && s.days === 31 && s.started === true &&
      s.people.furkan.due === 56 && s.people.furkan.done === 36 && near(s.people.furkan.pct, 36 * 100 / 56) && s.people.furkan.longest === 5 &&
      s.people.meryem.due === 60 && s.people.meryem.done === 42 && near(s.people.meryem.pct, 70) && s.people.meryem.longest === 3 &&
      s.birlikte.due === 30 && s.birlikte.done === 25 && near(s.birlikte.pct, 25 * 100 / 30) &&
      s.jointDays === 10 && s.leader === "meryem" &&
      s.bestItem && s.bestItem.id === "kuran" && s.bestItem.label === "Kuran (en az 1 sayfa)" && near(s.bestItem.pct, 100) &&
      s.items.length === 6 && s.items[0].id === "spor" && near(s.items[0].pct, 23 * 100 / 30) && s.items[5].meryem === null &&
      s.perDay.length === 31 && s.perDay[0].key === "2026-10-01" && daysOk;
    return { ok, detail: JSON.stringify({ people: s.people, birlikte: s.birlikte, jointDays: s.jointDays, leader: s.leader, best: s.bestItem, d: [1, 3, 6, 11, 14, 15, 16].map((n) => day(n)) }).slice(0, 600) };
  });

  // ── 3. the 1st of the month: only day 1 is due ────────────────────────────────────────────
  // Thu 1 Oct. Furkan boxes due 4 (spor, kuran, projeler, erken); he ticked spor, kuran -> 2/4.
  // Meryem boxes due 4; she ticked spor, arapca, cicek -> 3/4. Joint item-days due 2 (spor,
  // kuran); both ticked spor only -> 1/2. Ticks on day 2 (tomorrow) are ignored.
  await open(page, "2026-10-01T09:00:00");
  const first = T("2026-10-01");
  const FIRST = mk("2026-10", [
    ["spor", "furkan", [1]], ["kuran", "furkan", [1]], ["projeler", "furkan", [2]],
    ["spor", "meryem", [1]], ["arapca", "meryem", [1]], ["cicek", "meryem", [1]], ["kuran", "meryem", [2]],
  ]);
  await check("habits: on the 1st only day 1 is due (50 / 75 / Birlikte 50, an unticked due item is 0 not null)", async () => {
    const s = await core(page, "monthSummary", "2026-10", FIRST, first);
    const projeler = await core(page, "itemPercent", I("projeler"), "furkan", "2026-10", FIRST, first); // 0/1
    const sporF = await core(page, "itemPercent", I("spor"), "furkan", "2026-10", FIRST, first); // 1/1
    const ok =
      s.people.furkan.due === 4 && s.people.furkan.done === 2 && near(s.people.furkan.pct, 50) &&
      s.people.meryem.due === 4 && s.people.meryem.done === 3 && near(s.people.meryem.pct, 75) &&
      s.birlikte.due === 2 && s.birlikte.done === 1 && near(s.birlikte.pct, 50) &&
      s.jointDays === 0 && s.leader === "meryem" && projeler === 0 && near(sporF, 100) &&
      near(s.perDay[0].furkan, 50) && near(s.perDay[0].meryem, 75) && s.perDay[1].furkan === null &&
      s.people.furkan.longest === 0 && (await core(page, "currentStreak", "furkan", { "2026-10": FIRST }, first)) === 0;
    return { ok, detail: JSON.stringify({ p: s.people, b: s.birlikte, projeler, sporF }) };
  });

  // ── 4. the last day: Sat 31 Oct ───────────────────────────────────────────────────────────
  // Furkan: spor 1-30 (not the 31st), kuran 1-31, projeler 1-31, erken on all 22 weekdays (and a
  // weekend tick on the 31st, ignored). Boxes due = 31+31+31+22 = 115, ticked 30+31+31+22 = 114.
  // Meryem: spor 1-31, kuran 1-31, arapca 1-24, cicek 1-31. Boxes due 124, ticked 31+31+24+31 = 117.
  // Joint item-days 62; both ticked spor 1-30 = 30, kuran 31 -> 61.  jointDays = days 1-30 = 30.
  // Furkan complete 1-30 -> longest 30 and, today (31st) being open, current streak 30.
  // Meryem complete 1-24 -> longest 24; current: the 30th is incomplete -> 0.
  await open(page, "2026-10-31T21:00:00");
  const lastDay = T("2026-10-31");
  const weekdays = range(1, 31).filter((d) => isWeekday(2026, 10, d));
  const LAST = mk("2026-10", [
    ["spor", "furkan", range(1, 30)], ["kuran", "furkan", range(1, 31)], ["projeler", "furkan", range(1, 31)], ["erken", "furkan", [...weekdays, 31]],
    ["spor", "meryem", range(1, 31)], ["kuran", "meryem", range(1, 31)], ["arapca", "meryem", range(1, 24)], ["cicek", "meryem", range(1, 31)],
  ]);
  await check("habits: the last day of the month (31 Oct) counts, with its streaks", async () => {
    const s = await core(page, "monthSummary", "2026-10", LAST, lastDay);
    const cf = await core(page, "currentStreak", "furkan", { "2026-10": LAST }, lastDay);
    const cm = await core(page, "currentStreak", "meryem", { "2026-10": LAST }, lastDay);
    const ok =
      weekdays.length === 22 &&
      s.people.furkan.due === 115 && s.people.furkan.done === 114 && near(s.people.furkan.pct, 114 * 100 / 115) &&
      s.people.meryem.due === 124 && s.people.meryem.done === 117 && near(s.people.meryem.pct, 117 * 100 / 124) &&
      s.birlikte.due === 62 && s.birlikte.done === 61 && near(s.birlikte.pct, 61 * 100 / 62) && s.jointDays === 30 &&
      s.people.furkan.longest === 30 && s.people.meryem.longest === 24 && cf === 30 && cm === 0 &&
      near(s.perDay[30].furkan, 200 / 3) && near(s.perDay[30].meryem, 75) && near(s.items[4].pct, 100) && near(s.items[2].pct, 2400 / 31);
    return { ok, detail: JSON.stringify({ p: s.people, b: s.birlikte, jd: s.jointDays, cf, cm, d31: s.perDay[30] }) };
  });

  // ── 5. Şubat 2027: 28 days, 20 weekdays (Sun 28 Feb) ──────────────────────────────────────
  // Furkan ticks only erken, on all 20 weekdays. Boxes due = 28*3 + 20 = 104, ticked 20.
  // Meryem ticks nothing: 28*4 = 112 due, 0 ticked. Joint item-days 56, none both -> 0.
  await open(page, "2027-02-28T20:00:00");
  const feb = T("2027-02-28");
  const febWeekdays = range(1, 28).filter((d) => isWeekday(2027, 2, d));
  const FEB = mk("2027-02", [["erken", "furkan", febWeekdays]]);
  await check("habits: Şubat 2027 - 28 days, 20 weekdays, percentages over the right denominators", async () => {
    const s = await core(page, "monthSummary", "2027-02", FEB, feb);
    const ok =
      febWeekdays.length === 20 && s.days === 28 && s.perDay.length === 28 &&
      s.people.furkan.due === 104 && s.people.furkan.done === 20 && near(s.people.furkan.pct, 2000 / 104) &&
      s.people.meryem.due === 112 && s.people.meryem.done === 0 && s.people.meryem.pct === 0 &&
      s.birlikte.due === 56 && s.birlikte.pct === 0 && s.leader === "furkan" &&
      s.bestItem && s.bestItem.id === "erken" && near(s.bestItem.pct, 100);
    return { ok, detail: JSON.stringify({ p: s.people, b: s.birlikte, leader: s.leader, best: s.bestItem }) };
  });

  // ── 6. a Saturday and a Sunday as "today" ─────────────────────────────────────────────────
  // Erken çıkış with only the 1st ticked: through Sat 3 Oct the due days are Thu 1 and Fri 2 (the
  // Saturday itself is not due) -> 1/2 = 50; through Sun 4 Oct the same, 50.
  await open(page, "2026-10-03T12:00:00");
  const ERK = mk("2026-10", [["erken", "furkan", [1, 3]]]); // the Saturday tick must be ignored
  await check("habits: with a Saturday or a Sunday as today, Erken çıkış still counts only Thu 1 and Fri 2", async () => {
    const sat = await core(page, "itemPercent", I("erken"), "furkan", "2026-10", ERK, T("2026-10-03"));
    const sun = await core(page, "itemPercent", I("erken"), "furkan", "2026-10", ERK, T("2026-10-04"));
    const dayBefore = await core(page, "itemPercent", I("erken"), "furkan", "2026-10", ERK, T("2026-10-02"));
    return { ok: near(sat, 50) && near(sun, 50) && near(dayBefore, 50), detail: `sat ${sat}, sun ${sun}, fri ${dayBefore}` };
  });

  // ── 7. today before habitsStart ───────────────────────────────────────────────────────────
  await open(page, "2026-09-20T12:00:00");
  await check("habits: before habitsStart nothing is due - every percentage is null, no streak, no leader", async () => {
    const t = T("2026-09-20");
    const oct = await core(page, "monthSummary", "2026-10", { days: { "2026-10-01": { spor: { furkan: true } } } }, t);
    const sep = await core(page, "monthSummary", "2026-09", {}, t);
    const allNull = (s) => s.started === false && s.people.furkan.pct === null && s.people.meryem.pct === null && s.birlikte.pct === null &&
      s.leader === null && s.bestItem === null && s.jointDays === 0 && s.perDay.every((d) => d.furkan === null && d.meryem === null) && s.items.every((i) => i.pct === null);
    const streak = await core(page, "currentStreak", "furkan", {}, t);
    const months = await core(page, "monthsFrom", "2026-10", t);
    return { ok: allNull(oct) && allNull(sep) && streak === 0 && months.length === 0, detail: JSON.stringify({ oct: oct.people, sep: sep.people, streak, months }) };
  });

  // ── 8. the current streak across 31 Oct -> 2 Nov ──────────────────────────────────────────
  // Mon 2 Nov 2026. Furkan complete on Fri 30 Oct (4 boxes), Sat 31 Oct (3), Sun 1 Nov (3), and
  // Mon 2 Nov (4) = 4 days; Thu 29 Oct has nothing, so the run stops there.
  await open(page, "2026-11-02T10:00:00");
  const t2 = T("2026-11-02");
  const all4 = ["spor", "kuran", "projeler", "erken"];
  const all3 = ["spor", "kuran", "projeler"];
  const octS = mk("2026-10", [...all4.map((i) => [i, "furkan", [30]]), ...all3.map((i) => [i, "furkan", [31]])]);
  const novFull = mk("2026-11", [...all3.map((i) => [i, "furkan", [1]]), ...all4.map((i) => [i, "furkan", [2]]),
    ...["spor", "kuran", "arapca", "cicek"].map((i) => [i, "meryem", [2]])]);
  const novOpen = mk("2026-11", [...all3.map((i) => [i, "furkan", [1]])]); // today still open
  const novMissed = mk("2026-11", []); // yesterday (1 Nov) missed
  await check(N_STREAK, async () => {
    const full = await core(page, "currentStreak", "furkan", { "2026-10": octS, "2026-11": novFull }, t2);
    const meryem = await core(page, "currentStreak", "meryem", { "2026-10": octS, "2026-11": novFull }, t2);
    const open_ = await core(page, "currentStreak", "furkan", { "2026-10": octS, "2026-11": novOpen }, t2);
    const missed = await core(page, "currentStreak", "furkan", { "2026-10": octS, "2026-11": novMissed }, t2);
    const noPrev = await core(page, "currentStreak", "furkan", { "2026-11": novFull }, t2);
    // full: 30,31 Oct + 1,2 Nov = 4; Meryem only 2 Nov = 1; today open: 30,31 Oct + 1 Nov = 3 (an
    // unfinished today does not break it); yesterday missed: 0; October data absent: 1 and 2 Nov = 2.
    return { ok: full === 4 && meryem === 1 && open_ === 3 && missed === 0 && noPrev === 2, detail: JSON.stringify({ full, meryem, open_, missed, noPrev }) };
  });

  // ── 9. Firestore helpers against the stub ─────────────────────────────────────────────────
  await open(page, "2026-10-15T12:00:00", {
    habits: { months: { "2026-10": { days: { "2026-10-14": { kuran: { furkan: true } } } }, "2026-11": { days: { "2026-11-01": { spor: { meryem: true } } } } } },
  });

  await check("habits: initHabits keeps the current month's document and holds one habitMonths subscription", async () => {
    const st = await stateOf(page);
    const ls = (await listeners(page)).filter((l) => l.startsWith(MONTHS + "/"));
    return {
      ok: st.month === "2026-10" && st.day === "2026-10-15" && JSON.stringify(st.data) === JSON.stringify({ days: { "2026-10-14": { kuran: { furkan: true } } } }) && JSON.stringify(ls) === JSON.stringify([`${MONTHS}/2026-10`]),
      detail: JSON.stringify({ month: st.month, day: st.day, ls }),
    };
  });

  await check("habits: setHabitTick merges one person's tick into the month document and the open snapshot sees it", async () => {
    await page.eval(async () => {
      await setHabitTick("2026-10", "2026-10-15", "spor", "meryem", true);
      await setHabitTick("2026-10", "2026-10-15", "spor", "furkan", true);
      await setHabitTick("2026-10", "2026-10-15", "spor", "meryem", false);
    });
    const doc = (await page.stubDb())[MONTHS]["2026-10"];
    const want = { days: { "2026-10-14": { kuran: { furkan: true } }, "2026-10-15": { spor: { meryem: false, furkan: true } } } };
    const live = await until(async () => (await stateOf(page)).data.days?.["2026-10-15"]?.spor?.furkan === true);
    return { ok: JSON.stringify(doc) === JSON.stringify(want) && live === true, detail: JSON.stringify(doc) };
  });

  await check("habits: addHabitLog stores the entry with the server's time and keeps atLocal", async () => {
    const entry = { month: "2026-10", day: "2026-10-15", item: "spor", person: "meryem", value: true, by: "meryem", atLocal: 1760000000123 };
    await page.eval((e) => addHabitLog(e), entry);
    const docs = Object.values((await page.stubDb())[LOG] || {});
    const d = docs[0] || {};
    const want = istanbulEpoch(2026, 10, 15, 12, 0);
    const { at, ...rest } = d;
    return {
      ok: docs.length === 1 && JSON.stringify(rest) === JSON.stringify(entry) && at && typeof at.__ts === "number" && Math.abs(at.__ts - want) < 90000,
      detail: JSON.stringify(d),
    };
  });

  await check("habits: addHabitLog made offline leaves at empty (null) and keeps atLocal", async () => {
    await page.eval(() => { window.__STUB_TS_NULL = true; });
    await page.eval(() => addHabitLog({ month: "2026-10", day: "2026-10-15", item: "kuran", person: "furkan", value: false, by: "furkan", atLocal: 1760000001000 }));
    await page.eval(() => { window.__STUB_TS_NULL = false; });
    const docs = Object.values((await page.stubDb())[LOG] || {});
    const off = docs.find((x) => x.item === "kuran") || {};
    return { ok: docs.length === 2 && off.at === null && off.atLocal === 1760000001000 && off.by === "furkan" && off.value === false, detail: JSON.stringify(off) };
  });

  await check("habits: subscribeHabitMonths delivers every month document by its key", async () => {
    const got = await page.eval(() => new Promise((res) => { const u = subscribeHabitMonths((m) => { u(); res(Object.keys(m).sort()); }); }));
    return { ok: JSON.stringify(got) === JSON.stringify(["2026-10", "2026-11"]), detail: JSON.stringify(got) };
  });

  // The log: ids a (10:00) b (21:04, at still null) c (08:30) e (09:00, at null) and d in November.
  // Newest first by at, falling back to atLocal -> b, a, e, c; d belongs to another month.
  const E = (h, m) => istanbulEpoch(2026, 10, 15, h, m);
  const logRow = (id, extra) => ({ id, month: "2026-10", day: "2026-10-15", item: "spor", person: "furkan", value: true, by: "furkan", ...extra });
  await open(page, "2026-10-15T22:00:00", {
    habits: {
      months: {},
      log: [
        logRow("a", { at: { __ts: E(10, 0) }, atLocal: E(10, 0) }),
        logRow("b", { at: null, atLocal: E(21, 4) }),
        logRow("c", { at: { __ts: E(8, 30) }, atLocal: E(8, 30) }),
        logRow("d", { month: "2026-11", at: { __ts: E(23, 0) }, atLocal: E(23, 0) }),
        logRow("e", { at: null, atLocal: E(9, 0) }),
      ],
    },
  });
  await check(N_LOG, async () => {
    const ids = await page.eval(() => new Promise((res) => { const u = subscribeHabitLog("2026-10", (items) => { u(); res(items.map((i) => i.id)); }); }));
    return { ok: JSON.stringify(ids) === JSON.stringify(["b", "a", "e", "c"]), detail: JSON.stringify(ids) };
  });

  // ── 10. the stub itself ───────────────────────────────────────────────────────────────────
  await check("habits: the Firestore stub - merge vs replace, update, add, where, orderBy, limit, get, delete, live snapshots", async () => {
    const r = await page.eval(async () => {
      const c = userCollection("stubprobe");
      const out = {};
      const seen = [];
      const unsub = c.onSnapshot((s) => { seen.push(s.size); });
      await new Promise((x) => setTimeout(x, 30));
      await c.doc("m").set({ a: { b: 1 } });
      await c.doc("m").set({ a: { c: 2 } }, { merge: true });
      out.merged = (await c.doc("m").get()).data();
      await c.doc("m").set({ z: 1 });
      out.replaced = (await c.doc("m").get()).data();
      await c.doc("m").update({ "k.n": 5, z: 2 });
      out.updated = (await c.doc("m").get()).data();
      await c.add({ n: 3 }); await c.add({ n: 1 }); await c.add({ n: 2 });
      out.top2 = (await c.orderBy("n", "desc").limit(2).get()).docs.map((d) => d.data().n).filter((n) => n !== undefined);
      out.where = (await c.where("n", "==", 1).get()).size;
      out.missing = (await c.doc("nope").get()).exists;
      await c.doc("m").delete();
      out.afterDelete = (await c.doc("m").get()).exists;
      await new Promise((x) => setTimeout(x, 30));
      unsub();
      const n = seen.length;
      await c.add({ n: 9 });
      await new Promise((x) => setTimeout(x, 30));
      out.seen = seen.slice(); out.afterUnsub = seen.length === n;
      return out;
    });
    const ok =
      JSON.stringify(r.merged) === JSON.stringify({ a: { b: 1, c: 2 } }) && JSON.stringify(r.replaced) === JSON.stringify({ z: 1 }) &&
      JSON.stringify(r.updated) === JSON.stringify({ z: 2, k: { n: 5 } }) && JSON.stringify(r.top2) === JSON.stringify([3, 2]) &&
      r.where === 1 && r.missing === false && r.afterDelete === false && r.afterUnsub === true && r.seen[0] === 0 && r.seen[r.seen.length - 1] === 3;
    return { ok, detail: JSON.stringify(r) };
  });

  // ── 11. the month follows appNow() ────────────────────────────────────────────────────────
  // The raw clock says 20 Dec 2026; the birthday rehearsal (?onizleme=dogumgunu) moves appNow()
  // to her next birthday, 4 Oct 2027. A month taken from new Date() would still say 2026-12.
  await open(page, "2026-12-20T12:00:00", { query: "?onizleme=dogumgunu" });
  await check(N_APPNOW, async () => {
    const st = await stateOf(page);
    const subs = (await listeners(page)).filter((l) => l.startsWith(MONTHS + "/"));
    // Stage 3 also subscribes the month before (a streak crosses the 1st): 2027-09 beside 2027-10.
    return { ok: st.month === "2027-10" && st.day === "2027-10-04" && JSON.stringify(subs.slice().sort()) === JSON.stringify([`${MONTHS}/2027-09`, `${MONTHS}/2027-10`]), detail: JSON.stringify({ month: st.month, day: st.day, subs }) };
  });

  // ── 12. the day boundary with the app open ────────────────────────────────────────────────
  const NOV = { days: { "2026-11-01": { spor: { furkan: true } } } };
  const OCT = { days: { "2026-10-31": { spor: { meryem: true } } } };
  const record = () => page.eval(() => {
    window.__habitEvents = [];
    document.addEventListener("meryem:habits-day", (e) => window.__habitEvents.push(e.detail));
    return true;
  });
  const events = () => page.eval(() => window.__habitEvents.slice());

  // (a) the minute timer (shortened to 300 ms by the seam)
  await open(page, "2026-10-31T23:59:30", { habits: { months: { "2026-10": OCT, "2026-11": NOV } }, habitsTickMs: 300 });
  await record();
  await sleep(1000);
  const quiet = await events();
  const before = await stateOf(page);
  const lsBefore = (await listeners(page)).filter((l) => l.startsWith(MONTHS + "/"));
  await page.advanceClock(60000); // 23:59:30 -> 00:00:30 on 1 Nov
  const fired = await until(async () => (await events()).length > 0);
  await sleep(1000);
  const evs = await events();
  const after = await stateOf(page);
  const lsAfter = (await listeners(page)).filter((l) => l.startsWith(MONTHS + "/"));

  await check("habits: nothing fires while the day is unchanged", () => ({ ok: quiet.length === 0 && before.month === "2026-10" && before.day === "2026-10-31", detail: JSON.stringify({ quiet, before: before.day }) }));

  await check("habits: midnight with the app open fires meryem:habits-day once with the new day and month", () => ({
    ok: fired && evs.length === 1 && evs[0].day === "2026-11-01" && evs[0].month === "2026-11" && after.day === "2026-11-01" && after.month === "2026-11",
    detail: JSON.stringify({ evs, after: { day: after.day, month: after.month } }),
  }));

  await check("habits: at the month change the subscription moves to the new month (keeping the month before it) and its data replaces the old", () => ({
    ok: JSON.stringify(lsBefore) === JSON.stringify([`${MONTHS}/2026-10`]) && JSON.stringify(lsAfter.slice().sort()) === JSON.stringify([`${MONTHS}/2026-10`, `${MONTHS}/2026-11`]) &&
      JSON.stringify(before.data) === JSON.stringify(OCT) && JSON.stringify(after.data) === JSON.stringify(NOV),
    detail: JSON.stringify({ lsBefore, lsAfter }),
  }));

  await check("habits: no page errors across the roll-over", () => ({ ok: page.errors.length === 0, detail: page.errors.slice(0, 3).join(" | ") }));

  // (b) visibilitychange, with the real 60 s timer (it cannot fire inside the test)
  await open(page, "2026-10-31T23:59:30", { habits: { months: { "2026-10": OCT, "2026-11": NOV } } });
  await record();
  await page.advanceClock(60000);
  await sleep(500);
  const notYet = await events();
  await page.eval(() => document.dispatchEvent(new Event("visibilitychange")));
  const vis = await until(async () => (await events()).length > 0, 2000);
  const evs2 = await events();
  const st2 = await stateOf(page);
  await check("habits: visibilitychange re-reads the clock and catches up at once after midnight", () => ({
    ok: notYet.length === 0 && vis && evs2.length === 1 && evs2[0].month === "2026-11" && st2.month === "2026-11" && JSON.stringify(st2.data) === JSON.stringify(NOV),
    detail: JSON.stringify({ notYet, evs2, month: st2.month }),
  }));

  // (c) a day change inside the month: event fires, the month subscription stays where it is
  await open(page, "2026-10-14T23:59:30", { habits: { months: { "2026-10": OCT } }, habitsTickMs: 300 });
  await record();
  await page.advanceClock(60000);
  const dayFired = await until(async () => (await events()).length > 0);
  const evs3 = await events();
  const ls3 = (await listeners(page)).filter((l) => l.startsWith(MONTHS + "/"));
  await check("habits: a day change inside the month fires the event and keeps the month subscription", () => ({
    ok: dayFired && evs3.length === 1 && evs3[0].day === "2026-10-15" && evs3[0].month === "2026-10" && JSON.stringify(ls3) === JSON.stringify([`${MONTHS}/2026-10`]),
    detail: JSON.stringify({ evs3, ls3 }),
  }));

  // ══ Stage 3: the screens ═══════════════════════════════════════════════════════════════════
  // Fixed clocks again. Calendar facts: 2026-10-15 is a Thursday, 10-17 a Saturday, 10-12 a Monday;
  // 2027-02-01 is a Monday (no blank cells before it), 2026-10-01 a Thursday (3 blank cells).
  const NOW3 = "2026-10-15T12:00:00";
  const slot = (item, person) => `#hb-today .hb-heart[data-item="${item}"][data-person="${person}"]`;
  const titleOf = (p) => p.eval(() => (document.querySelector("#hb-month .hb-nav-title") || {}).textContent || null);

  // ── identity ──────────────────────────────────────────────────────────────────────────────
  await openTakip(page, NOW3, null, { habits: { months: { "2026-10": M1 } } });
  await check(N_ME, async () => {
    const a = await page.eval(() => ({
      who: [...document.querySelectorAll('#hb-top [data-act="choose"]')].map((b) => b.dataset.who),
      bear: !!document.querySelector("#hb-top .hb-choose svg"),
      hearts: document.querySelectorAll("#hb-today .hb-heart").length,
      days: document.querySelectorAll("#hb-month .hb-day").length,
      stored: localStorage.getItem("meryem-habits-me"),
    }));
    await tapIn(page, '#hb-top [data-who="furkan"]');
    const b = await page.eval(() => ({
      stored: localStorage.getItem("meryem-habits-me"),
      line: (document.querySelector("#hb-top .hb-me") || {}).textContent || null,
      chooser: !!document.querySelector("#hb-top .hb-choose"),
      hearts: document.querySelectorAll("#hb-today .hb-heart").length,
    }));
    await openTakip(page, NOW3, null, { keepStorage: true, habits: { months: { "2026-10": M1 } } });
    const c = await page.eval(() => ({ chooser: !!document.querySelector("#hb-top .hb-choose"), line: (document.querySelector("#hb-top .hb-me") || {}).textContent || null }));
    await tapIn(page, '#hb-top [data-act="change"]');
    const d = await page.eval(() => ({ chooser: !!document.querySelector("#hb-top .hb-choose"), cancel: !!document.querySelector('#hb-top [data-act="cancel-choose"]'), hearts: document.querySelectorAll("#hb-today .hb-heart").length }));
    await tapIn(page, '#hb-top [data-who="meryem"]');
    const e = await page.eval(() => ({ stored: localStorage.getItem("meryem-habits-me"), line: (document.querySelector("#hb-top .hb-me") || {}).textContent || null }));
    const ok =
      JSON.stringify(a.who) === JSON.stringify(["meryem", "furkan"]) && a.bear && a.hearts === 0 && a.days === 0 && a.stored === null &&
      b.stored === "furkan" && /Furkan/.test(b.line) && !b.chooser && b.hearts > 0 &&
      !c.chooser && /Furkan/.test(c.line) &&
      d.chooser && d.cancel && d.hearts === 0 &&
      e.stored === "meryem" && /Meryem/.test(e.line);
    return { ok, detail: JSON.stringify({ a, b, c, d, e }) };
  });

  // ── own boxes tappable, partner's locked ──────────────────────────────────────────────────
  await openTakip(page, NOW3, "meryem", { habits: { months: {} } });
  await check(N_LOCK, async () => {
    const info = await page.eval(() => {
      const q = (i, p) => document.querySelector(`#hb-today .hb-heart[data-item="${i}"][data-person="${p}"]`);
      const own = q("spor", "meryem");
      const other = q("spor", "furkan");
      const pro = q("projeler", "furkan");
      return {
        own: own.getAttribute("aria-disabled"), ownLock: !!own.querySelector(".hb-lock"),
        other: other.getAttribute("aria-disabled"), otherLock: !!other.querySelector(".hb-lock"),
        pro: pro.getAttribute("aria-disabled"), arapca: q("arapca", "meryem").getAttribute("aria-disabled"),
      };
    });
    const before = JSON.stringify(await page.stubDb());
    await tapIn(page, slot("spor", "furkan"));
    await tapIn(page, slot("projeler", "furkan"));
    await sleep(300);
    const after = JSON.stringify(await page.stubDb());
    const onAfter = await page.eval(() => document.querySelectorAll("#hb-today .hb-heart.is-on").length);
    const ok = info.own === null && !info.ownLock && info.other === "true" && info.otherLock && info.pro === "true" && info.arapca === null && before === after && onAfter === 0;
    return { ok, detail: JSON.stringify({ info, unchanged: before === after, onAfter, db: after.slice(0, 200) }) };
  });

  // ── tick and untick: the month document, the log, the snapshot ────────────────────────────
  await check(N_TICK, async () => {
    await tapIn(page, slot("spor", "meryem"));
    const on = await until(() => page.eval((s) => { const b = document.querySelector(s); return b.classList.contains("is-on") && b.getAttribute("aria-pressed") === "true"; }, slot("spor", "meryem")));
    let db = await page.stubDb();
    const doc = (db[MONTHS] || {})["2026-10"];
    let log = Object.values(db[LOG] || {});
    const e1 = log[0] || {};
    await tapIn(page, slot("spor", "meryem"));
    const off = await until(() => page.eval((s) => !document.querySelector(s).classList.contains("is-on"), slot("spor", "meryem")));
    db = await page.stubDb();
    const doc2 = (db[MONTHS] || {})["2026-10"];
    log = Object.values(db[LOG] || {});
    const values = log.map((x) => x.value).sort();
    const local = Date.parse(e1.atLocal);
    const ok =
      on && off && doc && doc.days["2026-10-15"].spor.meryem === true && !("furkan" in doc.days["2026-10-15"].spor) &&
      e1.by === "meryem" && e1.person === "meryem" && e1.item === "spor" && e1.value === true && e1.month === "2026-10" && e1.day === "2026-10-15" &&
      typeof e1.atLocal === "string" && Math.abs(local - istanbulEpoch(2026, 10, 15, 12, 0)) < 120000 &&
      doc2.days["2026-10-15"].spor.meryem === false && log.length === 2 && JSON.stringify(values) === JSON.stringify([false, true]) && log.every((x) => x.by === "meryem");
    return { ok, detail: JSON.stringify({ on, off, doc, doc2, log }).slice(0, 500) };
  });

  // ── the joint heart ───────────────────────────────────────────────────────────────────────
  // 12: spor+kuran both -> a joint day. 13: spor both, kuran only Furkan -> not. 14: spor only
  // Meryem. 15: spor only Furkan (not both), kuran both. Meryem ticking her spor on the 15th
  // makes the 15th joint as well.
  const JH = { days: {
    "2026-10-12": { spor: { furkan: true, meryem: true }, kuran: { furkan: true, meryem: true } },
    "2026-10-13": { spor: { furkan: true, meryem: true }, kuran: { furkan: true } },
    "2026-10-14": { spor: { meryem: true } },
    "2026-10-15": { spor: { furkan: true }, kuran: { furkan: true, meryem: true } },
  } };
  await openTakip(page, NOW3, "meryem", { habits: { months: { "2026-10": JH } } });
  await check(N_HEART, async () => {
    const read = () => page.eval(() => ({
      spor: document.querySelector('#hb-today .hb-row[data-item="spor"] .hb-joint').classList.contains("is-on"),
      kuran: document.querySelector('#hb-today .hb-row[data-item="kuran"] .hb-joint').classList.contains("is-on"),
      joint: [...document.querySelectorAll("#hb-month .hb-day.is-joint")].map((d) => d.dataset.day),
      hearts: document.querySelectorAll("#hb-month .hb-day-heart").length,
    }));
    const a = await read();
    await tapIn(page, slot("spor", "meryem"));
    await until(() => page.eval(() => document.querySelector('#hb-today .hb-row[data-item="spor"] .hb-joint').classList.contains("is-on")));
    const b = await read();
    const ok =
      a.spor === false && a.kuran === true && JSON.stringify(a.joint) === JSON.stringify(["2026-10-12"]) && a.hearts === 1 &&
      b.spor === true && b.kuran === true && JSON.stringify(b.joint) === JSON.stringify(["2026-10-12", "2026-10-15"]) && b.hearts === 2;
    return { ok, detail: JSON.stringify({ a, b }) };
  });

  // ── Erken çıkış on a weekend ──────────────────────────────────────────────────────────────
  await openTakip(page, "2026-10-17T12:00:00", "furkan", { habits: { months: {} } });
  await check(N_WEEKEND, async () => {
    const itemsOf = (root) => page.eval((r) => [...new Set([...document.querySelectorAll(`${r} .hb-heart`)].map((b) => b.dataset.item))], root);
    const sat = await itemsOf("#hb-today");
    await tapIn(page, '#hb-month .hb-day[data-day="2026-10-10"]');
    const satSheet = await itemsOf("#habits-day-modal");
    await page.eval(() => closeModal("habits-day-modal"));
    await sleep(200);
    await tapIn(page, '#hb-month .hb-day[data-day="2026-10-09"]');
    const friSheet = await itemsOf("#habits-day-modal");
    await page.eval(() => closeModal("habits-day-modal"));
    const ok =
      JSON.stringify(sat) === JSON.stringify(["spor", "kuran", "arapca", "cicek", "projeler"]) &&
      !satSheet.includes("erken") && satSheet.length === 5 && friSheet.includes("erken") && friSheet.length === 6;
    return { ok, detail: JSON.stringify({ sat, satSheet, friSheet }) };
  });

  // ── the navigator ─────────────────────────────────────────────────────────────────────────
  await openTakip(page, "2027-02-10T12:00:00", "meryem", { habits: { months: {} } });
  await check(N_NAV, async () => {
    const nextOff = () => page.eval(() => document.querySelector('#hb-month [data-act="next"]').disabled);
    const prevOff = () => page.eval(() => document.querySelector('#hb-month [data-act="prev"]').disabled);
    const first = { title: await titleOf(page), nextOff: await nextOff(), cells: await page.eval(() => ({ blank: document.querySelectorAll("#hb-month .hb-day.is-blank").length, days: document.querySelectorAll("#hb-month .hb-day:not(.is-blank)").length })) };
    await page.tap('#hb-month [data-act="next"]'); // disabled: nothing happens
    await sleep(150);
    const stay = await titleOf(page);
    const titles = [];
    const months = [];
    for (let i = 0; i < 8; i++) {
      titles.push(await titleOf(page));
      months.push(await page.eval(() => document.querySelector("#hb-month .hb-nav").dataset.month));
      if (await prevOff()) break;
      await tapIn(page, '#hb-month [data-act="prev"]');
    }
    const last = { prevOff: await prevOff(), nextOff: await nextOff(), cells: await page.eval(() => ({ blank: document.querySelectorAll("#hb-month .hb-day.is-blank").length, days: document.querySelectorAll("#hb-month .hb-day:not(.is-blank)").length })) };
    const ok =
      first.title === "Şubat 2027" && first.nextOff === true && stay === "Şubat 2027" && first.cells.blank === 0 && first.cells.days === 28 &&
      JSON.stringify(titles) === JSON.stringify(["Şubat 2027", "Ocak 2027", "Aralık 2026", "Kasım 2026", "Ekim 2026"]) &&
      JSON.stringify(months) === JSON.stringify(["2027-02", "2027-01", "2026-12", "2026-11", "2026-10"]) &&
      last.prevOff === true && last.nextOff === false && last.cells.blank === 3 && last.cells.days === 31;
    return { ok, detail: JSON.stringify({ first, stay, titles, last }) };
  });

  // ── future days, today, the sheet ─────────────────────────────────────────────────────────
  await openTakip(page, NOW3, "meryem", { habits: { months: {} } });
  await check(N_FUTURE_DAY, async () => {
    const info = await page.eval(() => {
      const d = (k) => document.querySelector(`#hb-month .hb-day[data-day="${k}"]`);
      const future = [];
      for (let n = 16; n <= 31; n++) { const el = d("2026-10-" + n); future.push(el.tagName + ":" + el.classList.contains("is-future") + ":" + el.getAttribute("aria-disabled") + ":" + el.querySelectorAll(".hb-ring").length); }
      return { future, past: d("2026-10-01").tagName, today: d("2026-10-15").tagName, todayMark: d("2026-10-15").classList.contains("is-today"), marks: document.querySelectorAll("#hb-month .hb-day.is-today").length };
    });
    await tapIn(page, '#hb-month .hb-day[data-day="2026-10-16"]');
    const closed = await page.eval(() => !document.getElementById("habits-day-modal").classList.contains("open"));
    await tapIn(page, '#hb-month .hb-day[data-day="2026-10-15"]');
    const opened = await page.eval(() => ({ open: document.getElementById("habits-day-modal").classList.contains("open"), title: document.getElementById("habits-day-title").textContent }));
    await page.eval(() => closeModal("habits-day-modal"));
    const ok =
      info.future.every((f) => f === "DIV:true:true:0") && info.past === "BUTTON" && info.today === "BUTTON" && info.todayMark && info.marks === 1 &&
      closed && opened.open && opened.title === "15 Ekim Perşembe";
    return { ok, detail: JSON.stringify({ info, closed, opened }) };
  });

  // ── the day sheet of a past day ───────────────────────────────────────────────────────────
  await openTakip(page, NOW3, "meryem", { habits: { months: {} } });
  await check(N_SHEET, async () => {
    await tapIn(page, '#hb-month .hb-day[data-day="2026-10-12"]');
    const head = await page.eval(() => ({
      title: document.getElementById("habits-day-title").textContent,
      groups: [...document.querySelectorAll("#habits-day-modal .hb-group-title")].map((g) => g.textContent),
      rows: [...document.querySelectorAll("#habits-day-modal .hb-row")].map((r) => r.dataset.item),
      lockedPartner: document.querySelector('#habits-day-modal [data-item="projeler"][data-person="furkan"]').getAttribute("aria-disabled"),
    }));
    const before = JSON.stringify(await page.stubDb());
    await tapIn(page, '#habits-day-modal [data-item="projeler"][data-person="furkan"]');
    await sleep(200);
    const untouched = before === JSON.stringify(await page.stubDb());
    await tapIn(page, '#habits-day-modal [data-item="arapca"][data-person="meryem"]');
    const on = await until(() => page.eval(() => document.querySelector('#habits-day-modal [data-item="arapca"][data-person="meryem"]').classList.contains("is-on")));
    const db = await page.stubDb();
    const doc = (db[MONTHS] || {})["2026-10"];
    const log = Object.values(db[LOG] || {});
    const cell = await page.eval(() => document.querySelector('#hb-month .hb-day[data-day="2026-10-12"]').dataset.pm);
    await page.eval(() => closeModal("habits-day-modal"));
    const ok =
      head.title === "12 Ekim Pazartesi" && JSON.stringify(head.groups) === JSON.stringify(["Birlikte", "Meryem", "Furkan"]) &&
      JSON.stringify(head.rows) === JSON.stringify(["spor", "kuran", "arapca", "cicek", "projeler", "erken"]) && head.lockedPartner === "true" && untouched &&
      on && doc.days["2026-10-12"].arapca.meryem === true && !doc.days["2026-10-15"] && log.length === 1 && log[0].day === "2026-10-12" && log[0].month === "2026-10" && log[0].by === "meryem" &&
      cell === "25";
    return { ok, detail: JSON.stringify({ head, untouched, on, doc, log, cell }).slice(0, 600) };
  });

  // ── a past month ──────────────────────────────────────────────────────────────────────────
  await openTakip(page, "2026-11-10T12:00:00", "meryem", { habits: { months: {} } });
  await check(N_PASTMONTH, async () => {
    await tapIn(page, '#hb-month [data-act="prev"]');
    const title = await titleOf(page);
    await tapIn(page, '#hb-month .hb-day[data-day="2026-10-20"]');
    await tapIn(page, '#habits-day-modal [data-item="spor"][data-person="meryem"]');
    await until(() => page.eval(() => document.querySelector('#habits-day-modal [data-item="spor"][data-person="meryem"]').classList.contains("is-on")));
    const db = await page.stubDb();
    const octDoc = (db[MONTHS] || {})["2026-10"];
    const novDoc = (db[MONTHS] || {})["2026-11"];
    const log = Object.values(db[LOG] || {});
    await page.eval(() => closeModal("habits-day-modal"));
    const ok = title === "Ekim 2026" && octDoc && octDoc.days["2026-10-20"].spor.meryem === true && (!novDoc || !novDoc.days) && log.length === 1 && log[0].month === "2026-10" && log[0].day === "2026-10-20";
    return { ok, detail: JSON.stringify({ title, octDoc, novDoc, log }).slice(0, 400) };
  });

  // ── switching months leaks no listener ────────────────────────────────────────────────────
  await openTakip(page, "2027-01-10T12:00:00", "meryem", { habits: { months: {} } });
  await check(N_LEAK, async () => {
    const subs = async () => (await listeners(page)).filter((l) => l.startsWith(MONTHS + "/")).sort();
    const base = await subs();
    let max = base.length;
    const seen = [];
    for (let round = 0; round < 3; round++) {
      for (let i = 0; i < 3; i++) { await tapIn(page, '#hb-month [data-act="prev"]'); const s = await subs(); max = Math.max(max, s.length); seen.push(s.length); }
      for (let i = 0; i < 3; i++) { await tapIn(page, '#hb-month [data-act="next"]'); const s = await subs(); max = Math.max(max, s.length); seen.push(s.length); }
    }
    const end = await subs();
    // Stage 4: one more listener over the whole habitMonths collection ("Aydan aya") and one log
    // listener that follows the viewed month - each exactly once, however often the month changes.
    const extra = async () => { const all = await listeners(page); return { coll: all.filter((l) => l === MONTHS).length, log: all.filter((l) => l.startsWith(LOG)) }; };
    const ex0 = await extra();
    for (let i = 0; i < 3; i++) await tapIn(page, '#hb-month [data-act="prev"]');
    const exPrev = await extra();
    for (let i = 0; i < 3; i++) await tapIn(page, '#hb-month [data-act="next"]');
    const exEnd = await extra();
    const logOk = ex0.coll === 1 && exPrev.coll === 1 && exEnd.coll === 1 && ex0.log.length === 1 && exPrev.log.length === 1 && exEnd.log.length === 1 &&
      ex0.log[0] === `${LOG}?month==2027-01` && exPrev.log[0] === `${LOG}?month==2026-10` && exEnd.log[0] === `${LOG}?month==2027-01`;
    const ok = JSON.stringify(base) === JSON.stringify([`${MONTHS}/2026-12`, `${MONTHS}/2027-01`]) && JSON.stringify(end) === JSON.stringify(base) && max <= 4 && logOk;
    return { ok, detail: JSON.stringify({ base, end, max, seen: seen.join(","), ex0, exPrev, exEnd }) };
  });

  // ── the previous month is subscribed (a streak crosses the 1st), without any card ─────────
  await openTakip(page, "2026-11-02T10:00:00", "furkan", { habits: { months: { "2026-10": octS, "2026-11": novFull } } });
  await check(N_PREVSUB, async () => {
    await until(() => page.eval(() => !!window.habitsCore.state().monthsData["2026-10"]));
    const st = await stateOf(page);
    const subs = (await listeners(page)).filter((l) => l.startsWith(MONTHS + "/")).sort();
    const streak = await page.eval(() => window.habitsCore.currentStreak("furkan", window.habitsCore.state().monthsData, new Date(2026, 10, 2)));
    const ok = Object.keys(st.monthsData).sort().join() === "2026-10,2026-11" && JSON.stringify(subs) === JSON.stringify([`${MONTHS}/2026-10`, `${MONTHS}/2026-11`]) && streak === 4;
    return { ok, detail: JSON.stringify({ months: Object.keys(st.monthsData), subs, streak }) };
  });

  // ── before the start, and the rings ───────────────────────────────────────────────────────
  await openTakip(page, "2026-09-20T10:00:00", "meryem", { habits: { months: {} } });
  await check(N_SOON, async () => {
    const info = await page.eval(() => ({ text: document.getElementById("hb-month").textContent, hearts: document.querySelectorAll("#habits-root .hb-heart").length, days: document.querySelectorAll("#habits-root .hb-day").length, today: document.getElementById("hb-today").children.length }));
    return { ok: /1 Ekim'de başlıyoruz/.test(info.text) && info.hearts === 0 && info.days === 0 && info.today === 0, detail: JSON.stringify(info) };
  });

  await openTakip(page, NOW3, "meryem", { habits: { months: { "2026-10": M1 } } });
  await check(N_RINGS, async () => {
    const info = await page.eval(() => {
      const d = (k) => document.querySelector(`#hb-month .hb-day[data-day="${k}"]`);
      const fill = (k, p) => { const c = d(k).querySelector(`.hb-p-${p} .hb-ring-fill`); return c ? parseFloat(c.getAttribute("stroke-dasharray")) : null; };
      return {
        d6: [d("2026-10-06").dataset.pm, d("2026-10-06").dataset.pf, fill("2026-10-06", "meryem"), fill("2026-10-06", "furkan")],
        d11: [d("2026-10-11").dataset.pm, d("2026-10-11").dataset.pf],
        d15: [d("2026-10-15").dataset.pm, d("2026-10-15").dataset.pf],
        joint: [...document.querySelectorAll("#hb-month .hb-day.is-joint")].map((x) => x.dataset.day),
      };
    });
    const len = 2 * Math.PI * 7.5;
    const wantJoint = range(1, 10).map((n) => `2026-10-${pad(n)}`);
    const ok =
      info.d6[0] === "75" && info.d6[1] === "75" && Math.abs(info.d6[2] - 0.75 * len) < 0.05 && Math.abs(info.d6[3] - 0.75 * len) < 0.05 &&
      info.d11[0] === "75" && info.d11[1] === "33" && info.d15[0] === "25" && info.d15[1] === "25" && JSON.stringify(info.joint) === JSON.stringify(wantJoint);
    return { ok, detail: JSON.stringify(info) };
  });

  // ── contrast of the words on their grounds ────────────────────────────────────────────────
  await check(N_CONTRAST, async () => {
    const got = await page.eval(() => {
      const pick = (sel) => document.querySelector(sel);
      const sels = {
        me: "#hb-top .hb-me", title: "#hb-today .hb-title", date: "#hb-today .hb-today-date", hint: "#hb-today .hb-hint",
        rowTogether: '#hb-today .hb-row[data-item="spor"] .hb-row-label', nameTogether: '#hb-today .hb-row[data-item="spor"] .hb-box-name',
        rowMeryem: '#hb-today .hb-row[data-item="arapca"] .hb-row-label', nameMeryem: '#hb-today .hb-row[data-item="arapca"] .hb-box-name',
        rowFurkan: '#hb-today .hb-row[data-item="projeler"] .hb-row-label', nameFurkan: '#hb-today .hb-row[data-item="projeler"] .hb-box-name',
        navTitle: "#hb-month .hb-nav-title", dow: "#hb-month .hb-dow", dayN: '#hb-month .hb-day[data-day="2026-10-06"] .hb-day-n',
        todayN: '#hb-month .hb-day.is-today .hb-day-n', futureN: '#hb-month .hb-day.is-future .hb-day-n', legend: "#hb-month .hb-leg",
      };
      const out = {};
      for (const k in sels) out[k] = +window.__app.readable(pick(sels[k])).toFixed(2);
      return out;
    });
    const low = Object.entries(got).filter(([, v]) => v < 4.5);
    return { ok: low.length === 0, detail: low.length ? `below 4.5: ${JSON.stringify(low)}` : `min ${Math.min(...Object.values(got))}` };
  });

  // ── the day rolls over with the tab open ──────────────────────────────────────────────────
  const panelDays = (p) => p.eval(() => [...new Set([...document.querySelectorAll("#hb-today .hb-heart")].map((b) => b.dataset.day))]);
  const panelDate = (p) => p.eval(() => (document.querySelector("#hb-today .hb-today-date") || {}).textContent || null);
  await openTakip(page, "2026-10-31T23:59:30", "furkan", { habits: { months: {} }, habitsTickMs: 300 });
  await check(N_ROLL, async () => {
    const before = { days: await panelDays(page), date: await panelDate(page), title: await titleOf(page), items: (await page.eval(() => document.querySelectorAll("#hb-today .hb-row").length)) };
    await page.advanceClock(60000);
    await until(async () => (await panelDate(page)) !== before.date);
    await sleep(300);
    const after = { days: await panelDays(page), date: await panelDate(page), title: await titleOf(page), today: await page.eval(() => (document.querySelector("#hb-month .hb-day.is-today") || {}).dataset.day), cells: await page.eval(() => document.querySelectorAll("#hb-month .hb-day:not(.is-blank)").length) };
    const ok =
      JSON.stringify(before.days) === JSON.stringify(["2026-10-31"]) && /31 Ekim/.test(before.date) && before.title === "Ekim 2026" && before.items === 5 &&
      JSON.stringify(after.days) === JSON.stringify(["2026-11-01"]) && /1 Kasım/.test(after.date) && after.title === "Kasım 2026" && after.today === "2026-11-01" && after.cells === 30;
    return { ok, detail: JSON.stringify({ before, after }) };
  });

  await openTakip(page, "2026-10-14T23:59:30", "meryem", { habits: { months: {} }, habitsTickMs: 300 });
  await check("habits: a day change inside the month moves today's panel and the outlined calendar day", async () => {
    const before = { days: await panelDays(page), today: await page.eval(() => document.querySelector("#hb-month .hb-day.is-today").dataset.day) };
    await page.advanceClock(60000);
    await until(async () => JSON.stringify(await panelDays(page)) !== JSON.stringify(before.days));
    await sleep(200);
    const after = { days: await panelDays(page), today: await page.eval(() => document.querySelector("#hb-month .hb-day.is-today").dataset.day), title: await titleOf(page) };
    return { ok: before.days[0] === "2026-10-14" && before.today === "2026-10-14" && after.days[0] === "2026-10-15" && after.today === "2026-10-15" && after.title === "Ekim 2026", detail: JSON.stringify({ before, after }) };
  });

  // ══ Stage 4: cards, charts, the report card and the log ═════════════════════════════════════
  const lab = (p) => (p === null ? "—" : "%" + Math.round(p)); // the test's own copy of the display rounding
  const tilesOf = (p) => p.eval(() => {
    const o = {};
    document.querySelectorAll("#hb-stats .hb-stat").forEach((t) => { o[t.dataset.kind] = { num: t.querySelector(".hb-stat-num").textContent, pct: t.dataset.pct }; });
    return o;
  });
  const textOf = (p, sel) => p.eval((s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, " ").trim() : null; }, sel);
  const goPrev = (p) => tapIn(p, '#hb-month [data-act="prev"]');

  // ── the three cards ───────────────────────────────────────────────────────────────────────
  await check(N_CARDS, async () => {
    const cases = [
      { now: "2026-10-15T12:00:00", day: "2026-10-15", data: { "2026-10": M1 }, month: "2026-10", back: 0 },
      { now: "2026-11-20T12:00:00", day: "2026-11-20", data: { "2026-10": M1 }, month: "2026-10", back: 1 },
      { now: "2027-02-10T12:00:00", day: "2027-02-10", data: { "2027-02": FEB }, month: "2027-02", back: 0 },
    ];
    const seen = [];
    let ok = true;
    for (const k of cases) {
      await openTakip(page, k.now, "meryem", { habits: { months: k.data } });
      for (let i = 0; i < k.back; i++) await goPrev(page);
      const s = await core(page, "monthSummary", k.month, k.data[k.month], T(k.day));
      const t = await tilesOf(page);
      const want = { meryem: s.people.meryem.pct, furkan: s.people.furkan.pct, together: s.birlikte.pct };
      for (const who of ["meryem", "furkan", "together"]) {
        if (!t[who] || t[who].num !== lab(want[who]) || t[who].pct !== String(Math.round(want[who]))) ok = false;
      }
      seen.push([k.month, t.meryem && t.meryem.num, t.furkan && t.furkan.num, t.together && t.together.num]);
    }
    // by hand, 15 Oct: Meryem 42/60 = 70, Furkan 36/56 = 64.29, Birlikte 25/30 = 83.33
    // (a Birlikte read from a person's own percentage would show %70). Şubat 2027 on the 10th: Furkan has 3 boxes
    // on each of 10 days plus Erken çıkış on the 8 weekdays = 38 due, 8 ticked = 21.05; Meryem 0/40; Birlikte 0/20.
    const hand = JSON.stringify(seen[0]) === JSON.stringify(["2026-10", "%70", "%64", "%83"]) && JSON.stringify(seen[2]) === JSON.stringify(["2027-02", "%0", "%21", "%0"]);
    return { ok: ok && hand, detail: JSON.stringify(seen) };
  });

  // ── the lead line ─────────────────────────────────────────────────────────────────────────
  await check(N_LEAD, async () => {
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: { "2026-10": M1 } } });
    const lead = { text: await textOf(page, "#hb-stats .hb-lead"), who: await page.eval(() => document.querySelector("#hb-stats .hb-lead").dataset.lead) };
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: {} } });
    const tie = { text: await textOf(page, "#hb-stats .hb-lead"), who: await page.eval(() => document.querySelector("#hb-stats .hb-lead").dataset.lead) };
    const synth = async (s) => core(page, "leadLine", s);
    const people = (m, f) => ({ meryem: { pct: m }, furkan: { pct: f } });
    const nothing = await synth({ started: false, leader: null, people: people(null, null) });
    const noLeader = await synth({ started: true, leader: null, people: people(50, 50) });
    const roundedTie = await synth({ started: true, leader: "meryem", people: people(70.2, 69.8) });
    const furkanLead = await synth({ started: true, leader: "furkan", people: people(40, 52.5) });
    // by hand: 70 - 64.29 = 5.71 -> +6 points to Meryem; nothing ticked at all -> an exact tie
    const ok =
      lead.text === "Bu ay önde: Meryem (+6 puan)" && lead.who === "meryem" &&
      tie.text === "Başa baş 💞" && tie.who === "tie" &&
      nothing === "" && noLeader === "" && roundedTie === "Başa baş 💞" && furkanLead === "Bu ay önde: Furkan (+13 puan)";
    return { ok, detail: JSON.stringify({ lead, tie, nothing, noLeader, roundedTie, furkanLead }) };
  });

  // ── the streak card ───────────────────────────────────────────────────────────────────────
  await check(N_STREAKCARD, async () => {
    await openTakip(page, "2026-11-02T10:00:00", "furkan", { habits: { months: { "2026-10": octS, "2026-11": novFull } } });
    await until(() => page.eval(() => !!window.habitsCore.state().monthsData["2026-10"]));
    await page.eval(() => window.habitsCore.render());
    const read = () => page.eval(() => [...document.querySelectorAll("#hb-stats .hb-streak")].map((e) => [e.dataset.person, e.dataset.kind, +e.dataset.n, e.textContent.replace(/\s+/g, " ").trim()]));
    const now = await read();
    await goPrev(page);
    const past = await read();
    // 2 Nov: Furkan 30,31 Oct + 1,2 Nov = 4, Meryem only 2 Nov = 1 (see the streak check above).
    // October alone: Furkan complete on 30 and 31 -> longest 2; Meryem never complete -> 0.
    const ok =
      JSON.stringify(now) === JSON.stringify([["meryem", "current", 1, "🔥 1 gün seri"], ["furkan", "current", 4, "🔥 4 gün seri"]]) &&
      JSON.stringify(past) === JSON.stringify([["meryem", "longest", 0, "🔥 0 gün en uzun seri"], ["furkan", "longest", 2, "🔥 2 gün en uzun seri"]]);
    return { ok, detail: JSON.stringify({ now, past }) };
  });

  // ── the daily chart ───────────────────────────────────────────────────────────────────────
  await check(N_DAILY, async () => {
    const read = () => page.eval(() => {
      const svg = document.querySelector("#hb-stats .hb-daily-svg");
      return {
        role: svg.getAttribute("role"), aria: svg.getAttribute("aria-label"), top: +svg.dataset.top, h: +svg.dataset.h,
        grid: svg.querySelectorAll("line.hb-grid").length,
        pts: [...svg.querySelectorAll(".hb-pt")].map((e) => ({ p: e.dataset.person, d: e.dataset.day, pct: +e.dataset.pct, y: +e.dataset.y })),
      };
    });
    let ok = true;
    const notes = [];
    for (const k of [{ now: "2026-10-15T12:00:00", day: "2026-10-15", back: 0, n: 15 }, { now: "2026-11-20T12:00:00", day: "2026-11-20", back: 1, n: 31 }]) {
      await openTakip(page, k.now, "meryem", { habits: { months: { "2026-10": M1 } } });
      for (let i = 0; i < k.back; i++) await goPrev(page);
      const s = await core(page, "monthSummary", "2026-10", M1, T(k.day));
      const c = await read();
      for (const p of ["meryem", "furkan"]) {
        const mine = c.pts.filter((x) => x.p === p);
        const due = s.perDay.filter((r) => r[p] !== null);
        const same = mine.length === due.length && mine.length === k.n && mine.every((x, i) => x.d === due[i].key && Math.abs(x.pct - due[i][p]) < 0.006 && Math.abs(x.y - (c.top + (100 - due[i][p]) * c.h / 100)) < 0.06);
        const after = mine.filter((x) => x.d > k.day).length;
        if (!same || after !== 0) ok = false;
        notes.push([k.day, p, mine.length, after]);
      }
      if (c.role !== "img" || c.grid !== 3 || !/Meryem %/.test(c.aria) || !/Furkan %/.test(c.aria)) ok = false;
      if (k.back === 0) {
        // by hand (see the monthSummary check): day 6 -> 75/75, day 11 -> Furkan 33.33 / Meryem 75, day 15 -> 25/25
        const at = (p, d) => c.pts.find((x) => x.p === p && x.d === "2026-10-" + d).pct;
        if (Math.abs(at("furkan", "06") - 75) > 0.01 || Math.abs(at("meryem", "11") - 75) > 0.01 || Math.abs(at("furkan", "11") - 100 / 3) > 0.01 || Math.abs(at("meryem", "15") - 25) > 0.01) ok = false;
        if (!/%70/.test(c.aria) || !/%64/.test(c.aria)) ok = false;
      }
    }
    return { ok, detail: JSON.stringify(notes) };
  });

  // ── the per-item bars ─────────────────────────────────────────────────────────────────────
  await check(N_BARS, async () => {
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: { "2026-10": M1 } } });
    const s = await core(page, "monthSummary", "2026-10", M1, T("2026-10-15"));
    const read = () => page.eval(() => [...document.querySelectorAll("#hb-stats .hb-bar-row")].map((r) => [r.dataset.item, r.dataset.person, r.querySelector(".hb-bar-val").textContent, r.querySelector(".hb-bar-fill").style.width]));
    const rows = await read();
    const want = [];
    for (const it of s.items) for (const p of ["meryem", "furkan"]) if (it.owners.includes(p)) want.push([it.id, p, lab(it[p])]);
    const same = rows.length === want.length && rows.every((r, i) => r[0] === want[i][0] && r[1] === want[i][1] && r[2] === want[i][2]);
    // by hand (15 Oct): spor 80 / 73, kuran 100 / 100, arapca 80, cicek 20, projeler 33, erken 45
    const hand = JSON.stringify(rows.map((r) => r[2])) === JSON.stringify(["%80", "%73", "%100", "%100", "%80", "%20", "%33", "%45"]);
    // nothing due: Projeleri geliştirme starting after today shows a dash and an empty bar
    await page.eval(() => { CONFIG.habits.find((h) => h.id === "projeler").since = "2026-10-16"; window.habitsCore.render(); });
    const dash = (await read()).find((r) => r[0] === "projeler");
    const ok = same && hand && dash && dash[2] === "—" && /^0(%|px)?$/.test(dash[3]);
    return { ok: !!ok, detail: JSON.stringify({ rows: rows.map((r) => r.slice(0, 3).join(":")), dash }) };
  });

  // ── month over month ──────────────────────────────────────────────────────────────────────
  await check(N_MOM, async () => {
    await openTakip(page, "2027-01-10T12:00:00", "meryem", { habits: { months: MOM_MONTHS } });
    await until(() => page.eval(() => document.querySelectorAll("#hb-mom .hb-mbar").length >= 12));
    const read = () => page.eval(() => ({
      bars: [...document.querySelectorAll("#hb-mom .hb-mbar")].map((b) => [b.dataset.month, b.dataset.person, +b.dataset.pct]),
      vals: [...document.querySelectorAll("#hb-mom .hb-mval")].map((t) => [t.dataset.month, t.dataset.person, t.textContent]),
      labels: [...document.querySelectorAll("#hb-mom .hb-mlabel")].map((t) => t.textContent),
      role: document.querySelector("#hb-mom .hb-mom-svg").getAttribute("role"), aria: document.querySelector("#hb-mom .hb-mom-svg").getAttribute("aria-label"),
      scroll: document.querySelector("#hb-mom .hb-mom-scroll").classList.contains("is-scroll"),
    }));
    const got = await read();
    const months = ["2026-10", "2026-11", "2026-12", "2027-01"];
    const want = [];
    for (const mk of months) {
      const s = await core(page, "monthSummary", mk, MOM_MONTHS[mk], T("2027-01-10"));
      want.push([mk, "meryem", Math.round(s.people.meryem.pct)], [mk, "furkan", Math.round(s.people.furkan.pct)], [mk, "together", Math.round(s.birlikte.pct)]);
    }
    const same = JSON.stringify(got.bars) === JSON.stringify(want) && JSON.stringify(got.vals.map((v) => [v[0], v[1], +v[2]])) === JSON.stringify(want);
    // by hand: October is 70 / 64 / 83 (the 15 Oct figures, re-read on the 10th of January with every day due: 44/124, 39/115, ...)
    const labels = JSON.stringify(got.labels) === JSON.stringify(["Eki", "Kas", "Ara", "Oca"]);
    // eight months (Oct - May): a scroll strip that opens at the newest month
    await openTakip(page, "2027-05-10T12:00:00", "meryem", { habits: { months: MOM_MONTHS } });
    await until(() => page.eval(() => document.querySelectorAll("#hb-mom .hb-mbar").length >= 12));
    const strip = await page.eval(() => { const e = document.querySelector("#hb-mom .hb-mom-scroll"); return { scroll: e.classList.contains("is-scroll"), months: +e.dataset.months, over: e.scrollWidth > e.clientWidth + 2, atEnd: e.scrollLeft + e.clientWidth >= e.scrollWidth - 2 }; });
    const ok = same && labels && got.role === "img" && /Ekim: Meryem %/.test(got.aria) && got.scroll === false && strip.scroll && strip.months === 8 && strip.over && strip.atEnd;
    return { ok, detail: JSON.stringify({ got: got.bars.length, same, labels: got.labels, strip }) };
  });

  // ── the report card ───────────────────────────────────────────────────────────────────────
  await check(N_REPORT, async () => {
    const report = () => page.eval(() => {
      const r = document.querySelector("#hb-report .hb-report");
      const t = document.querySelector("#hb-report .hb-teaser");
      const tx = (s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, " ").trim() : null; };
      return {
        report: !!r, teaser: t ? t.textContent.replace(/\s+/g, " ").trim() : null, month: r ? r.dataset.month : null,
        title: tx("#hb-report .hb-report-title"), lead: tx("#hb-report .hb-report-lead"), best: tx("#hb-report .hb-report-best"), joint: tx("#hb-report .hb-report-joint"),
        streaks: [...document.querySelectorAll("#hb-report .hb-report-streak")].map((e) => [e.dataset.person, +e.dataset.n]),
        close: tx("#hb-report .hb-report-close"), bear: !!document.querySelector("#hb-report .hb-report svg.kawaii-bear"),
        pool: CONTENT.habits.report.closing,
      };
    });
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: { "2026-10": M1 } } });
    const running = await report();
    await openTakip(page, "2026-11-20T12:00:00", "meryem", { habits: { months: { "2026-10": M1 } } });
    const novCurrent = await report();
    await goPrev(page);
    const past = await report();
    await openTakip(page, "2026-11-01T08:00:00", "meryem", { habits: { months: { "2026-10": M1 } } });
    const first = await report();
    await goPrev(page);
    const firstPrev = await report();
    // by hand, October 2026 with every day due: Meryem 44/124 = 35.5, Furkan 39/115 = 33.9 -> she leads by 1.6 = +2;
    // best item Kuran 31/62 = 50; joint days 1-10 = 10; longest streaks Furkan 1-5 = 5, Meryem 1-3 = 3.
    // Closing line: pool[(2026*12 + 10) % pool.length], so the same month always says the same thing.
    const closeWant = past.pool[(2026 * 12 + 10) % past.pool.length];
    const full =
      past.report && past.month === "2026-10" && past.title === "Ekim karnesi" && past.lead === "Bu ay önde: Meryem (+2 puan)" &&
      past.best === "En düzenli görev: Kuran (en az 1 sayfa) (%50)" && past.joint === "10 gün ikimiz de" &&
      JSON.stringify(past.streaks) === JSON.stringify([["meryem", 3], ["furkan", 5]]) && past.close === closeWant && past.bear;
    const ok =
      !running.report && running.teaser === "Ay bitince karnemiz burada 🐻" &&
      !novCurrent.report && novCurrent.teaser !== null && full &&
      !first.report && first.teaser !== null && firstPrev.report && firstPrev.month === "2026-10";
    return { ok, detail: JSON.stringify({ running: running.report, novCurrent: novCurrent.report, past: { ...past, pool: undefined }, first: first.report, firstPrev: firstPrev.report }) };
  });

  // ── the log ───────────────────────────────────────────────────────────────────────────────
  const logRows = (p) => p.eval(() => [...document.querySelectorAll("#hb-log .hb-log-row")].map((r) => ({ id: r.dataset.id, pending: r.dataset.pending === "1", text: r.textContent.replace(/\s+/g, " ").trim() })));
  await check(N_LOGVIEW, async () => {
    await openTakip(page, "2026-10-15T22:00:00", "meryem", { habits: { months: { "2026-10": M1 }, log: LOG8 } });
    await until(async () => (await logRows(page)).length > 0);
    const collapsed = await logRows(page);
    const toggle1 = await textOf(page, "#hb-log .hb-log-toggle");
    await tapIn(page, "#hb-log .hb-log-toggle");
    const open = await logRows(page);
    const toggle2 = await textOf(page, "#hb-log .hb-log-toggle");
    await tapIn(page, "#hb-log .hb-log-toggle");
    const again = await logRows(page);
    // newest first by time (at, else atLocal): b 21:04 (at still empty), a 10:00, e 09:00 (empty), c 08:30, f 07:00, g, h, i
    const byId = (rows, id) => rows.find((r) => r.id === id);
    const ok =
      JSON.stringify(collapsed.map((r) => r.id)) === JSON.stringify(["b", "a", "e", "c", "f"]) && toggle1 === "Tümünü gör (8)" &&
      JSON.stringify(open.map((r) => r.id)) === JSON.stringify(["b", "a", "e", "c", "f", "g", "h", "i"]) && toggle2 === "Daha az göster" &&
      again.length === 5 &&
      byId(collapsed, "b").pending && byId(collapsed, "b").text === "Furkan · Spor ✓ · 15 Eki 21:04 bekliyor" &&
      byId(collapsed, "e").pending && /bekliyor$/.test(byId(collapsed, "e").text) &&
      !byId(collapsed, "a").pending && byId(collapsed, "a").text === "Meryem · Arapça tekrarı ✓ · 15 Eki 10:00" &&
      /^Furkan · Kuran ✗ geri aldı · 15 Eki 07:00$/.test(byId(collapsed, "f").text) &&
      byId(open, "g").text === "Furkan · Spor ✓ · 14 Eki 22:10";
    return { ok, detail: JSON.stringify({ collapsed, toggle1, open: open.length, toggle2, again: again.length }).slice(0, 700) };
  });

  await check(N_LOGSWITCH, async () => {
    await openTakip(page, "2026-11-10T12:00:00", "meryem", { habits: { months: {}, log: [...LOG8, NOV_LOG] } });
    await until(async () => (await logRows(page)).length > 0);
    const nov = (await logRows(page)).map((r) => r.id);
    await goPrev(page);
    await until(async () => (await logRows(page)).length === 5);
    const oct = (await logRows(page)).map((r) => r.id);
    await tapIn(page, "#hb-log .hb-log-toggle");
    const octOpen = (await logRows(page)).length;
    await tapIn(page, '#hb-month [data-act="next"]');
    await until(async () => (await logRows(page)).length === 1);
    const back = (await logRows(page)).map((r) => r.id);
    // a tick of her own shows at the top at once
    await tapIn(page, slot("spor", "meryem"));
    await until(async () => (await logRows(page)).length === 2);
    const fresh = (await logRows(page))[0];
    return {
      ok: JSON.stringify(nov) === JSON.stringify(["d"]) && JSON.stringify(oct) === JSON.stringify(["b", "a", "e", "c", "f"]) && octOpen === 8 && JSON.stringify(back) === JSON.stringify(["d"]) &&
        fresh && /^Meryem · Spor ✓ · 10 Kas 12:0\d$/.test(fresh.text) && !fresh.pending,
      detail: JSON.stringify({ nov, oct, octOpen, back, fresh }),
    };
  });

  // ── 360 and 390 px: nothing pushes the page sideways ──────────────────────────────────────
  await check(N_FIT, async () => {
    const notes = [];
    let ok = true;
    for (const vp of [{ width: 360, height: 780 }, { width: 390, height: 844 }]) {
      await openTakip(page, "2027-05-10T12:00:00", "meryem", { viewport: vp, habits: { months: MOM_MONTHS, log: LOG8 } });
      await until(() => page.eval(() => document.querySelectorAll("#hb-mom .hb-mbar").length >= 12));
      await sleep(300);
      const m = await page.eval(() => {
        const w = document.documentElement.clientWidth;
        const over = [];
        document.querySelectorAll("#habits-root *").forEach((e) => {
          if (e.closest(".hb-mom-scroll.is-scroll")) return;
          const r = e.getBoundingClientRect();
          if (r.width > 0 && (r.right > w + 0.5 || r.left < -0.5)) over.push((e.className && e.className.baseVal !== undefined ? e.className.baseVal : e.className) + ":" + Math.round(r.right));
        });
        return { w, doc: document.documentElement.scrollWidth, body: document.body.scrollWidth, over: over.slice(0, 5) };
      });
      if (m.doc > m.w || m.body > m.w || m.over.length) ok = false;
      notes.push([vp.width, m]);
    }
    return { ok, detail: JSON.stringify(notes) };
  });

  // ── contrast on every new surface ─────────────────────────────────────────────────────────
  await check(N_CONTRAST2, async () => {
    const SEL = {
      lead: "#hb-stats .hb-lead",
      nameM: '#hb-stats .hb-stat[data-kind="meryem"] .hb-stat-name span', numM: '#hb-stats .hb-stat[data-kind="meryem"] .hb-stat-num', streakM: '#hb-stats .hb-stat[data-kind="meryem"] .hb-streak-n', labelM: '#hb-stats .hb-stat[data-kind="meryem"] .hb-streak-label',
      nameF: '#hb-stats .hb-stat[data-kind="furkan"] .hb-stat-name span', numF: '#hb-stats .hb-stat[data-kind="furkan"] .hb-stat-num', streakF: '#hb-stats .hb-stat[data-kind="furkan"] .hb-streak-n', labelF: '#hb-stats .hb-stat[data-kind="furkan"] .hb-streak-label',
      nameT: '#hb-stats .hb-stat[data-kind="together"] .hb-stat-name span', numT: '#hb-stats .hb-stat[data-kind="together"] .hb-stat-num', subT: '#hb-stats .hb-joint-count .hb-streak-n',
      dailyTitle: "#hb-stats .hb-daily .hb-title", axis: "#hb-stats .hb-daily .hb-axis", dailyLeg: "#hb-stats .hb-daily .hb-leg",
      barsTitle: "#hb-stats .hb-bars .hb-title", barLabel: "#hb-stats .hb-bar-label", barWho: "#hb-stats .hb-bar-who", barVal: "#hb-stats .hb-bar-val",
      momTitle: "#hb-mom .hb-title", mlabel: "#hb-mom .hb-mlabel", myear: "#hb-mom .hb-myear", mval: "#hb-mom .hb-mval", momLeg: "#hb-mom .hb-leg", momHint: "#hb-mom .hb-hint",
      teaser: "#hb-report .hb-teaser-text",
      logTitle: "#hb-log .hb-title", logWho: "#hb-log .hb-log-who", logWhat: "#hb-log .hb-log-what", logWhen: "#hb-log .hb-log-when", logSep: "#hb-log .hb-log-sep", pending: "#hb-log .hb-log-pending", toggle: "#hb-log .hb-log-toggle",
    };
    const REPORT = { title: "#hb-report .hb-report-title", item: "#hb-report .hb-report-list li span", close: "#hb-report .hb-report-close" };
    const measure = (map) => page.eval((m) => {
      const out = {};
      for (const k in m) { const e = document.querySelector(m[k]); out[k] = e ? +window.__app.readable(e).toFixed(2) : "missing"; }
      return out;
    }, map);
    await openTakip(page, "2026-11-20T12:00:00", "meryem", { habits: { months: { "2026-10": M1, "2026-11": novFull }, log: [...LOG8.map((e) => ({ ...e, month: "2026-11", day: "2026-11-09" })), NOV_LOG] } });
    await until(async () => (await logRows(page)).length > 0);
    await sleep(200);
    const a = await measure(SEL);
    await goPrev(page);
    const b = await measure(REPORT);
    const all = { ...a, ...b };
    const bad = Object.entries(all).filter(([, v]) => v === "missing" || v < 4.5);
    return { ok: bad.length === 0, detail: bad.length ? `below 4.5 or missing: ${JSON.stringify(bad)}` : `min ${Math.min(...Object.values(all))}` };
  });

  await check(N_ERR, () => ({ ok: page.errors.length === 0, detail: page.errors.slice(0, 3).join(" | ") }));
}

// ── screenshot fixtures (tests/shoot.mjs) ───────────────────────────────────────────────────
const NOW_SHOT = "2026-10-15T12:00:00";
const SHOT_STORE = { "meryem-gate-played-year": "2026", "meryem-birthday-seen-year": "2026" };
const SHOT_HABITS = { months: { "2026-10": M1 } };
const tabAct = async (page) => {
  await sleep(300);
  await page.tap('.nav-btn[data-tab="habits-view"]');
  await page.settle();
  await sleep(250);
};

export const mutants = [
  {
    id: "habits-weekday-rule-dropped",
    file: "js/habits.js",
    find: "    if (item.weekdaysOnly && (dow === 0 || dow === 6)) return false;\n",
    replace: "",
    expect: N_WEEKDAY,
  },
  {
    id: "habits-future-tick-counted",
    file: "js/habits.js",
    find: "    if (key > todayKey) return false;\n",
    replace: "",
    expect: N_FUTURE,
  },
  {
    id: "habits-single-tick-counts-as-birlikte",
    file: "js/habits.js",
    find: "isTicked(monthData, key, item, 'furkan') && isTicked(monthData, key, item, 'meryem')",
    replace: "isTicked(monthData, key, item, 'furkan') || isTicked(monthData, key, item, 'meryem')",
    expect: N_JOINT,
  },
  {
    id: "habits-person-percent-swapped",
    file: "js/habits.js",
    find: "    var c = personCounts(person, month, monthData, today);\n",
    replace: "    var c = personCounts(person === 'furkan' ? 'meryem' : 'furkan', month, monthData, today);\n",
    expect: N_PERSON,
  },
  {
    id: "habits-streak-stops-at-month-start",
    file: "js/habits.js",
    find: "if (keyStr < startKey) break;",
    replace: "if (keyStr < startKey || keyStr.slice(0, 7) !== todayKey.slice(0, 7)) break;",
    expect: N_STREAK,
  },
  {
    id: "habits-month-from-raw-date",
    file: "js/habits.js",
    find: "    return appNow();\n",
    replace: "    return new Date();\n",
    expect: N_APPNOW,
  },
  {
    id: "habits-log-sort-drops-null-at",
    file: "js/firebase.js",
    find: "    items.sort(function (a, b) { return habitLogMillis(b) - habitLogMillis(a); });\n",
    replace: "    items = items.filter(function (x) { return !!x.at; });\n    items.sort(function (a, b) { return habitLogMillis(b) - habitLogMillis(a); });\n",
    expect: N_LOG,
  },
  {
    id: "habits-partner-row-unlocked",
    file: "js/habits.js",
    find: "    return person === state.me;\n",
    replace: "    return true;\n",
    expect: N_LOCK,
  },
  {
    id: "habits-log-without-by",
    file: "js/habits.js",
    find: "by: state.me, ",
    replace: "",
    expect: N_TICK,
  },
  {
    id: "habits-future-day-tappable",
    file: "js/habits.js",
    find: "    var tappable = key <= todayKey && key >= startKey;\n",
    replace: "    var tappable = key >= startKey;\n",
    expect: N_FUTURE_DAY,
  },
  {
    id: "habits-joint-heart-on-single-tick",
    file: "js/habits.js",
    find: "    return isTicked(md, key, item, 'furkan') && isTicked(md, key, item, 'meryem');",
    replace: "    return isTicked(md, key, item, 'furkan') || isTicked(md, key, item, 'meryem');",
    expect: N_HEART,
  },
  {
    id: "habits-navigator-offers-next-month",
    file: "js/habits.js",
    find: "    return monthsFrom(CONFIG.habitsStart, now);\n",
    replace: "    return monthsFrom(CONFIG.habitsStart, new Date(now.getFullYear(), now.getMonth() + 1, 1));\n",
    expect: N_NAV,
  },
  {
    id: "habits-previous-month-not-subscribed",
    file: "js/habits.js",
    find: "      if (prev >= CONFIG.habitsStart) add(prev);\n",
    replace: "",
    expect: N_PREVSUB,
  },
  {
    id: "habits-month-listener-never-closed",
    file: "js/habits.js",
    find: "      try { subs[mk](); } catch (e) { /* already gone */ }\n",
    replace: "",
    expect: N_LEAK,
  },
  {
    id: "habits-log-listener-never-closed",
    file: "js/habits.js",
    find: "    if (logSub.off) {\n      try { logSub.off(); } catch (e) { /* already gone */ }\n      logSub.off = null;\n    }\n",
    replace: "",
    expect: N_LEAK,
  },
  {
    id: "habits-daily-chart-wrong-person",
    file: "js/habits.js",
    find: "        var v = rec[p];\n",
    replace: "        var v = rec[p === 'meryem' ? 'furkan' : p];\n",
    expect: N_DAILY,
  },
  {
    id: "habits-daily-line-drawn-into-the-future",
    file: "js/habits.js",
    find: "        if (v === null) continue;\n",
    replace: "        if (v === null) v = 0;\n",
    expect: N_DAILY,
  },
  {
    id: "habits-birlikte-card-from-person-percent",
    file: "js/habits.js",
    find: "    var bp = summary.birlikte.pct;\n",
    replace: "    var bp = personPercent('meryem', vm, state.monthsData[vm] || {}, now);\n",
    expect: N_CARDS,
  },
  {
    id: "habits-report-card-on-the-running-month",
    file: "js/habits.js",
    find: "    if (vm < monthKey(now)) {\n",
    replace: "    if (vm <= monthKey(now)) {\n",
    expect: N_REPORT,
  },
  {
    id: "habits-log-view-drops-null-at-rows",
    file: "js/habits.js",
    find: "    var rows = state.log.slice();\n",
    replace: "    var rows = state.log.filter(function (x) { return !!x.at; });\n",
    expect: N_LOGVIEW,
  },
  {
    id: "habits-month-over-month-misses-the-first-month",
    file: "js/habits.js",
    find: "    var list = shownMonths(now);\n",
    replace: "    var list = shownMonths(now).slice(1);\n",
    expect: N_MOM,
  },
];

const meOpen = (now, me, extra) => ({ now, storage: { ...SHOT_STORE, "meryem-habits-me": me, "meryem-gate-played-year": now.slice(0, 4), "meryem-birthday-seen-year": now.slice(0, 4) }, ...extra });
const scrollTo = (sel) => async (page) => { await tabAct(page); await sleep(300); await page.eval((s) => { document.querySelector(s).scrollIntoView({ block: "start" }); window.scrollBy(0, -76); }, sel); await sleep(150); };
const S4 = { habits: { months: MOM_MONTHS, log: LOG8 } };
const S4_NOV = { habits: { months: { "2026-10": M1, "2026-11": NOV_D }, log: [...LOG8, NOV_LOG] } };
const P360 = { viewport: { width: 360, height: 780 } };

export const shots = [
  { name: "stats-meryem", open: meOpen(NOW_SHOT, "meryem", { habits: { months: { "2026-10": M1 }, log: LOG8 } }), act: scrollTo("#hb-stats") },
  { name: "daily", open: meOpen(NOW_SHOT, "meryem", { habits: { months: { "2026-10": M1 }, log: LOG8 } }), act: scrollTo("#hb-stats .hb-daily") },
  { name: "bars", open: meOpen(NOW_SHOT, "meryem", { habits: { months: { "2026-10": M1 }, log: LOG8 } }), act: scrollTo("#hb-stats .hb-bars") },
  { name: "mom", open: meOpen("2027-01-10T12:00:00", "meryem", S4), act: scrollTo("#hb-mom") },
  { name: "report", open: meOpen("2026-11-20T12:00:00", "meryem", S4_NOV), act: async (page) => { await tabAct(page); await tapIn(page, '#hb-month [data-act="prev"]'); await page.eval(() => { document.querySelector("#hb-report").scrollIntoView({ block: "start" }); window.scrollBy(0, -76); }); await sleep(150); } },
  { name: "teaser", open: meOpen(NOW_SHOT, "meryem", { habits: { months: { "2026-10": M1 }, log: LOG8 } }), act: scrollTo("#hb-report") },
  { name: "log-collapsed", open: meOpen(NOW_SHOT, "furkan", { habits: { months: { "2026-10": M1 }, log: LOG8 } }), act: scrollTo("#hb-log") },
  { name: "log-expanded", open: meOpen(NOW_SHOT, "furkan", { habits: { months: { "2026-10": M1 }, log: LOG8 } }), act: async (page) => { await tabAct(page); await sleep(300); await tapIn(page, "#hb-log .hb-log-toggle"); await page.eval(() => { document.querySelector("#hb-log").scrollIntoView({ block: "start" }); window.scrollBy(0, -76); }); await sleep(150); } },
  { name: "stats-360", open: meOpen(NOW_SHOT, "meryem", { ...P360, habits: { months: { "2026-10": M1 }, log: LOG8 } }), act: scrollTo("#hb-stats") },
  { name: "daily-360", open: meOpen(NOW_SHOT, "meryem", { ...P360, habits: { months: { "2026-10": M1 }, log: LOG8 } }), act: scrollTo("#hb-stats .hb-daily") },
  { name: "bars-360", open: meOpen(NOW_SHOT, "meryem", { ...P360, habits: { months: { "2026-10": M1 }, log: LOG8 } }), act: scrollTo("#hb-stats .hb-bars") },
  { name: "mom-360", open: meOpen("2027-01-10T12:00:00", "meryem", { ...P360, ...S4 }), act: scrollTo("#hb-mom") },
  { name: "mom-scroll-360", open: meOpen("2027-05-10T12:00:00", "meryem", { ...P360, ...S4 }), act: scrollTo("#hb-mom") },
  { name: "report-360", open: meOpen("2026-11-20T12:00:00", "meryem", { ...P360, ...S4_NOV }), act: async (page) => { await tabAct(page); await tapIn(page, '#hb-month [data-act="prev"]'); await page.eval(() => { document.querySelector("#hb-report").scrollIntoView({ block: "start" }); window.scrollBy(0, -76); }); await sleep(150); } },
  { name: "log-360", open: meOpen(NOW_SHOT, "furkan", { ...P360, habits: { months: { "2026-10": M1 }, log: LOG8 } }), act: scrollTo("#hb-log") },
  { name: "chooser", open: { now: NOW_SHOT, storage: SHOT_STORE, habits: SHOT_HABITS }, act: tabAct },
  { name: "today-meryem", open: { now: NOW_SHOT, storage: { ...SHOT_STORE, "meryem-habits-me": "meryem" }, habits: SHOT_HABITS }, act: tabAct },
  { name: "today-furkan", open: { now: NOW_SHOT, storage: { ...SHOT_STORE, "meryem-habits-me": "furkan" }, habits: SHOT_HABITS }, act: tabAct },
  {
    name: "calendar",
    open: { now: NOW_SHOT, storage: { ...SHOT_STORE, "meryem-habits-me": "meryem" }, habits: SHOT_HABITS },
    act: async (page) => { await tabAct(page); await page.eval(() => document.getElementById("hb-month").scrollIntoView({ block: "center" })); },
  },
  {
    name: "day-sheet",
    open: { now: NOW_SHOT, storage: { ...SHOT_STORE, "meryem-habits-me": "meryem" }, habits: SHOT_HABITS },
    act: async (page) => { await tabAct(page); await tapIn(page, '#hb-month .hb-day[data-day="2026-10-06"]'); await page.settle(); },
  },
  {
    name: "past-month",
    open: { now: "2026-11-10T12:00:00", storage: { ...SHOT_STORE, "meryem-habits-me": "furkan" }, habits: SHOT_HABITS },
    act: async (page) => { await tabAct(page); await tapIn(page, '#hb-month [data-act="prev"]'); await page.eval(() => document.getElementById("hb-month").scrollIntoView({ block: "center" })); },
  },
  { name: "saturday", open: { now: "2026-10-17T10:00:00", storage: { ...SHOT_STORE, "meryem-habits-me": "furkan" }, habits: SHOT_HABITS }, act: tabAct },
  { name: "not-started", open: { now: "2026-09-20T10:00:00", storage: { ...SHOT_STORE, "meryem-habits-me": "meryem" } }, act: tabAct },
  { name: "nav-360", open: { now: NOW_SHOT, storage: { ...SHOT_STORE, "meryem-habits-me": "meryem" }, habits: SHOT_HABITS, viewport: { width: 360, height: 780 } }, act: tabAct },
  { name: "sheet-360", open: { now: NOW_SHOT, storage: { ...SHOT_STORE, "meryem-habits-me": "furkan" }, habits: SHOT_HABITS, viewport: { width: 360, height: 780 } }, act: async (page) => { await tabAct(page); await tapIn(page, '#hb-month .hb-day[data-day="2026-10-11"]'); await page.settle(); } },
];
