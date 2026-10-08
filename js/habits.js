/**
 * Meryem App — Takip (the couple's daily habit tracker)
 *
 * Stages 2 and 3 of the build: the numbers and the data wiring (stage 2), then the screens -
 * "Ben kimim?", today's panel, the month page with its calendar and the day sheet (stage 3,
 * last section of this file).
 *
 * TEST SEAM: every pure function below is exposed as `window.habitsCore` so the suite
 * (tests/checks/habits.mjs) can call it on fixed dates with hand-computed expectations. The
 * screens read ONLY `monthSummary()` for the calendar rings (and the later cards, charts and the
 * report card will too).
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
   *   perDay: Array<{n: number, key: string, furkan: number|null, meryem: number|null, joint: boolean}>
   *     (joint = every joint item due that day was ticked by both),
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
      var rec = { n: d, key: key, furkan: null, meryem: null, joint: false };
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
      if (jointDue > 0 && jointBoth === jointDue) {
        out.jointDays++;
        rec.joint = true;
      }
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

  /* `month` is the current month, `view` the month the month page shows when it is NOT the
     current one (null = follow the current month, also across midnight on the 1st). */
  var state = { day: null, month: null, data: {}, monthsData: {}, view: null, me: null, choosing: false };
  var subs = {};
  var _initialized = false;

  /** The month the month page shows. */
  function viewedMonth() {
    return state.view || state.month;
  }

  /** The months that must be subscribed: the current month and its previous one (a current
      streak crosses the 1st), and the same pair for the viewed month. A previous month before
      CONFIG.habitsStart is never subscribed - nothing was tracked there. */
  function wantedMonths() {
    var want = [];
    function add(mk) {
      if (mk && want.indexOf(mk) === -1) want.push(mk);
    }
    function addWithPrevious(mk) {
      add(mk);
      var prev = prevMonth(mk);
      if (prev >= CONFIG.habitsStart) add(prev);
    }
    addWithPrevious(state.month);
    if (state.view) addWithPrevious(state.view);
    return want;
  }

  /** Opens the listeners that are missing and closes the ones no longer wanted, so switching
      months back and forth never leaves a listener behind. */
  function syncSubscriptions() {
    var want = wantedMonths();
    Object.keys(subs).forEach(function (mk) {
      if (want.indexOf(mk) !== -1) return;
      try { subs[mk](); } catch (e) { /* already gone */ }
      delete subs[mk];
    });
    state.data = state.monthsData[state.month] || {};
    if (typeof subscribeHabitMonth !== 'function') return;
    want.forEach(function (mk) {
      if (subs[mk]) return;
      subs[mk] = subscribeHabitMonth(mk, function (data) {
        state.monthsData[mk] = data || {};
        if (mk === state.month) state.data = state.monthsData[mk];
        renderAll();
      });
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
    if (monthChanged) {
      if (state.view === m) state.view = null;
      syncSubscriptions();
    }
    document.dispatchEvent(new CustomEvent('meryem:habits-day', { detail: { day: d, month: m } }));
    renderAll();
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
    state.me = readMe();
    wireUi();
    syncSubscriptions();
    renderAll();

    /* window.__HABITS_TICK_MS is a test seam only: the suite shortens the minute so a midnight
       roll-over can be watched in seconds. Absent in production. */
    var tickMs = (typeof window.__HABITS_TICK_MS === 'number' && window.__HABITS_TICK_MS > 0) ? window.__HABITS_TICK_MS : 60000;
    setInterval(checkDay, tickMs);
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible') checkDay();
    });
  }

  /* ── Screens: identity, today's panel, month page, day sheet ───────────── */

  /* Stage 3. Every string comes from CONTENT.habits (js/content.js), every date from appNow().
     The screens never draw from a local guess: a tick is WRITTEN, and the boxes change when the
     month document's snapshot comes back (the same way the to-do list in js/daily.js works). */

  var ME_KEY = 'meryem-habits-me';
  var HEART_D = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';
  var LOCK_D = 'M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z';
  var RING_R = 7.5;
  var RING_LEN = 2 * Math.PI * RING_R;
  var shown = { top: null, today: null, month: null, sheet: null };

  function copy() {
    return CONTENT.habits;
  }

  function fmt(text, values) {
    return String(text).replace(/\{(\w+)\}/g, function (all, key) {
      return values && values[key] != null ? values[key] : '';
    });
  }

  function nameOf(person) {
    return CONFIG.people[person];
  }

  function readMe() {
    var v = storageGet(ME_KEY);
    return v === 'furkan' || v === 'meryem' ? v : null;
  }

  /** Your own boxes are tappable, the partner's are shown and locked. */
  function canTick(person) {
    return person === state.me;
  }

  function dateOf(key) {
    return new Date(parseInt(key.slice(0, 4), 10), parseInt(key.slice(5, 7), 10) - 1, parseInt(key.slice(8, 10), 10));
  }

  function monthDataOf(key) {
    return state.monthsData[key.slice(0, 7)] || {};
  }

  function tickedOn(item, key, person) {
    return isTicked(monthDataOf(key), key, item, person);
  }

  /** The joint heart: lit only when BOTH of them ticked. */
  function bothOn(item, key) {
    var md = monthDataOf(key);
    return isTicked(md, key, item, 'furkan') && isTicked(md, key, item, 'meryem');
  }

  function dueItems(key, now) {
    var d = dateOf(key);
    return CONFIG.habits.filter(function (item) { return isDue(item, d, now); });
  }

  function groupOf(item) {
    return isJoint(item) ? 'together' : item.owners[0];
  }

  function shownMonths(now) {
    return monthsFrom(CONFIG.habitsStart, now);
  }

  function heartButton(item, person, key) {
    var c = copy();
    var on = tickedOn(item, key, person);
    var can = canTick(person);
    var label = item.label + ' · ' + nameOf(person) + ', ' + (on ? c.aria.done : c.aria.notDone) +
      (can ? '' : ', ' + fmt(c.aria.locked, { name: nameOf(person) }));
    return '<span class="hb-box hb-p-' + person + '">' +
      '<button type="button" class="hb-heart' + (on ? ' is-on' : '') + (can ? '' : ' is-locked') + '"' +
        ' data-item="' + escapeHtml(item.id) + '" data-person="' + person + '" data-day="' + key + '"' +
        ' aria-pressed="' + (on ? 'true' : 'false') + '"' + (can ? '' : ' aria-disabled="true"') +
        ' aria-label="' + escapeHtml(label) + '">' +
        '<svg class="hb-heart-svg" viewBox="0 0 24 24" aria-hidden="true"><path class="hb-heart-shape" d="' + HEART_D + '"/>' +
          '<path class="hb-heart-check" d="M8 12.3l2.7 2.7 5.2-5.6"/></svg>' +
        (can ? '' : '<svg class="hb-lock" viewBox="0 0 24 24" aria-hidden="true"><path d="' + LOCK_D + '"/></svg>') +
      '</button>' +
      '<span class="hb-box-name">' + escapeHtml(nameOf(person)) + '</span>' +
    '</span>';
  }

  function jointBadge(item, key) {
    var c = copy();
    var on = bothOn(item, key);
    return '<span class="hb-joint' + (on ? ' is-on' : '') + '" role="img" aria-label="' + escapeHtml(on ? c.aria.jointOn : c.aria.jointOff) + '">' +
      '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + HEART_D + '"/></svg></span>';
  }

  function rowHtml(item, key, extraClass) {
    var boxes;
    if (isJoint(item)) {
      boxes = heartButton(item, 'meryem', key) + jointBadge(item, key) + heartButton(item, 'furkan', key);
    } else {
      boxes = heartButton(item, item.owners[0], key);
    }
    return '<div class="hb-row hb-g-' + groupOf(item) + (extraClass || '') + '" data-item="' + escapeHtml(item.id) + '">' +
      '<p class="hb-row-label">' + escapeHtml(item.label) + '</p>' +
      '<div class="hb-boxes">' + boxes + '</div>' +
    '</div>';
  }

  function topHtml() {
    var c = copy();
    if (!state.me || state.choosing) {
      return '<div class="card hb-choose">' +
        '<div class="hb-choose-bear">' + bearSVG({ mood: 'happy', arms: 'wave', heart: true, size: 96 }) + '</div>' +
        '<h2 class="hb-choose-title">' + escapeHtml(c.me.title) + '</h2>' +
        '<p class="hb-choose-sub">' + escapeHtml(c.me.sub) + '</p>' +
        '<div class="hb-choose-btns">' +
          '<button type="button" class="hb-choose-btn hb-p-meryem" data-act="choose" data-who="meryem">' + escapeHtml(nameOf('meryem')) + '</button>' +
          '<button type="button" class="hb-choose-btn hb-p-furkan" data-act="choose" data-who="furkan">' + escapeHtml(nameOf('furkan')) + '</button>' +
        '</div>' +
        (state.me ? '<button type="button" class="hb-link" data-act="cancel-choose">' + escapeHtml(c.me.cancel) + '</button>' : '') +
      '</div>';
    }
    return '<p class="hb-me">' + escapeHtml(c.me.line) + ' ' +
      '<strong class="hb-me-name hb-p-' + state.me + '">' + escapeHtml(nameOf(state.me)) + '</strong> · ' +
      '<button type="button" class="hb-link" data-act="change">' + escapeHtml(c.me.change) + '</button></p>';
  }

  function todayHtml(now) {
    var c = copy();
    var key = dayKey(now);
    var rows = dueItems(key, now).map(function (item) { return rowHtml(item, key, ''); }).join('');
    return '<section class="card hb-today">' +
      '<div class="hb-today-head"><h2 class="hb-title">' + escapeHtml(c.today.title) + '</h2>' +
      '<span class="hb-today-date">' + escapeHtml(c.days[now.getDay()] + ', ' + now.getDate() + ' ' + c.months[now.getMonth()]) + '</span></div>' +
      '<p class="hb-hint">' + escapeHtml(c.today.hint) + '</p>' +
      '<div class="hb-rows">' + rows + '</div>' +
    '</section>';
  }

  function ringSvg(person, pct) {
    var len = pct === null ? 0 : Math.max(0, Math.min(100, pct)) * RING_LEN / 100;
    return '<svg class="hb-ring hb-p-' + person + '" viewBox="0 0 20 20" aria-hidden="true">' +
      '<circle class="hb-ring-track" cx="10" cy="10" r="' + RING_R + '"/>' +
      '<circle class="hb-ring-fill" cx="10" cy="10" r="' + RING_R + '" stroke-dasharray="' + len.toFixed(2) + ' ' + RING_LEN.toFixed(2) + '" transform="rotate(-90 10 10)"/>' +
    '</svg>';
  }

  function pctText(p) {
    return p === null ? '' : String(Math.round(p));
  }

  function dayCell(rec, vm, todayKey) {
    var c = copy();
    var key = rec.key;
    var startKey = CONFIG.habitsStart + '-01';
    var tappable = key <= todayKey && key >= startKey;
    var dayName = rec.n + ' ' + c.months[parseInt(vm.slice(5, 7), 10) - 1];
    if (!tappable) {
      return '<div class="hb-day is-future" data-day="' + key + '" aria-disabled="true"><span class="hb-day-n">' + rec.n + '</span></div>';
    }
    var label = rec.meryem === null && rec.furkan === null
      ? dayName
      : fmt(c.aria.day, { day: dayName, m: pctText(rec.meryem), f: pctText(rec.furkan) });
    return '<button type="button" class="hb-day' + (key === todayKey ? ' is-today' : '') + (rec.joint ? ' is-joint' : '') + '"' +
      ' data-day="' + key + '" data-pm="' + pctText(rec.meryem) + '" data-pf="' + pctText(rec.furkan) + '" aria-label="' + escapeHtml(label) + '">' +
      '<span class="hb-day-n">' + rec.n + '</span>' +
      (rec.joint ? '<svg class="hb-day-heart" viewBox="0 0 24 24" aria-hidden="true"><path d="' + HEART_D + '"/></svg>' : '') +
      '<span class="hb-rings">' + ringSvg('meryem', rec.meryem) + ringSvg('furkan', rec.furkan) + '</span>' +
    '</button>';
  }

  function monthHtml(now) {
    var c = copy();
    var months = shownMonths(now);
    if (!months.length) {
      return '<section class="card hb-soon">' +
        '<div class="hb-soon-bear">' + bearSVG({ mood: 'happy', arms: 'wave', size: 84 }) + '</div>' +
        '<h2 class="hb-title">' + escapeHtml(c.notStarted.title) + '</h2>' +
        '<p class="hb-hint">' + escapeHtml(c.notStarted.sub) + '</p>' +
      '</section>';
    }
    var vm = viewedMonth();
    var idx = months.indexOf(vm);
    var todayKey = dayKey(now);
    var summary = monthSummary(vm, state.monthsData[vm] || {}, now);
    var parts = vm.split('-');
    var offset = (dowOf(vm, 1) + 6) % 7;
    var cells = '';
    var i;
    for (i = 0; i < offset; i++) cells += '<span class="hb-day is-blank" aria-hidden="true"></span>';
    summary.perDay.forEach(function (rec) { cells += dayCell(rec, vm, todayKey); });
    var heads = c.dow.map(function (n) { return '<span class="hb-dow">' + escapeHtml(n) + '</span>'; }).join('');
    return '<section class="card hb-month">' +
      '<div class="hb-nav" data-month="' + vm + '">' +
        '<button type="button" class="hb-nav-btn" data-act="prev" aria-label="' + escapeHtml(c.aria.prev) + '"' + (idx <= 0 ? ' disabled' : '') + '>&#8249;</button>' +
        '<h2 class="hb-nav-title">' + escapeHtml(c.months[parseInt(parts[1], 10) - 1] + ' ' + parts[0]) + '</h2>' +
        '<button type="button" class="hb-nav-btn" data-act="next" aria-label="' + escapeHtml(c.aria.next) + '"' + (idx >= months.length - 1 ? ' disabled' : '') + '>&#8250;</button>' +
      '</div>' +
      '<div class="hb-cal">' + heads + cells + '</div>' +
      '<div class="hb-legend">' +
        '<span class="hb-leg hb-p-meryem"><i class="hb-dot"></i>' + escapeHtml(nameOf('meryem')) + '</span>' +
        '<span class="hb-leg hb-p-furkan"><i class="hb-dot"></i>' + escapeHtml(nameOf('furkan')) + '</span>' +
        '<span class="hb-leg hb-leg-joint"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="' + HEART_D + '"/></svg>' + escapeHtml(c.legendJoint) + '</span>' +
      '</div>' +
    '</section>';
  }

  /* ── The day sheet (a bottom sheet on the shared modal shell) ──────────── */

  function sheetEl() {
    return document.getElementById('habits-day-modal');
  }

  function sheetHtml(key, now) {
    var c = copy();
    var items = dueItems(key, now);
    var out = '';
    ['together', 'meryem', 'furkan'].forEach(function (group) {
      var rows = items.filter(function (item) { return groupOf(item) === group; });
      if (!rows.length) return;
      out += '<div class="hb-sheet-group hb-g-' + group + '"><h3 class="hb-group-title">' + escapeHtml(c.groups[group]) + '</h3>' +
        rows.map(function (item) { return rowHtml(item, key, ' hb-row--sheet'); }).join('') + '</div>';
    });
    return out || '<p class="hb-hint">' + escapeHtml(c.sheetEmpty) + '</p>';
  }

  function fillSheet() {
    var modal = sheetEl();
    var content = document.getElementById('habits-day-content');
    var title = document.getElementById('habits-day-title');
    if (!modal || !content || !title) return;
    var key = modal.getAttribute('data-day');
    if (!key) return;
    var c = copy();
    var d = dateOf(key);
    title.textContent = d.getDate() + ' ' + c.months[d.getMonth()] + ' ' + c.days[d.getDay()];
    setRegion('sheet', content, sheetHtml(key, appNow()));
  }

  function renderSheet() {
    var modal = sheetEl();
    if (modal && modal.classList.contains('open')) fillSheet();
  }

  function openSheet(key) {
    var modal = sheetEl();
    if (!modal) return;
    modal.setAttribute('data-day', key);
    shown.sheet = null;
    fillSheet();
    openModal('habits-day-modal');
  }

  /* ── Drawing, clicks and the write path ───────────────────────────────── */

  /** innerHTML only when the markup changed, with keyboard focus put back on the same control. */
  function setRegion(name, el, html) {
    if (shown[name] === html) return;
    var f = document.activeElement;
    var selector = null;
    if (f && f !== document.body && el.contains(f) && f.getAttribute) {
      if (f.getAttribute('data-item')) {
        selector = '[data-item="' + f.getAttribute('data-item') + '"][data-person="' + f.getAttribute('data-person') + '"][data-day="' + f.getAttribute('data-day') + '"]';
      } else if (f.getAttribute('data-act')) {
        selector = '[data-act="' + f.getAttribute('data-act') + '"]';
      } else if (f.getAttribute('data-day')) {
        selector = '[data-day="' + f.getAttribute('data-day') + '"]';
      }
    }
    el.innerHTML = html;
    shown[name] = html;
    if (selector) {
      var again = el.querySelector(selector);
      if (again && typeof again.focus === 'function') again.focus();
    }
  }

  function renderAll() {
    var top = document.getElementById('hb-top');
    var today = document.getElementById('hb-today');
    var month = document.getElementById('hb-month');
    if (!top || !today || !month || !state.month) return;
    var now = nowDate();
    var choosing = !state.me || state.choosing;
    setRegion('top', top, topHtml());
    setRegion('today', today, choosing || !shownMonths(now).length ? '' : todayHtml(now));
    setRegion('month', month, choosing ? '' : monthHtml(now));
    renderSheet();
  }

  /** One tap on one of YOUR boxes: the month document and the log, from the snapshot's value. */
  function tickFrom(btn) {
    var person = btn.getAttribute('data-person');
    var key = btn.getAttribute('data-day');
    var itemId = btn.getAttribute('data-item');
    if (!canTick(person)) return;
    var item = null;
    CONFIG.habits.forEach(function (h) { if (h.id === itemId) item = h; });
    if (!item || !key) return;
    var now = nowDate();
    if (!isDue(item, dateOf(key), now)) return;
    var month = key.slice(0, 7);
    var value = !tickedOn(item, key, person);
    var failed = function () {
      if (typeof showToast === 'function') showToast(copy().saveError);
    };
    if (typeof setHabitTick !== 'function' || typeof addHabitLog !== 'function') return;
    try {
      setHabitTick(month, key, itemId, person, value).catch(failed);
      addHabitLog({ month: month, day: key, item: itemId, person: person, value: value, by: state.me, atLocal: now.toISOString() }).catch(failed);
    } catch (e) {
      failed();
    }
  }

  function shiftMonth(delta) {
    var months = shownMonths(nowDate());
    var target = months[months.indexOf(viewedMonth()) + delta];
    if (!target) return;
    state.view = target === state.month ? null : target;
    syncSubscriptions();
    renderAll();
  }

  function onClick(e) {
    var heart = e.target.closest('.hb-heart');
    if (heart) {
      tickFrom(heart);
      return;
    }
    var act = e.target.closest('[data-act]');
    if (act) {
      var what = act.getAttribute('data-act');
      if (what === 'choose') {
        var who = act.getAttribute('data-who');
        if (who === 'furkan' || who === 'meryem') {
          storageSet(ME_KEY, who);
          state.me = who;
          state.choosing = false;
        }
      } else if (what === 'change') {
        state.choosing = true;
      } else if (what === 'cancel-choose') {
        state.choosing = false;
      } else if (what === 'prev') {
        shiftMonth(-1);
        return;
      } else if (what === 'next') {
        shiftMonth(1);
        return;
      }
      renderAll();
      return;
    }
    var day = e.target.closest('button.hb-day');
    if (day) openSheet(day.getAttribute('data-day'));
  }

  function wireUi() {
    var view = document.getElementById('habits-view');
    var content = document.getElementById('habits-day-content');
    if (view) view.addEventListener('click', onClick);
    if (content) content.addEventListener('click', onClick);
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
      return { day: state.day, month: state.month, data: state.data, monthsData: state.monthsData, view: state.view, me: state.me };
    }
  };
})();
