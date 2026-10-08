/**
 * Meryem App — Takip (the couple's daily habit tracker)
 *
 * Stage 2 of the build: the numbers and the data wiring. No DOM yet.
 *
 * TEST SEAM: every pure function below is exposed as `window.habitsCore` so the suite
 * (tests/checks/habits.mjs) can call it on fixed dates with hand-computed expectations. The
 * screens of the later stages read ONLY `monthSummary()` for cards, charts and the report card.
 *
 * Data shape (js/firebase.js): a month document `habitMonths/{YYYY-MM}` holds
 *   { days: { 'YYYY-MM-DD': { <itemId>: { furkan: true|false, meryem: true|false } } } }
 * The list of habits is CONFIG.habits (js/data.js). All dates here are LOCAL calendar days; "now"
 * is always appNow() (js/time.js), never the raw Date.
 *
 * Definitions (the plan's, kept in one place):
 *   - an item is DUE on a day when the day is not after today, falls inside the item's
 *     since/until, and (weekdaysOnly items) is Monday-Friday. Ticks on days that are not due —
 *     in the future, on a weekend for a weekdays-only item — never count anywhere;
 *   - item % = ticked due days / due days; person % = all of that person's due boxes;
 *     Birlikte % = joint item-days where BOTH ticked / joint item-days due. Every percentage is
 *     null (not 0) while nothing is due yet;
 *   - a day is COMPLETE for a person when every box due that day is ticked. The current streak
 *     counts complete days backwards from today across month boundaries; today still being open
 *     does not break it (a missed earlier day does). The longest streak is within one month.
 */
(function () {
  'use strict';

  var PEOPLE = ['furkan', 'meryem'];

  /* ── Dates ─────────────────────────────────────────────────────────────── */

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /** The app's clock — the single place this module reads "now". */
  function nowDate() {
    return appNow();
  }

  /** @returns {string} 'YYYY-MM-DD' of a local date */
  function dayKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1) + '-' + pad2(date.getDate());
  }

  /** @returns {string} 'YYYY-MM' of a local date */
  function monthKey(date) {
    return date.getFullYear() + '-' + pad2(date.getMonth() + 1);
  }

  function parseMonth(mk) {
    var p = String(mk).split('-');
    return { year: parseInt(p[0], 10), month: parseInt(p[1], 10) };
  }

  function daysInMonth(mk) {
    var m = parseMonth(mk);
    return new Date(m.year, m.month, 0).getDate();
  }

  function prevMonth(mk) {
    var m = parseMonth(mk);
    return m.month === 1 ? (m.year - 1) + '-12' : m.year + '-' + pad2(m.month - 1);
  }

  function nextMonth(mk) {
    var m = parseMonth(mk);
    return m.month === 12 ? (m.year + 1) + '-01' : m.year + '-' + pad2(m.month + 1);
  }

  /** Every month from `start` ('YYYY-MM') to the month of `now`, oldest first; [] when `now`
      is before `start`. Months therefore exist by themselves as the calendar moves on. */
  function monthsFrom(start, now) {
    var end = monthKey(now);
    var out = [];
    var cur = start;
    while (cur <= end) {
      out.push(cur);
      cur = nextMonth(cur);
    }
    return out;
  }

  function dayKeyOf(mk, day) {
    return mk + '-' + pad2(day);
  }

  function dowOf(mk, day) {
    var m = parseMonth(mk);
    return new Date(m.year, m.month - 1, day).getDay();
  }

  /* ── Due / ticked ──────────────────────────────────────────────────────── */

  function dueOnKey(item, key, dow, todayKey) {
    if (key > todayKey) return false;
    if (item.since && key < item.since) return false;
    if (item.until && key > item.until) return false;
    if (item.weekdaysOnly && (dow === 0 || dow === 6)) return false;
    return true;
  }

  /**
   * @param {Object} item  a CONFIG.habits entry
   * @param {Date} date    the day asked about
   * @param {Date} today   appNow() (or a fixed date in tests)
   * @returns {boolean}
   */
  function isDue(item, date, today) {
    return dueOnKey(item, dayKey(date), date.getDay(), dayKey(today));
  }

  /**
   * @param {Object} monthData  the month document's data ({days: …}) or {}
   * @param {string} day        'YYYY-MM-DD'
   * @param {Object|string} item  a habit or its id
   * @param {string} person     'furkan' | 'meryem'
   */
  function isTicked(monthData, day, item, person) {
    var id = item && item.id ? item.id : item;
    var d = monthData && monthData.days && monthData.days[day];
    var it = d && d[id];
    return !!(it && it[person] === true);
  }

  function owns(item, person) {
    return item.owners.indexOf(person) !== -1;
  }

  function isJoint(item) {
    return owns(item, 'furkan') && owns(item, 'meryem');
  }

  function bothTicked(monthData, key, item) {
    return isTicked(monthData, key, item, 'furkan') && isTicked(monthData, key, item, 'meryem');
  }

  function percentOf(c) {
    return c.due === 0 ? null : c.done * 100 / c.due;
  }

  /* ── Counts → percentages ──────────────────────────────────────────────── */

  function itemCounts(item, person, month, monthData, today) {
    var c = { due: 0, done: 0 };
    if (!owns(item, person)) return c;
    var todayKey = dayKey(today);
    var n = daysInMonth(month);
    for (var d = 1; d <= n; d++) {
      var key = dayKeyOf(month, d);
      if (!dueOnKey(item, key, dowOf(month, d), todayKey)) continue;
      c.due++;
      if (isTicked(monthData, key, item, person)) c.done++;
    }
    return c;
  }

  function personCounts(person, month, monthData, today) {
    var c = { due: 0, done: 0 };
    CONFIG.habits.forEach(function (item) {
      var ic = itemCounts(item, person, month, monthData, today);
      c.due += ic.due;
      c.done += ic.done;
    });
    return c;
  }

  function jointCounts(month, monthData, today) {
    var c = { due: 0, done: 0 };
    var todayKey = dayKey(today);
    var n = daysInMonth(month);
    CONFIG.habits.forEach(function (item) {
      if (!isJoint(item)) return;
      for (var d = 1; d <= n; d++) {
        var key = dayKeyOf(month, d);
        if (!dueOnKey(item, key, dowOf(month, d), todayKey)) continue;
        c.due++;
        if (bothTicked(monthData, key, item)) c.done++;
      }
    });
    return c;
  }

  /** @returns {number|null} 0-100, or null when the item is not the person's or nothing is due */
  function itemPercent(item, person, month, monthData, today) {
    return percentOf(itemCounts(item, person, month, monthData, today));
  }

  function personPercent(person, month, monthData, today) {
    var c = personCounts(person, month, monthData, today);
    return percentOf(c);
  }

  function birliktePercent(month, monthData, today) {
    return percentOf(jointCounts(month, monthData, today));
  }

  /* ── Days and streaks ──────────────────────────────────────────────────── */

  /** The person's boxes on one day: how many are due and how many of those are ticked. */
  function dayBoxes(person, key, dow, monthData, todayKey) {
    var c = { due: 0, done: 0 };
    CONFIG.habits.forEach(function (item) {
      if (!owns(item, person)) return;
      if (!dueOnKey(item, key, dow, todayKey)) return;
      c.due++;
      if (isTicked(monthData, key, item, person)) c.done++;
    });
    return c;
  }

  /**
   * Consecutive complete days up to today, across month boundaries.
   * @param {string} person
   * @param {Object} monthsData  { 'YYYY-MM': monthData } — must hold every month the streak may reach
   * @param {Date} today
   */
  function currentStreak(person, monthsData, today) {
    var all = monthsData || {};
    var todayKey = dayKey(today);
    var startKey = CONFIG.habitsStart + '-01';
    var cursor = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    var streak = 0;
    for (var guard = 0; guard < 4000; guard++) {
      var keyStr = dayKey(cursor);
      if (keyStr < startKey) break;
      var b = dayBoxes(person, keyStr, cursor.getDay(), all[keyStr.slice(0, 7)], todayKey);
      if (b.due > 0) {
        if (b.done === b.due) streak++;
        else if (keyStr !== todayKey) break;
      }
      cursor.setDate(cursor.getDate() - 1);
    }
    return streak;
  }

  /** Longest run of complete days inside one month (days after today are not looked at). */
  function longestStreak(person, month, monthData, today) {
    var todayKey = dayKey(today);
    var n = daysInMonth(month);
    var run = 0;
    var best = 0;
    for (var d = 1; d <= n; d++) {
      var key = dayKeyOf(month, d);
      if (key > todayKey) break;
      var b = dayBoxes(person, key, dowOf(month, d), monthData, todayKey);
      if (b.due === 0) continue;
      if (b.done === b.due) {
        run++;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    return best;
  }

  /* ── Everything the cards, charts and report card need ─────────────────── */

  /**
   * @returns {{
   *   month: string, days: number, started: boolean,
   *   people: {furkan: {pct, due, done, longest}, meryem: {pct, due, done, longest}},
   *   birlikte: {pct, due, done}, jointDays: number,
   *   items: Array<{id, label, owners, furkan: number|null, meryem: number|null, pct: number|null}>,
   *   perDay: Array<{n: number, key: string, furkan: number|null, meryem: number|null}>,
   *   leader: 'furkan'|'meryem'|'tie'|null,
   *   bestItem: {id, label, pct}|null
   * }}
   */
  function monthSummary(month, monthData, today) {
    var todayKey = dayKey(today);
    var n = daysInMonth(month);
    var out = {
      month: month, days: n, started: false,
      people: {}, birlikte: null, jointDays: 0,
      items: [], perDay: [], leader: null, bestItem: null
    };

    var counts = {};
    PEOPLE.forEach(function (p) {
      var c = personCounts(p, month, monthData, today);
      counts[p] = c;
      out.people[p] = { pct: percentOf(c), due: c.due, done: c.done, longest: longestStreak(p, month, monthData, today) };
      if (c.due > 0) out.started = true;
    });

    var jc = jointCounts(month, monthData, today);
    out.birlikte = { pct: percentOf(jc), due: jc.due, done: jc.done };

    CONFIG.habits.forEach(function (item) {
      var row = { id: item.id, label: item.label, owners: item.owners.slice(), furkan: null, meryem: null, pct: null };
      var due = 0;
      var done = 0;
      PEOPLE.forEach(function (p) {
        var ic = itemCounts(item, p, month, monthData, today);
        row[p] = percentOf(ic);
        due += ic.due;
        done += ic.done;
      });
      row.pct = percentOf({ due: due, done: done });
      out.items.push(row);
      if (row.pct !== null && (out.bestItem === null || row.pct > out.bestItem.pct)) {
        out.bestItem = { id: item.id, label: item.label, pct: row.pct };
      }
    });

    var joint = CONFIG.habits.filter(isJoint);
    for (var d = 1; d <= n; d++) {
      var key = dayKeyOf(month, d);
      var dow = dowOf(month, d);
      var rec = { n: d, key: key, furkan: null, meryem: null };
      PEOPLE.forEach(function (p) {
        rec[p] = percentOf(dayBoxes(p, key, dow, monthData, todayKey));
      });
      out.perDay.push(rec);

      var jointDue = 0;
      var jointBoth = 0;
      joint.forEach(function (item) {
        if (!dueOnKey(item, key, dow, todayKey)) return;
        jointDue++;
        if (bothTicked(monthData, key, item)) jointBoth++;
      });
      if (jointDue > 0 && jointBoth === jointDue) out.jointDays++;
    }

    var f = counts.furkan;
    var m = counts.meryem;
    if (f.due > 0 && m.due > 0) {
      var a = f.done * m.due;
      var b = m.done * f.due;
      out.leader = a === b ? 'tie' : (a > b ? 'furkan' : 'meryem');
    }
    return out;
  }

  /* ── Live state, subscription and the day boundary ─────────────────────── */

  var state = { day: null, month: null, data: {}, monthsData: {}, unsub: null };
  var _initialized = false;

  function subscribeMonth(mk) {
    if (state.unsub) {
      try { state.unsub(); } catch (e) { /* already gone */ }
      state.unsub = null;
    }
    state.data = state.monthsData[mk] || {};
    if (typeof subscribeHabitMonth !== 'function') return;
    state.unsub = subscribeHabitMonth(mk, function (data) {
      state.monthsData[mk] = data || {};
      if (mk === state.month) state.data = state.monthsData[mk];
    });
  }

  /**
   * Re-reads appNow(). When the day or the month key moved on, re-subscribes (month changes
   * only — the subscription is per month) and announces it on `document`.
   * @returns {boolean} true when the day changed
   */
  function checkDay() {
    var now = nowDate();
    var d = dayKey(now);
    var m = monthKey(now);
    if (d === state.day && m === state.month) return false;
    var monthChanged = m !== state.month;
    state.day = d;
    state.month = m;
    if (monthChanged) subscribeMonth(m);
    document.dispatchEvent(new CustomEvent('meryem:habits-day', { detail: { day: d, month: m } }));
    return true;
  }

  /**
   * Starts the live month subscription and the day-boundary watch (a minute timer plus
   * `visibilitychange`, so a phone waking up after midnight catches up at once). Idempotent.
   */
  function initHabits() {
    if (_initialized) return;
    _initialized = true;

    var now = nowDate();
    state.day = dayKey(now);
    state.month = monthKey(now);
    subscribeMonth(state.month);

    /* window.__HABITS_TICK_MS is a test seam only: the suite shortens the minute so a midnight
       roll-over can be watched in seconds. Absent in production. */
    var tickMs = (typeof window.__HABITS_TICK_MS === 'number' && window.__HABITS_TICK_MS > 0) ? window.__HABITS_TICK_MS : 60000;
    setInterval(checkDay, tickMs);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkDay();
    });
  }

  /* ── Contract ──────────────────────────────────────────────────────────── */

  /* Called by js/app.js's initFeatures() dispatcher. */
  window.initHabits = initHabits;

  /* The test seam described in the header. */
  window.habitsCore = {
    dayKey: dayKey, monthKey: monthKey, daysInMonth: daysInMonth,
    prevMonth: prevMonth, nextMonth: nextMonth, monthsFrom: monthsFrom,
    isDue: isDue, isTicked: isTicked,
    itemPercent: itemPercent, personPercent: personPercent, birliktePercent: birliktePercent,
    currentStreak: currentStreak, longestStreak: longestStreak,
    monthSummary: monthSummary,
    checkDay: checkDay,
    state: function () {
      return { day: state.day, month: state.month, data: state.data, monthsData: state.monthsData };
    }
  };
})();
