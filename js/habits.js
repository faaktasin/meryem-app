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
  var state = {
    day: null, month: null, data: {}, monthsData: {}, view: null, me: null, choosing: false,
    allMonths: {}, log: [], logOpen: false, momPinned: true
  };
  var subs = {};
  /* The value a tap INTENDS for a box until a snapshot confirms it: 'day|item|person' -> {day,
     item, person, value}. A second tap before the snapshot arrives reads this, not the stale
     snapshot, so two quick taps write true and then false, never true twice. */
  var pending = {};
  var logSub = { month: null, off: null };
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
    syncLogSubscription();
    if (typeof subscribeHabitMonth !== 'function') return;
    want.forEach(function (mk) {
      if (subs[mk]) return;
      subs[mk] = subscribeHabitMonth(mk, function (data) {
        state.monthsData[mk] = data || {};
        if (mk === state.month) state.data = state.monthsData[mk];
        dropConfirmed(mk);
        renderAll();
      });
    });
  }

  /** A pending tap is forgotten once the month's snapshot shows the value it intended. */
  function dropConfirmed(mk) {
    Object.keys(pending).forEach(function (k) {
      var p = pending[k];
      if (p.day.slice(0, 7) !== mk) return;
      if (isTicked(state.monthsData[mk], p.day, p.item, p.person) === p.value) delete pending[k];
    });
  }

  /** Every month the streak may reach: the all-months listener, with the fresher live month
      documents laid over it (a streak that began months ago must not be cut at the previous
      month). */
  function streakMonths() {
    var out = {};
    Object.keys(state.allMonths).forEach(function (k) { out[k] = state.allMonths[k]; });
    Object.keys(state.monthsData).forEach(function (k) { out[k] = state.monthsData[k]; });
    return out;
  }

  /** The log listener follows the viewed month: the old one is closed before the new one opens,
      so switching months back and forth leaves exactly one behind. */
  function syncLogSubscription() {
    var vm = viewedMonth();
    if (logSub.month === vm) return;
    if (logSub.off) {
      try { logSub.off(); } catch (e) { /* already gone */ }
      logSub.off = null;
    }
    logSub.month = vm;
    state.log = [];
    state.logOpen = false;
    if (typeof subscribeHabitLog !== 'function') return;
    logSub.off = subscribeHabitLog(vm, function (items) {
      if (logSub.month !== vm) return;
      state.log = items || [];
      renderAll();
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
    /* One listener over every month document, for "Aydan aya" - opened once, never per month. */
    if (typeof subscribeHabitMonths === 'function') {
      subscribeHabitMonths(function (months) {
        state.allMonths = months || {};
        renderAll();
      });
    }
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
  var shown = { top: null, today: null, month: null, sheet: null, stats: null, mom: null, report: null, log: null };

  function copy() {
    return CONTENT.habits;
  }

  function fmt(text, values) {
    return String(text).replace(/\{(\w+)\}/g, function (all, key) {
      return values && values[key] != null ? values[key] : '';
    });
  }

  /** True only for the two people of the app. Anything read from storage (a log entry's person or
      by) passes through this before it can reach a class attribute or a name. */
  function isPerson(p) {
    return typeof p === 'string' && PEOPLE.indexOf(p) !== -1;
  }

  /** The person's display name; '' for anything that is not one of the two (an own-property
      check: 'constructor' and 'toString' are not names). */
  function nameOf(person) {
    return isPerson(person) && Object.prototype.hasOwnProperty.call(CONFIG.people, person) ? CONFIG.people[person] : '';
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

  /** What the box shows: the value a tap intends while its snapshot is on the way, else the data. */
  function tickedOn(item, key, person) {
    var p = pending[key + '|' + item.id + '|' + person];
    if (p) return p.value;
    return isTicked(monthDataOf(key), key, item, person);
  }

  /** The joint heart: lit only when BOTH of them ticked. */
  function bothOn(item, key) {
    return tickedOn(item, key, 'furkan') && tickedOn(item, key, 'meryem');
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

  /** The ONE place a percentage is rounded for display: cards, charts, calendar and report. */
  function roundPct(p) {
    return Math.round(p);
  }

  function pctText(p) {
    return p === null ? '' : String(roundPct(p));
  }

  /** '%70', or a dash while nothing is due. */
  function pctLabel(p) {
    return p === null || p === undefined ? copy().noData : '%' + roundPct(p);
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

  /* ── Stage 4: cards, charts, the report card and the log ───────────────── */

  /* Every number below comes from monthSummary() (or currentStreak for the live streak); the
     views only place it. Colours are the --hb-* variables; a person's number always sits beside
     the person's name, so colour is never the only cue. */

  var LOG_LIMIT = 5;
  var PLOT = { w: 320, h: 156, left: 30, right: 308, top: 12, bottom: 124 };
  var MOM = { group: 54, bar: 13, gap: 3, base: 92, maxH: 72, h: 118 };

  function personClass(p) {
    if (p === 'together') return 'hb-p-together';
    return isPerson(p) ? 'hb-p-' + p : 'hb-p-none';
  }

  function monthLabel(mk) {
    return copy().months[parseInt(mk.slice(5, 7), 10) - 1];
  }

  /** The lead of the month, taken from the two numbers the cards SHOW: the gap is the difference
      of the two rounded percentages, a tie is exactly "both cards read the same", and the leader
      is the card with the higher shown number. */
  function leadInfo(s) {
    if (!s || !s.started || !s.leader) return null;
    var shownM = roundPct(s.people.meryem.pct);
    var shownF = roundPct(s.people.furkan.pct);
    var gap = Math.abs(shownM - shownF);
    if (gap === 0) return { tie: true, gap: 0, who: null };
    return { tie: false, gap: gap, who: shownM > shownF ? 'meryem' : 'furkan' };
  }

  function leadLine(s) {
    var info = leadInfo(s);
    if (!info) return '';
    var c = copy().stats;
    return info.tie ? c.tie : fmt(c.lead, { name: nameOf(info.who), n: info.gap });
  }

  /** The current streak on the running month, that month's longest on a past one. */
  function streakOf(person, vm, summary, now) {
    if (vm === monthKey(now)) return { kind: 'current', n: currentStreak(person, streakMonths(), now) };
    return { kind: 'longest', n: summary.people[person].longest };
  }

  function dotMark(p) {
    if (p !== 'together' && !isPerson(p)) return '';
    return '<i class="hb-dot ' + personClass(p) + '"></i>';
  }

  function heartMark(cls) {
    return '<svg class="' + cls + '" viewBox="0 0 24 24" aria-hidden="true"><path d="' + HEART_D + '"/></svg>';
  }

  function statTile(kind, name, pct, sub) {
    var mark = kind === 'together' ? heartMark('hb-stat-heart') : dotMark(kind);
    return '<div class="hb-stat ' + personClass(kind) + '" data-kind="' + kind + '" data-pct="' + (pct === null ? '' : roundPct(pct)) + '">' +
      '<div class="hb-stat-name">' + mark + '<span>' + escapeHtml(name) + '</span></div>' +
      '<div class="hb-stat-num">' + escapeHtml(pctLabel(pct)) + '</div>' +
      sub +
    '</div>';
  }

  function streakHtml(person, st) {
    var c = copy().stats;
    /* The flame only marks a streak that exists: no fire on 0 days. */
    return '<div class="hb-stat-sub hb-streak" data-person="' + person + '" data-kind="' + st.kind + '" data-n="' + st.n + '">' +
      '<span class="hb-streak-n">' + (st.n > 0 ? '🔥 ' : '') + escapeHtml(fmt(c.streakDays, { n: st.n })) + '</span> ' +
      '<span class="hb-streak-label">' + escapeHtml(st.kind === 'current' ? c.streakNow : c.streakBest) + '</span>' +
    '</div>';
  }

  function cardsHtml(vm, summary, now) {
    var c = copy();
    var lead = leadLine(summary);
    var bp = summary.birlikte.pct;
    var mp = summary.people.meryem.pct;
    var fp = summary.people.furkan.pct;
    return '<section class="card hb-stats">' +
      (lead ? '<p class="hb-lead" data-lead="' + (leadInfo(summary).tie ? 'tie' : leadInfo(summary).who) + '">' + escapeHtml(lead) + '</p>' : '') +
      '<div class="hb-stats-grid">' +
        statTile('meryem', nameOf('meryem'), mp, streakHtml('meryem', streakOf('meryem', vm, summary, now))) +
        statTile('furkan', nameOf('furkan'), fp, streakHtml('furkan', streakOf('furkan', vm, summary, now))) +
        statTile('together', c.groups.together, bp,
          '<div class="hb-stat-sub hb-joint-count" data-n="' + summary.jointDays + '"><span class="hb-streak-n">' + escapeHtml(fmt(c.stats.jointDays, { n: summary.jointDays })) + '</span></div>') +
      '</div>' +
    '</section>';
  }

  /* ── The daily line chart ───────────────────────────────────────────────── */

  function plotX(n, days) {
    return PLOT.left + (days <= 1 ? 0 : (n - 1) * (PLOT.right - PLOT.left) / (days - 1));
  }

  function plotY(pct) {
    return PLOT.top + (100 - pct) * (PLOT.bottom - PLOT.top) / 100;
  }

  function dailySvg(summary) {
    var c = copy();
    var days = summary.days;
    var out = '';
    [100, 50, 0].forEach(function (g) {
      var y = plotY(g).toFixed(1);
      out += '<line class="hb-grid" x1="' + PLOT.left + '" x2="' + PLOT.right + '" y1="' + y + '" y2="' + y + '"/>' +
        '<text class="hb-axis" x="' + (PLOT.left - 5) + '" y="' + (plotY(g) + 3).toFixed(1) + '" text-anchor="end">' + g + '</text>';
    });
    var ticks = [1, 5, 10, 15, 20, 25];
    if (days - 25 >= 3) ticks.push(days);
    ticks.forEach(function (n) {
      if (n > days) return;
      out += '<text class="hb-axis" x="' + plotX(n, days).toFixed(1) + '" y="' + (PLOT.bottom + 14) + '" text-anchor="middle">' + n + '</text>';
    });
    var parts = { meryem: '', furkan: '' };
    ['meryem', 'furkan'].forEach(function (p) {
      var path = '';
      var pts = '';
      for (var i = 0; i < summary.perDay.length; i++) {
        var rec = summary.perDay[i];
        var v = rec[p];
        if (v === null) continue;
        var x = plotX(rec.n, days);
        var y = plotY(v);
        path += (path ? 'L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
        var attrs = ' class="hb-pt hb-pt-' + p + '" data-person="' + p + '" data-day="' + rec.key + '" data-pct="' + v.toFixed(2) + '" data-y="' + y.toFixed(1) + '"';
        pts += p === 'meryem'
          ? '<circle' + attrs + ' cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="2.8"/>'
          : '<rect' + attrs + ' x="' + (x - 2.6).toFixed(1) + '" y="' + (y - 2.6).toFixed(1) + '" width="5.2" height="5.2"/>';
      }
      parts[p] = (path ? '<path class="hb-line hb-line-' + p + '" d="' + path + '"/>' : '') + pts;
    });
    out += parts.furkan + parts.meryem;
    return '<svg class="hb-svg hb-daily-svg" viewBox="0 0 ' + PLOT.w + ' ' + PLOT.h + '" role="img" aria-label="' +
      escapeHtml(fmt(c.daily.aria, { m: pctLabel(summary.people.meryem.pct), f: pctLabel(summary.people.furkan.pct) })) +
      '" data-top="' + PLOT.top + '" data-h="' + (PLOT.bottom - PLOT.top) + '">' + out + '</svg>';
  }

  function dailyHtml(summary) {
    var c = copy();
    var legend = '<div class="hb-legend hb-legend--chart">' +
      '<span class="hb-leg hb-p-meryem"><svg viewBox="0 0 22 10" aria-hidden="true"><path class="hb-line-sample hb-line-meryem" d="M1 5H21"/><circle cx="11" cy="5" r="2.8" class="hb-pt-meryem"/></svg>' + escapeHtml(nameOf('meryem')) + '</span>' +
      '<span class="hb-leg hb-p-furkan"><svg viewBox="0 0 22 10" aria-hidden="true"><path class="hb-line-sample hb-line-furkan" d="M1 5H21"/><rect x="8.4" y="2.4" width="5.2" height="5.2" class="hb-pt-furkan"/></svg>' + escapeHtml(nameOf('furkan')) + '</span>' +
    '</div>';
    return '<section class="card hb-daily"><h2 class="hb-title">' + escapeHtml(c.daily.title) + '</h2>' + dailySvg(summary) + legend + '</section>';
  }

  /* ── Per-item bars ──────────────────────────────────────────────────────── */

  function itemActiveIn(item, vm) {
    var first = vm + '-01';
    var last = vm + '-' + pad2(daysInMonth(vm));
    if (item.since && item.since > last) return false;
    if (item.until && item.until < first) return false;
    return true;
  }

  function barsHtml(vm, summary) {
    var c = copy();
    var aria = [];
    var rows = '';
    summary.items.forEach(function (row) {
      var item = null;
      CONFIG.habits.forEach(function (h) { if (h.id === row.id) item = h; });
      if (!item || !itemActiveIn(item, vm)) return;
      var bars = '';
      var said = [];
      ['meryem', 'furkan'].forEach(function (p) {
        if (row.owners.indexOf(p) === -1) return;
        var v = row[p];
        said.push(nameOf(p) + ' ' + pctLabel(v));
        bars += '<div class="hb-bar-row ' + personClass(p) + '" data-item="' + escapeHtml(row.id) + '" data-person="' + p + '" data-pct="' + (v === null ? '' : roundPct(v)) + '">' +
          '<span class="hb-bar-who">' + dotMark(p) + escapeHtml(nameOf(p)) + '</span>' +
          '<span class="hb-bar-track"><span class="hb-bar-fill" style="width:' + (v === null ? 0 : Math.max(0, Math.min(100, v)).toFixed(1)) + '%"></span></span>' +
          '<span class="hb-bar-val">' + escapeHtml(pctLabel(v)) + '</span>' +
        '</div>';
      });
      aria.push(row.label + ': ' + said.join(', '));
      rows += '<div class="hb-bar-item"><p class="hb-bar-label">' + escapeHtml(row.label) + '</p>' + bars + '</div>';
    });
    return '<section class="card hb-bars"><h2 class="hb-title">' + escapeHtml(c.bars.title) + '</h2>' +
      '<div class="hb-bar-list" role="img" aria-label="' + escapeHtml(c.bars.title + '. ' + aria.join('; ')) + '">' + rows + '</div></section>';
  }

  function statsHtml(now) {
    var vm = viewedMonth();
    var summary = monthSummary(vm, state.monthsData[vm] || {}, now);
    var out = cardsHtml(vm, summary, now);
    if (summary.started) out += dailyHtml(summary) + barsHtml(vm, summary);
    return out;
  }

  /* ── Month over month ──────────────────────────────────────────────────── */

  function momHtml(now) {
    var c = copy();
    var list = shownMonths(now);
    /* A short history is centred in a five-slot frame so the columns keep a friendly size. */
    var width = Math.max(list.length, 5) * MOM.group;
    var shift = (width - list.length * MOM.group) / 2;
    var bars = '';
    var aria = [];
    list.forEach(function (mk, i) {
      var s = monthSummary(mk, state.allMonths[mk] || {}, now);
      var x0 = shift + i * MOM.group + 4;
      var cols = [['meryem', s.people.meryem.pct], ['furkan', s.people.furkan.pct], ['together', s.birlikte.pct]];
      var said = [];
      cols.forEach(function (col, j) {
        var x = x0 + j * (MOM.bar + MOM.gap);
        var pct = col[1];
        said.push((col[0] === 'together' ? c.groups.together : nameOf(col[0])) + ' ' + pctLabel(pct));
        if (pct === null) return;
        var h = pct * MOM.maxH / 100;
        bars += '<rect class="hb-mbar ' + personClass(col[0]) + '" data-month="' + mk + '" data-person="' + col[0] + '" data-pct="' + roundPct(pct) + '"' +
          ' x="' + x + '" y="' + (MOM.base - h).toFixed(1) + '" width="' + MOM.bar + '" height="' + Math.max(h, 0.5).toFixed(1) + '" rx="3"/>' +
          '<text class="hb-mval" data-month="' + mk + '" data-person="' + col[0] + '" x="' + (x + MOM.bar / 2) + '" y="' + (MOM.base - h - 3).toFixed(1) + '" text-anchor="middle">' + roundPct(pct) + '</text>';
      });
      aria.push(monthLabel(mk) + ': ' + said.join(', '));
      var cx = x0 + (3 * MOM.bar + 2 * MOM.gap) / 2;
      var mi = parseInt(mk.slice(5, 7), 10);
      bars += '<text class="hb-mlabel" x="' + cx + '" y="' + (MOM.base + 12) + '" text-anchor="middle">' + escapeHtml(c.monthsShort[mi - 1]) + '</text>';
      if (i === 0 || mi === 1) {
        bars += '<text class="hb-myear" x="' + cx + '" y="' + (MOM.base + 22) + '" text-anchor="middle">' + escapeHtml("'" + mk.slice(2, 4)) + '</text>';
      }
    });
    var scrolls = list.length > 6;
    var legend = '<div class="hb-legend hb-legend--chart">' +
      '<span class="hb-leg hb-p-meryem">' + dotMark('meryem') + escapeHtml(nameOf('meryem')) + '</span>' +
      '<span class="hb-leg hb-p-furkan">' + dotMark('furkan') + escapeHtml(nameOf('furkan')) + '</span>' +
      '<span class="hb-leg hb-p-together">' + heartMark('hb-stat-heart') + escapeHtml(c.groups.together) + '</span>' +
    '</div>';
    return '<section class="card hb-mom"><h2 class="hb-title">' + escapeHtml(c.mom.title) + '</h2>' +
      '<div class="hb-mom-scroll' + (scrolls ? ' is-scroll' : '') + '" data-months="' + list.length + '">' +
      '<svg class="hb-svg hb-mom-svg" viewBox="0 0 ' + width + ' ' + MOM.h + '" role="img" aria-label="' + escapeHtml(c.mom.title + '. ' + aria.join('; ')) + '"' +
      ' style="' + (scrolls ? 'width:' + width + 'px' : 'width:100%') + '">' +
      '<line class="hb-grid" x1="0" x2="' + width + '" y1="' + MOM.base + '" y2="' + MOM.base + '"/>' + bars + '</svg></div>' +
      legend + '<p class="hb-hint hb-hint--center">' + escapeHtml(c.mom.hint) + '</p></section>';
  }

  /* ── Monthly report card ───────────────────────────────────────────────── */

  function closingFor(vm) {
    var pool = copy().report.closing;
    var m = parseMonth(vm);
    return pool[(m.year * 12 + m.month) % pool.length];
  }

  function reportHtml(now) {
    var c = copy();
    var vm = viewedMonth();
    if (vm < monthKey(now)) {
      var s = monthSummary(vm, state.monthsData[vm] || {}, now);
      var lead = leadLine(s);
      var info = leadInfo(s);
      var items = '';
      if (lead) items += '<li class="hb-report-lead" data-lead="' + (info.tie ? 'tie' : info.who) + '">' + heartMark('hb-ri') + '<span>' + escapeHtml(lead) + '</span></li>';
      /* Each "Name %n" is one unbreakable unit, so a line break never strands the number. */
      var score = function (name, pct) { return '<span class="hb-nw">' + escapeHtml(name + ' ' + pctLabel(pct)) + '</span>'; };
      items += '<li class="hb-report-scores">' + heartMark('hb-ri') + '<span>' +
        score(nameOf('meryem'), s.people.meryem.pct) + ' · ' + score(nameOf('furkan'), s.people.furkan.pct) + ' · ' + score(c.groups.together, s.birlikte.pct) + '</span></li>';
      if (s.bestItem) {
        items += '<li class="hb-report-best" data-item="' + escapeHtml(s.bestItem.id) + '">' + heartMark('hb-ri') + '<span>' +
          escapeHtml(fmt(c.report.best, { item: shortLabel(s.bestItem.id), pct: pctLabel(s.bestItem.pct) })) + '</span></li>';
      }
      ['meryem', 'furkan'].forEach(function (p) {
        items += '<li class="hb-report-streak" data-person="' + p + '" data-n="' + s.people[p].longest + '">' + heartMark('hb-ri') + '<span>' +
          escapeHtml(fmt(c.report.streak, { name: nameOf(p), n: s.people[p].longest })) + '</span></li>';
      });
      items += '<li class="hb-report-joint" data-n="' + s.jointDays + '">' + heartMark('hb-ri') + '<span>' + escapeHtml(fmt(c.stats.jointDays, { n: s.jointDays })) + '</span></li>';
      return '<section class="card hb-report" data-month="' + vm + '">' +
        '<div class="hb-report-top"><div class="hb-report-bear">' + bearSVG({ mood: 'love', arms: 'wave', size: 92 }) + '</div>' +
        '<div class="hb-report-hearts" aria-hidden="true">' + heartMark('hb-rh hb-rh--1') + heartMark('hb-rh hb-rh--2') + heartMark('hb-rh hb-rh--3') + '</div></div>' +
        '<h2 class="hb-title hb-report-title">' + escapeHtml(fmt(c.report.title, { month: monthLabel(vm) })) + '</h2>' +
        '<ul class="hb-report-list">' + items + '</ul>' +
        '<p class="hb-report-close">' + escapeHtml(closingFor(vm)) + '</p>' +
      '</section>';
    }
    return '<section class="card hb-teaser">' +
      '<p class="hb-teaser-text">' + escapeHtml(c.report.teaser) + '</p></section>';
  }

  /* ── The log ("Geçmiş") ────────────────────────────────────────────────── */

  function logWhen(entry) {
    var ms = typeof habitLogMillis === 'function' ? habitLogMillis(entry) : 0;
    if (!ms) return '';
    var d = new Date(ms);
    if (isNaN(d.getTime())) return '';
    return d.getDate() + ' ' + copy().monthsShort[d.getMonth()] + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
  }

  /** The habit's short label; an id that is not in CONFIG.habits (a stored value) prints as ''. */
  function shortLabel(id) {
    var out = '';
    CONFIG.habits.forEach(function (h) { if (h.id === id) out = h.label.replace(/\s*\(.*$/, ''); });
    return out;
  }

  function logRowHtml(entry) {
    var c = copy().log;
    /* by is one of the two people or null (a neutral row, no dot): never the raw stored string. */
    var by = isPerson(entry.by) ? entry.by : (isPerson(entry.person) ? entry.person : null);
    var whose = isPerson(entry.person) && entry.person !== by ? ' · ' + fmt(c.box, { name: nameOf(entry.person) }) : '';
    /* the pill follows the SDK's own flag: this entry has not reached the server yet */
    var pending = entry.pendingWrites === true;
    /* Two lines: who and what on the first, the time (and the pending pill) on the second, so no
       separator dangles at a line end and the pill never sits alone. */
    return '<li class="hb-log-row ' + personClass(by) + '" data-id="' + escapeHtml(entry.id || '') + '" data-value="' + (entry.value ? '1' : '0') + '"' + (pending ? ' data-pending="1"' : '') + '>' +
      '<div class="hb-log-main">' +
        '<span class="hb-log-who">' + dotMark(by) + escapeHtml(nameOf(by) || '') + '</span>' +
        '<span class="hb-log-sep"> · </span>' +
        '<span class="hb-log-what">' + escapeHtml(shortLabel(entry.item)) + ' ' + (entry.value ? '✓' : escapeHtml(c.undone)) + escapeHtml(whose) + '</span>' +
      '</div> ' +
      '<div class="hb-log-meta">' +
        '<span class="hb-log-when">' + escapeHtml(logWhen(entry)) + '</span>' +
        (pending ? ' <span class="hb-log-pending">' + escapeHtml(c.pending) + '</span>' : '') +
      '</div>' +
    '</li>';
  }

  function logHtml() {
    var c = copy().log;
    var rows = state.log.slice();
    var total = rows.length;
    var cut = !state.logOpen && total > LOG_LIMIT;
    if (cut) rows = rows.slice(0, LOG_LIMIT);
    var body = total
      ? '<ul class="hb-log-list">' + rows.map(logRowHtml).join('') + '</ul>'
      : '<p class="hb-hint">' + escapeHtml(c.empty) + '</p>';
    var toggle = total > LOG_LIMIT
      ? '<button type="button" class="hb-link hb-log-toggle" data-act="log-toggle" aria-expanded="' + (state.logOpen ? 'true' : 'false') + '">' +
        escapeHtml(state.logOpen ? c.less : fmt(c.all, { n: total })) + '</button>'
      : '';
    return '<section class="card hb-log"><h2 class="hb-title">' + escapeHtml(c.title) + '</h2>' + body + toggle + '</section>';
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
    var live = !choosing && shownMonths(now).length > 0;
    var stats = document.getElementById('hb-stats');
    var mom = document.getElementById('hb-mom');
    var report = document.getElementById('hb-report');
    var log = document.getElementById('hb-log');
    if (stats) setRegion('stats', stats, live ? statsHtml(now) : '');
    if (mom) {
      var oldStrip = mom.querySelector('.hb-mom-scroll.is-scroll');
      var keepLeft = oldStrip ? oldStrip.scrollLeft : 0;
      var momMarkup = live ? momHtml(now) : '';
      var momChanged = shown.mom !== momMarkup;
      setRegion('mom', mom, momMarkup);
      /* More than ~6 months: the newest sit at the right edge until the user scrolls away. */
      var strip = momChanged ? mom.querySelector('.hb-mom-scroll.is-scroll') : null;
      if (strip && !state.momPinned) strip.scrollLeft = keepLeft;
      pinMom();
    }
    if (report) setRegion('report', report, live ? reportHtml(now) : '');
    if (log) setRegion('log', log, live ? logHtml() : '');
    renderSheet();
  }

  /** One tap on one of YOUR boxes: the month document and the log, from the snapshot's value. */
  function tickFrom(btn) {
    var person = btn.getAttribute('data-person');
    var key = btn.getAttribute('data-day');
    var itemId = btn.getAttribute('data-item');
    if (!canTick(person)) return;
    /* The rehearsal clock (?onizleme=dogumgunu) dates every tap a year ahead: never write from it. */
    if (isPreviewMode()) {
      if (typeof showToast === 'function') showToast(copy().previewNote);
      return;
    }
    var item = null;
    CONFIG.habits.forEach(function (h) { if (h.id === itemId) item = h; });
    if (!item || !key) return;
    var now = nowDate();
    if (!isDue(item, dateOf(key), now)) return;
    var month = key.slice(0, 7);
    var value = !tickedOn(item, key, person);
    var pendingKey = key + '|' + itemId + '|' + person;
    /* The month write decides whether the tick is saved: only its failure clears the box and
       asks for another tap. The log is a side record - its failure is only noted, because the tick
       DID save and a toast would tell her to undo it. */
    var monthFailed = function () {
      delete pending[pendingKey];
      renderAll();
      if (typeof showToast === 'function') showToast(copy().saveError);
    };
    var logFailed = function (err) {
      if (window.console && console.warn) console.warn('habit log entry was not saved', err);
    };
    if (typeof setHabitTick !== 'function' || typeof addHabitLog !== 'function') return;
    pending[pendingKey] = { day: key, item: itemId, person: person, value: value };
    renderAll();
    var written;
    try {
      written = setHabitTick(month, key, itemId, person, value);
    } catch (e) {
      monthFailed();
      return;
    }
    written.catch(monthFailed);
    try {
      addHabitLog({ month: month, day: key, item: itemId, person: person, value: value, by: state.me, atLocal: now.toISOString() }).catch(logFailed);
    } catch (e) {
      logFailed(e);
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
      } else if (what === 'log-toggle') {
        state.logOpen = !state.logOpen;
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

  /** Keeps the month-over-month strip at its newest month until the user scrolls away from it. */
  function pinMom() {
    var mom = document.getElementById('hb-mom');
    var strip = mom && mom.querySelector('.hb-mom-scroll.is-scroll');
    if (strip && state.momPinned && strip.scrollWidth > 0) strip.scrollLeft = strip.scrollWidth;
  }

  function wireUi() {
    var view = document.getElementById('habits-view');
    var content = document.getElementById('habits-day-content');
    var mom = document.getElementById('hb-mom');
    if (view) view.addEventListener('click', onClick);
    if (content) content.addEventListener('click', onClick);
    if (mom) {
      /* scroll events do not bubble, so listen while they travel down */
      mom.addEventListener('scroll', function (e) {
        var strip = e.target;
        if (strip && strip.classList && strip.classList.contains('is-scroll')) {
          state.momPinned = strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 4;
        }
      }, true);
      /* the tab is hidden at start-up: the strip has no width until Takip is opened */
      if (typeof ResizeObserver === 'function') new ResizeObserver(pinMom).observe(mom);
    }
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
    leadLine: leadLine,
    render: renderAll,
    checkDay: checkDay,
    state: function () {
      return { day: state.day, month: state.month, data: state.data, monthsData: state.monthsData, view: state.view, me: state.me, pending: Object.keys(pending).length };
    }
  };
})();
