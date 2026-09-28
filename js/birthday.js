/**
 * Meryem App — Birthday surprise (Sürpriz)
 * Owns #birthday-root (the 🎁 tab) and the contents of #birthday-overlay (the full-screen
 * surprise). Two tab states — LOCKED (a guarded gift box with a live countdown) and UNLOCKED (a
 * card that opens the surprise) — plus a six-scene overlay: title, cake, balloons, gift+letter,
 * slideshow, end. Every timer/animation this file starts is torn down when its scene ends, the
 * overlay closes, or initBirthday() runs again.
 *
 * Contract (window-exposed): initBirthday(), maybeAutoOpenBirthday(), openBirthdaySurprise().
 * Also exposes birthdayBlowDetector() (a pure RMS-over-time detector factory) purely so
 * tests/checks/birthday.mjs can prove the "blow" logic without a real microphone.
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
      { key: 'days', label: 'Gün' },
      { key: 'hours', label: 'Saat' },
      { key: 'minutes', label: 'Dakika' },
      { key: 'seconds', label: 'Saniye' }
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
    root.innerHTML =
      '<div class="bday-view bday-view--unlocked">' +
        '<div class="bday-ready-card">' +
          '<div class="bday-ready-bear">' + bearSVG({ mood: 'love', hat: true, heart: true, arms: 'up', size: 120 }) + '</div>' +
          '<h2 class="bday-ready-title">Sürprizin hazır! 🎉</h2>' +
          '<p class="bday-ready-subtitle">' + (seen
            ? 'İstersen tekrar aç, seninle her seferinde konuşmak isterim 💗'
            : 'Dokun ve doğum günü sürprizini gör') + '</p>' +
          '<button type="button" class="btn btn-primary bday-open-btn" id="bday-open-btn">🎁 Sürprizi Aç</button>' +
        '</div>' +
      '</div>';

    document.getElementById('bday-open-btn').addEventListener('click', function () {
      openBirthdaySurprise();
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
    navigator.mediaDevices.getUserMedia({ audio: true }).then(function (stream) {
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
    playMelody();
    var muteBtn = document.getElementById('bday-mute-btn');
    if (muteBtn) muteBtn.addEventListener('click', toggleMute);
    var cont = document.getElementById('bday-scene1-continue');
    if (cont) {
      cont.hidden = false;
      cont.addEventListener('click', function () {
        stopMelody();
        goToScene(2);
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
    };
  }

  /* ── Scene 3 (balloons) ───────────────────────────────────────────────── */

  function renderSceneBalloons(stage) {
    var wishes = CONTENT.birthday.balloons;
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
        '<p class="bday-scene-subtitle">Birini seç, bir dilek çıksın 🎈</p>' +
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

    document.getElementById('bday-scene2-continue').addEventListener('click', function () { goToScene(3); });
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

  function startLetterTyping(paragraphs) {
    var i = 0;
    function typeNext() {
      if (i >= paragraphs.length) {
        var sig = document.getElementById('bday-letter-signature');
        if (sig) sig.hidden = false;
        var cont = document.getElementById('bday-scene3-continue');
        if (cont) {
          cont.hidden = false;
          cont.addEventListener('click', function () { goToScene(4); });
        }
        return;
      }
      var el = document.getElementById('bday-letter-p-' + i);
      var text = paragraphs[i];
      i++;
      bdayType(el, text, typeNext);
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
          '<p class="bday-tap-hint">Bitirmek için dokun</p>' +
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
      bdaySkipTypewriter();
    });

    return function cleanup() { bdaySkipTypewriter(); };
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
    var photos = all.filter(function (m) { return !!getMemoryPhotoUrlSafe(m); });
    if (photos.length === 0) {
      goToScene(5);
      return null;
    }

    var polaroids = photos.map(function (m, i) {
      var url = getMemoryPhotoUrlSafe(m);
      var thumb = (typeof getMemoryThumbnailUrl === 'function') ? getMemoryThumbnailUrl(m) : null;
      var rot = (i % 2 === 0 ? -1 : 1) * (4 + (i % 3) * 2);
      return '<figure class="bday-polaroid' + (i === 0 ? ' is-active' : '') + '" data-polaroid="' + i +
        '" style="--bday-tilt:' + rot + 'deg">' +
        '<img src="' + url + '" alt="' + bdayEsc(m.title || '') + '"' +
          (thumb && thumb !== url ? ' onerror="this.onerror=null;this.src=\'' + thumb + '\'"' : '') + '>' +
        (m.title ? '<figcaption>' + bdayEsc(m.title) + '</figcaption>' : '') +
      '</figure>';
    }).join('');

    stage.innerHTML =
      '<div class="bday-scene bday-scene--slideshow">' +
        '<p class="bday-scene-subtitle">' + bdayEsc(CONTENT.birthday.slideshow.title) + '</p>' +
        '<div class="bday-polaroid-stack" id="bday-polaroid-stack">' + polaroids + '</div>' +
        '<button type="button" class="btn btn-primary bday-continue-btn" id="bday-scene4-continue">Devam 💕</button>' +
      '</div>';

    var idx = 0;
    var frames = stage.querySelectorAll('.bday-polaroid');
    var timer = null;
    if (frames.length > 1 && !prefersReducedMotion()) {
      timer = setInterval(function () {
        frames[idx].classList.remove('is-active');
        idx = (idx + 1) % frames.length;
        frames[idx].classList.add('is-active');
      }, 2600);
    }

    document.getElementById('bday-scene4-continue').addEventListener('click', function () { goToScene(5); });
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
      ensureAudioContext();
      goToScene(1);
    });
    return function cleanup() { cancelType(); };
  }

  /* ── Scene stepper + overlay open/close ──────────────────────────────── */

  var BDAY_SCENES = [renderSceneTitle, renderSceneCake, renderSceneBalloons, renderSceneGiftLetter, renderSceneSlideshow, renderSceneEnd];

  function bdayFocusEl(el) {
    if (!el) return;
    try { el.focus(); } catch (e) { /* not focusable — ignore */ }
  }

  /** A light Tab-key focus trap for #birthday-overlay, mirroring js/gate.js's own (private, not
   *  reusable from here) _onOverlayKeydown — keeps focus cycling within the overlay's visible,
   *  enabled controls even where `inert` support is missing on #app-content. */
  function bdayOverlayKeydown(e) {
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
    if (!stage || index < 0 || index >= BDAY_SCENES.length) return;
    var cleanup = BDAY_SCENES[index](stage);
    if (typeof cleanup === 'function') _bdaySceneCleanup = cleanup;
  }

  function openBirthdaySurprise() {
    storageSet('meryem-birthday-seen-year', String(birthdayYear()));
    updateGiftNavGlow();
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

    goToScene(0);
  }

  function closeBirthdaySurprise() {
    if (_bdaySceneCleanup) {
      try { _bdaySceneCleanup(); } catch (e) { /* scene already torn down */ }
      _bdaySceneCleanup = null;
    }
    stopMicAndAnalyser();
    stopMelody();

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
})();
