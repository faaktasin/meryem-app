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
 * The habit list (CONFIG.habits): spor and kitap are joint (both), muzik and yuruyus are Meryem's,
 * su is Furkan's, uyku (Düzenli uyku) is Furkan's and due Monday-Friday only. So on a
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
//   Furkan  spor 1-10,14 (+16,20 future)   kitap 1-15 (+31 future)   su 1-5
//           uyku 1,2,3,5,6,7  (3 is a Saturday: not due, must not count)
//   Meryem  spor 1-12 (+20 future)   kitap 1-15   muzik 1-12   yuruyus 1-3 (+30 future)
const M1 = mk("2026-10", [
  ["spor", "furkan", [...range(1, 10), 14, 16, 20]],
  ["kitap", "furkan", [...range(1, 15), 31]],
  ["su", "furkan", range(1, 5)],
  ["uyku", "furkan", [1, 2, 3, 5, 6, 7]],
  ["spor", "meryem", [...range(1, 12), 20]],
  ["kitap", "meryem", range(1, 15)],
  ["muzik", "meryem", range(1, 12)],
  ["yuruyus", "meryem", [1, 2, 3, 30]],
]);

// ── stage 4 fixtures: four months for "Aydan aya", and a log of eight entries ─────────────────
const NOV_D = mk("2026-11", [
  ["spor", "meryem", range(1, 25)], ["spor", "furkan", range(1, 20)], ["kitap", "meryem", range(1, 30)], ["kitap", "furkan", range(1, 28)],
  ["muzik", "meryem", range(1, 22)], ["yuruyus", "meryem", range(1, 10)], ["su", "furkan", range(1, 26)], ["uyku", "furkan", [2, 3, 4, 5, 6, 9, 10, 11, 12, 13, 16, 17, 18, 19, 20, 23, 24, 25, 26, 27, 30]],
]);
const DEC_D = mk("2026-12", [
  ["spor", "meryem", range(1, 31)], ["spor", "furkan", range(1, 12)], ["kitap", "meryem", range(1, 31)], ["kitap", "furkan", range(1, 31)],
  ["muzik", "meryem", range(1, 28)], ["yuruyus", "meryem", range(1, 31)], ["su", "furkan", range(1, 15)],
]);
const JAN_D = mk("2027-01", [["kitap", "meryem", [1, 2, 3, 4, 5]], ["kitap", "furkan", [1, 2, 3, 4]], ["spor", "meryem", [1, 2, 3, 4, 5]], ["spor", "furkan", [1, 2, 3]], ["muzik", "meryem", [1, 2, 3]]]);
const MOM_MONTHS = { "2026-10": M1, "2026-11": NOV_D, "2026-12": DEC_D, "2027-01": JAN_D };
const LE = (d, h, mi) => istanbulEpoch(2026, 10, d, h, mi);
const logEntry = (id, extra) => ({ id, month: "2026-10", day: "2026-10-15", item: "spor", person: "furkan", value: true, by: "furkan", ...extra });
const LOG8 = [
  logEntry("a", { item: "muzik", person: "meryem", by: "meryem", at: { __ts: LE(15, 10, 0) }, atLocal: LE(15, 10, 0) }),
  logEntry("b", { at: null, atLocal: LE(15, 21, 4) }),
  logEntry("c", { item: "kitap", at: { __ts: LE(15, 8, 30) }, atLocal: LE(15, 8, 30) }),
  logEntry("e", { item: "yuruyus", person: "meryem", by: "meryem", at: null, atLocal: LE(15, 9, 0) }),
  logEntry("f", { item: "kitap", value: false, at: { __ts: LE(15, 7, 0) }, atLocal: LE(15, 7, 0) }),
  logEntry("g", { day: "2026-10-14", at: { __ts: LE(14, 22, 10) }, atLocal: LE(14, 22, 10) }),
  logEntry("h", { day: "2026-10-14", item: "su", at: { __ts: LE(14, 21, 0) }, atLocal: LE(14, 21, 0) }),
  logEntry("i", { day: "2026-10-13", at: { __ts: LE(13, 20, 0) }, atLocal: LE(13, 20, 0) }),
];
const NOV_LOG = { id: "d", month: "2026-11", day: "2026-11-09", item: "kitap", person: "meryem", value: true, by: "meryem", at: { __ts: istanbulEpoch(2026, 11, 9, 20, 15) }, atLocal: istanbulEpoch(2026, 11, 9, 20, 15) };

const N_CARDS = "habits: every stat card number equals its monthSummary field through the one rounding helper (15 Oct, a past month, Şubat 2027)";
const N_LEAD = "habits: the lead line names the leader with the rounded gap, says Başa baş on a tie and is empty before anything is due";
const N_STREAKCARD = "habits: the streak card shows the current streak on the running month and that month's longest on a past one";
const N_DAILY = "habits: the daily chart has one point per due day up to today for each person, none after, and each y follows perDay";
const N_BARS = "habits: the per-item bars print the item percentages per owner and a dash when nothing is due";
const N_MOM = "habits: month over month shows every month from 2026-10 to the current with each month's summary values";
const N_REPORT = "habits: the report card is absent on the running month, present on a past month and on the 1st for the month before";
const N_LOGVIEW = "habits: the log lists newest first, keeps a null-at row marked kaydediliyor, collapses to 5 and expands";
const N_LOGSWITCH = "habits: the log follows the viewed month and a fresh tick lands at its top";
const N_FIT = "habits: the new cards fit 360 and 390 px wide with no horizontal page scroll";
const N_CONTRAST2 = "habits: the words on the stat cards, charts, report card and log reach 4.5:1";

const N_LONGSTREAK = "habits: a streak older than the previous month is counted whole on a fresh load (92 on 1 Jan 2027, 152 on 1 Mar 2027)";
const N_LEADSHOWN = "habits: the lead line is the difference of the two numbers the cards show, and Başa baş only when they read the same";
const N_DOUBLETAP = "habits: two quick taps before the snapshot echo store true then false, in the month document and in the log";

const N_JUNKLOG = "habits: a stored log entry with markup or a prototype name in person/by/item creates no element, prints no function text and the page stays error-free";
const N_LOGFAIL = "habits: a refused log write leaves the saved tick alone with no toast; a refused month write toasts, clears the pending tap and shows the stored value";
const N_LISTENFAIL = "habits: a habit listener the server refuses shows one toast (Kayıtlara ulaşamadık) and logs the error, however many listeners fail";
const N_PILL = "habits: the kaydediliyor pill follows the SDK's pending flag - absent after an online echo, shown while a write is pending, and the row still sorts by its estimated time";
const N_PREVIEW = "habits: under the rehearsal clock (?onizleme=dogumgunu) a tap writes nothing to the month document or the log";
const N_COPY ="habits: the reviewed texts - closing pool, save error, daily chart title - read as agreed, and a failed save puts the box back";
const N_GAPS ="habits: every card on the Takip page sits 14-18 px below the one before it (360 and 390 px)";
const N_LOGLAYOUT = "habits: a log row is two lines, the pending pill shares the time's line, no separator dangles and no cross glyph";
const N_SCORELINE = "habits: each Name %n of the report's score line is one unbreakable unit, and the best item prints its short name";
const N_STREAKTILE = "habits: the streak tile holds its number and label on two clean lines at 360 px, and a 0-day streak has no flame";
const N_BOTTOM = "habits: the last card clears the Sürpriz bubble by at least 16 px (360, 390 and 412 px)";
const N_MOMCUE = "habits: the month strip shows an edge cue only when its months overflow";
const N_LEGENDGAP = "habits: every legend label sits the same distance from its mark (calendar, daily line, month over month)";
const N_LOCKEDTICK = "habits: a ticked partner box looks different from your own tick, with the check still visible and its name legible";
const N_SHEETSTICKY = "habits: the day sheet keeps its title and close button in view while the rows scroll";
const N_TARGETS = "habits: every control inside Takip and its day sheet is at least 44 x 44 px (360, 390 and 412 px)";

const N_SINCE = "habits: the shipped config starts every habit on 2026-10-07 (no test seam)";
const N_WEEK1 = "habits: with the shipped config 1-6 October are due nowhere - calendar, cards and report - and 7 October is";
const N_WEEKDAY = "habits: Düzenli uyku is due Monday to Friday only and a weekend tick never counts";
const N_FUTURE = "habits: a tick dated after today never counts, in any number";
const N_JOINT = "habits: Birlikte counts a joint item-day only when both ticked";
const N_PERSON = "habits: person percentages are per person (15 Oct)";
const N_STREAK = "habits: the current streak runs across the month boundary (30 Oct to 2 Nov)";
const N_APPNOW = "habits: the tracked month follows appNow() (rehearsal clock), not the raw Date";
const N_ME = "habits: Ben kimim? appears once on a fresh device, is remembered and can be changed";
const N_LOCK = "habits: your own boxes are tappable, the partner's are locked and a tap on them writes nothing";
const N_TICK = "habits: a tick writes the month document and a log entry with by, an untick writes false";
const N_HEART = "habits: the joint heart lights only when both ticked (today's panel and the calendar)";
const N_WEEKEND = "habits: Düzenli uyku is absent on a Saturday in today's panel and undue in the day sheet";
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
      ["spor", "Spor", "furkan+meryem", false, "2026-10-01", true, "Birlikte hareket edeceğiz"],
      ["kitap", "Kitap (en az 10 sayfa)", "furkan+meryem", false, "2026-10-01", true, "Her gün biraz kitap okuyacağız"],
      ["muzik", "Müzik pratiği (en az 15 dk)", "meryem", false, "2026-10-01", true, "Her gün biraz müzik pratiği yapacağım"],
      ["yuruyus", "Yürüyüş", "meryem", false, "2026-10-01", true, "Her gün kısa bir yürüyüşe çıkacağım"],
      ["su", "Su içme", "furkan", false, "2026-10-01", true, "Gün boyunca yeterince su içeceğim"],
      ["uyku", "Düzenli uyku", "furkan", true, "2026-10-01", true, "Hafta içi düzenli saatte uyuyacağım"],
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
  //   Furkan boxes due = spor 15 + kitap 15 + su 15 + uyku 11 = 56
  //   Meryem boxes due = spor 15 + kitap 15 + muzik 15 + yuruyus 15  = 60
  //   joint item-days  = spor 15 + kitap 15 = 30
  // Furkan ticked & due: spor 1-10,14 = 11; kitap 15; su 5; uyku 1,2,5,6,7 = 5 -> 36
  // Meryem ticked & due: spor 12; kitap 15; muzik 12; yuruyus 3 -> 42
  const mid = T("2026-10-15");
  await check(N_PERSON, async () => {
    const f = await core(page, "personPercent", "furkan", "2026-10", M1, mid); // 36 / 56
    const m = await core(page, "personPercent", "meryem", "2026-10", M1, mid); // 42 / 60
    return { ok: near(f, 36 * 100 / 56) && near(m, 70) && near(f, 64.28571428571429), detail: `furkan ${f} (want 64.2857), meryem ${m} (want 70)` };
  });

  await check(N_JOINT, async () => {
    // both ticked: spor 1-10 = 10, kitap 1-15 = 15 -> 25 of 30. (Either-one-ticked would be
    // spor 1-12,14 = 13 plus 15 = 28 of 30.)
    const b = await core(page, "birliktePercent", "2026-10", M1, mid);
    return { ok: near(b, 25 * 100 / 30), detail: `birlikte ${b} (want 83.3333)` };
  });

  await check("habits: item percentages (15 Oct); an item that is not the person's is null", async () => {
    const got = {
      sporF: await core(page, "itemPercent", I("spor"), "furkan", "2026-10", M1, mid), // 11/15
      sporM: await core(page, "itemPercent", I("spor"), "meryem", "2026-10", M1, mid), // 12/15
      kitapF: await core(page, "itemPercent", I("kitap"), "furkan", "2026-10", M1, mid), // 15/15
      muzikM: await core(page, "itemPercent", I("muzik"), "meryem", "2026-10", M1, mid), // 12/15
      yuruyusM: await core(page, "itemPercent", I("yuruyus"), "meryem", "2026-10", M1, mid), // 3/15
      suF: await core(page, "itemPercent", I("su"), "furkan", "2026-10", M1, mid), // 5/15
      muzikF: await core(page, "itemPercent", I("muzik"), "furkan", "2026-10", M1, mid), // not his
    };
    const want = { sporF: 1100 / 15, sporM: 80, kitapF: 100, muzikM: 80, yuruyusM: 20, suF: 500 / 15, muzikF: null };
    const ok = Object.keys(want).every((k) => near(got[k], want[k]));
    return { ok, detail: JSON.stringify(got) };
  });

  await check(N_WEEKDAY, async () => {
    // Düzenli uyku, 15 Oct: weekdays 1,2,5,6,7,8,9,12,13,14,15 = 11 due; ticked 1,2,5,6,7 = 5 (the
    // Saturday tick on the 3rd is ignored) -> 5/11. Without the weekday rule it would be 6/15.
    const uyku = await core(page, "itemPercent", I("uyku"), "furkan", "2026-10", M1, mid);
    const due = [
      await core(page, "isDue", I("uyku"), T("2026-10-02"), mid), // Friday
      await core(page, "isDue", I("uyku"), T("2026-10-03"), mid), // Saturday
      await core(page, "isDue", I("uyku"), T("2026-10-04"), mid), // Sunday
      await core(page, "isDue", I("uyku"), T("2026-10-05"), mid), // Monday
      await core(page, "isDue", I("spor"), T("2026-10-03"), mid), // an every-day item on a Saturday
    ];
    return {
      ok: near(uyku, 500 / 11) && JSON.stringify(due) === JSON.stringify([true, false, false, true, true]),
      detail: `uyku ${uyku} (want 45.4545), due ${JSON.stringify(due)}`,
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
    // Furkan complete (every due box ticked) on 1-5, so the longest is 5; the 6th lacks su.
    // Meryem complete on 1-3 (yuruyus stops after the 3rd) -> 3. On the 15th: today is open, the 14th
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
    // jointDays: spor both on 1-10, kitap both on 1-15 -> days where BOTH joint items were done
    // by both = 1-10 = 10.  leader: 36*60 = 2160 < 42*56 = 2352 -> meryem.
    // best item (all owners together): kitap 30/30 = 100 beats spor 23/30 = 76.7.
    // perDay: d1 both 4/4; d3 (Sat) furkan 3/3 (his weekend uyku tick ignored), meryem 4/4; d6 furkan 3/4,
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
      s.bestItem && s.bestItem.id === "kitap" && s.bestItem.label === "Kitap (en az 10 sayfa)" && near(s.bestItem.pct, 100) &&
      s.items.length === 6 && s.items[0].id === "spor" && near(s.items[0].pct, 23 * 100 / 30) && s.items[5].meryem === null &&
      s.perDay.length === 31 && s.perDay[0].key === "2026-10-01" && daysOk;
    return { ok, detail: JSON.stringify({ people: s.people, birlikte: s.birlikte, jointDays: s.jointDays, leader: s.leader, best: s.bestItem, d: [1, 3, 6, 11, 14, 15, 16].map((n) => day(n)) }).slice(0, 600) };
  });

  // ── 3. the 1st of the month: only day 1 is due ────────────────────────────────────────────
  // Thu 1 Oct. Furkan boxes due 4 (spor, kitap, su, uyku); he ticked spor, kitap -> 2/4.
  // Meryem boxes due 4; she ticked spor, muzik, yuruyus -> 3/4. Joint item-days due 2 (spor,
  // kitap); both ticked spor only -> 1/2. Ticks on day 2 (tomorrow) are ignored.
  await open(page, "2026-10-01T09:00:00");
  const first = T("2026-10-01");
  const FIRST = mk("2026-10", [
    ["spor", "furkan", [1]], ["kitap", "furkan", [1]], ["su", "furkan", [2]],
    ["spor", "meryem", [1]], ["muzik", "meryem", [1]], ["yuruyus", "meryem", [1]], ["kitap", "meryem", [2]],
  ]);
  await check("habits: on the 1st only day 1 is due (50 / 75 / Birlikte 50, an unticked due item is 0 not null)", async () => {
    const s = await core(page, "monthSummary", "2026-10", FIRST, first);
    const su = await core(page, "itemPercent", I("su"), "furkan", "2026-10", FIRST, first); // 0/1
    const sporF = await core(page, "itemPercent", I("spor"), "furkan", "2026-10", FIRST, first); // 1/1
    const ok =
      s.people.furkan.due === 4 && s.people.furkan.done === 2 && near(s.people.furkan.pct, 50) &&
      s.people.meryem.due === 4 && s.people.meryem.done === 3 && near(s.people.meryem.pct, 75) &&
      s.birlikte.due === 2 && s.birlikte.done === 1 && near(s.birlikte.pct, 50) &&
      s.jointDays === 0 && s.leader === "meryem" && su === 0 && near(sporF, 100) &&
      near(s.perDay[0].furkan, 50) && near(s.perDay[0].meryem, 75) && s.perDay[1].furkan === null &&
      s.people.furkan.longest === 0 && (await core(page, "currentStreak", "furkan", { "2026-10": FIRST }, first)) === 0;
    return { ok, detail: JSON.stringify({ p: s.people, b: s.birlikte, su, sporF }) };
  });

  // ── 4. the last day: Sat 31 Oct ───────────────────────────────────────────────────────────
  // Furkan: spor 1-30 (not the 31st), kitap 1-31, su 1-31, uyku on all 22 weekdays (and a
  // weekend tick on the 31st, ignored). Boxes due = 31+31+31+22 = 115, ticked 30+31+31+22 = 114.
  // Meryem: spor 1-31, kitap 1-31, muzik 1-24, yuruyus 1-31. Boxes due 124, ticked 31+31+24+31 = 117.
  // Joint item-days 62; both ticked spor 1-30 = 30, kitap 31 -> 61.  jointDays = days 1-30 = 30.
  // Furkan complete 1-30 -> longest 30 and, today (31st) being open, current streak 30.
  // Meryem complete 1-24 -> longest 24; current: the 30th is incomplete -> 0.
  await open(page, "2026-10-31T21:00:00");
  const lastDay = T("2026-10-31");
  const weekdays = range(1, 31).filter((d) => isWeekday(2026, 10, d));
  const LAST = mk("2026-10", [
    ["spor", "furkan", range(1, 30)], ["kitap", "furkan", range(1, 31)], ["su", "furkan", range(1, 31)], ["uyku", "furkan", [...weekdays, 31]],
    ["spor", "meryem", range(1, 31)], ["kitap", "meryem", range(1, 31)], ["muzik", "meryem", range(1, 24)], ["yuruyus", "meryem", range(1, 31)],
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
  // Furkan ticks only uyku, on all 20 weekdays. Boxes due = 28*3 + 20 = 104, ticked 20.
  // Meryem ticks nothing: 28*4 = 112 due, 0 ticked. Joint item-days 56, none both -> 0.
  await open(page, "2027-02-28T20:00:00");
  const feb = T("2027-02-28");
  const febWeekdays = range(1, 28).filter((d) => isWeekday(2027, 2, d));
  const FEB = mk("2027-02", [["uyku", "furkan", febWeekdays]]);
  await check("habits: Şubat 2027 - 28 days, 20 weekdays, percentages over the right denominators", async () => {
    const s = await core(page, "monthSummary", "2027-02", FEB, feb);
    const ok =
      febWeekdays.length === 20 && s.days === 28 && s.perDay.length === 28 &&
      s.people.furkan.due === 104 && s.people.furkan.done === 20 && near(s.people.furkan.pct, 2000 / 104) &&
      s.people.meryem.due === 112 && s.people.meryem.done === 0 && s.people.meryem.pct === 0 &&
      s.birlikte.due === 56 && s.birlikte.pct === 0 && s.leader === "furkan" &&
      s.bestItem && s.bestItem.id === "uyku" && near(s.bestItem.pct, 100);
    return { ok, detail: JSON.stringify({ p: s.people, b: s.birlikte, leader: s.leader, best: s.bestItem }) };
  });

  // ── 6. a Saturday and a Sunday as "today" ─────────────────────────────────────────────────
  // Düzenli uyku with only the 1st ticked: through Sat 3 Oct the due days are Thu 1 and Fri 2 (the
  // Saturday itself is not due) -> 1/2 = 50; through Sun 4 Oct the same, 50.
  await open(page, "2026-10-03T12:00:00");
  const UYK = mk("2026-10", [["uyku", "furkan", [1, 3]]]); // the Saturday tick must be ignored
  await check("habits: with a Saturday or a Sunday as today, Düzenli uyku still counts only Thu 1 and Fri 2", async () => {
    const sat = await core(page, "itemPercent", I("uyku"), "furkan", "2026-10", UYK, T("2026-10-03"));
    const sun = await core(page, "itemPercent", I("uyku"), "furkan", "2026-10", UYK, T("2026-10-04"));
    const dayBefore = await core(page, "itemPercent", I("uyku"), "furkan", "2026-10", UYK, T("2026-10-02"));
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
  const all4 = ["spor", "kitap", "su", "uyku"];
  const all3 = ["spor", "kitap", "su"];
  const octS = mk("2026-10", [...all4.map((i) => [i, "furkan", [30]]), ...all3.map((i) => [i, "furkan", [31]])]);
  const novFull = mk("2026-11", [...all3.map((i) => [i, "furkan", [1]]), ...all4.map((i) => [i, "furkan", [2]]),
    ...["spor", "kitap", "muzik", "yuruyus"].map((i) => [i, "meryem", [2]])]);
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
    habits: { months: { "2026-10": { days: { "2026-10-14": { kitap: { furkan: true } } } }, "2026-11": { days: { "2026-11-01": { spor: { meryem: true } } } } } },
  });

  await check("habits: initHabits keeps the current month's document and holds one habitMonths subscription", async () => {
    const st = await stateOf(page);
    const ls = (await listeners(page)).filter((l) => l.startsWith(MONTHS + "/"));
    return {
      ok: st.month === "2026-10" && st.day === "2026-10-15" && JSON.stringify(st.data) === JSON.stringify({ days: { "2026-10-14": { kitap: { furkan: true } } } }) && JSON.stringify(ls) === JSON.stringify([`${MONTHS}/2026-10`]),
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
    const want = { days: { "2026-10-14": { kitap: { furkan: true } }, "2026-10-15": { spor: { meryem: false, furkan: true } } } };
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
    await page.eval(() => addHabitLog({ month: "2026-10", day: "2026-10-15", item: "kitap", person: "furkan", value: false, by: "furkan", atLocal: 1760000001000 }));
    await page.eval(() => { window.__STUB_TS_NULL = false; });
    const docs = Object.values((await page.stubDb())[LOG] || {});
    const off = docs.find((x) => x.item === "kitap") || {};
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
  // to her next birthday, 25 Nov 2027. A month taken from new Date() would still say 2026-12.
  await open(page, "2026-12-20T12:00:00", { query: "?onizleme=dogumgunu" });
  await check(N_APPNOW, async () => {
    const st = await stateOf(page);
    const subs = (await listeners(page)).filter((l) => l.startsWith(MONTHS + "/"));
    // Stage 3 also subscribes the month before (a streak crosses the 1st): 2027-10 beside 2027-11.
    return { ok: st.month === "2027-11" && st.day === "2027-11-25" && JSON.stringify(subs.slice().sort()) === JSON.stringify([`${MONTHS}/2027-10`, `${MONTHS}/2027-11`]), detail: JSON.stringify({ month: st.month, day: st.day, subs }) };
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
      const pro = q("su", "furkan");
      return {
        own: own.getAttribute("aria-disabled"), ownLock: !!own.querySelector(".hb-lock"),
        other: other.getAttribute("aria-disabled"), otherLock: !!other.querySelector(".hb-lock"),
        pro: pro.getAttribute("aria-disabled"), muzik: q("muzik", "meryem").getAttribute("aria-disabled"),
      };
    });
    const before = JSON.stringify(await page.stubDb());
    await tapIn(page, slot("spor", "furkan"));
    await tapIn(page, slot("su", "furkan"));
    await sleep(300);
    const after = JSON.stringify(await page.stubDb());
    const onAfter = await page.eval(() => document.querySelectorAll("#hb-today .hb-heart.is-on").length);
    const ok = info.own === null && !info.ownLock && info.other === "true" && info.otherLock && info.pro === "true" && info.muzik === null && before === after && onAfter === 0;
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
  // 12: spor+kitap both -> a joint day. 13: spor both, kitap only Furkan -> not. 14: spor only
  // Meryem. 15: spor only Furkan (not both), kitap both. Meryem ticking her spor on the 15th
  // makes the 15th joint as well.
  const JH = { days: {
    "2026-10-12": { spor: { furkan: true, meryem: true }, kitap: { furkan: true, meryem: true } },
    "2026-10-13": { spor: { furkan: true, meryem: true }, kitap: { furkan: true } },
    "2026-10-14": { spor: { meryem: true } },
    "2026-10-15": { spor: { furkan: true }, kitap: { furkan: true, meryem: true } },
  } };
  await openTakip(page, NOW3, "meryem", { habits: { months: { "2026-10": JH } } });
  await check(N_HEART, async () => {
    const read = () => page.eval(() => ({
      spor: document.querySelector('#hb-today .hb-row[data-item="spor"] .hb-joint').classList.contains("is-on"),
      kitap: document.querySelector('#hb-today .hb-row[data-item="kitap"] .hb-joint').classList.contains("is-on"),
      joint: [...document.querySelectorAll("#hb-month .hb-day.is-joint")].map((d) => d.dataset.day),
      hearts: document.querySelectorAll("#hb-month .hb-day-heart").length,
    }));
    const a = await read();
    await tapIn(page, slot("spor", "meryem"));
    await until(() => page.eval(() => document.querySelector('#hb-today .hb-row[data-item="spor"] .hb-joint').classList.contains("is-on")));
    const b = await read();
    const ok =
      a.spor === false && a.kitap === true && JSON.stringify(a.joint) === JSON.stringify(["2026-10-12"]) && a.hearts === 1 &&
      b.spor === true && b.kitap === true && JSON.stringify(b.joint) === JSON.stringify(["2026-10-12", "2026-10-15"]) && b.hearts === 2;
    return { ok, detail: JSON.stringify({ a, b }) };
  });

  // ── Düzenli uyku on a weekend ──────────────────────────────────────────────────────────────
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
      JSON.stringify(sat) === JSON.stringify(["spor", "kitap", "muzik", "yuruyus", "su"]) &&
      !satSheet.includes("uyku") && satSheet.length === 5 && friSheet.includes("uyku") && friSheet.length === 6;
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
      lockedPartner: document.querySelector('#habits-day-modal [data-item="su"][data-person="furkan"]').getAttribute("aria-disabled"),
    }));
    const before = JSON.stringify(await page.stubDb());
    await tapIn(page, '#habits-day-modal [data-item="su"][data-person="furkan"]');
    await sleep(200);
    const untouched = before === JSON.stringify(await page.stubDb());
    await tapIn(page, '#habits-day-modal [data-item="muzik"][data-person="meryem"]');
    const on = await until(() => page.eval(() => document.querySelector('#habits-day-modal [data-item="muzik"][data-person="meryem"]').classList.contains("is-on")));
    const db = await page.stubDb();
    const doc = (db[MONTHS] || {})["2026-10"];
    const log = Object.values(db[LOG] || {});
    const cell = await page.eval(() => document.querySelector('#hb-month .hb-day[data-day="2026-10-12"]').dataset.pm);
    await page.eval(() => closeModal("habits-day-modal"));
    const ok =
      head.title === "12 Ekim Pazartesi" && JSON.stringify(head.groups) === JSON.stringify(["Birlikte", "Meryem", "Furkan"]) &&
      JSON.stringify(head.rows) === JSON.stringify(["spor", "kitap", "muzik", "yuruyus", "su", "uyku"]) && head.lockedPartner === "true" && untouched &&
      on && doc.days["2026-10-12"].muzik.meryem === true && !doc.days["2026-10-15"] && log.length === 1 && log[0].day === "2026-10-12" && log[0].month === "2026-10" && log[0].by === "meryem" &&
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
        rowMeryem: '#hb-today .hb-row[data-item="muzik"] .hb-row-label', nameMeryem: '#hb-today .hb-row[data-item="muzik"] .hb-box-name',
        rowFurkan: '#hb-today .hb-row[data-item="su"] .hb-row-label', nameFurkan: '#hb-today .hb-row[data-item="su"] .hb-box-name',
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
    // on each of 10 days plus Düzenli uyku on the 8 weekdays = 38 due, 8 ticked = 21.05; Meryem 0/40; Birlikte 0/20.
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
      lead.text === "Önde: Meryem (+6 puan)" && lead.who === "meryem" &&
      tie.text === "Başa baş 💞" /* textOf collapses the no-break space to a plain one */ && tie.who === "tie" &&
      nothing === "" && noLeader === "" && roundedTie === "Başa baş\u00a0💞" && furkanLead === "Önde: Furkan (+13 puan)";
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
      JSON.stringify(past) === JSON.stringify([["meryem", "longest", 0, "0 gün en uzun seri"], ["furkan", "longest", 2, "🔥 2 gün en uzun seri"]]);
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
    // by hand (15 Oct): spor 80 / 73, kitap 100 / 100, muzik 80, yuruyus 20, su 33, uyku 45
    const hand = JSON.stringify(rows.map((r) => r[2])) === JSON.stringify(["%80", "%73", "%100", "%100", "%80", "%20", "%33", "%45"]);
    // nothing due: Su içme starting after today shows a dash and an empty bar
    await page.eval(() => { CONFIG.habits.find((h) => h.id === "su").since = "2026-10-16"; window.habitsCore.render(); });
    const dash = (await read()).find((r) => r[0] === "su");
    const ok = same && hand && dash && dash[2] === "—" && /^0(%|px)?$/.test(dash[3]);
    return { ok: !!ok, detail: JSON.stringify({ rows: rows.map((r) => r.slice(0, 3).join(":")), dash }) };
  });


  // ── Takip starts on 7 October (the shipped config, habitsSince: null = no test seam) ────────
  await check(N_SINCE, async () => {
    await open(page, "2026-10-09T12:00:00", { habitsSince: null });
    const since = await page.eval(() => CONFIG.habits.map((h) => [h.id, h.since]));
    const ids = ["spor", "kitap", "muzik", "yuruyus", "su", "uyku"];
    const ok = since.length === 6 && ids.every((id, i) => since[i][0] === id && since[i][1] === "2026-10-07");
    return { ok, detail: JSON.stringify(since) };
  });

  await check(N_WEEK1, async () => {
    // Ticks on 1-6 October must count nowhere. By hand, today = Fri 9 Oct, so 7, 8 and 9 Oct are the due days
    // (all weekdays, so Düzenli uyku is due on each): Furkan 4 boxes x 3 days = 12, Meryem 4 x 3 = 12.
    //   Furkan  spor 5,8  kitap 6,8  su 7,9  uyku 8   -> counted spor8 kitap8 su7+9 uyku8 = 5/12 = 41.7 -> 42
    //   Meryem  spor 5,8  kitap 6,8,9  muzik 7,8,9  yuruyus 1,9 -> counted 1 + 2 + 3 + 1 = 7/12 = 58.3 -> 58
    //   Birlikte (spor and kitap, 3 days = 6 item-days): spor 8 both, kitap 8 both, kitap 9 Meryem only, rest no = 2/6 = 33.3 -> 33
    //   7 Oct: Meryem muzik = 1/4 = 25, Furkan su = 1/4 = 25
    //   8 Oct: Meryem spor kitap muzik = 3/4 = 75, Furkan spor kitap uyku = 3/4 = 75
    //   9 Oct: Meryem kitap muzik yuruyus = 3/4 = 75, Furkan su = 1/4 = 25
    const OCT = mk("2026-10", [
      ["spor", "furkan", [5, 8]], ["kitap", "furkan", [6, 8]], ["su", "furkan", [7, 9]], ["uyku", "furkan", [8]],
      ["spor", "meryem", [5, 8]], ["kitap", "meryem", [6, 8, 9]], ["muzik", "meryem", [7, 8, 9]], ["yuruyus", "meryem", [1, 9]],
    ]);
    const extra = { habitsSince: null, habits: { months: { "2026-10": OCT } } };
    await openTakip(page, "2026-10-09T12:00:00", "meryem", extra);
    const due = [];
    for (const d of ["2026-10-05", "2026-10-06", "2026-10-07"]) due.push(await core(page, "isDue", I("spor"), T(d), T("2026-10-09")));
    const cell = (day) => page.eval((k) => { const e = document.querySelector('#hb-month .hb-day[data-day="' + k + '"]'); return e ? [e.dataset.pm, e.dataset.pf] : null; }, day);
    const cells = {};
    for (let d = 1; d <= 9; d++) cells[d] = await cell("2026-10-0" + d);
    const tiles = await tilesOf(page);
    const cards = [tiles.meryem && tiles.meryem.num, tiles.furkan && tiles.furkan.num, tiles.together && tiles.together.num];
    const blankDays = [1, 2, 3, 4, 5, 6].every((d) => cells[d] && cells[d][0] === "" && cells[d][1] === "");
    // the October report, read on 1 Nov (days 7-31 due = 25). By hand: Furkan due 25 x 3 + 18 weekdays (7,8,9,12-16,19-23,26-30) = 93,
    // counted 5 -> 5.38 -> %5; Meryem 4 x 25 = 100, counted 7 -> %7; lead +2; best item Müzik pratiği 3/25 = 12 -> %12.
    await openTakip(page, "2026-11-01T08:00:00", "meryem", extra);
    await goPrev(page);
    const rep = await page.eval(() => {
      const tx = (s) => { const e = document.querySelector(s); return e ? e.textContent.replace(/\s+/g, " ").trim() : null; };
      const r = document.querySelector("#hb-report .hb-report");
      return { month: r ? r.dataset.month : null, lead: tx("#hb-report .hb-report-lead"), best: tx("#hb-report .hb-report-best") };
    });
    const repOk = rep.month === "2026-10" && rep.lead === "Önde: Meryem (+2 puan)" && rep.best === "En düzenli görev: Müzik pratiği (%12)";
    const ok = JSON.stringify(due) === "[false,false,true]" && blankDays
      && JSON.stringify(cells[7]) === '["25","25"]' && JSON.stringify(cells[8]) === '["75","75"]' && JSON.stringify(cells[9]) === '["75","25"]'
      && JSON.stringify(cards) === '["%58","%42","%33"]' && repOk;
    return { ok, detail: JSON.stringify({ due, cells, cards, rep }) };
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
    // by hand, October 2026 with every day due: Meryem 44/124 = 35.48 (card 35), Furkan 39/115 = 33.91 (card 34) -> the cards differ by +1;
    // best item Kitap 31/62 = 50; joint days 1-10 = 10; longest streaks Furkan 1-5 = 5, Meryem 1-3 = 3.
    // Closing line: pool[(2026*12 + 10) % pool.length], so the same month always says the same thing.
    const closeWant = past.pool[(2026 * 12 + 10) % past.pool.length].replace(/\s+/g, " "); // the card text is read with its no-break space collapsed
    const full =
      past.report && past.month === "2026-10" && past.title === "Ekim karnesi" && past.lead === "Önde: Meryem (+1 puan)" &&
      past.best === "En düzenli görev: Kitap (%50)" && past.joint === "10 gün ikimiz de" &&
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
      byId(collapsed, "b").pending && byId(collapsed, "b").text === "Furkan · Spor ✓ 15 Eki 21:04 kaydediliyor" &&
      byId(collapsed, "e").pending && /kaydediliyor$/.test(byId(collapsed, "e").text) &&
      !byId(collapsed, "a").pending && byId(collapsed, "a").text === "Meryem · Müzik pratiği ✓ 15 Eki 10:00" &&
      /^Furkan · Kitap geri aldı 15 Eki 07:00$/.test(byId(collapsed, "f").text) &&
      byId(open, "g").text === "Furkan · Spor ✓ 14 Eki 22:10";
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
        fresh && /^Meryem · Spor ✓ 10 Kas 12:0\d$/.test(fresh.text) && !fresh.pending,
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

  // ══ Stage 6: fixes from the two verifiers ═════════════════════════════════════════════════════
  // ── N1: a streak older than the previous month, on a fresh load ──────────────────────────────
  // Every item ticked by its owners on every day (a weekend tick of Düzenli uyku is ignored, which is
  // harmless: it is not due then). Perfect from 1 Oct 2026.
  const perfectMonth = (month, lastDay) => {
    const last = lastDay || new Date(+month.slice(0, 4), +month.slice(5, 7), 0).getDate();
    const d = range(1, last);
    return mk(month, [["spor", "furkan", d], ["spor", "meryem", d], ["kitap", "furkan", d], ["kitap", "meryem", d], ["muzik", "meryem", d], ["yuruyus", "meryem", d], ["su", "furkan", d], ["uyku", "furkan", d]]);
  };
  const streakNumbers = (p) => p.eval(() => [...document.querySelectorAll("#hb-stats .hb-streak")].map((e) => [e.dataset.person, e.dataset.kind, +e.dataset.n, e.textContent.replace(/\s+/g, " ").trim()]));
  await check(N_LONGSTREAK, async () => {
    // A) today Fri 1 Jan 2027 09:00, October-December perfect, today still open:
    //    31 (Oct) + 30 (Nov) + 31 (Dec) = 92. The two listened months (Nov, Dec) alone give 61.
    const A = { "2026-10": perfectMonth("2026-10"), "2026-11": perfectMonth("2026-11"), "2026-12": perfectMonth("2026-12") };
    await openTakip(page, "2027-01-01T09:00:00", "meryem", { habits: { months: A } });
    const a = await until(async () => { const r = await streakNumbers(page); return r.length === 2 && r.every((x) => x[2] === 92) ? r : null; });
    // B) today Mon 1 Mar 2027 09:00, October through 1 March perfect (today ticked too):
    //    Oct 31 + Nov 30 + Dec 31 + Jan 31 + Feb 28 + 1 Mar = 152. Only Feb and Mar are listened to: 29.
    const B = { ...A, "2027-01": perfectMonth("2027-01"), "2027-02": perfectMonth("2027-02"), "2027-03": perfectMonth("2027-03", 1) };
    await openTakip(page, "2027-03-01T09:00:00", "meryem", { habits: { months: B } });
    const b = await until(async () => { const r = await streakNumbers(page); return r.length === 2 && r.every((x) => x[2] === 152) ? r : null; });
    const ok = !!a && !!b && a.every((x) => x[1] === "current" && /92 gün/.test(x[3])) && b.every((x) => x[1] === "current" && /152 gün/.test(x[3]));
    return { ok, detail: JSON.stringify({ a: a || (await streakNumbers(page)), b }) };
  });

  // ── N2: the lead line is the difference of the two numbers the cards show ───────────────────
  await check(N_LEADSHOWN, async () => {
    const synth = (m, f, leader) => core(page, "leadLine", { started: true, leader, people: { meryem: { pct: m }, furkan: { pct: f } } });
    // by hand: 77.6 / 37.4 print 78 and 37, the cards differ by 41 (the unrounded gap 40.2 would say 40).
    const wide = await synth(77.6, 37.4, "meryem");
    // 80.6 / 80.4 print 81 and 80: +1, not "Başa baş" (the unrounded gap 0.2 would round to 0).
    const one = await synth(80.6, 80.4, "meryem");
    // 12.5 / 50 print 13 and 50: +37 (the unrounded gap 37.5 would say 38).
    const half = await synth(12.5, 50, "furkan");
    // 70.4 / 69.6 print 70 and 70: a tie although the unrounded gap is 0.8.
    const tie = await synth(70.4, 69.6, "meryem");
    // on the screen: the line's number is the difference of the two tiles.
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: { "2026-10": M1 } } });
    const dom = await page.eval(() => {
      const t = (k) => +document.querySelector(`#hb-stats .hb-stat[data-kind="${k}"]`).dataset.pct;
      const lead = document.querySelector("#hb-stats .hb-lead");
      return { m: t("meryem"), f: t("furkan"), n: +(/\+(\d+)/.exec(lead.textContent) || [0, -1])[1] };
    });
    const num = (s) => +(/\+(\d+)/.exec(s) || [0, -1])[1];
    const ok = num(wide) === 41 && num(one) === 1 && !/Başa baş/.test(one) && num(half) === 37 && /Furkan/.test(half) && /Başa baş/.test(tie) && dom.n === Math.abs(dom.m - dom.f);
    return { ok, detail: JSON.stringify({ wide, one, half, tie, dom }) };
  });

  // ── N3: two quick taps before the snapshot echo ──────────────────────────────────────────────
  await check(N_DOUBLETAP, async () => {
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: {} } });
    await page.eval(() => { window.__STUB_ECHO_DELAY_MS = 700; });
    const sel = slot("spor", "meryem");
    await page.eval((s) => document.querySelector(s).scrollIntoView({ block: "center" }), sel);
    await sleep(80);
    await page.tap(sel);
    await page.tap(sel); // the snapshot of the first tap is still on its way
    const shownBetween = await page.eval((s) => document.querySelector(s).classList.contains("is-on"), sel);
    await until(async () => (await stateOf(page)).pending === 0, 3000);
    await sleep(200);
    const db = await page.stubDb();
    const box = (((db[MONTHS] || {})["2026-10"] || {}).days || {})["2026-10-15"];
    const log = Object.values(db[LOG] || {}).map((x) => x.value);
    const shownAfter = await page.eval((s) => document.querySelector(s).classList.contains("is-on"), sel);
    const st = await stateOf(page);
    await page.eval(() => { window.__STUB_ECHO_DELAY_MS = 0; });
    return {
      ok: box && box.spor.meryem === false && JSON.stringify(log) === JSON.stringify([true, false]) && shownBetween === false && shownAfter === false && st.pending === 0,
      detail: JSON.stringify({ box, log, shownBetween, shownAfter, pending: st.pending }),
    };
  });

  // ── layout (stage 6), read from the painted page ─────────────────────────────────────────────
  const LOGZ = [...LOG8, logEntry("z", { item: "su", person: "meryem", value: false, at: null, atLocal: LE(15, 21, 30) })];
  const openFull = (vp, now, extra) => openTakip(page, now || "2026-10-15T12:00:00", "meryem", { viewport: vp, habits: { months: { "2026-10": M1 }, log: LOGZ }, ...(extra || {}) });
  const settleLog = async () => { await until(async () => (await logRows(page)).length > 0); await sleep(250); };

  await check(N_GAPS, async () => {
    const notes = [];
    let ok = true;
    for (const vp of [{ width: 360, height: 780 }, { width: 390, height: 844 }]) {
      await openFull(vp);
      await settleLog();
      const gaps = await page.eval(() => {
        const cards = [...document.querySelectorAll("#habits-root .card")].filter((c) => c.getBoundingClientRect().height > 0);
        const out = [];
        for (let i = 1; i < cards.length; i++) out.push([cards[i - 1].className.split(" ")[1] || "card", cards[i].className.split(" ")[1] || "card", +(cards[i].getBoundingClientRect().top - cards[i - 1].getBoundingClientRect().bottom).toFixed(2)]);
        return out;
      });
      // today, month, stats, daily, bars, mom, teaser, log: seven gaps, each 16 px (a measured 14-18 passes)
      if (gaps.length < 7 || gaps.some((g) => g[2] < 14 || g[2] > 18)) ok = false;
      notes.push([vp.width, gaps.map((g) => `${g[0]}>${g[1]}:${g[2]}`).join(" ")]);
    }
    return { ok, detail: JSON.stringify(notes) };
  });

  await check(N_LOGLAYOUT, async () => {
    await openFull({ width: 360, height: 780 });
    await settleLog();
    await tapIn(page, "#hb-log .hb-log-toggle"); // every row, the pending ones included
    const rows = await page.eval(() => [...document.querySelectorAll("#hb-log .hb-log-row")].map((r) => {
      const top = (s) => { const e = r.querySelector(s); return e ? e.getBoundingClientRect().top : null; };
      const what = r.querySelector(".hb-log-what");
      const firstLine = what.getClientRects()[0].top;
      const pill = r.querySelector(".hb-log-pending");
      const when = r.querySelector(".hb-log-when");
      return {
        id: r.dataset.id, text: r.textContent, pill: pill ? pill.getBoundingClientRect().top : null, when: when.getBoundingClientRect().top,
        sepAligned: Math.abs(r.querySelector(".hb-log-sep").getBoundingClientRect().top - firstLine) < 3,
        whenBelowMain: when.getBoundingClientRect().top > r.querySelector(".hb-log-main").getBoundingClientRect().bottom - 1,
        pillH: pill ? pill.getBoundingClientRect().height : null, whenH: when.getBoundingClientRect().height,
        seps: r.querySelectorAll(".hb-log-sep").length, top: top(".hb-log-who"),
      };
    }));
    const pills = rows.filter((x) => x.pill !== null);
    const ok = rows.length === 9 && pills.length === 3 && pills.every((x) => Math.abs(x.pill - x.when) < 0.6 && Math.abs(x.pillH - x.whenH) < 0.6) &&
      rows.every((x) => x.sepAligned && x.whenBelowMain && !/✗/.test(x.text) && x.seps === 1);
    return { ok, detail: JSON.stringify(rows.map((x) => [x.id, x.pill, x.when, x.sepAligned, x.whenBelowMain])) };
  });

  await check(N_SCORELINE, async () => {
    await openFull({ width: 360, height: 780 }, "2026-11-20T12:00:00");
    await settleLog();
    await goPrev(page);
    const got = await page.eval(() => {
      const spans = [...document.querySelectorAll("#hb-report .hb-report-scores .hb-nw")];
      return spans.map((s) => ({ t: s.textContent, lines: s.getClientRects().length, ws: getComputedStyle(s).whiteSpace }));
    });
    const best = await textOf(page, "#hb-report .hb-report-best");
    return { ok: got.length === 3 && got.every((x) => x.lines === 1 && x.ws === "nowrap" && /^\S+ %\d+$/.test(x.t)) && /^En düzenli görev: [^()]*\(%\d+\)$/.test(best), detail: JSON.stringify({ got, best }) };
  });

  await check(N_STREAKTILE, async () => {
    await openTakip(page, "2026-11-02T10:00:00", "furkan", { viewport: { width: 360, height: 780 }, habits: { months: { "2026-10": octS, "2026-11": novFull } } });
    await until(() => page.eval(() => !!window.habitsCore.state().monthsData["2026-10"]));
    await page.eval(() => window.habitsCore.render());
    const read = () => page.eval(() => [...document.querySelectorAll("#hb-stats .hb-stat")].filter((t) => t.querySelector(".hb-streak")).map((t) => {
      const n = t.querySelector(".hb-streak-n");
      const l = t.querySelector(".hb-streak-label");
      return { n: n.textContent, label: l.textContent, w: +t.getBoundingClientRect().width.toFixed(1), nLines: n.getClientRects().length, lLines: l.getClientRects().length, stacked: l.getBoundingClientRect().top >= n.getBoundingClientRect().bottom - 1, inside: l.getBoundingClientRect().right <= t.getBoundingClientRect().right && n.getBoundingClientRect().right <= t.getBoundingClientRect().right };
    }));
    const now = await read();
    await goPrev(page);
    const past = await read();
    // 2 Nov: Meryem 1 day, Furkan 4 days -> flames; October's longest for Meryem is 0 -> no flame
    const ok =
      now.length === 2 && now.every((x) => x.nLines === 1 && x.lLines === 1 && x.stacked && x.inside && x.w > 90 && x.w < 110) && now[0].n === "🔥 1 gün" && now[1].n === "🔥 4 gün" &&
      past[0].n === "0 gün" && !/🔥/.test(past[0].n) && past[1].n === "🔥 2 gün" && past.every((x) => x.nLines === 1 && x.lLines === 1 && x.stacked && x.inside);
    return { ok, detail: JSON.stringify({ now, past }) };
  });

  await check(N_BOTTOM, async () => {
    const notes = [];
    let ok = true;
    for (const w of [360, 390, 412]) {
      await openFull({ width: w, height: 780 });
      await settleLog();
      const m = await page.eval(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const last = [...document.querySelectorAll("#habits-root .card")].filter((c) => c.getBoundingClientRect().height > 0).pop().getBoundingClientRect();
        const b = document.querySelector(".nav-gift-bubble").getBoundingClientRect();
        // the raised circle is 52 px wide with a 4 px ring, centred on the 22 px icon box (css/style.css)
        const ringTop = b.top + b.height / 2 - 26 - 4;
        return { cardBottom: +last.bottom.toFixed(1), ringTop: +ringTop.toFixed(1), clear: +(ringTop - last.bottom).toFixed(1) };
      });
      if (m.clear < 16) ok = false;
      notes.push([w, m.clear]);
    }
    return { ok, detail: JSON.stringify(notes) };
  });

  await check(N_MOMCUE, async () => {
    await openTakip(page, "2027-05-10T12:00:00", "meryem", { viewport: { width: 360, height: 780 }, habits: { months: MOM_MONTHS } });
    await until(() => page.eval(() => document.querySelectorAll("#hb-mom .hb-mbar").length >= 12));
    const long = await page.eval(() => { const e = document.querySelector("#hb-mom .hb-mom-scroll"); return { scroll: e.classList.contains("is-scroll"), bg: getComputedStyle(e).backgroundImage }; });
    await openTakip(page, "2027-01-10T12:00:00", "meryem", { viewport: { width: 360, height: 780 }, habits: { months: MOM_MONTHS } });
    await until(() => page.eval(() => document.querySelectorAll("#hb-mom .hb-mbar").length >= 12));
    const short = await page.eval(() => { const e = document.querySelector("#hb-mom .hb-mom-scroll"); return { scroll: e.classList.contains("is-scroll"), bg: getComputedStyle(e).backgroundImage }; });
    return { ok: long.scroll && /gradient/.test(long.bg) && !short.scroll && short.bg === "none", detail: JSON.stringify({ long: long.bg.slice(0, 80), short }) };
  });

  await check(N_LEGENDGAP, async () => {
    const notes = [];
    let ok = true;
    for (const w of [360, 390]) {
      await openTakip(page, "2027-01-10T12:00:00", "meryem", { viewport: { width: w, height: 780 }, habits: { months: MOM_MONTHS } });
      await until(() => page.eval(() => document.querySelectorAll("#hb-mom .hb-mbar").length >= 12));
      const gaps = await page.eval(() => [...document.querySelectorAll("#habits-root .hb-leg")].map((l) => {
        const mark = l.firstElementChild;
        // the painted edge of the mark: an svg's own drawing (its path, circle or rect), not its box
        const parts = mark.tagName.toLowerCase() === "svg" ? [...mark.children] : [mark];
        const right = Math.max(...parts.map((p) => p.getBoundingClientRect().right));
        const text = [...l.childNodes].filter((n) => n.nodeType === 3).pop();
        const r = document.createRange();
        r.selectNodeContents(text);
        return +(r.getBoundingClientRect().left - right).toFixed(2);
      }));
      // calendar legend 3 + daily legend 2 + month-over-month legend 3; the marks differ in shape,
      // so the gaps agree to 1.3 px (the widened heart used to leave a 2 px larger gap)
      if (gaps.length !== 8 || Math.max(...gaps) - Math.min(...gaps) > 1.3) ok = false;
      notes.push([w, gaps.join(",")]);
    }
    return { ok, detail: JSON.stringify(notes) };
  });

  await check(N_LOCKEDTICK, async () => {
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: { "2026-10": { days: { "2026-10-15": { spor: { furkan: true, meryem: true }, kitap: { meryem: true } } } } } } });
    const got = await page.eval(() => {
      const parse = window.__app.parse;
      const pick = (p, item) => {
        const b = document.querySelector(`#hb-today .hb-heart[data-item="${item}"][data-person="${p}"]`);
        const cs = getComputedStyle(b);
        const shape = getComputedStyle(b.querySelector(".hb-heart-shape"));
        const check = getComputedStyle(b.querySelector(".hb-heart-check"));
        const name = b.parentElement.querySelector(".hb-box-name");
        return { on: b.classList.contains("is-on"), locked: b.classList.contains("is-locked"), bg: cs.backgroundColor, fill: shape.fill, checkStroke: check.stroke, checkOpacity: check.opacity, nameContrast: +window.__app.readable(name).toFixed(2),
          checkVsShape: parse(shape.fill) ? +window.__app.contrast(parse(check.stroke), parse(shape.fill)).toFixed(2) : 0 };
      };
      return { own: pick("meryem", "spor"), ownOff: pick("meryem", "muzik"), partner: pick("furkan", "spor"), partnerOff: pick("furkan", "kitap") };
    });
    const { own, ownOff, partner, partnerOff } = got;
    // yours: a solid disc with a white heart; the partner's: the same pale disc as an empty partner box,
    // with a coloured heart inside - so a partner tick never looks like one of your own
    const ok = own.on && !own.locked && partner.on && partner.locked && own.bg !== ownOff.bg && partner.bg === partnerOff.bg && partner.fill !== partnerOff.fill && partner.checkOpacity === "1" && partner.checkVsShape >= 3 && partner.nameContrast >= 4.5;
    return { ok, detail: JSON.stringify(got) };
  });

  await check(N_SHEETSTICKY, async () => {
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { viewport: { width: 390, height: 520 }, habits: { months: { "2026-10": M1 } } });
    await tapIn(page, '#hb-month .hb-day[data-day="2026-10-12"]');
    await sleep(350);
    const info = await page.eval(() => {
      const modal = document.querySelector("#habits-day-modal .modal");
      const before = { scrolls: modal.scrollHeight > modal.clientHeight + 40 };
      modal.scrollTop = modal.scrollHeight;
      const m = modal.getBoundingClientRect();
      const h = document.querySelector("#habits-day-modal .modal-header").getBoundingClientRect();
      const c = document.querySelector("#habits-day-modal .modal-close").getBoundingClientRect();
      const t = document.getElementById("habits-day-title").getBoundingClientRect();
      return { ...before, scrollTop: modal.scrollTop, modalTop: m.top, headerTop: h.top, closeIn: c.top >= m.top - 0.5 && c.bottom <= m.bottom, titleIn: t.top >= m.top - 0.5 && t.bottom <= m.bottom };
    });
    const closes = await page.eval(() => { document.querySelector("#habits-day-modal .modal-close").click(); return !document.getElementById("habits-day-modal").classList.contains("open"); });
    return { ok: info.scrolls && info.scrollTop > 20 && Math.abs(info.headerTop - info.modalTop) < 1.5 && info.closeIn && info.titleIn && closes, detail: JSON.stringify(info) };
  });

  await check(N_TARGETS, async () => {
    const notes = [];
    let ok = true;
    const disabled = [];
    for (const w of [360, 390, 412]) {
      await openFull({ width: w, height: 780 });
      await settleLog();
      await tapIn(page, '#hb-month .hb-day[data-day="2026-10-12"]');
      await sleep(350);
      const small = await page.eval(() => {
        const out = [];
        const sel = "#habits-view button, #habits-view [role=button], #habits-view a[href], #habits-day-modal button, #habits-day-modal [role=button]";
        document.querySelectorAll(sel).forEach((e) => {
          const r = e.getBoundingClientRect();
          if (r.width === 0 || r.height === 0) return;
          const tag = e.tagName.toLowerCase() + "." + String(e.className).split(" ")[0] + (e.dataset.act ? "[" + e.dataset.act + "]" : "");
          if (r.width < 43.99 || r.height < 43.99) out.push([tag, +r.width.toFixed(2), +r.height.toFixed(2), e.disabled === true]);
        });
        return { small: out, total: document.querySelectorAll(sel).length };
      });
      small.small.filter((x) => x[3]).forEach((x) => disabled.push([w, x[0]]));
      if (small.small.some((x) => !x[3]) || small.total < 30) ok = false;
      notes.push([w, small.total, small.small]);
      await page.eval(() => closeModal("habits-day-modal"));
    }
    return { ok, detail: JSON.stringify({ notes, disabled }) };
  });

  // ── final judge's fixes (stage 7) ────────────────────────────────────────────────────────────
  const toasts = (p) => p.eval(() => window.__toastLog.slice());
  const JUNK = '"><b id="pwn">x</b><i class="';

  await check(N_JUNKLOG, async () => {
    const log = [
      logEntry("ok1", { item: "muzik", person: "meryem", by: "meryem", at: { __ts: LE(15, 10, 0) }, atLocal: LE(15, 10, 0) }),
      { id: "j1", month: "2026-10", day: "2026-10-15", item: "spor", person: JUNK, by: JUNK, value: true, at: null, atLocal: "2026-10-15T09:00:00.000Z" },
      { id: "j2", month: "2026-10", day: "2026-10-15", item: { x: 1 }, person: "constructor", by: "constructor", value: "yes", at: "notatimestamp", atLocal: 1e20 },
      { id: "j3", month: "2026-10", day: "2026-10-15", item: "kitap", person: "toString", by: 7, value: true, at: { __ts: LE(15, 9, 30) }, atLocal: LE(15, 9, 30) },
    ];
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: { "2026-10": M1 }, log } });
    await until(async () => (await logRows(page)).length >= 4);
    await sleep(200);
    const got = await page.eval(() => {
      const rows = [...document.querySelectorAll("#hb-log .hb-log-row")];
      const byId = (id) => rows.find((r) => r.dataset.id === id);
      const info = (r) => r && ({ cls: r.className, dots: r.querySelectorAll(".hb-dot").length, text: r.textContent.replace(/\s+/g, " ").trim() });
      return {
        pwn: !!document.getElementById("pwn"),
        injected: document.querySelectorAll("#hb-log b, #hb-log i:not(.hb-dot)").length,
        rows: rows.length,
        ok1: info(byId("ok1")), j1: info(byId("j1")), j2: info(byId("j2")), j3: info(byId("j3")),
        logText: document.getElementById("hb-log").textContent,
        stats: !!document.querySelector("#hb-stats .hb-stat"),
      };
    });
    const neutral = (r) => r && r.dots === 0 && /\bhb-p-none\b/.test(r.cls) && !/hb-p-(meryem|furkan|together)/.test(r.cls);
    const ok =
      !got.pwn && got.injected === 0 && got.rows === 4 && !/function|Object|undefined|NaN/.test(got.logText) &&
      got.ok1.dots === 1 && /hb-p-meryem/.test(got.ok1.cls) && /^Meryem · Müzik pratiği ✓/.test(got.ok1.text) &&
      neutral(got.j1) && neutral(got.j2) && neutral(got.j3) && got.stats && page.errors.length === 0;
    return { ok, detail: JSON.stringify({ ...got, logText: undefined, errors: page.errors.slice(0, 3) }).slice(0, 900) };
  });

  await check(N_LOGFAIL, async () => {
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: {} } });
    // 1. the log write is refused, the month write lands: the tick is saved, so no toast and no undo
    await page.eval(() => { window.__STUB_REJECT = { habitLog: true }; });
    await tapIn(page, slot("spor", "meryem"));
    await sleep(400);
    let db = await page.stubDb();
    const box1 = (((db[MONTHS] || {})["2026-10"] || {}).days || {})["2026-10-15"];
    const logged1 = Object.keys(db[LOG] || {}).length;
    const t1 = await toasts(page);
    const lit1 = await page.eval((s) => document.querySelector(s).classList.contains("is-on"), slot("spor", "meryem"));
    const st1 = await stateOf(page);
    // 2. the month write is refused: the toast, the pending tap cleared, the heart shows what is stored
    await page.eval(() => { window.__STUB_REJECT = { habitMonths: true }; });
    await tapIn(page, slot("kitap", "meryem"));
    await sleep(400);
    db = await page.stubDb();
    const box2 = (((db[MONTHS] || {})["2026-10"] || {}).days || {})["2026-10-15"];
    const t2 = await toasts(page);
    const lit2 = await page.eval((s) => document.querySelector(s).classList.contains("is-on"), slot("kitap", "meryem"));
    const st2 = await stateOf(page);
    const msg = await page.eval(() => CONTENT.habits.saveError);
    const ok =
      box1 && box1.spor && box1.spor.meryem === true && logged1 === 0 && t1.length === 0 && lit1 === true && st1.pending === 0 &&
      box2 && !box2.kitap && t2.length === 1 && t2[0] === msg && lit2 === false && st2.pending === 0;
    return { ok, detail: JSON.stringify({ box1, logged1, t1, lit1, p1: st1.pending, box2, t2, lit2, p2: st2.pending }) };
  });

  await check(N_LISTENFAIL, async () => {
    const msg = "Kayıtlara ulaşamadık, sayfayı yenileyelim 💗";
    const runs = [];
    let ok = true;
    for (const [label, fail] of [["none", {}], ["month document", { "habitMonths/2026-10": true }], ["all months", { habitMonths: true }], ["log", { habitLog: true }], ["all three", { "habitMonths/2026-10": true, habitMonths: true, habitLog: true }]]) {
      await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: { "2026-10": M1 }, log: LOG8 }, stubFlags: { __STUB_FAIL_LISTEN: fail } });
      await sleep(500);
      const t = await toasts(page);
      const logged = page.errors.filter((e) => /habit listener failed/.test(e)).length;
      const want = label === "none" ? 0 : 1;
      if (t.length !== want || (want === 1 && t[0] !== msg) || (want === 1 && logged < 1) || (want === 0 && page.errors.length !== 0)) ok = false;
      runs.push([label, t.length, logged]);
    }
    return { ok, detail: JSON.stringify(runs) };
  });

  await check(N_PILL, async () => {
    const seedLog = [logEntry("old", { item: "kitap", at: { __ts: LE(15, 8, 0) }, atLocal: LE(15, 8, 0) })];
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: {}, log: seedLog } });
    await until(async () => (await logRows(page)).length === 1);
    // online: the tick echoes back with its server time; the row never carries the pill
    await tapIn(page, slot("spor", "meryem"));
    await until(async () => (await logRows(page)).length === 2);
    await sleep(500);
    const online = await logRows(page);
    // offline: the write stays pending - the pill shows and the row still sorts by its (estimated) time
    await page.eval(() => { window.__STUB_OFFLINE = true; });
    await tapIn(page, slot("muzik", "meryem"));
    await until(async () => (await logRows(page)).length === 3);
    await sleep(300);
    const offline = await logRows(page);
    // back online: the server time arrives, the pill goes, the order stays
    await page.eval(() => { window.__STUB_OFFLINE = false; window.__STUB_FLUSH(); });
    await sleep(500);
    const after = await logRows(page);
    const ids = (rows) => rows.map((r) => r.id);
    const ok =
      online.length === 2 && online.every((r) => !r.pending) && !/kaydediliyor/.test(online[0].text) &&
      offline.length === 3 && offline[0].pending && /kaydediliyor$/.test(offline[0].text) && /Müzik pratiği/.test(offline[0].text) && offline.slice(1).every((r) => !r.pending) &&
      after.length === 3 && after.every((r) => !r.pending) && JSON.stringify(ids(after)) === JSON.stringify(ids(offline)) &&
      offline[0].text.includes("15 Eki 12:");
    return { ok, detail: JSON.stringify({ online, offline, after }).slice(0, 900) };
  });

  await check(N_PREVIEW, async () => {
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { query: "?onizleme=dogumgunu", habits: { months: { "2026-10": M1 } } });
    const sel = slot("spor", "meryem");
    const has = await page.eval((s) => !!document.querySelector(s), sel);
    // the rehearsal's gate overlay covers the page, so the tap is delivered to the heart itself
    if (has) await page.eval((s) => document.querySelector(s).click(), sel);
    await sleep(400);
    const db = await page.stubDb();
    const t = await toasts(page);
    const st = await stateOf(page);
    const msg = await page.eval(() => CONTENT.habits.previewNote);
    const monthDocs = Object.keys(db[MONTHS] || {});
    const logged = Object.keys(db[LOG] || {}).length;
    const same = JSON.stringify((db[MONTHS] || {})["2026-10"]) === JSON.stringify(M1);
    return { ok: has && JSON.stringify(monthDocs) === JSON.stringify(["2026-10"]) && same && logged === 0 && st.pending === 0 && t.length === 1 && t[0] === msg, detail: JSON.stringify({ has, monthDocs, same, logged, pending: st.pending, t }) };
  });

  // ── copy (stage 6) ───────────────────────────────────────────────────────────────────────────
  await check(N_COPY, async () => {
    await openTakip(page, "2026-10-15T12:00:00", "meryem", { habits: { months: { "2026-10": M1 } } });
    const read = await page.eval(() => ({
      pool: CONTENT.habits.report.closing,
      title: document.querySelector("#hb-stats .hb-daily .hb-title").textContent,
      aria: document.querySelector("#hb-stats .hb-daily-svg").getAttribute("aria-label"),
      bars: document.querySelector("#hb-stats .hb-bars .hb-title").textContent,
    }));
    // a write that fails: the toast says what to do, and the box does not stay lit
    await page.eval(() => { window.setHabitTick = () => Promise.reject(new Error("offline")); });
    const sel = slot("yuruyus", "meryem");
    await tapIn(page, sel);
    await until(() => page.eval(() => !!document.querySelector(".toast")), 2000);
    const toast = await page.eval(() => (document.querySelector(".toast") || {}).textContent || null);
    await sleep(150);
    const lit = await page.eval((s) => document.querySelector(s).classList.contains("is-on"), sel);
    const st = await stateOf(page);
    const joined = read.pool.join(" | ");
    const ok =
      read.pool.includes("Gelecek ay da devam\u00a0💪") && read.pool.includes("Bir ay daha geride kaldı\u00a0👏") && !/harika bir ay|devaam/i.test(joined) &&
      read.title === "Gün gün" && /^Gün gün, ayın/.test(read.aria) && read.bars === "Görev görev" &&
      toast === "Kaydedemedik, bir daha dokunalım 💗" && lit === false && st.pending === 0;
    return { ok, detail: JSON.stringify({ title: read.title, aria: read.aria.slice(0, 30), toast, lit, pending: st.pending }) };
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
    // One item's start date back on 1 October: its early ticks count again, and the shipped-config checks see it.
    id: "habits-since-back-to-oct-1",
    file: "js/data.js",
    find: "id: 'spor', label: 'Spor', owners: ['furkan', 'meryem'], weekdaysOnly: false, since: '2026-10-07'",
    replace: "id: 'spor', label: 'Spor', owners: ['furkan', 'meryem'], weekdaysOnly: false, since: '2026-10-01'",
    expect: N_SINCE,
  },
  {
    id: "habits-since-back-to-oct-1-week",
    file: "js/data.js",
    find: "id: 'spor', label: 'Spor', owners: ['furkan', 'meryem'], weekdaysOnly: false, since: '2026-10-07'",
    replace: "id: 'spor', label: 'Spor', owners: ['furkan', 'meryem'], weekdaysOnly: false, since: '2026-10-01'",
    expect: N_WEEK1,
  },
  {
    // The start date moved a day later: 7 October is closed again, and the shipped-config check sees it.
    id: "habits-since-pushed-to-oct-8",
    file: "js/data.js",
    find: "id: 'spor', label: 'Spor', owners: ['furkan', 'meryem'], weekdaysOnly: false, since: '2026-10-07'",
    replace: "id: 'spor', label: 'Spor', owners: ['furkan', 'meryem'], weekdaysOnly: false, since: '2026-10-08'",
    expect: N_SINCE,
  },
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
    replace: "    items = items.filter(function (x) { return !x.pendingWrites; });\n    items.sort(function (a, b) { return habitLogMillis(b) - habitLogMillis(a); });\n",
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
    find: "    return tickedOn(item, key, 'furkan') && tickedOn(item, key, 'meryem');",
    replace: "    return tickedOn(item, key, 'furkan') || tickedOn(item, key, 'meryem');",
    expect: N_HEART,
  },
  {
    id: "habits-streak-fed-only-the-listened-months",
    file: "js/habits.js",
    find: "n: currentStreak(person, streakMonths(), now)",
    replace: "n: currentStreak(person, state.monthsData, now)",
    expect: N_LONGSTREAK,
  },
  {
    id: "habits-lead-gap-from-unrounded-percentages",
    file: "js/habits.js",
    find: "    var gap = Math.abs(shownM - shownF);\n",
    replace: "    var gap = roundPct(Math.abs(s.people.meryem.pct - s.people.furkan.pct));\n",
    expect: N_LEADSHOWN,
  },
  {
    id: "habits-stats-cards-touch",
    file: "css/habits.css",
    find: "#hb-stats {\n  display: flex;",
    replace: "#hb-stats {\n  display: block;",
    expect: N_GAPS,
  },
  {
    id: "habits-log-row-back-to-one-line",
    file: "css/habits.css",
    find: ".hb-log-row {\n  padding: 8px 0;",
    replace: ".hb-log-row {\n  display: flex;\n  flex-wrap: wrap;\n  align-items: baseline;\n  padding: 8px 0;",
    expect: N_LOGLAYOUT,
  },
  {
    id: "habits-log-pill-taller-than-the-time",
    file: "css/habits.css",
    find: "  padding: 0 8px;\n  line-height: 20px;",
    replace: "  padding: 0 8px;\n  line-height: 32px;",
    expect: N_LOGLAYOUT,
  },
  {
    id: "habits-log-undo-keeps-the-cross",
    file: "js/habits.js",
    find: "(entry.value ? '✓' : escapeHtml(c.undone))",
    replace: "(entry.value ? '✓' : '✗ ' + escapeHtml(c.undone))",
    expect: N_LOGLAYOUT,
  },
  {
    id: "habits-score-line-wraps-inside-a-name",
    file: "css/habits.css",
    find: ".hb-nw {\n  white-space: nowrap;",
    replace: ".hb-nw {\n  white-space: normal;",
    expect: N_SCORELINE,
  },
  {
    id: "habits-report-best-uses-the-long-label",
    file: "js/habits.js",
    find: "item: shortLabel(s.bestItem.id)",
    replace: "item: s.bestItem.label",
    expect: N_SCORELINE,
  },
  {
    id: "habits-flame-on-a-zero-streak",
    file: "js/habits.js",
    find: "(st.n > 0 ? '🔥 ' : '')",
    replace: "'🔥 '",
    expect: N_STREAKTILE,
  },
  {
    id: "habits-streak-label-runs-on-with-the-number",
    file: "css/habits.css",
    find: ".hb-stat-sub {\n  display: flex;\n  flex-direction: column;",
    replace: ".hb-stat-sub {\n  display: block;\n  flex-direction: column;",
    expect: N_STREAKTILE,
  },
  {
    id: "habits-no-room-below-the-last-card",
    file: "css/habits.css",
    find: "  padding-bottom: calc(var(--nav-h) + 24px);",
    replace: "  padding-bottom: var(--nav-h);",
    expect: N_BOTTOM,
  },
  {
    id: "habits-month-strip-cue-on-a-short-strip",
    file: "css/habits.css",
    find: ".hb-mom-scroll {\n  overflow-x: visible;",
    replace: ".hb-mom-scroll {\n  background: linear-gradient(red, red);\n  overflow-x: visible;",
    expect: N_MOMCUE,
  },
  {
    id: "habits-month-strip-without-a-cue",
    file: "css/habits.css",
    find: "  background:\n    linear-gradient(to right, var(--paper) 30%",
    replace: "  background: none;\n  --cue-off:\n    linear-gradient(to right, var(--paper) 30%",
    expect: N_MOMCUE,
  },
  {
    id: "habits-legend-heart-stretched",
    file: "css/habits.css",
    find: ".hb-legend--chart .hb-stat-heart {\n  width: 12px;\n  height: 12px;",
    replace: ".hb-legend--chart .hb-stat-heart {\n  width: 24px;\n  height: 11px;",
    expect: N_LEGENDGAP,
  },
  {
    id: "habits-locked-tick-looks-like-your-own",
    file: "css/habits.css",
    find: ".hb-heart.is-locked.is-on {\n  background: var(--hb-t);",
    replace: ".hb-heart.is-locked.is-on {\n  background: var(--hb-c);",
    expect: N_LOCKEDTICK,
  },
  {
    id: "habits-sheet-header-scrolls-away",
    file: "css/habits.css",
    find: "  position: sticky;\n  top: -24px;",
    replace: "  position: static;\n  top: -24px;",
    expect: N_SHEETSTICKY,
  },
  {
    id: "habits-change-link-small-again",
    file: "css/habits.css",
    find: "  min-height: 44px;\n  min-width: 44px;\n  border: none;",
    replace: "  min-height: 0;\n  min-width: 0;\n  border: none;",
    expect: N_TARGETS,
  },
  {
    id: "habits-sheet-close-small-again",
    file: "css/habits.css",
    find: "  width: 44px;\n  height: 44px;\n  margin: -10px -14px -10px 0;",
    replace: "  width: auto;\n  height: auto;\n  margin: 0;",
    expect: N_TARGETS,
  },
  {
    id: "habits-calendar-days-narrow-at-360",
    file: "css/habits.css",
    find: "  .hb-wrap {\n    padding: 12px 5px;",
    replace: "  .hb-wrap {\n    padding: 12px 12px;",
    expect: N_TARGETS,
  },
  {
    id: "habits-copy-next-month-wording",
    file: "js/content.js",
    find: "'Gelecek ay da devam\\u00a0💪'",
    replace: "'Gelecek ay da devaam\\u00a0💪'",
    expect: N_COPY,
  },
  {
    id: "habits-copy-claims-a-good-month",
    file: "js/content.js",
    find: "'Bir ay daha geride kaldı\\u00a0👏'",
    replace: "'Harika bir ay oldu 👏'",
    expect: N_COPY,
  },
  {
    id: "habits-copy-save-error-old-words",
    file: "js/content.js",
    find: "bir daha dokunalım\\u00a0💗",
    replace: "bir daha dokun\\u00a0💗",
    expect: N_COPY,
  },
  {
    id: "habits-copy-daily-title-old-words",
    file: "js/content.js",
    find: "title: 'Gün gün',",
    replace: "title: 'Günlük gidiş',",
    expect: N_COPY,
  },
  {
    id: "habits-copy-daily-aria-old-words",
    file: "js/content.js",
    find: "aria: 'Gün gün, ayın",
    replace: "aria: 'Günlük gidiş, ayın",
    expect: N_COPY,
  },
  {
    id: "habits-copy-pending-old-word",
    file: "js/content.js",
    find: "pending: 'kaydediliyor'",
    replace: "pending: 'bekliyor'",
    expect: N_LOGVIEW,
  },
  {
    id: "habits-copy-lead-says-this-month",
    file: "js/content.js",
    find: "lead: 'Önde: {name}",
    replace: "lead: 'Bu ay önde: {name}",
    expect: N_LEAD,
  },
  {
    id: "habits-failed-save-leaves-the-box-lit",
    file: "js/habits.js",
    find: "      delete pending[pendingKey];\n      renderAll();\n",
    replace: "",
    expect: N_COPY,
  },
  {
    id: "habits-next-tap-read-from-the-snapshot",
    file: "js/habits.js",
    find: "    var value = !tickedOn(item, key, person);\n",
    replace: "    var value = !isTicked(monthDataOf(key), key, item, person);\n",
    expect: N_DOUBLETAP,
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
    replace: "    var rows = state.log.filter(function (x) { return !x.pendingWrites; });\n",
    expect: N_LOGVIEW,
  },
  {
    id: "habits-month-over-month-misses-the-first-month",
    file: "js/habits.js",
    find: "    var list = shownMonths(now);\n",
    replace: "    var list = shownMonths(now).slice(1);\n",
    expect: N_MOM,
  },
  {
    id: "habits-log-row-by-falls-back-to-raw-person",
    file: "js/habits.js",
    find: "    var by = isPerson(entry.by) ? entry.by : (isPerson(entry.person) ? entry.person : null);\n",
    replace: "    var by = isPerson(entry.by) ? entry.by : entry.person;\n",
    expect: N_JUNKLOG,
  },
  {
    id: "habits-log-write-failure-toasts-again",
    file: "js/habits.js",
    find: ".catch(logFailed);\n",
    replace: ".catch(monthFailed);\n",
    expect: N_LOGFAIL,
  },
  {
    id: "habits-month-listener-has-no-error-callback",
    file: "js/firebase.js",
    find: "    cb(snap && snap.exists ? snap.data() : {});\n  }, habitListenError);\n",
    replace: "    cb(snap && snap.exists ? snap.data() : {});\n  });\n",
    expect: N_LISTENFAIL,
  },
  {
    id: "habits-all-months-listener-has-no-error-callback",
    file: "js/firebase.js",
    find: "    cb(months);\n  }, habitListenError);\n",
    replace: "    cb(months);\n  });\n",
    expect: N_LISTENFAIL,
  },
  {
    id: "habits-log-listener-has-no-error-callback",
    file: "js/firebase.js",
    find: "    cb(items);\n  }, habitListenError);\n",
    replace: "    cb(items);\n  });\n",
    expect: N_LISTENFAIL,
  },
  {
    id: "habits-pill-keyed-on-empty-server-time",
    file: "js/habits.js",
    find: "    var pending = entry.pendingWrites === true;\n",
    replace: "    var pending = !entry.at;\n",
    expect: N_PILL,
  },
  {
    id: "habits-preview-mode-tick-written",
    file: "js/habits.js",
    find: "    if (isPreviewMode()) {\n      if (typeof showToast === 'function') showToast(copy().previewNote);\n      return;\n    }\n",
    replace: "",
    expect: N_PREVIEW,
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
