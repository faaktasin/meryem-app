/**
 * Meryem App — Tarihler (Dates) view
 * Builds six countdown/since cards once — the four in the containers index.html already provides
 * (#countdown-her-bday, #countdown-his-bday, #countdown-meet, #countdown-love) plus an engagement
 * since-card and a wedding card built entirely from script, no matching container in index.html —
 * then ticks every second updating existing text nodes only (never innerHTML per tick) so node
 * identity survives every tick. Reads CONFIG's dates and getElapsed()/getNextBirthdayCountdown()
 * from js/data.js, and appNow() from js/time.js. Exposes window.initDates().
 *
 * Card order (her birthday, wedding, engagement, the two since-cards, his birthday last) is
 * achieved without touching index.html's two-column markup: her/wedding/engagement stay in (or
 * are appended to) .dates-col-birthdays, and his card is moved — via appendChild in buildHisCard,
 * which relocates an existing node rather than cloning it — to the end of .dates-col-counters, so
 * the flat mobile reading order comes out right without any CSS layout change.
 */
(function () {
  'use strict';

  var HER_LABEL_TODAY = "Meryem'in Doğum Günü";
  /* CONTENT (js/content.js) has no line for "it's HIS birthday today" — every message there is
     written for Meryem's days, not Furkan's. A small default in the app's own sweet voice. */
  /* His card on his birthday; the words live in CONTENT.dates.hisToday. */
  var HIS_TODAY_LINE = (CONTENT.dates && CONTENT.dates.hisToday) || 'Bugün benim doğum günüm 🎉';

  /* Engagement/wedding card text: CONTENT.dates.* is the source (js/content.js), each with a
     fallback here in the app's own voice, same pattern as HIS_TODAY_LINE above, in case CONTENT
     is ever missing a key. */
  var ENGAGEMENT_LABEL = (CONTENT.dates && CONTENT.dates.engagementLabel) || 'Nişanımızdan beri';
  var WEDDING_LABEL = (CONTENT.dates && CONTENT.dates.weddingLabel) || 'Düğünümüze';
  var WEDDING_APPROX = (CONTENT.dates && CONTENT.dates.weddingApprox) || 'yaklaşık {months} ay kaldı';
  var WEDDING_THIS_MONTH = (CONTENT.dates && CONTENT.dates.weddingThisMonth) || 'Bu ay evleniyoruz 💍';
  var WEDDING_DONE = (CONTENT.dates && CONTENT.dates.weddingDone) || 'Evlendik! 💍';

  var _initialized = false;
  var _refs = null;
  var _herCelebrationShown = false;

  function pad2(n) {
    return n < 10 ? '0' + n : String(n);
  }

  /**
   * "300. güne 40 gün kaldı 💕" — the next round hundred days past `elapsedDays`.
   * @param {number} elapsedDays
   * @returns {string}
   */
  function nextMilestoneLine(elapsedDays) {
    var next = (Math.floor(elapsedDays / 100) + 1) * 100;
    var left = next - elapsedDays;
    return next + '. güne ' + left + ' gün kaldı 💕';
  }

  function unitsMarkup(prefix) {
    return (
      '<div class="countdown-unit"><span class="countdown-num" data-dts-unit="' + prefix + '-days">0</span><span class="countdown-unit-label">gün</span></div>' +
      '<div class="countdown-unit"><span class="countdown-num" data-dts-unit="' + prefix + '-hours">00</span><span class="countdown-unit-label">saat</span></div>' +
      '<div class="countdown-unit"><span class="countdown-num" data-dts-unit="' + prefix + '-minutes">00</span><span class="countdown-unit-label">dakika</span></div>' +
      '<div class="countdown-unit"><span class="countdown-num" data-dts-unit="' + prefix + '-seconds">00</span><span class="countdown-unit-label">saniye</span></div>'
    );
  }

  function grabUnitRefs(prefix) {
    return {
      days: document.querySelector('[data-dts-unit="' + prefix + '-days"]'),
      hours: document.querySelector('[data-dts-unit="' + prefix + '-hours"]'),
      minutes: document.querySelector('[data-dts-unit="' + prefix + '-minutes"]'),
      seconds: document.querySelector('[data-dts-unit="' + prefix + '-seconds"]')
    };
  }

  /** Updates existing unit spans via textContent only — never rebuilds them, so node identity
   *  (and anything else watching these nodes) survives every tick. */
  function writeUnits(refs, res) {
    if (!refs) return;
    if (refs.days) refs.days.textContent = String(res.days);
    if (refs.hours) refs.hours.textContent = pad2(res.hours);
    if (refs.minutes) refs.minutes.textContent = pad2(res.minutes);
    if (refs.seconds) refs.seconds.textContent = pad2(res.seconds);
  }

  /* ── Card builders (each runs once, from initDates()) ────────────────── */

  function buildHerCard() {
    var box = document.getElementById('countdown-her-bday');
    if (!box) return null;
    var card = box.parentNode; /* .card.countdown-card, per index.html */
    var label = card ? card.querySelector('.countdown-label') : null;
    if (card && card.classList) card.classList.add('dts-card-gift');
    if (card) card.setAttribute('data-dts-card', 'her');

    var bearSlot = document.createElement('div');
    bearSlot.className = 'dts-bear-slot';
    bearSlot.innerHTML = '<span class="dts-bear" data-bear data-bear-mood="happy" data-bear-hat="true" data-bear-heart="true" data-bear-arms="wave" data-bear-size="72"></span>';
    card.insertBefore(bearSlot, box);

    box.innerHTML = unitsMarkup('her');

    var celeb = document.createElement('div');
    celeb.className = 'countdown-celebration dts-celebration';
    celeb.hidden = true;
    var celebBear = document.createElement('div');
    celebBear.className = 'dts-bear-slot';
    celebBear.innerHTML = '<span class="dts-bear" data-bear data-bear-mood="love" data-bear-hat="true" data-bear-arms="up" data-bear-size="88"></span>';
    var title = document.createElement('p');
    title.className = 'dts-celebration-title';
    title.textContent = CONTENT.birthday.title + ' 🎂';
    var sub = document.createElement('p');
    sub.className = 'dts-celebration-sub';
    sub.textContent = CONTENT.birthday.wish;
    celeb.appendChild(celebBear);
    celeb.appendChild(title);
    celeb.appendChild(sub);
    card.insertBefore(celeb, box.nextSibling);

    return {
      label: label,
      labelDefault: label ? label.textContent : '',
      bearSlot: bearSlot,
      units: box,
      unitRefs: grabUnitRefs('her'),
      celeb: celeb,
      celebBearEl: celebBear,
      isCelebrating: false
    };
  }

  function buildHisCard() {
    var box = document.getElementById('countdown-his-bday');
    if (!box) return null;
    var card = box.parentNode;
    card.setAttribute('data-dts-card', 'his');

    var bearSlot = document.createElement('div');
    bearSlot.className = 'dts-bear-slot dts-bear-slot--small';
    bearSlot.innerHTML = '<span class="dts-bear" data-bear data-bear-mood="happy" data-bear-size="52"></span>';
    card.insertBefore(bearSlot, box);

    box.innerHTML = unitsMarkup('his');

    var today = document.createElement('p');
    today.className = 'dts-today-line';
    today.hidden = true;
    today.textContent = HIS_TODAY_LINE;
    card.insertBefore(today, box.nextSibling);

    /* Card order (2026-09-30 brief): her birthday, wedding, engagement, the two since-cards, his
       birthday last. His card starts as the 2nd child of .dates-col-birthdays in index.html —
       moved here to the end of .dates-col-counters so the flat reading order (mobile: this
       column stacks fully below the birthdays column) comes out her/wedding/engagement/meet/
       love/his. appendChild() on an element already in the document MOVES it, it never clones. */
    var counters = document.querySelector('.dates-col-counters');
    if (counters) counters.appendChild(card);

    return {
      units: box,
      unitRefs: grabUnitRefs('his'),
      today: today,
      isCelebrating: false
    };
  }

  function buildSinceCard(id, prefix, mood) {
    var box = document.getElementById(id);
    if (!box) return null;
    var card = box.parentNode;
    card.setAttribute('data-dts-card', prefix);

    var bearSlot = document.createElement('div');
    bearSlot.className = 'dts-bear-slot dts-bear-slot--small';
    bearSlot.innerHTML = '<span class="dts-bear" data-bear data-bear-mood="' + mood + '" data-bear-head-only="true" data-bear-size="44"></span>';
    card.insertBefore(bearSlot, box);

    box.innerHTML = unitsMarkup(prefix);

    var milestone = document.createElement('p');
    milestone.className = 'dts-milestone';
    card.insertBefore(milestone, box.nextSibling);

    return {
      unitRefs: grabUnitRefs(prefix),
      milestone: milestone
    };
  }

  /**
   * Engagement since-card, built from scratch (unlike buildSinceCard, there is no matching
   * container in index.html) and appended to the birthdays column, after her card. Same shape as
   * the other two since-cards: a small bear, the four unit spans, and the shared next-milestone
   * line.
   */
  function buildEngagementCard() {
    var col = document.querySelector('.dates-col-birthdays');
    if (!col) return null;

    var card = document.createElement('div');
    card.className = 'card countdown-card';
    card.setAttribute('data-dts-card', 'engagement');

    var label = document.createElement('p');
    label.className = 'countdown-label';
    label.textContent = ENGAGEMENT_LABEL;
    card.appendChild(label);

    var bearSlot = document.createElement('div');
    bearSlot.className = 'dts-bear-slot dts-bear-slot--small';
    bearSlot.innerHTML = '<span class="dts-bear" data-bear data-bear-mood="love" data-bear-head-only="true" data-bear-size="44"></span>';
    card.appendChild(bearSlot);

    var box = document.createElement('div');
    box.className = 'countdown';
    box.id = 'countdown-engagement';
    box.innerHTML = unitsMarkup('engagement');
    card.appendChild(box);

    var milestone = document.createElement('p');
    milestone.className = 'dts-milestone';
    card.appendChild(milestone);

    col.appendChild(card);

    return {
      unitRefs: grabUnitRefs('engagement'),
      milestone: milestone
    };
  }

  var WEDDING_MONTH_NAMES_TR = [
    'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
    'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
  ];

  /** "Temmuz 2027" from CONFIG.wedding's {year, month}. */
  function weddingMonthLabel(w) {
    return (WEDDING_MONTH_NAMES_TR[w.month - 1] || '') + ' ' + w.year;
  }

  /**
   * Reads CONFIG.wedding + appNow() into one of four states:
   *   'countdown' (wedding.day is set and still in the future) — carries `diff` in ms
   *   'approx'    (day unset, target month still ahead)         — carries `months` (whole months
   *               from this month to the target month, ignoring day-of-month) and `monthLabel`
   *   'thisMonth' (day unset, this is the target month)         — carries `monthLabel`
   *   'done'      (day unset and the target month has passed, OR day is set and has passed)
   */
  function computeWeddingState() {
    var w = CONFIG.wedding;
    var now = appNow();

    if (w.day) {
      var target = new Date(w.year, w.month - 1, w.day, 0, 0, 0);
      var diff = target.getTime() - now.getTime();
      if (diff > 0) return { mode: 'countdown', diff: diff };
      return { mode: 'done' };
    }

    var monthsDiff = (w.year - now.getFullYear()) * 12 + ((w.month - 1) - now.getMonth());
    if (monthsDiff > 0) return { mode: 'approx', months: monthsDiff, monthLabel: weddingMonthLabel(w) };
    if (monthsDiff === 0) return { mode: 'thisMonth', monthLabel: weddingMonthLabel(w) };
    return { mode: 'done' };
  }

  /**
   * Wedding card, built from scratch and appended to the birthdays column, after the engagement
   * card. Two bears side by side under a heart (bride: veil; groom: bow tie) illustrate it always;
   * below that, either the month/year + approx-or-this-month-or-done line (day unset) or an exact
   * days/hours/minutes/seconds countdown (day set) — applyWeddingState() below switches between
   * them every tick.
   */
  function buildWeddingCard() {
    var col = document.querySelector('.dates-col-birthdays');
    if (!col) return null;

    var card = document.createElement('div');
    card.className = 'card countdown-card dts-card-wedding';
    card.setAttribute('data-dts-card', 'wedding');

    var label = document.createElement('p');
    label.className = 'countdown-label';
    label.textContent = WEDDING_LABEL;
    card.appendChild(label);

    var bears = document.createElement('div');
    bears.className = 'dts-wedding-bears';
    bears.innerHTML =
      '<span class="dts-bear" data-bear data-bear-mood="happy" data-bear-veil="true" data-bear-size="60"></span>' +
      '<span class="dts-wedding-heart" aria-hidden="true">💗</span>' +
      '<span class="dts-bear" data-bear data-bear-mood="happy" data-bear-bowtie="true" data-bear-size="60"></span>';
    card.appendChild(bears);

    var monthLine = document.createElement('p');
    monthLine.className = 'dts-wedding-month';
    monthLine.hidden = true;
    card.appendChild(monthLine);

    var stateLine = document.createElement('p');
    stateLine.className = 'dts-wedding-state';
    stateLine.hidden = true;
    card.appendChild(stateLine);

    var units = document.createElement('div');
    units.className = 'countdown';
    units.id = 'countdown-wedding';
    units.hidden = true;
    units.innerHTML = unitsMarkup('wedding');
    card.appendChild(units);

    col.appendChild(card);

    return {
      monthLine: monthLine,
      stateLine: stateLine,
      units: units,
      unitRefs: grabUnitRefs('wedding')
    };
  }

  /* ── State application (called every tick) ───────────────────────────── */

  /** Fires the one-time heart-burst delight the moment the celebration is actually ON SCREEN —
   *  never at the instant the calendar flips, which can happen while she is on another tab and
   *  would otherwise burst hearts at a (0,0) rect nobody sees. Safe to call every tick; it is a
   *  no-op once shown, and resets when the celebration period ends (js/dates.js does that in
   *  applyHerState below). */
  function triggerHerCelebrationEffect() {
    if (_herCelebrationShown) return;
    var her = _refs.her;
    var view = document.getElementById('dates-view');
    if (!view || !view.classList.contains('is-active')) return;
    _herCelebrationShown = true;
    if (typeof fxHeartBurst === 'function') fxHeartBurst(her.celebBearEl);
  }

  function applyHerState(res) {
    var her = _refs.her;
    if (!her) return;
    if (res.today) {
      if (!her.isCelebrating) {
        her.isCelebrating = true;
        her.units.hidden = true;
        her.celeb.hidden = false;
        /* The everyday "waving hello" bear steps aside so the celebration's own bear is the only
           one on screen — the two stacked together read as a mistake, not a flourish. */
        if (her.bearSlot) her.bearSlot.hidden = true;
        if (her.label) her.label.textContent = HER_LABEL_TODAY;
      }
      triggerHerCelebrationEffect();
    } else {
      if (her.isCelebrating) {
        her.isCelebrating = false;
        her.units.hidden = false;
        her.celeb.hidden = true;
        if (her.bearSlot) her.bearSlot.hidden = false;
        if (her.label) her.label.textContent = her.labelDefault;
        _herCelebrationShown = false;
      }
      writeUnits(her.unitRefs, res);
    }
  }

  function applyHisState(res) {
    var his = _refs.his;
    if (!his) return;
    if (res.today) {
      if (!his.isCelebrating) {
        his.isCelebrating = true;
        his.units.hidden = true;
        his.today.hidden = false;
      }
    } else {
      if (his.isCelebrating) {
        his.isCelebrating = false;
        his.units.hidden = false;
        his.today.hidden = true;
      }
      writeUnits(his.unitRefs, res);
    }
  }

  /** Reads CONFIG.wedding fresh every tick (via computeWeddingState) so setting
   *  CONFIG.wedding.day at any point — the only field Furkan will ever need to fill in — switches
   *  the card from the month-based line to an exact countdown on the very next tick, with no
   *  re-render call needed. */
  function applyWeddingState() {
    var wedding = _refs.wedding;
    if (!wedding) return;
    var st = computeWeddingState();

    if (st.mode === 'countdown') {
      wedding.monthLine.hidden = true;
      wedding.stateLine.hidden = true;
      wedding.units.hidden = false;
      var diff = st.diff;
      writeUnits(wedding.unitRefs, {
        days: Math.floor(diff / 86400000),
        hours: Math.floor((diff % 86400000) / 3600000),
        minutes: Math.floor((diff % 3600000) / 60000),
        seconds: Math.floor((diff % 60000) / 1000)
      });
      return;
    }

    wedding.units.hidden = true;

    if (st.mode === 'approx' || st.mode === 'thisMonth') {
      wedding.monthLine.hidden = false;
      wedding.monthLine.textContent = st.monthLabel;
    } else {
      wedding.monthLine.hidden = true;
    }

    wedding.stateLine.hidden = false;
    if (st.mode === 'approx') {
      wedding.stateLine.textContent = WEDDING_APPROX.replace('{months}', st.months);
    } else if (st.mode === 'thisMonth') {
      wedding.stateLine.textContent = WEDDING_THIS_MONTH;
    } else {
      wedding.stateLine.textContent = WEDDING_DONE;
    }
  }

  function tick() {
    if (!_refs) return;

    applyHerState(getNextBirthdayCountdown(CONFIG.herBirthday.month, CONFIG.herBirthday.day));
    applyHisState(getNextBirthdayCountdown(CONFIG.hisBirthday.month, CONFIG.hisBirthday.day));
    applyWeddingState();

    if (_refs.meet) {
      var meetElapsed = getElapsed(CONFIG.firstMeetDate);
      writeUnits(_refs.meet.unitRefs, meetElapsed);
      _refs.meet.milestone.textContent = nextMilestoneLine(meetElapsed.days);
    }
    if (_refs.love) {
      var loveElapsed = getElapsed(CONFIG.loveDate);
      writeUnits(_refs.love.unitRefs, loveElapsed);
      _refs.love.milestone.textContent = nextMilestoneLine(loveElapsed.days);
    }
    if (_refs.engagement) {
      var engagementElapsed = getElapsed(CONFIG.engagementDate);
      writeUnits(_refs.engagement.unitRefs, engagementElapsed);
      _refs.engagement.milestone.textContent = nextMilestoneLine(engagementElapsed.days);
    }
  }

  /**
   * Builds the Tarihler view once and starts its per-second tick. Idempotent — a second call
   * (e.g. a re-auth re-running initFeatures()) does nothing.
   */
  function initDates() {
    if (_initialized) return;
    _initialized = true;

    _refs = {
      her: buildHerCard(),
      his: buildHisCard(),
      wedding: buildWeddingCard(),
      engagement: buildEngagementCard(),
      meet: buildSinceCard('countdown-meet', 'meet', 'happy'),
      love: buildSinceCard('countdown-love', 'love', 'love')
    };

    if (typeof bearAutoRender === 'function') bearAutoRender();

    /* Covers the case where the calendar flips to her birthday while she is on another tab: the
       state switch already happened in tick(), this just plays the effect once she looks. */
    document.addEventListener('meryem:tab', function (e) {
      if (e.detail && e.detail.tab === 'dates-view') triggerHerCelebrationEffect();
    });

    tick();
    setInterval(tick, 1000);
  }

  window.initDates = initDates;
})();
