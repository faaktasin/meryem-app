/**
 * Meryem App — Tarihler (Dates) view
 * Builds the four countdown/since cards once, inside the containers index.html already provides
 * (#countdown-her-bday, #countdown-his-bday, #countdown-meet, #countdown-love), then ticks every
 * second updating existing text nodes only (never innerHTML per tick) so node identity survives
 * every tick. Reads CONFIG's dates and getElapsed()/getNextBirthdayCountdown() from js/data.js,
 * and appNow() from js/time.js. Exposes window.initDates().
 */
(function () {
  'use strict';

  var HER_LABEL_TODAY = "Meryem'in Doğum Günü";
  /* CONTENT (js/content.js) has no line for "it's HIS birthday today" — every message there is
     written for Meryem's days, not Furkan's. A small default in the app's own sweet voice. */
  /* His card on his birthday; the words live in CONTENT.dates.hisToday. */
  var HIS_TODAY_LINE = (CONTENT.dates && CONTENT.dates.hisToday) || 'Bugün benim doğum günüm 🎉';

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

  function tick() {
    if (!_refs) return;

    applyHerState(getNextBirthdayCountdown(CONFIG.herBirthday.month, CONFIG.herBirthday.day));
    applyHisState(getNextBirthdayCountdown(CONFIG.hisBirthday.month, CONFIG.hisBirthday.day));

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
