/**
 * Meryem App — Clock
 * The ONLY source of "now" for the whole app. Every feature reads time through appNow(),
 * never `new Date()` directly, so a birthday rehearsal (?onizleme=dogumgunu) can move the whole
 * app to her birthday without touching the real clock or any persisted flag.
 */

/* Duplicated from CONFIG.herBirthday on purpose — data.js (which defines CONFIG) loads after
   this file, so this module reads its own copy instead of depending on load order. */
var TIME_HER_BIRTHDAY = { month: 10, day: 4 };

var _timeOffsetMs = 0;
var _previewMode = null; /* computed once, lazily, on first use */

/**
 * True iff the page URL asked for birthday preview mode (?onizleme=dogumgunu). Read once: the
 * first call also computes the preview time offset so appNow() lands on her next birthday.
 * @returns {boolean}
 */
function isPreviewMode() {
  if (_previewMode === null) {
    try {
      var params = new URLSearchParams(window.location.search);
      _previewMode = params.get('onizleme') === 'dogumgunu';
    } catch (e) {
      _previewMode = false;
    }
    if (_previewMode) {
      var real = new Date();
      var target = birthdayStart(real.getFullYear());
      if (real.getTime() >= target.getTime()) {
        target = birthdayStart(real.getFullYear() + 1);
      }
      /* Land at 10:00 local on her next birthday, then keep ticking forward from there. */
      target = new Date(target.getFullYear(), target.getMonth(), target.getDate(), 10, 0, 0);
      _timeOffsetMs = target.getTime() - real.getTime();
    }
  }
  return _previewMode;
}

/**
 * The app's current time: real time plus the preview offset. Never frozen — keeps ticking.
 * @returns {Date}
 */
function appNow() {
  isPreviewMode(); /* ensures the offset is computed before it is used */
  return new Date(Date.now() + _timeOffsetMs);
}

/**
 * Midnight on her birthday for the given year.
 * @param {number} year
 * @returns {Date}
 */
function birthdayStart(year) {
  return new Date(year, TIME_HER_BIRTHDAY.month - 1, TIME_HER_BIRTHDAY.day, 0, 0, 0);
}

/**
 * True from the moment her birthday starts through the rest of the year; relocks 1 January for
 * the next year's countdown.
 * @returns {boolean}
 */
function isBirthdayUnlocked() {
  var now = appNow();
  return now.getTime() >= birthdayStart(now.getFullYear()).getTime();
}

/**
 * The year appNow() currently sits in — the year whose birthday gate/surprise is relevant.
 * @returns {number}
 */
function birthdayYear() {
  return appNow().getFullYear();
}

/**
 * False while rehearsing in preview mode — so a play-through never marks a real, persisted flag
 * (has she played the gate this year? has she seen the birthday surprise?) as done.
 * @returns {boolean}
 */
function canPersistFlags() {
  return !isPreviewMode();
}

/* Flag keys a rehearsal must not touch for real. Feature agents add their own flag keys here as
   they introduce them (e.g. the gate's "played this year" flag, the birthday "seen" flag).
   Deliberately excludes 'meryem-migrated' (firebase.js) and any Firestore-backed data — those are
   real user data, not a rehearsal flag, and must keep writing normally in preview mode too. */
var TIME_PREVIEW_PROTECTED_KEYS = {
  'meryem-gate-played-year': true,
  'meryem-birthday-seen-year': true
};

/**
 * localStorage.getItem with a try/catch — never throws in a locked-down or private context.
 * @param {string} key
 * @returns {string|null}
 */
function storageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (e) {
    return null;
  }
}

/**
 * localStorage.setItem with a try/catch, and a no-op for preview-protected keys while
 * `isPreviewMode()` is true — so a rehearsal never marks the real flag as done.
 * @param {string} key
 * @param {string} value
 */
function storageSet(key, value) {
  if (isPreviewMode() && TIME_PREVIEW_PROTECTED_KEYS[key]) return;
  try {
    window.localStorage.setItem(key, value);
  } catch (e) {
    /* storage full or unavailable — ignore, matching the app's existing storage helpers */
  }
}
