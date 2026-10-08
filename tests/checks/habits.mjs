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

const N_WEEKDAY = "habits: Erken çıkış is due Monday to Friday only and a weekend tick never counts";
const N_FUTURE = "habits: a tick dated after today never counts, in any number";
const N_JOINT = "habits: Birlikte counts a joint item-day only when both ticked";
const N_PERSON = "habits: person percentages are per person (15 Oct)";
const N_STREAK = "habits: the current streak runs across the month boundary (30 Oct to 2 Nov)";
const N_APPNOW = "habits: the tracked month follows appNow() (rehearsal clock), not the raw Date";
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
    const ls = (await listeners(page)).filter((l) => l.startsWith(MONTHS));
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
    const subs = (await listeners(page)).filter((l) => l.startsWith(MONTHS));
    return { ok: st.month === "2027-10" && st.day === "2027-10-04" && JSON.stringify(subs) === JSON.stringify([`${MONTHS}/2027-10`]), detail: JSON.stringify({ month: st.month, day: st.day, subs }) };
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
  const lsBefore = (await listeners(page)).filter((l) => l.startsWith(MONTHS));
  await page.advanceClock(60000); // 23:59:30 -> 00:00:30 on 1 Nov
  const fired = await until(async () => (await events()).length > 0);
  await sleep(1000);
  const evs = await events();
  const after = await stateOf(page);
  const lsAfter = (await listeners(page)).filter((l) => l.startsWith(MONTHS));

  await check("habits: nothing fires while the day is unchanged", () => ({ ok: quiet.length === 0 && before.month === "2026-10" && before.day === "2026-10-31", detail: JSON.stringify({ quiet, before: before.day }) }));

  await check("habits: midnight with the app open fires meryem:habits-day once with the new day and month", () => ({
    ok: fired && evs.length === 1 && evs[0].day === "2026-11-01" && evs[0].month === "2026-11" && after.day === "2026-11-01" && after.month === "2026-11",
    detail: JSON.stringify({ evs, after: { day: after.day, month: after.month } }),
  }));

  await check("habits: at the month change the subscription moves to the new month and its data replaces the old", () => ({
    ok: JSON.stringify(lsBefore) === JSON.stringify([`${MONTHS}/2026-10`]) && JSON.stringify(lsAfter) === JSON.stringify([`${MONTHS}/2026-11`]) &&
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
  const ls3 = (await listeners(page)).filter((l) => l.startsWith(MONTHS));
  await check("habits: a day change inside the month fires the event and keeps the month subscription", () => ({
    ok: dayFired && evs3.length === 1 && evs3[0].day === "2026-10-15" && evs3[0].month === "2026-10" && JSON.stringify(ls3) === JSON.stringify([`${MONTHS}/2026-10`]),
    detail: JSON.stringify({ evs3, ls3 }),
  }));
}

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
];
