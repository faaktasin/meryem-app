/**
 * Meryem App — Love-question gate overlay
 * The "beni ne kadar seviyorsun" playthrough: a growing-Yes/shrinking-No question, a few playful
 * follow-ups, a love meter, and a hugging finale. Renders into the frozen #gate-overlay shell.
 *
 * Contract (called by app.js / firebase.js, both frozen):
 *   window.isGateDue()       true once her birthday has started and this year's play is unplayed
 *   window.startGateIfDue()  opens the automatic birthday sequence when isGateDue()
 *   window.replayGate()      opens the shorter replay sequence any time
 * #gate-replay-btn (header) un-hides once the gate has ever been completed and replays it.
 */
(function () {
  'use strict';

  var GATE_FLAG_KEY = 'meryem-gate-played-year';

  var BEAR_SIZE = 128;
  var HUG_SIZE = 200;
  var REPLY_MS = 1600;
  var HOP_FROM_PRESS = 4;
  var HOP_MARGIN = 16;
  var HOP_OVERLAP_MARGIN = 14;
  var HOP_MAX_TRIES = 40;

  var YES_BASE_FONT = 17, YES_BASE_PAD_Y = 14, YES_BASE_PAD_X = 28, YES_MAX_SCALE = 3;
  var NO_BASE_HEIGHT = 56, NO_BASE_FONT = 16, NO_BASE_PAD_X = 22, NO_MIN_HEIGHT = 24, NO_DECAY = 0.85;

  var METER_ARM_STEPS = 20, METER_KEY_STEP = 0.1, METER_TAP_STEP = 0.15;

  /* Chrome labels CONTENT has no slot for — plain UI chrome, not romantic/message text. Listed
     in this package's report for the owner to fold into CONTENT if he wants them there instead. */
  var GATE_MORE_LABEL = '+ daha çok';
  var GATE_METER_ARIA_LABEL = 'Sevgi göstergesi';
  var GATE_OVERLAY_ARIA_LABEL = 'Sevgi soruları';

  var GATE_HEART_PATH_D = 'M0 8 C-10 -4 -26 4 -26 18 C-26 34 0 52 0 52 C0 52 26 34 26 18 C26 4 10 -4 0 8 Z';
  var GATE_HEART_SVG_BG = '<svg class="gate-meter-heart-bg" viewBox="-30 -6 60 62" aria-hidden="true">' +
    '<path d="' + GATE_HEART_PATH_D + '" fill="var(--rose-100)" stroke="var(--rose-strong)" stroke-width="3"/></svg>';
  var GATE_HEART_SVG_FILL = '<svg class="gate-meter-heart-fill" viewBox="-30 -6 60 62" aria-hidden="true">' +
    '<path d="' + GATE_HEART_PATH_D + '" fill="var(--rose-strong)"/></svg>';
  var GATE_HEART_ICON = '<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true">' +
    '<path fill="currentColor" d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>';

  var _els = { overlay: null, stage: null, progress: null };
  var _state = null; /* the current playthrough, or null when the gate is closed */
  var _previousActiveElement = null;
  var _completedThisSession = false;

  /* ── Public contract ─────────────────────────────────── */

  function isGateDue() {
    return isBirthdayUnlocked() && storageGet(GATE_FLAG_KEY) !== String(birthdayYear());
  }

  function startGateIfDue() {
    if (isGateDue()) _playSequence(true);
  }

  function replayGate() {
    _playSequence(false);
  }

  window.isGateDue = isGateDue;
  window.startGateIfDue = startGateIfDue;
  window.replayGate = replayGate;

  /* ── Sequence engine ─────────────────────────────────── */

  function _playSequence(birthdayPlay) {
    if (_state) return; /* already playing — ignore re-entrancy */
    _state = {
      birthdayPlay: !!birthdayPlay,
      steps: _buildSteps(!!birthdayPlay),
      stepIndex: 0,
      questionPresses: 0,
      yesScale: 1,
      advancing: false,
      meterValue: 0,
      meterQuantized: -1
    };
    _openOverlay();
    _renderStep();
  }

  function _buildSteps(birthdayPlay) {
    var steps = [];
    steps.push({ type: 'question', data: CONTENT.gate.opener });
    if (birthdayPlay) steps.push({ type: 'question', data: CONTENT.gate.birthday[0] });
    var picks = _pickRandomDistinct(CONTENT.gate.pool, 3);
    for (var i = 0; i < picks.length; i++) steps.push({ type: 'question', data: picks[i] });
    steps.push({ type: 'meter' });
    if (birthdayPlay) steps.push({ type: 'question', data: CONTENT.gate.birthday[1] });
    steps.push({ type: 'finale' });
    return steps;
  }

  function _pickRandomDistinct(arr, n) {
    var pool = arr.slice();
    var picked = [];
    var count = Math.min(n, pool.length);
    for (var i = 0; i < count; i++) {
      var idx = Math.floor(Math.random() * pool.length);
      picked.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return picked;
  }

  function _advance() {
    _state.stepIndex++;
    _renderStep();
  }

  function _renderStep() {
    _updateProgress();
    var step = _state.steps[_state.stepIndex];
    if (!step) return;
    if (step.type === 'question') _renderQuestion(step.data);
    else if (step.type === 'meter') _renderMeter();
    else if (step.type === 'finale') _renderFinale();
  }

  function _updateProgress() {
    if (!_els.progress) return;
    var total = 0, idx = -1;
    for (var i = 0; i < _state.steps.length; i++) {
      if (_state.steps[i].type !== 'finale') {
        if (i === _state.stepIndex) idx = total;
        total++;
      }
    }
    if (idx === -1) idx = total; /* on the finale — every step already done */
    var html = '';
    for (var j = 0; j < total; j++) {
      var cls = 'gate-progress-heart';
      if (j < idx) cls += ' is-done';
      else if (j === idx) cls += ' is-current';
      html += '<span class="' + cls + '">' + GATE_HEART_ICON + '</span>';
    }
    _els.progress.innerHTML = html;
  }

  /* ── Overlay open/close, focus & scroll lock ────────────── */

  function _openOverlay() {
    var overlay = _els.overlay;
    _previousActiveElement = document.activeElement;
    var appContent = document.getElementById('app-content');
    if (appContent) appContent.setAttribute('inert', '');

    overlay.innerHTML =
      '<div class="gate-bg-pattern" aria-hidden="true"></div>' +
      '<div class="gate-shell">' +
        '<div class="gate-progress" id="gate-progress" aria-hidden="true"></div>' +
        '<div class="gate-stage" id="gate-stage"></div>' +
      '</div>';
    _els.stage = document.getElementById('gate-stage');
    _els.progress = document.getElementById('gate-progress');

    overlay.hidden = false;
    overlay.setAttribute('aria-label', GATE_OVERLAY_ARIA_LABEL);
    document.body.style.overflow = 'hidden';
  }

  function _closeGate() {
    var overlay = _els.overlay;
    overlay.hidden = true;
    overlay.innerHTML = '';
    overlay.removeAttribute('aria-label');
    var appContent = document.getElementById('app-content');
    if (appContent) appContent.removeAttribute('inert');
    document.body.style.overflow = '';
    _state = null;

    var toFocus = _previousActiveElement;
    _previousActiveElement = null;
    if (toFocus && typeof toFocus.focus === 'function' && document.contains(toFocus)) {
      try { toFocus.focus(); } catch (e) { /* element no longer focusable — ignore */ }
    }
  }

  function _focusEl(el) {
    if (!el) return;
    try { el.focus({ preventScroll: true }); } catch (e) {
      try { el.focus(); } catch (e2) { /* not focusable — ignore */ }
    }
  }

  /** A light Tab-key focus trap, in addition to `inert` on #app-content: keeps focus cycling
   *  within the overlay's own visible, enabled controls even if `inert` is unsupported. */
  function _onOverlayKeydown(e) {
    if (e.key !== 'Tab') return;
    var nodes = _els.overlay.querySelectorAll('button, [tabindex]');
    var list = [];
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      if (el.disabled) continue;
      if (el.getAttribute('tabindex') === '-1') continue;
      /* getClientRects(), not offsetParent — offsetParent is null for position:fixed elements
         (the hopping No button), which would otherwise drop out of the trap while very visible. */
      if (el.getClientRects().length === 0) continue;
      list.push(el);
    }
    if (!list.length) return;
    var first = list[0], last = list[list.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault(); _focusEl(last);
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault(); _focusEl(first);
    }
  }

  /* ── Question step ───────────────────────────────────── */

  function _renderQuestion(qData) {
    _state.questionPresses = 0;
    _state.yesScale = 1;
    _state.advancing = false;

    var stage = _els.stage;
    stage.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'gate-question';

    var bearSlot = document.createElement('div');
    bearSlot.className = 'gate-bear-slot';
    bearSlot.innerHTML = bearSVG({ mood: 'normal', size: BEAR_SIZE });
    wrap.appendChild(bearSlot);

    var qText = document.createElement('p');
    qText.className = 'gate-question-text';
    qText.setAttribute('aria-live', 'polite');
    qText.textContent = qData.q;
    wrap.appendChild(qText);

    var btnRow = document.createElement('div');
    btnRow.className = 'gate-btn-row';

    var noBtn = document.createElement('button');
    noBtn.type = 'button';
    noBtn.className = 'gate-btn gate-btn-no';
    noBtn.textContent = CONTENT.gate.noLabels[0];

    var yesBtn = document.createElement('button');
    yesBtn.type = 'button';
    yesBtn.className = 'gate-btn gate-btn-yes';
    yesBtn.textContent = CONTENT.gate.yesLabel;

    btnRow.appendChild(noBtn);
    btnRow.appendChild(yesBtn);
    wrap.appendChild(btnRow);

    var replyEl = document.createElement('p');
    replyEl.className = 'gate-reply';
    replyEl.setAttribute('aria-live', 'polite');
    replyEl.hidden = true;
    wrap.appendChild(replyEl);

    stage.appendChild(wrap);

    _els.currentBearSlot = bearSlot;
    _els.currentNoBtn = noBtn;
    _els.currentYesBtn = yesBtn;
    _els.currentReply = replyEl;
    _els.currentQuestionData = qData;

    noBtn.addEventListener('click', _onNoPress);
    yesBtn.addEventListener('click', _onYesPress);

    _focusEl(yesBtn);
  }

  function _moodForPresses(n) {
    if (n <= 0) return 'normal';
    if (n <= 2) return 'pleading';
    if (n <= 4) return 'teary';
    return 'crying';
  }

  function _updateNoLabel(noBtn, n) {
    var labels = CONTENT.gate.noLabels;
    noBtn.textContent = labels[Math.min(n, labels.length - 1)];
  }

  function _updateBearMood(mood) {
    if (_els.currentBearSlot) _els.currentBearSlot.innerHTML = bearSVG({ mood: mood, size: BEAR_SIZE });
  }

  function _applyYesScale(el, scale) {
    el.style.fontSize = (YES_BASE_FONT * scale) + 'px';
    el.style.paddingTop = el.style.paddingBottom = (YES_BASE_PAD_Y * scale) + 'px';
    el.style.paddingLeft = el.style.paddingRight = (YES_BASE_PAD_X * scale) + 'px';
  }

  function _applyNoScale(el, n) {
    var raw = Math.pow(NO_DECAY, n);
    var h = NO_BASE_HEIGHT * raw; /* the box itself is floored by CSS min-height, not here */
    var eff = Math.max(h, NO_MIN_HEIGHT) / NO_BASE_HEIGHT; /* keep text legible once the box floors */
    el.style.height = h + 'px';
    el.style.lineHeight = h + 'px';
    el.style.paddingTop = '0';
    el.style.paddingBottom = '0';
    el.style.fontSize = Math.max(10, NO_BASE_FONT * eff) + 'px';
    el.style.paddingLeft = el.style.paddingRight = Math.max(4, NO_BASE_PAD_X * eff) + 'px';
  }

  /**
   * Measures the rect `el` WOULD have at `scale` without letting the visible transition jump
   * there: switch transitions off, apply the target style, read the now-settled rect, revert to
   * whatever style was there before, force a reflow, then restore the transition — leaving the
   * caller free to re-apply the target style and get a normal animated transition to it. Needed
   * because a synchronous read right after changing a transitioned property returns the PRE-change
   * layout, not the target one (the browser hasn't animated anywhere yet).
   */
  function _yesFinalRectForScale(el, scale) {
    var oldFont = el.style.fontSize;
    var oldPadY = el.style.paddingTop;
    var oldPadX = el.style.paddingLeft;
    var prevTransition = el.style.transition;

    el.style.transition = 'none';
    _applyYesScale(el, scale);
    void el.offsetWidth;
    var r = el.getBoundingClientRect();
    var rect = { left: r.left, right: r.right, top: r.top, bottom: r.bottom, width: r.width, height: r.height };

    el.style.fontSize = oldFont;
    el.style.paddingTop = el.style.paddingBottom = oldPadY;
    el.style.paddingLeft = el.style.paddingRight = oldPadX;
    void el.offsetWidth;
    el.style.transition = prevTransition;

    return rect;
  }

  /** Pulls `noBtn` out of the button row at its current on-screen spot (no visual jump) so later
   *  presses can move it anywhere in the overlay via left/top, unaffected by Yes growing beside
   *  it. Runs exactly once, on the press that first triggers hopping. */
  function _detachNoToFixed(noBtn) {
    var r = noBtn.getBoundingClientRect();
    noBtn.style.position = 'fixed';
    noBtn.style.left = r.left + 'px';
    noBtn.style.top = r.top + 'px';
    noBtn.style.right = 'auto';
    noBtn.style.zIndex = '5';
  }

  function _hopNoButton(noEl, yesRect) {
    var overlay = _els.overlay;
    var oRect = overlay.getBoundingClientRect();
    var noRect = noEl.getBoundingClientRect();

    var minX = oRect.left + HOP_MARGIN;
    var maxX = oRect.right - HOP_MARGIN - noRect.width;
    var minY = oRect.top + HOP_MARGIN;
    var maxY = oRect.bottom - HOP_MARGIN - noRect.height;
    if (maxX < minX) { var midX = (oRect.left + oRect.right - noRect.width) / 2; minX = maxX = midX; }
    if (maxY < minY) { var midY = (oRect.top + oRect.bottom - noRect.height) / 2; minY = maxY = midY; }

    var expLeft = yesRect.left - HOP_OVERLAP_MARGIN, expRight = yesRect.right + HOP_OVERLAP_MARGIN;
    var expTop = yesRect.top - HOP_OVERLAP_MARGIN, expBottom = yesRect.bottom + HOP_OVERLAP_MARGIN;

    var x = minX, y = minY, tries = 0, ok = false;
    while (tries < HOP_MAX_TRIES && !ok) {
      x = minX + Math.random() * Math.max(0, maxX - minX);
      y = minY + Math.random() * Math.max(0, maxY - minY);
      ok = !(x < expRight && (x + noRect.width) > expLeft && y < expBottom && (y + noRect.height) > expTop);
      tries++;
    }
    if (!ok) {
      /* Every random try overlapped (a very small overlay) — fall back to whichever corner of
         the safe area sits farthest from Yes's centre. */
      var yc = { x: (yesRect.left + yesRect.right) / 2, y: (yesRect.top + yesRect.bottom) / 2 };
      var corners = [
        { x: minX, y: minY }, { x: maxX, y: minY }, { x: minX, y: maxY }, { x: maxX, y: maxY }
      ];
      corners.sort(function (a, b) {
        var da = (a.x - yc.x) * (a.x - yc.x) + (a.y - yc.y) * (a.y - yc.y);
        var db = (b.x - yc.x) * (b.x - yc.x) + (b.y - yc.y) * (b.y - yc.y);
        return db - da;
      });
      x = corners[0].x; y = corners[0].y;
    }

    noEl.style.left = x + 'px';
    noEl.style.top = y + 'px';
  }

  function _onNoPress() {
    if (!_state || _state.advancing) return;
    var n = ++_state.questionPresses;
    var yesBtn = _els.currentYesBtn, noBtn = _els.currentNoBtn;

    _updateNoLabel(noBtn, n);
    _updateBearMood(_moodForPresses(n));

    var newYesScale = Math.min(Math.pow(1.2, n), YES_MAX_SCALE);

    if (n >= HOP_FROM_PRESS) {
      /* Detach BEFORE measuring Yes: once No leaves the flex row, Yes recenters in the row on
         its own — measuring Yes first would collide-check against a rect Yes is about to leave. */
      if (n === HOP_FROM_PRESS) _detachNoToFixed(noBtn);
      var yesFinalRect = _yesFinalRectForScale(yesBtn, newYesScale);
      _applyYesScale(yesBtn, newYesScale);
      _applyNoScale(noBtn, n);
      _hopNoButton(noBtn, yesFinalRect);
    } else {
      _applyYesScale(yesBtn, newYesScale);
      _applyNoScale(noBtn, n);
    }
    _state.yesScale = newYesScale;
  }

  function _onYesPress() {
    if (!_state || _state.advancing) return;
    _state.advancing = true;

    var yesBtn = _els.currentYesBtn, noBtn = _els.currentNoBtn;
    var bearSlot = _els.currentBearSlot, replyEl = _els.currentReply;
    var qData = _els.currentQuestionData;

    bearSlot.innerHTML = bearSVG({ mood: 'love', size: BEAR_SIZE });
    if (!prefersReducedMotion()) fxHeartBurst(yesBtn); /* reduced motion: no burst at all */

    yesBtn.disabled = true;
    noBtn.disabled = true;

    replyEl.textContent = qData.reply;
    replyEl.hidden = false;

    var advanced = false;
    var timer = setTimeout(goNext, REPLY_MS);
    function goNext() {
      if (advanced) return;
      advanced = true;
      clearTimeout(timer);
      replyEl.removeEventListener('click', goNext);
      _advance();
    }
    replyEl.addEventListener('click', goNext);
  }

  /* ── Love meter step ─────────────────────────────────── */

  function _renderMeter() {
    _state.meterValue = 0;
    _state.meterQuantized = -1;

    var stage = _els.stage;
    stage.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'gate-meter';

    var bearSlot = document.createElement('div');
    bearSlot.className = 'gate-bear-slot';
    bearSlot.innerHTML = bearSVG({ mood: 'happy', arms: 0, size: BEAR_SIZE });
    wrap.appendChild(bearSlot);

    var qText = document.createElement('p');
    qText.className = 'gate-question-text';
    qText.setAttribute('aria-live', 'polite');
    qText.textContent = CONTENT.gate.meter.q;
    wrap.appendChild(qText);

    var slider = document.createElement('div');
    slider.className = 'gate-meter-heart';
    slider.id = 'gate-meter-slider';
    slider.setAttribute('role', 'slider');
    slider.setAttribute('tabindex', '0');
    slider.setAttribute('aria-valuemin', '0');
    slider.setAttribute('aria-valuemax', '100');
    slider.setAttribute('aria-valuenow', '0');
    slider.setAttribute('aria-label', GATE_METER_ARIA_LABEL);
    slider.innerHTML = GATE_HEART_SVG_BG + GATE_HEART_SVG_FILL;
    wrap.appendChild(slider);

    var label = document.createElement('p');
    label.className = 'gate-meter-label';
    label.textContent = CONTENT.gate.meter.steps[0];
    wrap.appendChild(label);

    var actionsRow = document.createElement('div');
    actionsRow.className = 'gate-meter-actions';

    var moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.className = 'gate-btn gate-btn-more';
    moreBtn.textContent = GATE_MORE_LABEL;

    var contBtn = document.createElement('button');
    contBtn.type = 'button';
    contBtn.className = 'gate-btn gate-btn-yes';
    contBtn.textContent = CONTENT.gate.meter.button;
    contBtn.disabled = true;

    actionsRow.appendChild(moreBtn);
    actionsRow.appendChild(contBtn);
    wrap.appendChild(actionsRow);

    stage.appendChild(wrap);

    _els.meterSlider = slider;
    _els.meterFill = slider.querySelector('.gate-meter-heart-fill');
    _els.meterLabel = label;
    _els.meterBearSlot = bearSlot;
    _els.meterContinueBtn = contBtn;

    _wireMeter(slider, moreBtn, contBtn);
    _applyMeterValue();
    _focusEl(slider);
  }

  function _wireMeter(slider, moreBtn, contBtn) {
    var dragging = false;

    function valueFromY(clientY) {
      var r = slider.getBoundingClientRect();
      if (r.height <= 0) return _state.meterValue;
      return (r.bottom - clientY) / r.height; /* bottom of the heart = 0, top = 1 */
    }

    function trySet(v) {
      v = Math.max(0, Math.min(1, v));
      if (v <= _state.meterValue) return; /* only goes up — a lower attempt is silently ignored */
      _state.meterValue = v;
      _applyMeterValue();
    }

    slider.addEventListener('pointerdown', function (e) {
      dragging = true;
      try { slider.setPointerCapture(e.pointerId); } catch (err) { /* not supported — fine */ }
      trySet(valueFromY(e.clientY));
    });
    slider.addEventListener('pointermove', function (e) {
      if (!dragging) return;
      trySet(valueFromY(e.clientY));
    });
    function stopDrag() { dragging = false; }
    slider.addEventListener('pointerup', stopDrag);
    slider.addEventListener('pointercancel', stopDrag);

    slider.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowUp' || e.key === 'ArrowRight') {
        e.preventDefault();
        trySet(_state.meterValue + METER_KEY_STEP);
      }
      /* ArrowDown / ArrowLeft intentionally do nothing — the meter never decreases. */
    });

    moreBtn.addEventListener('click', function () {
      trySet(_state.meterValue + METER_TAP_STEP);
    });

    contBtn.addEventListener('click', function () {
      if (_state.meterValue < 1) return;
      _advance();
    });
  }

  function _applyMeterValue() {
    var v = _state.meterValue;
    var pct = Math.round(v * 100);
    _els.meterFill.style.clipPath = 'inset(' + (100 - pct) + '% 0 0 0)';
    _els.meterSlider.setAttribute('aria-valuenow', String(pct));

    var steps = CONTENT.gate.meter.steps;
    var idx = v >= 1 ? steps.length - 1 : Math.min(steps.length - 1, Math.floor(v * steps.length));
    _els.meterLabel.textContent = steps[idx];

    /* Throttle the bear re-render to ~20 discrete steps instead of every drag pixel. */
    var quant = Math.round(v * METER_ARM_STEPS) / METER_ARM_STEPS;
    if (quant !== _state.meterQuantized) {
      _state.meterQuantized = quant;
      _els.meterBearSlot.innerHTML = bearSVG({ mood: v >= 1 ? 'love' : 'happy', arms: quant, size: BEAR_SIZE });
    }

    _els.meterContinueBtn.disabled = v < 1;
  }

  /* ── Finale step ─────────────────────────────────────── */

  function _renderFinale() {
    var stage = _els.stage;
    stage.innerHTML = '';

    var wrap = document.createElement('div');
    wrap.className = 'gate-finale';

    var hugSlot = document.createElement('div');
    hugSlot.className = 'gate-hug-slot';
    hugSlot.innerHTML = hugSVG({ size: HUG_SIZE });
    wrap.appendChild(hugSlot);

    var title = document.createElement('h2');
    title.className = 'gate-finale-title';
    title.textContent = CONTENT.gate.finale.title;
    wrap.appendChild(title);

    var text = document.createElement('p');
    text.className = 'gate-finale-text';
    text.textContent = CONTENT.gate.finale.text;
    wrap.appendChild(text);

    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'gate-btn gate-btn-yes gate-finale-btn';
    btn.textContent = _state.birthdayPlay ? CONTENT.gate.finale.birthdayButton : CONTENT.gate.finale.button;
    wrap.appendChild(btn);

    stage.appendChild(wrap);

    fxConfetti({}); /* self no-ops under reduced motion */

    btn.addEventListener('click', _onFinaleClick);
    _focusEl(btn);
  }

  function _onFinaleClick() {
    var wasBirthdayPlay = _state.birthdayPlay;
    storageSet(GATE_FLAG_KEY, String(birthdayYear()));
    _completedThisSession = true;
    _updateReplayVisibility();
    _closeGate();
    if (wasBirthdayPlay && typeof window.openBirthdaySurprise === 'function') {
      window.openBirthdaySurprise();
    }
  }

  /* ── Header replay button ────────────────────────────── */

  function _updateReplayVisibility() {
    var btn = document.getElementById('gate-replay-btn');
    if (!btn) return;
    var flagPresent = !!storageGet(GATE_FLAG_KEY);
    btn.hidden = !(flagPresent || (_completedThisSession && isPreviewMode()));
  }

  /* ── Module init — gate.js sits near the end of <body>, so #gate-overlay and
     #gate-replay-btn already exist in the DOM by the time this line runs. ── */
  _els.overlay = document.getElementById('gate-overlay');
  if (_els.overlay) _els.overlay.addEventListener('keydown', _onOverlayKeydown);

  var _replayBtn = document.getElementById('gate-replay-btn');
  if (_replayBtn) _replayBtn.addEventListener('click', function () { replayGate(); });

  _updateReplayVisibility();
})();
