/**
 * Meryem App — Motion & Delight Effects
 * Self-written canvas confetti, a quick heart burst, a typewriter, and the background floating
 * hearts layer (#fx-hearts). Every effect is a no-op or an instant/static equivalent under
 * prefers-reduced-motion, per the app's animation rule.
 */

/**
 * @returns {boolean} true if the OS/browser asked for reduced motion
 */
function prefersReducedMotion() {
  try {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  } catch (e) {
    return false;
  }
}

var FX_PALETTE = ['#F06A8F', '#FFD1DC', '#C93A6E', '#FFD8C2', '#E6DAFB', '#9E2F5B'];

/**
 * Traces a heart path into a 2D canvas context, centred at (0,0), roughly `size` wide.
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} size
 */
function _fxHeartPath(ctx, size) {
  var s = size / 20;
  ctx.beginPath();
  ctx.moveTo(0, 4 * s);
  ctx.bezierCurveTo(-10 * s, -6 * s, -20 * s, 2 * s, 0, 14 * s);
  ctx.bezierCurveTo(20 * s, 2 * s, 10 * s, -6 * s, 0, 4 * s);
  ctx.closePath();
}

/**
 * Full-screen canvas confetti: hearts and ribbons in the app palette, falling and rotating.
 * Removes its own canvas when it finishes. No-op under reduced motion.
 * @param {object} [opts]
 * @param {number} [opts.count] - particle count, default 60-100
 * @param {number} [opts.duration] - ms the burst runs for
 */
function fxConfetti(opts) {
  if (prefersReducedMotion()) return;
  opts = opts || {};
  var count = opts.count || (60 + Math.floor(Math.random() * 40));
  var duration = opts.duration || 2600;

  var canvas = document.createElement('canvas');
  canvas.className = 'fx-confetti-canvas';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvas.style.position = 'fixed';
  canvas.style.top = '0';
  canvas.style.left = '0';
  canvas.style.right = '0';
  canvas.style.bottom = '0';
  canvas.style.zIndex = '9000';
  canvas.style.pointerEvents = 'none';
  document.body.appendChild(canvas);
  var ctx = canvas.getContext('2d');

  var particles = [];
  var i;
  for (i = 0; i < count; i++) {
    particles.push({
      x: Math.random() * canvas.width,
      y: -20 - Math.random() * canvas.height * 0.3,
      vx: (Math.random() - 0.5) * 2.2,
      vy: 2 + Math.random() * 3,
      size: 6 + Math.random() * 8,
      rot: Math.random() * Math.PI * 2,
      vr: (Math.random() - 0.5) * 0.25,
      color: FX_PALETTE[Math.floor(Math.random() * FX_PALETTE.length)],
      shape: Math.random() < 0.5 ? 'heart' : 'ribbon'
    });
  }

  var start = null;

  function frame(ts) {
    if (start === null) start = ts;
    var elapsed = ts - start;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    for (i = 0; i < particles.length; i++) {
      var p = particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.rot += p.vr;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      if (p.shape === 'heart') {
        _fxHeartPath(ctx, p.size);
        ctx.fill();
      } else {
        ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
      }
      ctx.restore();
    }

    if (elapsed < duration && canvas.parentNode) {
      requestAnimationFrame(frame);
    } else if (canvas.parentNode) {
      canvas.parentNode.removeChild(canvas);
    }
  }
  requestAnimationFrame(frame);
}

/**
 * A quick burst of small hearts from an element's (or a point's) centre. Under reduced motion,
 * a single static heart fades once — no burst animation.
 * @param {Element|{x:number,y:number}} elOrPoint
 */
function fxHeartBurst(elOrPoint) {
  var point = elOrPoint;
  if (elOrPoint && typeof elOrPoint.getBoundingClientRect === 'function') {
    var box = elOrPoint.getBoundingClientRect();
    point = { x: box.left + box.width / 2, y: box.top + box.height / 2 };
  }
  point = point || { x: window.innerWidth / 2, y: window.innerHeight / 2 };

  var reduced = prefersReducedMotion();
  var layer = document.createElement('div');
  layer.className = 'fx-heart-burst';
  layer.style.position = 'fixed';
  layer.style.left = point.x + 'px';
  layer.style.top = point.y + 'px';
  layer.style.zIndex = '9000';
  layer.style.pointerEvents = 'none';
  document.body.appendChild(layer);

  var count = reduced ? 1 : (6 + Math.floor(Math.random() * 4));
  var i;
  for (i = 0; i < count; i++) {
    var heart = document.createElement('span');
    heart.className = 'fx-heart-particle';
    heart.textContent = '💗'; /* 💗 */
    heart.style.fontSize = (12 + Math.random() * 10) + 'px';
    if (!reduced) {
      var angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
      var dist = 30 + Math.random() * 30;
      heart.style.setProperty('--fx-dx', (Math.cos(angle) * dist).toFixed(1) + 'px');
      heart.style.setProperty('--fx-dy', (Math.sin(angle) * dist - 20).toFixed(1) + 'px');
      heart.className += ' fx-heart-particle--burst';
    } else {
      heart.className += ' fx-heart-particle--static';
    }
    layer.appendChild(heart);
  }

  setTimeout(function () {
    if (layer.parentNode) layer.parentNode.removeChild(layer);
  }, reduced ? 650 : 900);
}

/**
 * Types `text` into `el` one character at a time. Instant under reduced motion (sets the full
 * text immediately). Returns a cancel function that stops mid-type without clearing the text
 * already shown.
 * @param {Element} el
 * @param {string} text
 * @param {object} [opts]
 * @param {number} [opts.speed] - ms per character, default 32
 * @param {Function} [opts.onDone]
 * @returns {Function} cancel
 */
function fxTypewriter(el, text, opts) {
  opts = opts || {};
  var speed = opts.speed || 32;
  var onDone = opts.onDone;
  var cancelled = false;

  if (prefersReducedMotion()) {
    el.textContent = text;
    if (onDone) onDone();
    return function () { cancelled = true; };
  }

  el.textContent = '';
  var i = 0;

  function step() {
    if (cancelled) return;
    i++;
    el.textContent = text.slice(0, i);
    if (i < text.length) {
      setTimeout(step, speed);
    } else if (onDone) {
      onDone();
    }
  }
  setTimeout(step, speed);

  return function () { cancelled = true; };
}

/* ── Floating Hearts Background Layer ───────────────── */

var _fxHeartsOn = false;

/**
 * Toggles the #fx-hearts background layer: populates it with slowly drifting hearts, or clears
 * it. Under reduced motion, turning it on leaves the layer present but empty (hidden), per the
 * app's animation rule.
 * @param {boolean} on
 */
function fxFloatingHearts(on) {
  var layer = document.getElementById('fx-hearts');
  if (!layer) return;

  layer.innerHTML = '';

  if (!on) {
    _fxHeartsOn = false;
    return;
  }
  _fxHeartsOn = true;

  if (prefersReducedMotion()) return; /* stays empty: hidden under reduced motion */

  var count = 10;
  var i;
  for (i = 0; i < count; i++) {
    var heart = document.createElement('span');
    heart.className = 'fx-hearts-item';
    heart.textContent = i % 2 === 0 ? '💗' : '💖'; /* both pink — a white heart emoji nearly */
    /* disappears against the cream/blush ground, reading as a pale ghost instead of a heart */
    heart.style.left = (Math.random() * 100) + '%';
    heart.style.fontSize = (10 + Math.random() * 14) + 'px';
    heart.style.animationDuration = (14 + Math.random() * 10) + 's';
    heart.style.animationDelay = (Math.random() * -20) + 's';
    layer.appendChild(heart);
  }
}
