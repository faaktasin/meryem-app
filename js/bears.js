/**
 * Meryem App — Kawaii Bears — "Pofuduk Peluş — Bebek Yüzlü, Yumuşak" (soft baby-faced plush)
 * Drop-in for js/bears.js: same public API (bearSVG, hugSVG, bearAutoRender), same class hooks.
 * Built on the baby-faced plush the owner picked, then softened:
 *   - lighter, thinner warm-brown outline (never black) and deep-warm-brown eyes/mouth/nose
 *   - gentler fur shading (three close tones), no glossy forehead highlight (only a very faint
 *     soft glow), blush as a radial fade, chubbier egg-shaped head with full low cheeks
 *   - hug redrawn: two cheek-to-cheek baby faces, each with its own small round muzzle set low,
 *     ^^ eyes on plain fur, ears outside the heads, paws resting on each other's back
 * Colours come from the app's --bear-* tokens; the two new tokens (--bear-line, --bear-eye) and the
 * fur highlight/shadow tones carry literal fallbacks, so a CSS-less render (the icon script) matches.
 * No external art, no JS animation loops — every motion is a CSS keyframe on a group (bears.css).
 */

var _bearInstanceCounter = 0;

var _BEAR_LINE = 'var(--bear-line, #AB7B65)';
var _BEAR_EYE = 'var(--bear-eye, #5A382B)';

/**
 * Builds a kawaii SVG bear as a markup string.
 * @param {object} [opts]
 * @param {string} [opts.mood] - normal|happy|pleading|teary|crying|love|sleepy
 * @param {boolean} [opts.hat] - adds a small party hat
 * @param {boolean} [opts.heart] - the bear holds a heart at its chest
 * @param {string|number} [opts.arms] - 'down'|'wave'|'up'|'wide', or a 0..1 spread amount
 * @param {number} [opts.size] - rendered width in px; height follows the bear's own aspect ratio
 * @param {boolean} [opts.headOnly] - crops to just the head, for compact icon use
 * @param {boolean} [opts.veil] - bride's veil draped behind the head, plus a small flower worn at the crown (full-body only)
 * @param {boolean} [opts.bowtie] - a bow tie at the collar (full-body only)
 * @param {string} [opts.className] - extra class(es) on the root <svg>
 * @returns {string} SVG markup
 */
function bearSVG(opts) {
  opts = opts || {};
  var mood = opts.mood || 'normal';
  var size = opts.size || 120;
  var id = 'bear' + (_bearInstanceCounter++);
  var headOnly = !!opts.headOnly;
  /* headOnly: the crop window is wide enough for the whole ears (they span x 3..197) and centred on
     the head; only the width:height RATIO (exactly 180:172) is the contract tests/make_icons.mjs
     and the header button rely on. */
  var viewBox = headOnly ? '0 -14.5 200 191.11' : '0 0 200 226';
  var height = headOnly ? Math.round(size * (172 / 180)) : Math.round(size * (226 / 200));
  var armSpread = _bearArmSpread(opts.arms);
  var isWave = opts.arms === 'wave';
  /* icon-scale renders drop the fine detail (glow, seam, hatch marks) that blurs into noise. */
  var tiny = headOnly && size <= 64;
  var outlineW = tiny ? 3.2 : 2.4;

  var svg = '<svg class="kawaii-bear kawaii-bear--' + mood + (headOnly ? ' kawaii-bear--head-only' : '') +
    (opts.className ? ' ' + opts.className : '') +
    '" viewBox="' + viewBox + '" width="' + size + '" height="' + height +
    '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-mood="' + mood + '">';

  svg += '<defs>' + _bearFurGradient(id) + _bearGlowGradient(id) + _bearBlushGradient(id) + '</defs>';

  svg += '<g class="kawaii-bear-figure">';

  /* Veil is the backmost layer on purpose — it drapes from behind the head down past the
     shoulders, so it has to sit under the body/arms/head, not over them. */
  if (opts.veil && !headOnly) svg += _bearVeil();

  if (!headOnly) {
    svg += '<ellipse class="kawaii-bear-body" cx="100" cy="190" rx="44" ry="28" fill="url(#' + id + '-fur)" stroke="' + _BEAR_LINE + '" stroke-width="2.4"/>';
    svg += '<ellipse cx="100" cy="196" rx="25" ry="17" fill="var(--bear-light)"/>';
    svg += _bearGlow(id, 100, 176, 24, 10);
    svg += _bearFeet(id);
    svg += _bearArm(id, 'left', armSpread, false);
    svg += _bearArm(id, 'right', armSpread, isWave);
  }

  /* The head — one shared builder, also used for both hug bears, so the two can never drift apart. */
  svg += _bearHead(id, mood, headOnly, tiny, outlineW, opts);

  if (opts.bowtie && !headOnly) svg += _bearBowtie();

  if (opts.heart && !headOnly) svg += _bearHeldHeart();

  /* floating hearts never enter a headOnly render. */
  if (mood === 'love' && !headOnly) svg += _bearFloatHearts();

  svg += '</g>'; /* /figure */

  svg += '</svg>';
  return svg;
}

/**
 * Builds two kawaii bears hugging, with a heart above them, as a markup string. Two baby faces
 * cheek to cheek, heads tilted toward each other; each face has its own small round muzzle set low
 * under the eyes (plain fur around the eyes, never a band), ^^ eyes, soft blush, ears clearly
 * outside the heads. Each bear's near arm goes round behind the other's back and its paw rests on
 * the other's shoulder blade.
 * @param {object} [opts]
 * @param {number} [opts.size] - rendered width in px
 * @param {string} [opts.className]
 * @returns {string} SVG markup
 */
function hugSVG(opts) {
  opts = opts || {};
  var size = opts.size || 160;
  var id = 'hug' + (_bearInstanceCounter++);
  var height = Math.round(size * (170 / 260));

  var svg = '<svg class="kawaii-bear-hug' + (opts.className ? ' ' + opts.className : '') +
    '" viewBox="0 0 260 170" width="' + size + '" height="' + height +
    '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">';
  svg += '<defs>' + _bearFurGradient(id) + _bearGlowGradient(id) + _bearBlushGradient(id) + '</defs>';

  /* Layer order: both bodies, then both arms (each draped over the OTHER bear's shoulder), then both
     heads (so an arm's inner end tucks under a chin and never crosses a face), then the two paws
     on the shoulders, then the heart. */
  svg += _bearHugBody(id, HUG_CX, HUG_BODY_TILT, 'left');
  svg += _bearHugBody(id, 260 - HUG_CX, -HUG_BODY_TILT, 'right');
  svg += _bearHugArm(id, 'left');
  svg += _bearHugArm(id, 'right');
  svg += _bearHugHead(id, HUG_CX, 1);
  svg += _bearHugHead(id, 260 - HUG_CX, -1);
  svg += _bearHugPaw(id, 'left');
  svg += _bearHugPaw(id, 'right');

  svg += '<g class="kawaii-bear-heart-wrap" transform="translate(130,-2) scale(0.62)"><path class="kawaii-bear-heart" ' +
    'd="M0 8 C-10 -4 -26 4 -26 18 C-26 34 0 52 0 52 C0 52 26 34 26 18 C26 4 10 -4 0 8 Z" ' +
    'fill="var(--rose)" stroke="var(--berry)" stroke-width="2.2"/></g>';

  svg += '</svg>';
  return svg;
}

/**
 * The bear's head, drawn once for everyone: ears, tuft, chubby-egg head, faint glow, party hat and
 * bridal flower, muzzle, seam, blush, the mood face and the nose. Solo coordinates (head centre
 * 100,84; ears out to x 4..196; tuft top -5; chin 166). bearSVG() places it as it is; hugSVG()
 * places the very same markup, scaled and tilted, once per bear.
 */
function _bearHead(id, mood, headOnly, tiny, outlineW, opts) {
  var svg = '<g class="kawaii-bear-head-wrap">';

  /* Ears — big and round, centred on the head's rim so the cream inner ear shows as a full disc.
     Outer + inner circle share one <g class="kawaii-bear-ear …"> so bearEarFlop swings them
     together. */
  svg += _bearEar(id, 'l', 32, 40, 27, 12.5, outlineW);
  svg += _bearEar(id, 'r', 168, 40, 27, 12.5, outlineW);

  if (!opts.hat && !tiny) svg += _bearTuft(id, outlineW);

  /* Head — a chubby egg: widest low down, where the cheeks are. */
  svg += '<path class="kawaii-bear-head" d="' + _bearHeadD(100, 84, 1) + '" fill="url(#' + id + '-fur)" stroke="' + _BEAR_LINE + '" stroke-width="' + outlineW + '" stroke-linejoin="round"/>';
  if (!tiny) svg += _bearGlow(id, 68, 50, 32, 20);

  if (opts.hat) svg += _bearHat();
  /* Drawn here — after the head/ears, on top of them: at the crown the flower's own bounds overlap
     the head's top, so drawn earlier the head would paint over most of it. */
  if (opts.veil && !headOnly) svg += _bearVeilFlower();

  /* Muzzle — short and round, sitting close under the low-set eyes. */
  svg += '<ellipse class="kawaii-bear-muzzle" cx="100" cy="124" rx="38" ry="23" fill="var(--bear-light)"/>';
  if (!tiny) svg += '<path d="M100 104 Q98 116 100 128 Q102 136 100 142" fill="none" stroke="' + _BEAR_LINE + '" stroke-width="1.4" stroke-linecap="round" stroke-dasharray="2.5 4" opacity=".3"/>';

  /* Chubby cheeks — soft radial blush; the little hatch marks only on the two happy moods. */
  var hatch = !tiny && (mood === 'love' || mood === 'happy');
  svg += _bearCheek(id, 52, 121, hatch);
  svg += _bearCheek(id, 148, 121, hatch);

  /* Mood-specific face (brows + eyes + mouth [+ tear]), swapped as one group */
  svg += _bearFace(mood, headOnly, tiny);

  /* Nose — soft button, warm brown */
  svg += '<ellipse cx="100" cy="112" rx="9.5" ry="6.5" fill="' + _BEAR_EYE + '"/>';
  svg += '<ellipse cx="96.8" cy="109.6" rx="2.6" ry="1.6" fill="var(--paper, #fff)" opacity=".7"/>';

  svg += '</g>'; /* /head-wrap */
  return svg;
}

/* ── Internal construction helpers ──────────────────── */

/* Three close fur tones — a gentle glow at the top-left, a whisper of shade at the bottom-right. */
function _bearFurGradient(id) {
  return '<radialGradient id="' + id + '-fur" cx="38%" cy="26%" r="85%">' +
    '<stop offset="0%" stop-color="var(--bear-fur-hi, #EFC9B4)"/>' +
    '<stop offset="60%" stop-color="var(--bear-fur)"/>' +
    '<stop offset="100%" stop-color="var(--bear-fur-lo, #DDA58A)"/>' +
    '</radialGradient>';
}

/* A very faint white bloom that fades to nothing — stands in for the old glossy highlight. */
function _bearGlowGradient(id) {
  return '<radialGradient id="' + id + '-glow">' +
    '<stop offset="0%" stop-color="#fff" stop-opacity=".24"/>' +
    '<stop offset="100%" stop-color="#fff" stop-opacity="0"/>' +
    '</radialGradient>';
}

/* Blush that fades out at the edge instead of ending in a flat oval. */
function _bearBlushGradient(id) {
  return '<radialGradient id="' + id + '-blush">' +
    '<stop offset="0%" stop-color="var(--bear-blush)" stop-opacity=".85"/>' +
    '<stop offset="55%" stop-color="var(--bear-blush)" stop-opacity=".5"/>' +
    '<stop offset="100%" stop-color="var(--bear-blush)" stop-opacity="0"/>' +
    '</radialGradient>';
}

function _bearGlow(id, cx, cy, rx, ry) {
  return '<ellipse cx="' + cx + '" cy="' + cy + '" rx="' + rx + '" ry="' + ry +
    '" fill="url(#' + id + '-glow)" transform="rotate(-22 ' + cx + ' ' + cy + ')"/>';
}

/* The chubby egg head, centred (cx,cy), scaled by s: top -80, widest ±84 at +20 (cheek height),
   bottom +82 — all relative to the centre, unscaled. */
function _bearHeadD(cx, cy, s) {
  function p(x, y) { return (Math.round((cx + x * s) * 10) / 10) + ' ' + (Math.round((cy + y * s) * 10) / 10); }
  return 'M' + p(0, -80) +
    ' C' + p(50, -80) + ' ' + p(84, -34) + ' ' + p(84, 20) +
    ' C' + p(84, 56) + ' ' + p(48, 82) + ' ' + p(0, 82) +
    ' C' + p(-48, 82) + ' ' + p(-84, 56) + ' ' + p(-84, 20) +
    ' C' + p(-84, -34) + ' ' + p(-50, -80) + ' ' + p(0, -80) + ' Z';
}

function _bearArmSpread(arms) {
  if (arms === 'up' || arms === 'wide') return 1;
  if (arms === 'wave') return 'wave';
  if (arms === undefined || arms === null || arms === 'down') return 0;
  var n = Number(arms);
  return isNaN(n) ? 0 : Math.max(0, Math.min(1, n));
}

/* Short, stubby reach on purpose — a plush toy's arms don't stretch far. The hand's y is 208 when
   down and 150 when fully up (tests/checks/today.mjs reads the waving bear's hands off these). */
function _bearArmHand(side, t) {
  var down = side === 'left' ? { x: 42, y: 208 } : { x: 158, y: 208 };
  var up = side === 'left' ? { x: 26, y: 150 } : { x: 174, y: 150 };
  return {
    x: down.x + (up.x - down.x) * t,
    y: down.y + (up.y - down.y) * t
  };
}

var _BEAR_SHOULDER = { left: { x: 60, y: 176 }, right: { x: 140, y: 176 } };

function _bearArm(id, side, spread, isWaveArm) {
  var shoulder = _BEAR_SHOULDER[side];
  var t = spread === 'wave' ? (side === 'right' ? 1 : 0) : spread;
  var hand = _bearArmHand(side, t);
  var wrapClass = 'kawaii-bear-arm kawaii-bear-arm--' + side + (isWaveArm ? ' kawaii-bear-arm-wave' : '');
  var out = '<g class="' + wrapClass + '">';
  out += '<line x1="' + shoulder.x + '" y1="' + shoulder.y + '" x2="' + hand.x + '" y2="' + hand.y + '" stroke="' + _BEAR_LINE + '" stroke-width="25" stroke-linecap="round"/>';
  out += '<line x1="' + shoulder.x + '" y1="' + shoulder.y + '" x2="' + hand.x + '" y2="' + hand.y + '" stroke="url(#' + id + '-fur)" stroke-width="20.6" stroke-linecap="round"/>';
  /* The hand + its paw marks are their own nested group (kawaii-bear-wrist) so bears.css can add a
     small flick rotation on top of the arm's own wave swing, around the hand's own centre. */
  out += '<g class="kawaii-bear-wrist" style="transform-origin:' + hand.x + 'px ' + hand.y + 'px;">';
  out += '<circle cx="' + hand.x + '" cy="' + hand.y + '" r="14.5" fill="var(--bear-light)" stroke="' + _BEAR_LINE + '" stroke-width="2.2"/>';
  out += _bearPawMarks(hand.x, hand.y);
  out += '</g>';
  out += '</g>';
  return out;
}

/* Three tiny toe marks on a hand or foot pad — the one recurring "plush" detail. */
function _bearPawMarks(cx, cy) {
  var out = '<g opacity=".5">';
  out += '<ellipse cx="' + (cx - 5) + '" cy="' + (cy + 1) + '" rx="2.1" ry="2.6" fill="var(--bear-fur)"/>';
  out += '<ellipse cx="' + cx + '" cy="' + (cy - 1.5) + '" rx="2.1" ry="2.6" fill="var(--bear-fur)"/>';
  out += '<ellipse cx="' + (cx + 5) + '" cy="' + (cy + 1) + '" rx="2.1" ry="2.6" fill="var(--bear-fur)"/>';
  out += '</g>';
  return out;
}

/* Small round feet peeking out from under the body ellipse. */
function _bearFeet(id) {
  var out = '';
  out += '<ellipse cx="77" cy="208" rx="16" ry="10" fill="url(#' + id + '-fur)" stroke="' + _BEAR_LINE + '" stroke-width="2.2"/>';
  out += _bearPawMarks(77, 209);
  out += '<ellipse cx="123" cy="208" rx="16" ry="10" fill="url(#' + id + '-fur)" stroke="' + _BEAR_LINE + '" stroke-width="2.2"/>';
  out += _bearPawMarks(123, 209);
  return out;
}

/* One ear as outer+inner circle sharing a single group, so the whole flap swings together. */
function _bearEar(id, side, cx, cy, r, innerR, outlineW) {
  return '<g class="kawaii-bear-ear kawaii-bear-ear--' + side + '">' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + r + '" fill="url(#' + id + '-fur)" stroke="' + _BEAR_LINE + '" stroke-width="' + outlineW + '"/>' +
    '<circle cx="' + cx + '" cy="' + cy + '" r="' + innerR + '" fill="var(--bear-light)"/>' +
    '</g>';
}

/* Chubby cheek: a soft radial blush; on the happy moods three tiny hatch strokes as a plush cue. */
function _bearCheek(id, cx, cy, hatch) {
  var out = '<ellipse cx="' + cx + '" cy="' + cy + '" rx="22" ry="15" fill="url(#' + id + '-blush)"/>';
  if (hatch) {
    var dir = cx < 100 ? -1 : 1;
    var hx = cx + dir * 6;
    out += '<g opacity=".26" stroke="var(--bear-blush-deep, ' + _BEAR_LINE + ')" stroke-width="1" stroke-linecap="round" fill="none">';
    out += '<path d="M' + (hx - dir * 3) + ' ' + (cy - 6) + ' q ' + (dir * 4) + ' 3 0 6"/>';
    out += '<path d="M' + (hx - dir * 3) + ' ' + cy + ' q ' + (dir * 4) + ' 3 0 6"/>';
    out += '<path d="M' + (hx - dir * 3) + ' ' + (cy + 6) + ' q ' + (dir * 4) + ' 3 0 6"/>';
    out += '</g>';
  }
  return out;
}

/* A small tuft of head fur. Skipped under a hat and at icon scale. */
function _bearTuft(id, outlineW) {
  return '<path class="kawaii-bear-tuft" d="M91 10 Q88 -5 100 -2 Q112 -5 109 10 Q100 2 91 10 Z" ' +
    'fill="var(--bear-fur)" stroke="' + _BEAR_LINE + '" stroke-width="' + (outlineW - 0.6) + '" stroke-linejoin="round"/>';
}

function _bearHat() {
  var out = '<g class="kawaii-bear-hat" transform="translate(118,4) rotate(16)">';
  out += '<path d="M0 44 L15 -20 L30 44 Z" fill="var(--rose)" stroke="' + _BEAR_LINE + '" stroke-width="2.2" stroke-linejoin="round"/>';
  out += '<circle cx="15" cy="-20" r="7.5" fill="var(--peach)" stroke="' + _BEAR_LINE + '" stroke-width="1.8"/>';
  out += '<circle cx="6" cy="18" r="3.6" fill="var(--paper, #fff)"/>';
  out += '<circle cx="19" cy="28" r="3.6" fill="var(--paper, #fff)"/>';
  out += '</g>';
  return out;
}

/**
 * Bride's tulle veil, the fabric: a soft shape draped behind the head down past the shoulders.
 * Drawn before the body/head, as the backmost layer, so both sit on top of it. Filled with
 * --blush (not --paper, which is the same near-white as the card behind it).
 */
function _bearVeil() {
  return '<g class="kawaii-bear-veil">' +
    '<path d="M60 18 C36 64 30 128 44 196 C70 185 130 185 156 196 C170 128 164 64 140 18 C118 40 82 40 60 18 Z" ' +
    'fill="var(--blush)" stroke="var(--rose-100)" stroke-width="2.5" opacity="0.85"/>' +
    '</g>';
}

/**
 * Bride's small flower, worn at the top of the head. Drawn separately from _bearVeil() and much
 * later in bearSVG() — after the head/ears, alongside the hat — so the head does not paint over it.
 */
function _bearVeilFlower() {
  return '<g class="kawaii-bear-veil-flower" transform="translate(100,10)">' +
    '<circle cx="-9" cy="3" r="7" fill="var(--rose-100)" stroke="var(--rose)" stroke-width="1"/>' +
    '<circle cx="9" cy="3" r="7" fill="var(--rose-100)" stroke="var(--rose)" stroke-width="1"/>' +
    '<circle cx="0" cy="-8" r="7" fill="var(--rose-100)" stroke="var(--rose)" stroke-width="1"/>' +
    '<circle cx="0" cy="11" r="7" fill="var(--rose-100)" stroke="var(--rose)" stroke-width="1"/>' +
    '<circle cx="0" cy="2" r="5.5" fill="var(--rose)"/>' +
    '</g>';
}

/**
 * Groom's bow tie, sitting at the collar (just under the muzzle, atop the body).
 */
function _bearBowtie() {
  return '<g class="kawaii-bear-bowtie" transform="translate(100,166)">' +
    '<path d="M-22 0 L-3 -11 L-3 11 Z" fill="var(--rose-strong)" stroke="var(--berry)" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M22 0 L3 -11 L3 11 Z" fill="var(--rose-strong)" stroke="var(--berry)" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<circle cx="0" cy="0" r="5.5" fill="var(--berry)"/>' +
    '</g>';
}

function _bearHeldHeart() {
  // The pulse animation (bears.css) drives the CSS `transform` property, which would silently
  // replace rather than combine with an SVG `transform` attribute on the same element — so the
  // positioning translate/scale lives on this wrapping <g>, never on the animated path itself.
  return '<g transform="translate(100,180) scale(0.66)"><path class="kawaii-bear-heart" ' +
    'd="M0 8 C-10 -4 -26 4 -26 18 C-26 34 0 52 0 52 C0 52 26 34 26 18 C26 4 10 -4 0 8 Z" ' +
    'fill="var(--rose)" stroke="var(--berry)" stroke-width="2.5"/></g>';
}

/* Two or three tiny hearts drifting up past the head for the 'love' mood — each its own element so
   bears.css can stagger the float-up timing; position/scale on a wrapping <g> (same reason as
   _bearHeldHeart). The caller never invokes this for a headOnly render. */
function _bearFloatHearts() {
  var out = '<g class="kawaii-bear-float-hearts">';
  out += '<g transform="translate(30,60) scale(0.32)"><path class="kawaii-bear-mini-heart kawaii-bear-mini-heart--1" ' +
    'd="M0 8 C-10 -4 -26 4 -26 18 C-26 34 0 52 0 52 C0 52 26 34 26 18 C26 4 10 -4 0 8 Z" fill="var(--rose)"/></g>';
  out += '<g transform="translate(172,44) scale(0.24)"><path class="kawaii-bear-mini-heart kawaii-bear-mini-heart--2" ' +
    'd="M0 8 C-10 -4 -26 4 -26 18 C-26 34 0 52 0 52 C0 52 26 34 26 18 C26 4 10 -4 0 8 Z" fill="var(--rose-strong)"/></g>';
  out += '<g transform="translate(166,80) scale(0.19)"><path class="kawaii-bear-mini-heart kawaii-bear-mini-heart--3" ' +
    'd="M0 8 C-10 -4 -26 4 -26 18 C-26 34 0 52 0 52 C0 52 26 34 26 18 C26 4 10 -4 0 8 Z" fill="var(--rose)"/></g>';
  out += '</g>';
  return out;
}

/**
 * Mood face: brows (worried moods only) + eyes (+ eyelid for the open-eyed moods, so bearEyelidBlink
 * has something to animate) + mouth [+ tear, for teary/crying]. Z's are gated on !headOnly.
 */
function _bearFace(mood, headOnly, tiny) {
  var out = '<g class="kawaii-bear-face">';

  if (mood === 'happy') {
    out += _bearEyeArc(68, 96, false) + _bearEyeArc(132, 96, false);
    out += _bearMouth('big');
  } else if (mood === 'sleepy') {
    out += _bearEyeArc(68, 98, true) + _bearEyeArc(132, 98, true);
    out += _bearMouth('flat');
    if (!headOnly) {
      out += '<text class="kawaii-bear-z kawaii-bear-z--1" x="152" y="40" font-size="20">z</text>';
      out += '<text class="kawaii-bear-z kawaii-bear-z--2" x="168" y="20" font-size="15">z</text>';
      out += '<text class="kawaii-bear-z kawaii-bear-z--sm kawaii-bear-z--3" x="180" y="4" font-size="11">z</text>';
    }
  } else if (mood === 'pleading') {
    out += _bearBrow(68, 80, .5) + _bearBrow(132, 80, .5);
    out += _bearEyeGlossy(68, 96) + _bearEyeGlossy(132, 96);
    out += _bearMouth('pucker');
  } else if (mood === 'teary') {
    out += _bearBrow(68, 79, .75) + _bearBrow(132, 79, .75);
    out += _bearEyeGlossy(68, 96) + _bearEyeGlossy(132, 96);
    out += _bearMouth('pout');
    out += _bearTearPair(137, 108, 1, false);
  } else if (mood === 'crying') {
    out += _bearBrow(68, 78, 1) + _bearBrow(132, 78, 1);
    out += _bearEyeScrunch(68, 98) + _bearEyeScrunch(132, 98);
    out += _bearMouth('cry');
    out += _bearTearPair(70, 110, 1.3, true) + _bearTearPair(130, 110, 1.3, true, 1);
  } else if (mood === 'love') {
    out += _bearHeartEye(68, 95) + _bearHeartEye(132, 95);
    out += _bearMouth('big');
  } else {
    out += _bearEyeDot(68, 96) + _bearEyeDot(132, 96);
    out += _bearMouth('smile');
  }

  out += '</g>';
  return out;
}

/* Small worried brow — the "sad puppy" slant: the INNER end (toward the nose) sits high, the
   OUTER end (toward the ear) droops low, the universal cue for worried/pleading rather than
   angry. `weight` (0..1) steepens the droop and thickens the stroke. Side (inner/outer) is read
   off cx itself so the caller never has to pass a left/right flag. */
function _bearBrow(cx, cy, weight) {
  var out = cx < 100 ? -1 : 1; /* points away from centre, toward this eye's own ear */
  var dy = 4 + weight * 4;
  var innerX = cx - out * 8, outerX = cx + out * 9;
  return '<path d="M' + innerX + ' ' + (cy - dy) + ' Q ' + cx + ' ' + (cy - dy * .35) + ' ' + outerX + ' ' + (cy + dy * .65) +
    '" fill="none" stroke="' + _BEAR_EYE + '" stroke-width="' + (2 + weight * .8) + '" stroke-linecap="round" opacity=".65"/>';
}

/* Normal-mood eye: a big soft dot with a big sparkle plus a tiny secondary one. Wrapped with an
   eyelid the same size so bearEyelidBlink can sweep a fur-coloured lid over it. */
function _bearEyeDot(cx, cy) {
  var out = '<g class="kawaii-bear-eye">';
  out += '<circle cx="' + cx + '" cy="' + cy + '" r="9.4" fill="' + _BEAR_EYE + '"/>';
  out += '<circle cx="' + (cx - 3) + '" cy="' + (cy - 3.3) + '" r="3.2" fill="var(--paper, #fff)" opacity=".95"/>';
  out += '<circle cx="' + (cx + 2.8) + '" cy="' + (cy + 2.8) + '" r="1.4" fill="var(--paper, #fff)" opacity=".8"/>';
  out += _bearEyelid(cx, cy, 10);
  out += '</g>';
  return out;
}

/* strokeWidth defaults to 3.4. */
function _bearEyeArc(cx, cy, droopy, strokeWidth) {
  var h = droopy ? 6.5 : 10;
  var sw = strokeWidth || 3.4;
  return '<path d="M' + (cx - 10.5) + ' ' + cy + ' Q ' + cx + ' ' + (cy - h) + ' ' + (cx + 10.5) + ' ' + cy +
    '" fill="none" stroke="' + _BEAR_EYE + '" stroke-width="' + sw + '" stroke-linecap="round"/>';
}

/* Crying-mood eye: squeezed tight shut — a short, steep upward arc with a small second line under
   it, the classic "scrunched" double-line squint. */
function _bearEyeScrunch(cx, cy) {
  var out = '<path d="M' + (cx - 9) + ' ' + (cy + 1) + ' Q ' + cx + ' ' + (cy - 9) + ' ' + (cx + 9) + ' ' + (cy + 1) +
    '" fill="none" stroke="' + _BEAR_EYE + '" stroke-width="3.4" stroke-linecap="round"/>';
  out += '<path d="M' + (cx - 5) + ' ' + (cy + 4) + ' Q ' + cx + ' ' + (cy + 1.5) + ' ' + (cx + 5) + ' ' + (cy + 4) +
    '" fill="none" stroke="' + _BEAR_EYE + '" stroke-width="1.8" stroke-linecap="round" opacity=".6"/>';
  return out;
}

/* Pleading/teary eye: big and glossy, with TWO highlight dots, plus the same eyelid wrapper. */
function _bearEyeGlossy(cx, cy) {
  var out = '<g class="kawaii-bear-eye">';
  out += '<circle cx="' + cx + '" cy="' + cy + '" r="12" fill="' + _BEAR_EYE + '"/>';
  out += '<circle cx="' + (cx - 4) + '" cy="' + (cy - 4.2) + '" r="4.2" fill="var(--paper, #fff)"/>';
  out += '<circle cx="' + (cx + 3.6) + '" cy="' + (cy + 3.6) + '" r="2" fill="var(--paper, #fff)" opacity=".85"/>';
  out += _bearEyelid(cx, cy, 12.6);
  out += '</g>';
  return out;
}

/* Fur-coloured eyelid, resting collapsed to nothing (scaleY(0)) over the eye's own centre;
   bearEyelidBlink briefly scales it to 1 to sweep down and cover the eye, then back. The collapsed
   state is ALSO written inline: a running CSS animation overrides it, but a render without the
   animation (reduced motion, or a page without bears.css) shows open eyes instead of a fur disc. */
function _bearEyelid(cx, cy, r) {
  return '<ellipse class="kawaii-bear-eyelid" cx="' + cx + '" cy="' + cy + '" rx="' + r + '" ry="' + r +
    '" fill="var(--bear-fur)" style="transform:scaleY(0);transform-box:fill-box;transform-origin:center;"/>';
}

function _bearHeartEye(cx, cy) {
  return '<path transform="translate(' + cx + ',' + cy + ') scale(0.95)" ' +
    'd="M0 6 C-10 -4 -20 4 0 16 C20 4 10 -4 0 6 Z" fill="var(--rose)" stroke="var(--berry, ' + _BEAR_EYE + ')" stroke-width="1.2"/>';
}

/**
 * A teary/crying tear as TWO layered copies: a STATIC one, always fully visible from the first
 * frame (a fresh bearSVG() call never has an invisible tear), plus a DRIP copy on top that is the
 * only animated one, started mid-cycle by a negative delay in bears.css.
 */
function _bearTearPair(cx, cy, scale, wide, delayIndex) {
  var d = wide ? 'M0 0 C5 7 5 14 0 16 C-5 14 -5 7 0 0 Z' : 'M0 0 C4 6 4 12 0 14 C-4 12 -4 6 0 0 Z';
  var delayClass = delayIndex ? ' kawaii-bear-tear-drip--2' : '';
  var out = '<g transform="translate(' + cx + ',' + cy + ') scale(' + scale + ')">';
  out += '<path class="kawaii-bear-tear-static" d="' + d + '" fill="var(--lavender, #E6DAFB)" stroke="' + _BEAR_LINE + '" stroke-width="1.7"/>';
  out += '<path class="kawaii-bear-tear-drip' + delayClass + '" d="' + d + '" fill="var(--lavender, #E6DAFB)" stroke="' + _BEAR_LINE + '" stroke-width="1.7"/>';
  out += '</g>';
  return out;
}

function _bearMouth(kind) {
  var c = _BEAR_EYE;
  if (kind === 'big') {
    return '<path d="M83 128 Q100 141 117 128" fill="none" stroke="' + c + '" stroke-width="3" stroke-linecap="round"/>';
  }
  if (kind === 'flat') {
    return '<path d="M90 129 Q100 132 110 129" fill="none" stroke="' + c + '" stroke-width="2.6" stroke-linecap="round"/>';
  }
  if (kind === 'pucker') {
    return '<path d="M94 129 Q98 124 101 129 Q104 124 107 129" fill="none" stroke="' + c + '" stroke-width="2.5" stroke-linecap="round"/>';
  }
  if (kind === 'pout') {
    return '<path d="M91 130 Q95 134 100 131 Q105 134 109 130" fill="none" stroke="' + c + '" stroke-width="2.6" stroke-linecap="round"/>';
  }
  if (kind === 'cry') {
    return '<path d="M80 126 Q88 138 98 126 Q106 138 116 126 Q120 133 120 135" fill="none" stroke="' + c + '" stroke-width="3.1" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  return '<path d="M87 128 Q100 136 113 128" fill="none" stroke="' + c + '" stroke-width="2.8" stroke-linecap="round"/>';
}

/* ── The hug ─────────────────────────────────────────── */

/* Centre x of the LEFT figure (the right one mirrors it around x=130), and how far each whole
   figure leans toward the other. Together with the head lean they put the two round cheeks side by
   side, faces clear of each other. */
var HUG_CX = 79;
var HUG_BODY_TILT = 4;
var HUG_HEAD_TILT = 9;
var HUG_NECK_Y = 121;      /* the point the head turns about (solo point 100,160) */
var HUG_HEAD_S = 0.56;     /* head scale vs the solo bear's head */
var HUG_BODY_CY = 140;
/* Where each paw rests: on the FAR bear's inner shoulder blade, just under its chin — shoulder
   height (above the body's middle at HUG_BODY_CY), never on a face, never down on the belly. */
var HUG_PAW_X = 20;        /* distance from the far bear's own centre line, toward its outer side */
var HUG_PAW_Y = 136;

function _bearHugBody(id, cx, tilt, side) {
  var out = '<g transform="translate(' + cx + ',0) rotate(' + tilt + ' 0 ' + (HUG_BODY_CY + 20) + ')">';
  out += '<ellipse class="kawaii-bear-hug-body kawaii-bear-hug-body--' + side + '" cx="0" cy="' + HUG_BODY_CY + '" rx="43" ry="28" fill="url(#' + id + '-fur)" stroke="' + _BEAR_LINE + '" stroke-width="2.4"/>';
  out += '<ellipse cx="0" cy="' + (HUG_BODY_CY + 6) + '" rx="22" ry="17" fill="var(--bear-light)"/>';
  out += '</g>';
  return out;
}

/* One hugging bear's head: the SAME head as the solo bear (_bearHead, happy mood), shrunk to
   HUG_HEAD_S and tilted toward the other bear about its neck. `dir` is +1 for the left bear
   (leaning right) and -1 for the right one. */
function _bearHugHead(id, cx, dir) {
  var out = '<g transform="translate(' + cx + ',' + HUG_NECK_Y + ') rotate(' + (dir * HUG_HEAD_TILT) + ') scale(' + HUG_HEAD_S + ') translate(-100,-160)">';
  out += _bearHead(id, 'happy', false, false, 2.4, {});
  out += '</g>';
  return out;
}

function _bearRound1(n) { return Math.round(n * 10) / 10; }

function _bearHugEye(cx, cy) {
  return '<path class="kawaii-bear-hug-eye" d="M' + (cx - 7) + ' ' + cy + ' Q' + cx + ' ' + (cy - 8) + ' ' + (cx + 7) + ' ' + cy +
    '" fill="none" stroke="' + _BEAR_EYE + '" stroke-width="3" stroke-linecap="round"/>';
}

/* The arm draped over the far bear's shoulder: it starts under this bear's own chin (hidden by its
   head), crosses the gap under the two chins, and ends at the paw on the far bear's inner shoulder.
   The two arms cross in an X below the chins. Drawn over both bodies but under both heads, so an
   arm never crosses a face. */
function _bearHugArm(id, side) {
  var ownCx = side === 'left' ? HUG_CX : 260 - HUG_CX;
  var farCx = 260 - ownCx;
  var toward = side === 'left' ? 1 : -1;
  var d = 'M' + (ownCx + toward * 10) + ' ' + (HUG_PAW_Y - 12) + ' Q130 ' + (HUG_PAW_Y + 8) + ' ' + (farCx - toward * HUG_PAW_X) + ' ' + HUG_PAW_Y;
  var out = '<g class="kawaii-bear-hug-arm-wrap">';
  out += '<path class="kawaii-bear-hug-arm" d="' + d + '" fill="none" stroke="' + _BEAR_LINE + '" stroke-width="18" stroke-linecap="round"/>';
  out += '<path d="' + d + '" fill="none" stroke="url(#' + id + '-fur)" stroke-width="13.6" stroke-linecap="round"/>';
  out += '</g>';
  return out;
}

/* The paw that lands on the far bear's outer shoulder blade, over its body. */
function _bearHugPaw(id, side) {
  var farCx = side === 'left' ? 260 - HUG_CX : HUG_CX;
  var x = farCx + (side === 'left' ? -1 : 1) * HUG_PAW_X;
  var out = '<g class="kawaii-bear-hug-paw-wrap">';
  out += '<circle class="kawaii-bear-hug-paw" cx="' + x + '" cy="' + HUG_PAW_Y + '" r="11" fill="var(--bear-light)" stroke="' + _BEAR_LINE + '" stroke-width="2.2"/>';
  out += _bearPawMarks(x, HUG_PAW_Y + 1);
  out += '</g>';
  return out;
}

/* ── Declarative auto-render ─────────────────────────── */

/**
 * Fills every element carrying a `data-bear` attribute with a generated bear, reading its pose
 * from `data-bear-*` attributes (mood, hat, heart, arms, size, head-only). Skips an element that
 * already carries data-bear-rendered="true" — safe to call again after inserting new markup.
 */
function bearAutoRender() {
  var slots = document.querySelectorAll('[data-bear]');
  slots.forEach(function (el) {
    if (el.getAttribute('data-bear-rendered') === 'true') return;
    el.innerHTML = bearSVG({
      mood: el.getAttribute('data-bear-mood') || 'normal',
      hat: el.getAttribute('data-bear-hat') === 'true',
      heart: el.getAttribute('data-bear-heart') === 'true',
      veil: el.getAttribute('data-bear-veil') === 'true',
      bowtie: el.getAttribute('data-bear-bowtie') === 'true',
      arms: el.getAttribute('data-bear-arms') || 'down',
      size: Number(el.getAttribute('data-bear-size')) || 120,
      headOnly: el.getAttribute('data-bear-head-only') === 'true'
    });
    el.setAttribute('data-bear-rendered', 'true');
  });
}

/* bears.js sits near the end of <body>, so every data-bear slot already exists in the DOM by the
   time this line runs — no need to wait for DOMContentLoaded. */
bearAutoRender();
