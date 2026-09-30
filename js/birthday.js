/**
 * Meryem App — Birthday surprise (Sürpriz)
 * Owns #birthday-root (the 🎁 tab) and the contents of #birthday-overlay (the full-screen
 * surprise). Two tab states — LOCKED (a guarded gift box with a live countdown) and UNLOCKED (a
 * card that opens the surprise, plus a "Kuponların" list of her love coupons) — plus a scene
 * stepper: title, cake, balloons, gift+letter, [voice message — only when Furkan has dropped a
 * recording at audio/sesli-mesaj.*], love coupons, slideshow, end. Scenes advance with
 * goToNextScene() (relative to the current one), not a hardcoded index, precisely so the voice
 * scene can be spliced in or out without renumbering every other scene's continue button. Every
 * timer/animation this file starts is torn down when its scene ends, the overlay closes, or
 * initBirthday() runs again.
 *
 * Contract (window-exposed): initBirthday(), maybeAutoOpenBirthday(), openBirthdaySurprise().
 * Also exposes birthdayBlowDetector() (a pure RMS-over-time detector factory) and
 * birthdayTestStartMelody()/birthdayTestIsMelodyPlaying(), purely so tests/checks/birthday.mjs can
 * prove the "blow" and "music box stops before her voice plays" logic without a real microphone.
 */
(function () {
  'use strict';

  /* ── Module state ─────────────────────────────────────────────────────── */

  var _bdayTickId = null;
  var _bdayCurrentState = null; /* 'locked' | 'unlocked' | null (not yet rendered) */
  var _bdayReturnFocusEl = null;

  var _bdaySceneCleanup = null;
  var _bdayCandlesEl = null;
  var _bdayLitCount = 0;
  /* The cake scene's own "reveal" timers (wish-text show, then wish-hide+blow-UI-show). Tracked
     here (not just in renderSceneCake's closure) so finishBlowing() can cancel them the moment
     blowing finishes early — otherwise they fire later regardless and re-surface the blow prompt
     UNDER the already-showing after-blow celebration. */
  var _bdayCakeTimers = [];

  var _bdayMicStream = null;
  var _bdayAnalyser = null;
  var _bdayMicRaf = null;

  var _bdayAudioCtx = null;
  var _bdayMasterGain = null;
  var _bdayMelodyOscillators = [];
  var _bdayMuted = false;

  var _bdayActiveTypewriter = null; /* {el, text, onDone, cancel} | null */

  var BDAY_BALLOON_COLORS = ['var(--rose)', 'var(--peach)', 'var(--lavender)', 'var(--rose-100)', 'var(--bear-blush)'];

  /* Chrome label CONTENT has no slot for — plain UI chrome (the overlay's own accessible name),
     not romantic/message text. Listed in this package's report per the module brief. */
  var BDAY_OVERLAY_ARIA_LABEL = 'Doğum günü sürprizi';

  /* Filenames the iOS/Android photo picker assigns when nothing better is given — never worth
     showing as a slideshow caption ("IMG_4821", "image", "photo (12)", etc). */
  var BDAY_CAMERA_FILENAME_RE = /^(img|dsc|dscn|pxl|image|photo|foto)[\s_-]*\d*$/i;

  /* The post-blow melody's own deferred-start timer (finishBlowing) — tracked here so a scene
     change or an overlay close can cancel it before it fires. */
  var _bdayMelodyTimeoutId = null;

  /* ── Small helpers ────────────────────────────────────────────────────── */

  /** Escapes text for HTML interpolation; reuses map.js's escapeHtml when present. */
  function bdayEsc(s) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(s);
    var d = document.createElement('div');
    d.textContent = s == null ? '' : s;
    return d.innerHTML;
  }

  function bdayPad2(n) {
    return (n < 10 ? '0' : '') + n;
  }

  /**
   * Days/hours/minutes/seconds remaining until 4 Oct 00:00 this year, via appNow() only. Only
   * meaningful while locked (appNow() < that date) — never negative in that case.
   */
  function bdayComputeRemaining() {
    var now = appNow();
    var target = new Date(now.getFullYear(), 9, 4, 0, 0, 0);
    var diff = target.getTime() - now.getTime();
    if (diff < 0) diff = 0;
    return {
      days: Math.floor(diff / 86400000),
      hours: Math.floor((diff % 86400000) / 3600000),
      minutes: Math.floor((diff % 3600000) / 60000),
      seconds: Math.floor((diff % 60000) / 1000)
    };
  }

  /* ── Gift box SVG (shared by the locked card and the scene-4 gift) ──────── */

  function bdayGiftSVG(opts) {
    opts = opts || {};
    var size = opts.size || 140;
    var height = Math.round(size * (150 / 170));
    return '<svg class="bday-gift-graphic' + (opts.className ? ' ' + opts.className : '') +
      '" viewBox="0 0 170 150" width="' + size + '" height="' + height +
      '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<rect x="20" y="70" width="130" height="70" rx="10" fill="var(--rose)" stroke="var(--berry)" stroke-width="3"/>' +
      '<rect x="76" y="70" width="18" height="70" fill="var(--peach)"/>' +
      '<g class="bday-gift-lid">' +
        '<rect x="10" y="46" width="150" height="30" rx="9" fill="var(--rose-strong)" stroke="var(--berry)" stroke-width="3"/>' +
        '<rect x="76" y="46" width="18" height="30" fill="var(--peach)"/>' +
        '<path d="M85 46 C70 20 40 26 50 42 C58 54 78 50 85 46 Z" fill="var(--rose-strong)" stroke="var(--berry)" stroke-width="2.5"/>' +
        '<path d="M85 46 C100 20 130 26 120 42 C112 54 92 50 85 46 Z" fill="var(--rose-strong)" stroke="var(--berry)" stroke-width="2.5"/>' +
        '<circle cx="85" cy="45" r="8" fill="var(--berry)"/>' +
      '</g>' +
    '</svg>';
  }

  function bdayBgBalloonsMarkup(n) {
    var out = '';
    var i, left, delay, color;
    for (i = 0; i < n; i++) {
      color = BDAY_BALLOON_COLORS[i % BDAY_BALLOON_COLORS.length];
      left = 6 + (i * (88 / Math.max(1, n - 1)));
      delay = (i * 1.1).toFixed(1);
      out += '<span class="bday-bg-balloon" style="left:' + left.toFixed(1) + '%;animation-delay:-' + delay + 's">' +
        '<span class="bday-bg-balloon-body" style="background:' + color + '"></span>' +
        '<span class="bday-bg-balloon-knot" style="background:' + color + '"></span>' +
        '<span class="bday-bg-balloon-string"></span>' +
      '</span>';
    }
    return out;
  }

  /* ── LOCKED / UNLOCKED tab rendering ─────────────────────────────────── */

  function bdayCountdownUnitsMarkup() {
    var units = [
      { key: 'days', label: 'gün' },
      { key: 'hours', label: 'saat' },
      { key: 'minutes', label: 'dakika' },
      { key: 'seconds', label: 'saniye' }
    ];
    return units.map(function (u) {
      return '<div class="countdown-unit"><span class="countdown-num" id="bday-cd-' + u.key + '">00</span>' +
        '<span class="countdown-unit-label">' + u.label + '</span></div>';
    }).join('');
  }

  function updateCountdownDisplay() {
    var r = bdayComputeRemaining();
    var d = document.getElementById('bday-cd-days');
    var h = document.getElementById('bday-cd-hours');
    var m = document.getElementById('bday-cd-minutes');
    var s = document.getElementById('bday-cd-seconds');
    if (d) d.textContent = String(r.days);
    if (h) h.textContent = bdayPad2(r.hours);
    if (m) m.textContent = bdayPad2(r.minutes);
    if (s) s.textContent = bdayPad2(r.seconds);
    return r;
  }

  function onLockedTap() {
    var wrap = document.getElementById('bday-gift-trigger');
    if (wrap) {
      wrap.classList.remove('bday-shake');
      void wrap.offsetWidth; /* restart the CSS animation on repeated taps */
      wrap.classList.add('bday-shake');
      if (!prefersReducedMotion()) fxHeartBurst(wrap);
    }
    var r = bdayComputeRemaining();
    var teases = CONTENT.birthday.locked.teases;
    /* On the eve (the whole day before unlock), days is 0 — "Sabret, daha 0 gün var" reads oddly,
       so on that day only the non-{days} teases are drawn from. */
    var pool = r.days > 0 ? teases : teases.filter(function (t) { return t.indexOf('{days}') === -1; });
    var line = pool[Math.floor(Math.random() * pool.length)].replace('{days}', String(r.days));
    var teaseEl = document.getElementById('bday-tease');
    if (teaseEl) teaseEl.textContent = line;
  }

  function renderLocked(root) {
    var c = CONTENT.birthday.locked;
    root.innerHTML =
      '<div class="bday-view bday-view--locked">' +
        '<div class="bday-lock-scene">' +
          '<button type="button" class="bday-guard" id="bday-gift-trigger" aria-label="Hediye kutusu">' +
            bdayGiftSVG({ size: 150, className: 'bday-gift-svg' }) +
            '<span class="bday-guard-bear">' + bearSVG({ mood: 'pleading', arms: 'wide', size: 84 }) + '</span>' +
          '</button>' +
          '<h2 class="bday-lock-title">' + bdayEsc(c.title) + '</h2>' +
          '<p class="bday-lock-subtitle">' + bdayEsc(c.subtitle) + '</p>' +
          '<div class="countdown bday-countdown" id="bday-countdown">' + bdayCountdownUnitsMarkup() + '</div>' +
          '<p class="bday-tease" id="bday-tease" aria-live="polite"></p>' +
        '</div>' +
      '</div>';

    document.getElementById('bday-gift-trigger').addEventListener('click', onLockedTap);
    updateCountdownDisplay();
  }

  function updateGiftNavGlow() {
    var navBtn = document.querySelector('.nav-btn--gift');
    if (!navBtn) return;
    var seen = storageGet('meryem-birthday-seen-year') === String(birthdayYear());
    navBtn.classList.toggle('is-glowing', isBirthdayUnlocked() && !seen);
  }

  function renderUnlocked(root) {
    var seen = storageGet('meryem-birthday-seen-year') === String(birthdayYear());
    /* CONTENT is the single source for this romantic copy; a fallback default covers the case
       CONTENT.birthday.ready is somehow missing (CONTENT is a read-only global this package
       never edits — the fallback is the only safety net if its shape ever changes). */
    var ready = (CONTENT.birthday && CONTENT.birthday.ready) || {};
    var readyTitle = ready.title || 'Sürprizin hazır! 🎉';
    var readySubtitle = (seen ? ready.again : ready.firstTime) || (seen
      ? 'İstersen tekrar aç, seninle her seferinde konuşmak isterim 💗'
      : 'Dokun ve doğum günü sürprizini gör');
    var couponsContent = CONTENT.birthday.coupons || {};
    var couponsTitle = couponsContent.title || 'Doğum günü kuponların 🎟️';
    root.innerHTML =
      '<div class="bday-view bday-view--unlocked">' +
        '<div class="bday-ready-card">' +
          '<div class="bday-ready-bear">' + bearSVG({ mood: 'love', hat: true, heart: true, arms: 'up', size: 120 }) + '</div>' +
          '<h2 class="bday-ready-title">' + bdayEsc(readyTitle) + '</h2>' +
          '<p class="bday-ready-subtitle">' + bdayEsc(readySubtitle) + '</p>' +
          '<button type="button" class="btn btn-primary bday-open-btn" id="bday-open-btn">🎁 Sürprizi Aç</button>' +
        '</div>' +
        '<div class="bday-coupons-tab-section">' +
          '<h3 class="bday-coupons-tab-title">' + bdayEsc(couponsTitle) + '</h3>' +
          '<div class="bday-coupon-booklet bday-coupon-booklet--tab" id="bday-coupon-booklet-tab">' + bdayCouponsListMarkup() + '</div>' +
        '</div>' +
      '</div>';
    bdayWireCouponContainer(document.getElementById('bday-coupon-booklet-tab'));

    document.getElementById('bday-open-btn').addEventListener('click', function () {
      /* Gate-aware (B1): a due gate owns opening the birthday surprise — jumping straight there
         would skip it, and it would then fire on her next reload, replaying the whole surprise a
         second time. startGateIfDue() is a harmless no-op re-entrant call if the gate is already
         mid-play from elsewhere. */
      if (window.isGateDue && window.isGateDue()) window.startGateIfDue();
      else openBirthdaySurprise();
    });
    updateGiftNavGlow();
  }

  function renderBirthdayRoot() {
    var root = document.getElementById('birthday-root');
    if (!root) return;
    var unlocked = isBirthdayUnlocked();
    _bdayCurrentState = unlocked ? 'unlocked' : 'locked';
    if (unlocked) renderUnlocked(root);
    else renderLocked(root);
  }

  function bdayTick() {
    var unlockedNow = isBirthdayUnlocked();
    var wasUnlocked = _bdayCurrentState === 'unlocked';
    if (unlockedNow !== wasUnlocked) {
      renderBirthdayRoot();
      if (unlockedNow) {
        /* B1: the clock crossing midnight WHILE the app is already open — nothing else re-checks
           the gate for that case (startGateIfDue() otherwise only runs once, at load, from
           app.js's initFeatures()). Other packages (words.js, daily.js) listen for this exact
           event name to re-render their own once-per-load content; keep it as written. */
        document.dispatchEvent(new CustomEvent('meryem:birthday-unlocked'));
        if (typeof window.startGateIfDue === 'function') window.startGateIfDue();
      }
    } else if (!unlockedNow) {
      updateCountdownDisplay();
    } else {
      updateGiftNavGlow();
    }
  }

  function initBirthday() {
    if (_bdayTickId) {
      clearInterval(_bdayTickId);
      _bdayTickId = null;
    }
    _bdayCurrentState = null;
    renderBirthdayRoot();
    _bdayTickId = setInterval(bdayTick, 1000);
    /* Probe once at load time and patch the scene list the moment it resolves — long before she
       could ever tap through to the scene right after the letter, whichever way it comes out. */
    bdayProbeVoiceUrl().then(function (voiceUrl) { _bdayScenes = bdayBuildScenes(voiceUrl); });
    maybeAutoOpenBirthday();
  }

  function maybeAutoOpenBirthday() {
    if (!isBirthdayUnlocked()) return;
    var seenYear = storageGet('meryem-birthday-seen-year');
    if (seenYear === String(birthdayYear())) return;
    if (window.isGateDue && window.isGateDue()) return;
    openBirthdaySurprise();
  }

  /* ── Web Audio: a shared context, and a music-box "Happy Birthday" ──────── */

  /**
   * iOS 17+'s navigator.audioSession — 'playback' ignores the ring/silent switch (WebKit bug
   * 237322, without it a pure Web Audio context is muted whenever the switch is on silent);
   * 'play-and-record' is what getUserMedia needs while the mic listens. A no-op everywhere else
   * (older iOS, desktop, Android) — never creates a new AudioContext, only routes the existing
   * one, so it is always safe to call outside a user gesture too.
   * @param {string} type
   */
  function bdaySetAudioSession(type) {
    try { if (navigator.audioSession) navigator.audioSession.type = type; } catch (e) { /* unsupported */ }
  }

  function ensureAudioContext() {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    if (!_bdayAudioCtx) {
      _bdayAudioCtx = new Ctx();
      _bdayMasterGain = _bdayAudioCtx.createGain();
      _bdayMasterGain.gain.value = _bdayMuted ? 0 : 0.18;
      _bdayMasterGain.connect(_bdayAudioCtx.destination);
    } else if (_bdayAudioCtx.state === 'suspended') {
      _bdayAudioCtx.resume();
    }
    return _bdayAudioCtx;
  }

  var BDAY_NOTE_FREQ = {
    C4: 261.63, D4: 293.66, E4: 329.63, F4: 349.23, G4: 392.00, A4: 440.00, AS4: 466.16, C5: 523.25
  };
  /* "Happy Birthday to You" — public domain melody, [note, beats]. */
  var BDAY_MELODY = [
    ['C4', 0.75], ['C4', 0.25], ['D4', 1], ['C4', 1], ['F4', 1], ['E4', 2],
    ['C4', 0.75], ['C4', 0.25], ['D4', 1], ['C4', 1], ['G4', 1], ['F4', 2],
    ['C4', 0.75], ['C4', 0.25], ['C5', 1], ['A4', 1], ['F4', 1], ['E4', 1], ['D4', 2],
    ['AS4', 0.75], ['AS4', 0.25], ['A4', 1], ['F4', 1], ['G4', 1], ['F4', 2]
  ];

  function stopMelody() {
    _bdayMelodyOscillators.forEach(function (osc) {
      try { osc.stop(); } catch (e) { /* already stopped */ }
    });
    _bdayMelodyOscillators = [];
  }

  /** A modest, bell-like music-box rendition. No-op if Web Audio is unavailable. */
  function playMelody() {
    var ctx = ensureAudioContext();
    if (!ctx) return;
    stopMelody();
    var t = ctx.currentTime + 0.05;
    var tempo = 0.42; /* seconds per beat */
    BDAY_MELODY.forEach(function (n) {
      var freq = BDAY_NOTE_FREQ[n[0]];
      var dur = n[1] * tempo;
      var osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.value = freq;
      var g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(1, t + 0.02);
      g.gain.exponentialRampToValueAtTime(0.001, t + dur);
      osc.connect(g);
      g.connect(_bdayMasterGain);
      osc.start(t);
      osc.stop(t + dur + 0.03);
      _bdayMelodyOscillators.push(osc);
      t += dur;
    });
  }

  function toggleMute() {
    _bdayMuted = !_bdayMuted;
    if (_bdayMasterGain) _bdayMasterGain.gain.value = _bdayMuted ? 0 : 0.18;
    var btn = document.getElementById('bday-mute-btn');
    if (btn) {
      btn.textContent = _bdayMuted ? '🔇' : '🔊';
      btn.setAttribute('aria-label', _bdayMuted ? 'Sesi aç' : 'Sesi kapat');
    }
  }

  /* ── Blow detector (pure, exposed for tests) ─────────────────────────── */

  /**
   * A tiny stateful detector: feed it RMS samples with their timestamp (ms); it returns true
   * exactly once each time the signal has stayed at/above `threshold` for `sustainMs`
   * continuously, then rearms so the next sustained blow can trigger again.
   * @param {{threshold?: number, sustainMs?: number}} [opts]
   */
  function makeBlowDetector(opts) {
    opts = opts || {};
    var threshold = opts.threshold || 0.16;
    var sustainMs = opts.sustainMs || 350;
    var aboveSinceMs = null;
    return {
      feed: function (rms, tMs) {
        if (rms >= threshold) {
          if (aboveSinceMs === null) aboveSinceMs = tMs;
          if (tMs - aboveSinceMs >= sustainMs) {
            aboveSinceMs = null;
            return true;
          }
        } else {
          aboveSinceMs = null;
        }
        return false;
      },
      reset: function () { aboveSinceMs = null; }
    };
  }

  /* ── Scene 2 (cake): candles, mic RMS, tap-to-blow ───────────────────── */

  function stopMicAndAnalyser() {
    if (_bdayMicRaf) {
      cancelAnimationFrame(_bdayMicRaf);
      _bdayMicRaf = null;
    }
    if (_bdayAnalyser) {
      try { _bdayAnalyser.disconnect(); } catch (e) { /* already gone */ }
      _bdayAnalyser = null;
    }
    if (_bdayMicStream) {
      _bdayMicStream.getTracks().forEach(function (t) { t.stop(); });
      _bdayMicStream = null;
    }
  }

  function updateFlameFlicker(rms) {
    if (!_bdayCandlesEl) return;
    var scaleY = 1 + Math.min(rms * 2.2, 0.9);
    var scaleX = 1 - Math.min(rms, 0.3) * 0.4;
    _bdayCandlesEl.forEach(function (btn) {
      if (!btn.classList.contains('is-lit')) return;
      var flame = btn.querySelector('.bday-flame');
      if (flame) flame.style.transform = 'scaleY(' + scaleY.toFixed(2) + ') scaleX(' + scaleX.toFixed(2) + ')';
    });
  }

  function startMicListening() {
    var micBtn = document.getElementById('bday-mic-btn');
    var deniedEl = document.getElementById('bday-mic-denied');
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      if (deniedEl) deniedEl.hidden = false;
      return;
    }
    bdaySetAudioSession('play-and-record');
    navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
    }).then(function (stream) {
      _bdayMicStream = stream;
      var ctx = ensureAudioContext();
      if (!ctx) {
        stream.getTracks().forEach(function (t) { t.stop(); });
        _bdayMicStream = null;
        if (deniedEl) deniedEl.hidden = false;
        return;
      }
      if (micBtn) micBtn.disabled = true;
      var source = ctx.createMediaStreamSource(stream);
      var analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      _bdayAnalyser = analyser;
      var detector = makeBlowDetector({ threshold: 0.16, sustainMs: 350 });
      var data = new Uint8Array(analyser.fftSize);
      function loop() {
        if (!_bdayAnalyser) return;
        analyser.getByteTimeDomainData(data);
        var i, v, sumSq = 0;
        for (i = 0; i < data.length; i++) {
          v = (data[i] - 128) / 128;
          sumSq += v * v;
        }
        var rms = Math.sqrt(sumSq / data.length);
        if (!prefersReducedMotion()) updateFlameFlicker(rms);
        if (detector.feed(rms, performance.now())) blowOutNextLitCandle();
        if (_bdayAnalyser) _bdayMicRaf = requestAnimationFrame(loop);
      }
      loop();
    }).catch(function () {
      if (deniedEl) deniedEl.hidden = false;
    });
  }

  function bdaySmokePuff(el) {
    var box = el.getBoundingClientRect();
    var layer = document.createElement('div');
    layer.className = 'bday-smoke-layer';
    layer.style.left = (box.left + box.width / 2) + 'px';
    layer.style.top = box.top + 'px';
    document.body.appendChild(layer);
    var i;
    for (i = 0; i < 3; i++) {
      var dot = document.createElement('span');
      dot.className = 'bday-smoke-dot';
      dot.style.animationDelay = (i * 60) + 'ms';
      dot.style.setProperty('--bday-smoke-dx', ((i - 1) * 8) + 'px');
      layer.appendChild(dot);
    }
    setTimeout(function () {
      if (layer.parentNode) layer.parentNode.removeChild(layer);
    }, 700);
  }

  function finishBlowing() {
    stopMicAndAnalyser();
    bdaySetAudioSession('playback');
    /* Cancel the scene's own pending "reveal" timers (wish-hide + blow-UI-show) — otherwise they
       fire later regardless of this early finish and re-surface the blow prompt UNDER the
       after-blow celebration this function is about to show. */
    _bdayCakeTimers.forEach(clearTimeout);
    _bdayCakeTimers = [];
    var wishTextEl = document.getElementById('bday-wish-text');
    if (wishTextEl) wishTextEl.hidden = true;
    var blowUi = document.getElementById('bday-blow-ui');
    if (blowUi) blowUi.hidden = true;
    var afterEl = document.getElementById('bday-after-blow');
    if (afterEl) afterEl.hidden = false;
    fxConfetti({});
    /* The melody waits ~400ms instead of starting the instant the mic path stops the stream —
       gives the audio-session route above time to flip back from play-and-record before the
       music plays, so it does not get stuck on the earpiece (M1). */
    if (_bdayMelodyTimeoutId) clearTimeout(_bdayMelodyTimeoutId);
    _bdayMelodyTimeoutId = setTimeout(function () {
      _bdayMelodyTimeoutId = null;
      playMelody();
    }, 400);
    var muteBtn = document.getElementById('bday-mute-btn');
    if (muteBtn) muteBtn.addEventListener('click', toggleMute);
    var cont = document.getElementById('bday-scene1-continue');
    if (cont) {
      cont.hidden = false;
      cont.addEventListener('click', function () {
        stopMelody();
        goToNextScene();
      });
    }
  }

  function blowOutCandle(idx) {
    var btn = _bdayCandlesEl && _bdayCandlesEl[idx];
    if (!btn || !btn.classList.contains('is-lit')) return;
    btn.classList.remove('is-lit');
    btn.classList.add('is-out');
    _bdayLitCount--;
    if (!prefersReducedMotion()) bdaySmokePuff(btn);
    if (_bdayLitCount <= 0) finishBlowing();
  }

  function blowOutNextLitCandle() {
    if (!_bdayCandlesEl) return;
    var i;
    for (i = 0; i < _bdayCandlesEl.length; i++) {
      if (_bdayCandlesEl[i].classList.contains('is-lit')) {
        blowOutCandle(i);
        return;
      }
    }
  }

  function renderSceneCake(stage) {
    var c = CONTENT.birthday;
    var candles = '';
    var i;
    for (i = 0; i < 5; i++) {
      candles += '<button type="button" class="bday-candle" data-candle="' + i + '" aria-label="Mum ' + (i + 1) + '">' +
        '<span class="bday-flame"></span><span class="bday-wick"></span></button>';
    }
    stage.innerHTML =
      '<div class="bday-scene bday-scene--cake">' +
        '<div class="bday-cake">' +
          '<div class="bday-cake-candles">' + candles + '</div>' +
          '<div class="bday-cake-layer bday-cake-layer--top"></div>' +
          '<div class="bday-cake-layer bday-cake-layer--mid"></div>' +
          '<div class="bday-cake-layer bday-cake-layer--base"></div>' +
          '<div class="bday-cake-plate"></div>' +
        '</div>' +
        '<p class="bday-wish-text" id="bday-wish-text" hidden></p>' +
        '<div class="bday-blow-ui" id="bday-blow-ui" hidden>' +
          '<p class="bday-blow-prompt">' + bdayEsc(c.blow.prompt) + '</p>' +
          '<button type="button" class="btn btn-primary" id="bday-mic-btn">' + bdayEsc(c.blow.micButton) + '</button>' +
          '<p class="bday-tap-hint">' + bdayEsc(c.blow.tapHint) + '</p>' +
          '<p class="bday-mic-denied" id="bday-mic-denied" hidden>' + bdayEsc(c.blow.micDenied) + '</p>' +
        '</div>' +
        '<div class="bday-after-blow" id="bday-after-blow" hidden>' +
          '<p class="bday-after-blow-text">' + bdayEsc(c.afterBlow) + '</p>' +
          '<button type="button" class="bday-mute-btn" id="bday-mute-btn" aria-label="Sesi kapat">🔊</button>' +
          '<button type="button" class="btn btn-primary bday-continue-btn" id="bday-scene1-continue" hidden>Devam 💕</button>' +
        '</div>' +
      '</div>';

    _bdayLitCount = 5;
    _bdayCandlesEl = stage.querySelectorAll('.bday-candle');
    _bdayCandlesEl.forEach(function (btn) {
      btn.addEventListener('click', function () {
        blowOutCandle(Number(btn.dataset.candle));
      });
    });

    var timers = [];
    _bdayCakeTimers = timers;
    var reduced = prefersReducedMotion();
    var stagger = reduced ? 0 : 420;
    _bdayCandlesEl.forEach(function (btn, idx) {
      timers.push(setTimeout(function () { btn.classList.add('is-lit'); }, idx * stagger));
    });
    timers.push(setTimeout(function () {
      var wishEl = document.getElementById('bday-wish-text');
      if (wishEl) {
        wishEl.hidden = false;
        wishEl.textContent = c.wish;
      }
    }, 5 * stagger + 150));
    timers.push(setTimeout(function () {
      var wishEl = document.getElementById('bday-wish-text');
      if (wishEl) wishEl.hidden = true;
      var blowUi = document.getElementById('bday-blow-ui');
      if (blowUi) blowUi.hidden = false;
    }, 5 * stagger + (reduced ? 500 : 2100)));

    document.getElementById('bday-mic-btn').addEventListener('click', function () {
      startMicListening();
    });

    return function cleanup() {
      timers.forEach(clearTimeout);
      _bdayCakeTimers = [];
      stopMicAndAnalyser();
      stopMelody();
      if (_bdayMelodyTimeoutId) { clearTimeout(_bdayMelodyTimeoutId); _bdayMelodyTimeoutId = null; }
    };
  }

  /* ── Scene 3 (balloons) ───────────────────────────────────────────────── */

  function renderSceneBalloons(stage) {
    var wishes = CONTENT.birthday.balloons;
    var balloonsPrompt = (CONTENT.birthday && CONTENT.birthday.balloonsPrompt) || 'Birini seç, bir dilek çıksın 🎈';
    var items = wishes.map(function (w, i) {
      return '<div class="bday-balloon-slot" data-slot="' + i + '">' +
        '<button type="button" class="bday-balloon" data-balloon="' + i +
          '" style="--bday-balloon-color:' + BDAY_BALLOON_COLORS[i % BDAY_BALLOON_COLORS.length] +
          '" aria-label="Balonu patlat">' +
          '<span class="bday-balloon-body"></span><span class="bday-balloon-knot"></span><span class="bday-balloon-string"></span>' +
        '</button>' +
      '</div>';
    }).join('');

    stage.innerHTML =
      '<div class="bday-scene bday-scene--balloons">' +
        '<p class="bday-scene-subtitle">' + bdayEsc(balloonsPrompt) + '</p>' +
        '<div class="bday-balloon-grid" id="bday-balloon-grid">' + items + '</div>' +
        '<p class="bday-balloon-counter" id="bday-balloon-counter">0 / ' + wishes.length + ' patlatıldı</p>' +
        '<button type="button" class="btn btn-primary bday-continue-btn" id="bday-scene2-continue">Devam 💕</button>' +
      '</div>';

    var popped = 0;
    stage.querySelectorAll('.bday-balloon').forEach(function (btn) {
      btn.addEventListener('click', function () {
        if (btn.classList.contains('is-popped')) return;
        btn.classList.add('is-popped');
        if (!prefersReducedMotion()) fxHeartBurst(btn);
        var i = Number(btn.dataset.balloon);
        var slot = btn.parentNode;
        /* Spans the full grid row instead of squeezing the wish text into one 4-column cell —
           narrow enough there for a long wish to wrap into 8-10 cramped lines. */
        slot.className = 'bday-balloon-slot bday-balloon-slot--revealed';
        slot.innerHTML = '<div class="bday-balloon-wish">' + bdayEsc(wishes[i]) + '</div>';
        popped++;
        var counter = document.getElementById('bday-balloon-counter');
        if (counter) counter.textContent = popped + ' / ' + wishes.length + ' patlatıldı';
      });
    });

    document.getElementById('bday-scene2-continue').addEventListener('click', function () { goToNextScene(); });
    return null;
  }

  /* ── Scene 4 (gift + letter) ──────────────────────────────────────────── */

  function bdayType(el, text, onDone) {
    var entry = { el: el, text: text, onDone: onDone, cancel: null };
    _bdayActiveTypewriter = entry;
    entry.cancel = fxTypewriter(el, text, {
      speed: 30,
      onDone: function () {
        if (_bdayActiveTypewriter === entry) _bdayActiveTypewriter = null;
        if (onDone) onDone();
      }
    });
  }

  function bdaySkipTypewriter() {
    var entry = _bdayActiveTypewriter;
    if (!entry) return false;
    _bdayActiveTypewriter = null;
    entry.cancel();
    entry.el.textContent = entry.text;
    if (entry.onDone) entry.onDone();
    return true;
  }

  /* Set by the letter's own tap handler (m15) — makes every remaining paragraph fill instantly
     instead of only the one currently typing, so "finish" is one tap, not one tap per paragraph.
     Reset at the top of every startLetterTyping() call. */
  var _bdayLetterSkipAll = false;

  function startLetterTyping(paragraphs) {
    _bdayLetterSkipAll = false;
    var i = 0;
    function typeNext() {
      if (i >= paragraphs.length) {
        var hintEl = document.getElementById('bday-letter-hint');
        if (hintEl) hintEl.hidden = true;
        var sig = document.getElementById('bday-letter-signature');
        if (sig) sig.hidden = false;
        var cont = document.getElementById('bday-scene3-continue');
        if (cont) {
          cont.hidden = false;
          cont.addEventListener('click', function () { goToNextScene(); });
        }
        return;
      }
      var el = document.getElementById('bday-letter-p-' + i);
      var text = paragraphs[i];
      i++;
      if (_bdayLetterSkipAll) {
        el.textContent = text;
        typeNext();
      } else {
        bdayType(el, text, typeNext);
      }
    }
    typeNext();
  }

  function renderSceneGiftLetter(stage) {
    var c = CONTENT.birthday;
    stage.innerHTML =
      '<div class="bday-scene bday-scene--giftletter">' +
        '<div class="bday-gift-open-wrap" id="bday-gift-open-wrap">' +
          '<p class="bday-scene-subtitle">' + bdayEsc(c.gift.prompt) + '</p>' +
          '<button type="button" class="bday-gift-open-btn" id="bday-gift-open-btn" aria-label="' + bdayEsc(c.gift.open) + '">' +
            bdayGiftSVG({ size: 130, className: 'bday-gift-svg bday-gift-svg--scene' }) +
          '</button>' +
          '<p class="bday-tap-hint">' + bdayEsc(c.gift.open) + '</p>' +
        '</div>' +
        '<div class="bday-letter card" id="bday-letter" hidden>' +
          '<p class="bday-letter-greeting">' + bdayEsc(c.letter.greeting) + '</p>' +
          '<p class="bday-tap-hint" id="bday-letter-hint">Bitirmek için dokun</p>' +
          '<div class="bday-letter-body" id="bday-letter-body">' +
            c.letter.paragraphs.map(function (_, i) { return '<p class="bday-letter-p" id="bday-letter-p-' + i + '"></p>'; }).join('') +
          '</div>' +
          '<p class="bday-letter-signature" id="bday-letter-signature" hidden>' + bdayEsc(c.letter.signature) + '</p>' +
          '<button type="button" class="btn btn-primary bday-continue-btn" id="bday-scene3-continue" hidden>Devam 💕</button>' +
        '</div>' +
      '</div>';

    document.getElementById('bday-gift-open-btn').addEventListener('click', function onOpenGift() {
      if (this.classList.contains('is-open')) return;
      this.classList.add('is-open');
      if (!prefersReducedMotion()) fxHeartBurst(this);
      setTimeout(function () {
        document.getElementById('bday-gift-open-wrap').hidden = true;
        var letter = document.getElementById('bday-letter');
        letter.hidden = false;
        startLetterTyping(c.letter.paragraphs);
      }, prefersReducedMotion() ? 0 : 550);
    });

    document.getElementById('bday-letter').addEventListener('click', function (e) {
      if (e.target.closest('.bday-continue-btn')) return;
      /* m15: one tap finishes the WHOLE letter, not just the paragraph mid-type — set before
         skipping the current one, so the chain of typeNext() calls it triggers also writes every
         later paragraph instantly instead of animating the next one. */
      _bdayLetterSkipAll = true;
      bdaySkipTypewriter();
    });

    return function cleanup() { bdaySkipTypewriter(); };
  }

  /* ── Voice message probing (audio/sesli-mesaj.*) ─────────────────────── */

  /* Extensions probed in order — the first that answers 200 to a HEAD request wins. Furkan drops
     one file at audio/sesli-mesaj.<ext> in the repo; none of these exist until he does, so the
     scene is skipped entirely on every load until then. */
  var BDAY_VOICE_EXTS = ['m4a', 'mp3', 'ogg', 'opus', 'wav'];

  var _bdayVoiceUrl; /* undefined = not probed yet, null = probed, none found, string = the url */
  var _bdayVoiceProbePromise = null;

  /**
   * Resolves to the first audio/sesli-mesaj.<ext> that exists (a cheap HEAD request, in order), or
   * null if none do. Cached for the page's lifetime — a rehearsal or a real visit only probes once.
   * @returns {Promise<string|null>}
   */
  function bdayProbeVoiceUrl() {
    if (_bdayVoiceProbePromise) return _bdayVoiceProbePromise;
    if (typeof fetch !== 'function') {
      _bdayVoiceUrl = null;
      _bdayVoiceProbePromise = Promise.resolve(null);
      return _bdayVoiceProbePromise;
    }
    function tryExt(i) {
      if (i >= BDAY_VOICE_EXTS.length) {
        _bdayVoiceUrl = null;
        return null;
      }
      var url = 'audio/sesli-mesaj.' + BDAY_VOICE_EXTS[i];
      return fetch(url, { method: 'HEAD', cache: 'no-store' }).then(function (res) {
        if (res && res.ok) {
          _bdayVoiceUrl = url;
          return url;
        }
        return tryExt(i + 1);
      })['catch'](function () { return tryExt(i + 1); });
    }
    _bdayVoiceProbePromise = tryExt(0);
    return _bdayVoiceProbePromise;
  }

  /* ── Scene: voice message (only when a recording exists) ─────────────── */

  /**
   * Builds the voice-message scene's render function bound to a known-present audio url. Not
   * included in the scene list at all when no recording exists (bdayBuildScenes() below).
   * @param {string} voiceUrl
   */
  function makeRenderSceneVoice(voiceUrl) {
    return function renderSceneVoice(stage) {
      var c = (CONTENT.birthday && CONTENT.birthday.voice) || {};
      var title = c.title || 'Bir de sana söylemek istediğim bir şey var';
      var hint = c.hint || 'Sesini aç, sonra kalbe dokun 🎧';
      var playLabel = c.play || 'Dinle';
      var pauseLabel = c.pause || 'Durdur';
      var r = 32;
      var circumference = 2 * Math.PI * r;

      stage.innerHTML =
        '<div class="bday-scene bday-scene--voice">' +
          '<div class="bday-voice-bear">' + bearSVG({ mood: 'love', heart: true, arms: 'down', size: 104 }) + '</div>' +
          '<h2 class="bday-voice-title">' + bdayEsc(title) + '</h2>' +
          '<p class="bday-scene-subtitle">' + bdayEsc(hint) + '</p>' +
          '<button type="button" class="bday-voice-play" id="bday-voice-play" aria-label="' + bdayEsc(playLabel) + '">' +
            '<svg class="bday-voice-ring" viewBox="0 0 72 72" width="72" height="72" aria-hidden="true">' +
              '<circle class="bday-voice-ring-track" cx="36" cy="36" r="' + r + '"/>' +
              '<circle class="bday-voice-ring-progress" id="bday-voice-ring-progress" cx="36" cy="36" r="' + r + '"' +
                ' style="stroke-dasharray:' + circumference.toFixed(2) + ';stroke-dashoffset:' + circumference.toFixed(2) + '"/>' +
            '</svg>' +
            '<span class="bday-voice-heart" id="bday-voice-heart" aria-hidden="true">💗</span>' +
          '</button>' +
          '<audio id="bday-voice-audio" preload="none" src="' + bdayEsc(voiceUrl) + '"></audio>' +
          '<button type="button" class="btn btn-primary bday-continue-btn" id="bday-scene-voice-continue">Devam 💕</button>' +
        '</div>';

      /* Defensive: any lingering music-box note (in theory already stopped by the cake scene's own
         teardown well before this scene can ever mount) is silenced the instant this scene shows,
         so her voice never has to compete with it. */
      stopMelody();

      var audio = document.getElementById('bday-voice-audio');
      var playBtn = document.getElementById('bday-voice-play');
      var ringProgress = document.getElementById('bday-voice-ring-progress');

      function updateRing() {
        var dur = audio.duration;
        var frac = (dur && isFinite(dur) && dur > 0) ? Math.min(1, audio.currentTime / dur) : 0;
        ringProgress.style.strokeDashoffset = (circumference * (1 - frac)).toFixed(2);
      }
      function setPlayingUi(isPlaying) {
        playBtn.classList.toggle('is-playing', isPlaying);
        playBtn.setAttribute('aria-label', isPlaying ? pauseLabel : playLabel);
      }
      audio.addEventListener('timeupdate', updateRing);
      audio.addEventListener('play', function () { setPlayingUi(true); });
      audio.addEventListener('pause', function () { setPlayingUi(false); });
      audio.addEventListener('ended', function () { setPlayingUi(false); updateRing(); });

      playBtn.addEventListener('click', function () {
        if (audio.paused) {
          stopMelody(); /* stop the music box before her voice plays */
          var playPromise = audio.play();
          if (playPromise && typeof playPromise['catch'] === 'function') {
            playPromise['catch'](function () { /* blocked/unsupported — she can just tap again */ });
          }
        } else {
          audio.pause();
        }
      });

      document.getElementById('bday-scene-voice-continue').addEventListener('click', function () { goToNextScene(); });

      return function cleanup() {
        audio.pause();
        try { audio.currentTime = 0; } catch (e) { /* metadata not loaded yet — nothing to reset */ }
      };
    };
  }

  /* ── Coupon storage (JSON map over time.js's storageGet/storageSet) ──── */

  var BDAY_COUPONS_KEY = 'meryem-coupons-used';

  /* Preview-mode shadow, same contract as js/words.js's own: while a rehearsal is live
     (?onizleme=dogumgunu), reads/writes to this key never touch real localStorage. Reproduced here
     because js/time.js's TIME_PREVIEW_PROTECTED_KEYS is frozen for this package and does not know
     this key. Seeded once from the real value, then every write during the rehearsal only updates
     the shadow copy and vanishes when the tab closes. */
  var _bdayCouponsShadow = null;

  function bdayReadRealCoupons() {
    try {
      var raw = storageGet(BDAY_COUPONS_KEY);
      var obj = raw ? JSON.parse(raw) : {};
      return (obj && typeof obj === 'object' && Object.prototype.toString.call(obj) !== '[object Array]') ? obj : {};
    } catch (e) {
      return {};
    }
  }

  function bdayReadCoupons() {
    var src = isPreviewMode() ? (function () {
      if (!_bdayCouponsShadow) _bdayCouponsShadow = bdayReadRealCoupons();
      return _bdayCouponsShadow;
    })() : bdayReadRealCoupons();
    var copy = {}, k;
    for (k in src) { if (Object.prototype.hasOwnProperty.call(src, k)) copy[k] = src[k]; }
    return copy;
  }

  function bdayWriteCoupons(obj) {
    if (isPreviewMode()) {
      _bdayCouponsShadow = obj;
      return;
    }
    storageSet(BDAY_COUPONS_KEY, JSON.stringify(obj));
  }

  function bdayTodayIso() {
    var now = appNow();
    return now.getFullYear() + '-' + bdayPad2(now.getMonth() + 1) + '-' + bdayPad2(now.getDate());
  }

  function bdayIsoToTr(iso) {
    var parts = String(iso || '').split('-');
    if (parts.length !== 3) return '';
    return parts[2] + '.' + parts[1] + '.' + parts[0];
  }

  /** Marks a coupon used (idempotent — a coupon already used keeps its original date) and persists. */
  function bdayMarkCouponUsed(id) {
    var all = bdayReadCoupons();
    if (all[id]) return all[id];
    var iso = bdayTodayIso();
    all[id] = iso;
    bdayWriteCoupons(all);
    return iso;
  }

  /* ── Coupon rendering (shared by the overlay scene and the 🎁-tab list) ── */

  function bdayCouponItemMarkup(item, usedIso) {
    var usedLabel = (CONTENT.birthday.coupons && CONTENT.birthday.coupons.used) || 'Kullanıldı';
    var stampText = usedIso ? (usedLabel + ' · ' + bdayIsoToTr(usedIso)) : '';
    return '<button type="button" class="bday-coupon' + (usedIso ? ' is-used' : '') +
        '" data-coupon="' + bdayEsc(item.id) + '" aria-label="' + bdayEsc(item.title) + '">' +
      '<span class="bday-coupon-emoji" aria-hidden="true">' + bdayEsc(item.emoji) + '</span>' +
      '<span class="bday-coupon-divider" aria-hidden="true"></span>' +
      '<span class="bday-coupon-body">' +
        '<span class="bday-coupon-title">' + bdayEsc(item.title) + '</span>' +
        '<span class="bday-coupon-text">' + bdayEsc(item.text) + '</span>' +
        '<span class="bday-coupon-stamp"' + (usedIso ? '' : ' hidden') + '>' + bdayEsc(stampText) + '</span>' +
      '</span>' +
    '</button>';
  }

  function bdayCouponsListMarkup() {
    var items = (CONTENT.birthday.coupons && CONTENT.birthday.coupons.items) || [];
    var used = bdayReadCoupons();
    return items.map(function (item) { return bdayCouponItemMarkup(item, used[item.id] || null); }).join('');
  }

  /** Stamps every on-screen instance of coupon `id` (the scene booklet AND the 🎁-tab list may
   *  both be in the DOM at once — updating by data-coupon reaches whichever exist). */
  function bdayApplyCouponStampToDom(id, iso) {
    var usedLabel = (CONTENT.birthday.coupons && CONTENT.birthday.coupons.used) || 'Kullanıldı';
    var stampText = usedLabel + ' · ' + bdayIsoToTr(iso);
    var nodes = document.querySelectorAll('.bday-coupon[data-coupon="' + id + '"]');
    Array.prototype.forEach.call(nodes, function (btn) {
      btn.classList.add('is-used');
      var stampEl = btn.querySelector('.bday-coupon-stamp');
      if (stampEl) {
        stampEl.textContent = stampText;
        stampEl.hidden = false;
      }
    });
  }

  /** Wires every .bday-coupon inside `container` via one delegated click listener. */
  function bdayWireCouponContainer(container) {
    if (!container) return;
    container.addEventListener('click', function (e) {
      var btn = e.target.closest ? e.target.closest('.bday-coupon') : null;
      if (!btn || btn.classList.contains('is-used')) return;
      var id = btn.getAttribute('data-coupon');
      var items = (CONTENT.birthday.coupons && CONTENT.birthday.coupons.items) || [];
      var item = null, i;
      for (i = 0; i < items.length; i++) {
        if (items[i].id === id) { item = items[i]; break; }
      }
      if (item) bdayOpenCouponConfirm(item, btn);
    });
  }

  /* ── Coupon confirm dialog (in-page — never window.confirm) ──────────── */

  var _bdayCouponConfirmCleanup = null;
  var _bdayCouponConfirmReturnFocus = null;

  function bdayBuildCouponConfirmDialog() {
    var existing = document.getElementById('bday-coupon-confirm');
    if (existing) return existing;
    var c = CONTENT.birthday.coupons || {};
    var el = document.createElement('div');
    el.className = 'bday-coupon-confirm';
    el.id = 'bday-coupon-confirm';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'bday-coupon-confirm-title');
    el.hidden = true;
    el.innerHTML =
      '<div class="bday-coupon-confirm-backdrop" id="bday-coupon-confirm-backdrop"></div>' +
      '<div class="bday-coupon-confirm-card">' +
        '<p class="bday-coupon-confirm-emoji" id="bday-coupon-confirm-emoji" aria-hidden="true"></p>' +
        '<h3 class="bday-coupon-confirm-title" id="bday-coupon-confirm-title"></h3>' +
        '<p class="bday-coupon-confirm-text">' + bdayEsc(c.confirm || 'Bu kuponu şimdi kullanmak istiyor musun?') + '</p>' +
        '<div class="bday-coupon-confirm-actions">' +
          '<button type="button" class="btn btn-primary" id="bday-coupon-confirm-yes">' + bdayEsc(c.yes || 'Evet, kullanıyorum') + '</button>' +
          '<button type="button" class="btn bday-coupon-confirm-no" id="bday-coupon-confirm-no">' + bdayEsc(c.no || 'Sonra') + '</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(el);
    el.querySelector('#bday-coupon-confirm-backdrop').addEventListener('click', bdayCloseCouponConfirm);
    return el;
  }

  function bdayCloseCouponConfirm() {
    var dialog = document.getElementById('bday-coupon-confirm');
    if (!dialog || dialog.hidden) return;
    if (_bdayCouponConfirmCleanup) {
      _bdayCouponConfirmCleanup();
      _bdayCouponConfirmCleanup = null;
    }
    dialog.hidden = true;
    var toFocus = _bdayCouponConfirmReturnFocus;
    _bdayCouponConfirmReturnFocus = null;
    if (toFocus && typeof toFocus.focus === 'function' && document.contains(toFocus)) {
      try { toFocus.focus(); } catch (e) { /* opener gone */ }
    }
  }

  function bdayOpenCouponConfirm(item, openerEl) {
    var dialog = bdayBuildCouponConfirmDialog();
    bdayCloseCouponConfirm(); /* safety: tear down a stale handler set from a previous open */
    _bdayCouponConfirmReturnFocus = openerEl || document.activeElement;
    document.getElementById('bday-coupon-confirm-emoji').textContent = item.emoji;
    document.getElementById('bday-coupon-confirm-title').textContent = item.title;

    var yesBtn = document.getElementById('bday-coupon-confirm-yes');
    var noBtn = document.getElementById('bday-coupon-confirm-no');

    function onYes() {
      var iso = bdayMarkCouponUsed(item.id);
      bdayApplyCouponStampToDom(item.id, iso);
      bdayCloseCouponConfirm();
    }
    function onNo() { bdayCloseCouponConfirm(); }
    function onKeydown(e) { if (e.key === 'Escape') bdayCloseCouponConfirm(); }

    yesBtn.addEventListener('click', onYes);
    noBtn.addEventListener('click', onNo);
    document.addEventListener('keydown', onKeydown);
    _bdayCouponConfirmCleanup = function () {
      yesBtn.removeEventListener('click', onYes);
      noBtn.removeEventListener('click', onNo);
      document.removeEventListener('keydown', onKeydown);
    };

    dialog.hidden = false;
    try { noBtn.focus(); } catch (e) { /* not focusable — ignore */ }
  }

  /* ── Scene: love coupons ──────────────────────────────────────────────── */

  function renderSceneCoupons(stage) {
    var c = CONTENT.birthday.coupons || {};
    stage.innerHTML =
      '<div class="bday-scene bday-scene--coupons">' +
        '<h2 class="bday-coupons-title">' + bdayEsc(c.title || 'Doğum günü kuponların 🎟️') + '</h2>' +
        '<p class="bday-scene-subtitle">' + bdayEsc(c.hint || '') + '</p>' +
        '<div class="bday-coupon-booklet" id="bday-coupon-booklet">' + bdayCouponsListMarkup() + '</div>' +
        '<button type="button" class="btn btn-primary bday-continue-btn" id="bday-scene-coupons-continue">Devam 💕</button>' +
      '</div>';
    bdayWireCouponContainer(document.getElementById('bday-coupon-booklet'));
    document.getElementById('bday-scene-coupons-continue').addEventListener('click', function () { goToNextScene(); });
    return null;
  }

  /* ── Scene 5 (slideshow) ──────────────────────────────────────────────── */

  function getMemoryPhotoUrlSafe(m) {
    try {
      if (typeof getMemoryPhotoUrl === 'function') {
        var u = getMemoryPhotoUrl(m);
        if (u) return u;
      }
    } catch (e) { /* fall through to thumbnail */ }
    try {
      if (typeof getMemoryThumbnailUrl === 'function') return getMemoryThumbnailUrl(m);
    } catch (e) { /* no photo available */ }
    return null;
  }

  function renderSceneSlideshow(stage) {
    var all = window.memories || [];
    /* firebase.js loads memories via orderBy('date', 'desc') — newest first. Reversed here so the
       slideshow tells her story chronologically instead of opening on the most recent photo
       (M19). */
    var photos = all.filter(function (m) { return !!getMemoryPhotoUrlSafe(m); }).reverse();
    if (photos.length === 0) {
      goToNextScene();
      return null;
    }

    var polaroids = photos.map(function (m, i) {
      var title = m.title || '';
      /* M7: a camera/picker filename ("IMG_4821", "image", "photo (12)") is never a real caption. */
      var showCaption = !!title && !BDAY_CAMERA_FILENAME_RE.test(title.trim());
      var rot = (i % 2 === 0 ? -1 : 1) * (4 + (i % 3) * 2);
      /* src/alt are set as DOM properties in the loop below, never concatenated into this HTML
         string — bdayEsc()/escapeHtml() only escapes for a TEXT node (it does not escape `"`),
         so a memory-supplied url/title with a quote in it could otherwise break out of the
         src="…"/alt="…" attribute (m1, defense in depth: only the signed-in owner writes this
         data). A DOM property assignment is never re-parsed as HTML, so it closes that gap
         completely rather than only narrowing it. */
      return '<figure class="bday-polaroid' + (i === 0 ? ' is-active' : '') + '" data-polaroid="' + i +
        '" style="--bday-tilt:' + rot + 'deg">' +
        '<img>' +
        (showCaption ? '<figcaption>' + bdayEsc(title) + '</figcaption>' : '') +
      '</figure>';
    }).join('');

    stage.innerHTML =
      '<div class="bday-scene bday-scene--slideshow">' +
        '<p class="bday-scene-subtitle">' + bdayEsc(CONTENT.birthday.slideshow.title) + '</p>' +
        '<div class="bday-polaroid-stack" id="bday-polaroid-stack">' + polaroids + '</div>' +
        '<button type="button" class="btn btn-primary bday-continue-btn" id="bday-scene4-continue">Devam 💕</button>' +
      '</div>';

    var frames = stage.querySelectorAll('.bday-polaroid');
    frames.forEach(function (fig, i) {
      var m = photos[i];
      var img = fig.querySelector('img');
      if (!img) return;
      var url = getMemoryPhotoUrlSafe(m);
      var thumb = (typeof getMemoryThumbnailUrl === 'function') ? getMemoryThumbnailUrl(m) : null;
      /* A soft blush preview (css/birthday.css) shows behind the full 1600px Drive image while it
         loads on mobile data (M19). */
      if (thumb) img.style.backgroundImage = 'url(' + JSON.stringify(thumb) + ')';
      img.alt = m.title || '';
      img.src = url;
      if (thumb && thumb !== url) {
        img.addEventListener('error', function onImgError() {
          img.removeEventListener('error', onImgError);
          img.src = thumb;
        });
      }
    });

    var idx = 0;
    var timer = null;
    /* M5: this used to also require !prefersReducedMotion(), which meant the slideshow never
       left the first photo under reduced motion — lost content, not reduced motion. The
       reduced-motion block already sets .bday-polaroid { transition: none }, so the swap below
       becomes an instant cut instead of an animated cross-fade; the photos still change. */
    if (frames.length > 1) {
      timer = setInterval(function () {
        frames[idx].classList.remove('is-active');
        idx = (idx + 1) % frames.length;
        frames[idx].classList.add('is-active');
      }, 2600);
    }

    document.getElementById('bday-scene4-continue').addEventListener('click', function () { goToNextScene(); });
    return function cleanup() { if (timer) clearInterval(timer); };
  }

  /* ── Scene 6 (end) ────────────────────────────────────────────────────── */

  function renderSceneEnd(stage) {
    var c = CONTENT.birthday.end;
    stage.innerHTML =
      '<div class="bday-scene bday-scene--end">' +
        '<div class="bday-end-hug">' + hugSVG({ size: 210 }) + '</div>' +
        '<h2 class="bday-end-title">' + bdayEsc(c.title) + '</h2>' +
        '<button type="button" class="btn btn-primary bday-end-btn" id="bday-end-btn">' + bdayEsc(c.button) + '</button>' +
      '</div>';
    document.getElementById('bday-end-btn').addEventListener('click', function () { closeBirthdaySurprise(); });
    return null;
  }

  /* ── Scene 1 (title) ──────────────────────────────────────────────────── */

  function renderSceneTitle(stage) {
    var c = CONTENT.birthday;
    stage.innerHTML =
      '<div class="bday-scene bday-scene--title">' +
        '<div class="bday-bg-balloons" aria-hidden="true">' + bdayBgBalloonsMarkup(6) + '</div>' +
        '<div class="bday-hat-bears">' +
          bearSVG({ mood: 'happy', hat: true, arms: 'wave', size: 74 }) +
          bearSVG({ mood: 'love', hat: true, arms: 'up', size: 74 }) +
        '</div>' +
        '<h1 class="bday-title-script" id="bday-title-text"></h1>' +
        '<button type="button" class="btn btn-primary bday-continue-btn" id="bday-scene0-continue">Devam 💕</button>' +
      '</div>';

    var titleEl = document.getElementById('bday-title-text');
    var cancelType = fxTypewriter(titleEl, c.title, { speed: 55 });
    document.getElementById('bday-scene0-continue').addEventListener('click', function () {
      bdaySetAudioSession('playback');
      ensureAudioContext();
      goToNextScene();
    });
    return function cleanup() { cancelType(); };
  }

  /* ── Scene stepper + overlay open/close ──────────────────────────────── */

  /**
   * The overlay's scene list, built once the voice-file probe resolves — with the voice scene
   * spliced in right after the letter only when a recording was found; the love-coupons scene
   * always follows (after the voice scene, or straight after the letter when there is none).
   * @param {string|null} voiceUrl
   */
  function bdayBuildScenes(voiceUrl) {
    var scenes = [renderSceneTitle, renderSceneCake, renderSceneBalloons, renderSceneGiftLetter];
    if (voiceUrl) scenes.push(makeRenderSceneVoice(voiceUrl));
    scenes.push(renderSceneCoupons);
    scenes.push(renderSceneSlideshow);
    scenes.push(renderSceneEnd);
    return scenes;
  }

  var _bdayScenes = bdayBuildScenes(null);
  var _bdaySceneIndex = -1;

  function bdayFocusEl(el) {
    if (!el) return;
    try { el.focus(); } catch (e) { /* not focusable — ignore */ }
  }

  /** A light Tab-key focus trap for #birthday-overlay, mirroring js/gate.js's own (private, not
   *  reusable from here) _onOverlayKeydown — keeps focus cycling within the overlay's visible,
   *  enabled controls even where `inert` support is missing on #app-content. */
  function bdayOverlayKeydown(e) {
    if (e.key === 'Escape') { closeBirthdaySurprise(); return; }
    if (e.key !== 'Tab') return;
    var overlay = document.getElementById('birthday-overlay');
    if (!overlay) return;
    var nodes = overlay.querySelectorAll('button, [tabindex]');
    var list = [];
    var i, el;
    for (i = 0; i < nodes.length; i++) {
      el = nodes[i];
      if (el.disabled) continue;
      if (el.getAttribute('tabindex') === '-1') continue;
      if (el.getClientRects().length === 0) continue;
      list.push(el);
    }
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      bdayFocusEl(last);
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      bdayFocusEl(first);
    }
  }

  function goToScene(index) {
    if (_bdaySceneCleanup) {
      try { _bdaySceneCleanup(); } catch (e) { /* scene already torn down */ }
      _bdaySceneCleanup = null;
    }
    var stage = document.getElementById('bday-scene-stage');
    if (!stage || index < 0 || index >= _bdayScenes.length) return;
    _bdaySceneIndex = index;
    var cleanup = _bdayScenes[index](stage);
    if (typeof cleanup === 'function') _bdaySceneCleanup = cleanup;
  }

  /** Advances one scene from wherever the stepper currently sits — every scene's own continue
   *  button calls this instead of a hardcoded index, so bdayBuildScenes() can splice the voice
   *  scene in or out without renumbering every other scene's click handler. */
  function goToNextScene() {
    goToScene(_bdaySceneIndex + 1);
  }

  function openBirthdaySurprise() {
    /* M2: the seen-year flag is written on CLOSE (closeBirthdaySurprise), not here. Writing it
       the moment the overlay opens meant an interrupted surprise (a call, iOS evicting the
       backgrounded app) never got re-offered — maybeAutoOpenBirthday() saw the flag already set
       and silently left her on the plain "yeniden aç" card. */
    _bdayReturnFocusEl = document.activeElement;

    var overlay = document.getElementById('birthday-overlay');
    if (!overlay) return;
    /* Matches js/gate.js's own overlay contract for the identical role="dialog" aria-modal="true"
       markup: inert the app behind it, name the dialog, and trap Tab inside it. */
    var appContent = document.getElementById('app-content');
    if (appContent) appContent.setAttribute('inert', '');
    overlay.innerHTML =
      '<button type="button" class="icon-btn bday-close-btn" id="bday-close-btn" aria-label="Kapat">&times;</button>' +
      '<div class="bday-scene-stage" id="bday-scene-stage"></div>';
    overlay.hidden = false;
    overlay.setAttribute('aria-label', BDAY_OVERLAY_ARIA_LABEL);
    overlay.addEventListener('keydown', bdayOverlayKeydown);
    document.body.style.overflow = 'hidden';
    document.getElementById('bday-close-btn').addEventListener('click', closeBirthdaySurprise);

    /* _bdayScenes already reflects whether a voice recording exists — initBirthday() kicked off
       the (cached) probe at load time and patches it in the background the moment it resolves, so
       the title scene never waits on a network round-trip to appear. By the time she could ever
       reach the scene right after the letter (several scenes and animations later), the probe has
       long since resolved either way. */
    goToScene(0);
  }

  function closeBirthdaySurprise() {
    if (_bdaySceneCleanup) {
      try { _bdaySceneCleanup(); } catch (e) { /* scene already torn down */ }
      _bdaySceneCleanup = null;
    }
    bdayCloseCouponConfirm();
    stopMicAndAnalyser();
    stopMelody();
    if (_bdayMelodyTimeoutId) { clearTimeout(_bdayMelodyTimeoutId); _bdayMelodyTimeoutId = null; }
    bdaySetAudioSession('auto');

    /* M2: written here (on a real close), not the moment the overlay opened — see
       openBirthdaySurprise()'s own comment. storageSet() is itself a no-op in preview mode
       (time.js's TIME_PREVIEW_PROTECTED_KEYS), so a rehearsal still persists nothing. */
    storageSet('meryem-birthday-seen-year', String(birthdayYear()));
    updateGiftNavGlow();

    var overlay = document.getElementById('birthday-overlay');
    if (overlay) {
      overlay.hidden = true;
      overlay.innerHTML = '';
      overlay.removeAttribute('aria-label');
      overlay.removeEventListener('keydown', bdayOverlayKeydown);
    }
    var appContent = document.getElementById('app-content');
    if (appContent) appContent.removeAttribute('inert');
    document.body.style.overflow = '';
    if (_bdayReturnFocusEl && typeof _bdayReturnFocusEl.focus === 'function') {
      try { _bdayReturnFocusEl.focus(); } catch (e) { /* element gone/unfocusable */ }
    }
    showTab('birthday-view');
  }

  /* ── Contract ─────────────────────────────────────────────────────────── */

  window.initBirthday = initBirthday;
  window.maybeAutoOpenBirthday = maybeAutoOpenBirthday;
  window.openBirthdaySurprise = openBirthdaySurprise;
  /* Testing hook only (per the module's own test brief) — a pure RMS-over-time detector factory,
     so tests/checks/birthday.mjs can prove the "sustained blow" logic with synthetic frames and
     no real microphone. */
  window.birthdayBlowDetector = makeBlowDetector;
  /* Testing hooks only — let tests/checks/birthday.mjs force the music-box melody into a
     still-playing state right before the voice scene mounts, so the mutant that drops the scene's
     own defensive stopMelody() call can be proven to fail. Never referenced by product code. */
  window.birthdayTestStartMelody = playMelody;
  window.birthdayTestIsMelodyPlaying = function () { return _bdayMelodyOscillators.length > 0; };
})();
