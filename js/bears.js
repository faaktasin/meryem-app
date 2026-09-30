/**
 * Meryem App — Kawaii Bears
 * Our own SVG bear illustrations — no external art. bearSVG() draws one bear; hugSVG() draws two
 * bears hugging under a heart. Every visual variant (mood, hat, held heart, arm pose, head-only
 * crop) is one shared construction so every bear in the app reads as the same character.
 *
 * Any element in the page can request a bear declaratively instead of calling bearSVG() by hand:
 *   <span data-bear data-bear-mood="happy" data-bear-arms="wave" data-bear-heart="true"></span>
 * bearAutoRender() (called once below, and callable again after inserting new markup) fills every
 * such element that has not already been rendered.
 */

var _bearInstanceCounter = 0;

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
  var viewBox = headOnly ? '10 4 180 172' : '0 0 200 226';
  var height = headOnly ? Math.round(size * (172 / 180)) : Math.round(size * (226 / 200));
  var armSpread = _bearArmSpread(opts.arms);

  var svg = '<svg class="kawaii-bear' + (opts.className ? ' ' + opts.className : '') +
    '" viewBox="' + viewBox + '" width="' + size + '" height="' + height +
    '" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" data-mood="' + mood + '">';

  svg += '<defs><radialGradient id="' + id + '-fur" cx="42%" cy="30%" r="75%">' +
    '<stop offset="0%" stop-color="var(--bear-light)"/>' +
    '<stop offset="100%" stop-color="var(--bear-fur)"/>' +
    '</radialGradient></defs>';

  /* Veil is the backmost layer on purpose — it drapes from behind the head down past the
     shoulders, so it has to sit under the body/arms/head, not over them. */
  if (opts.veil && !headOnly) svg += _bearVeil();

  if (!headOnly) {
    svg += '<ellipse class="kawaii-bear-body" cx="100" cy="184" rx="52" ry="42" fill="url(#' + id + '-fur)" stroke="var(--bear-stroke)" stroke-width="3"/>';
    svg += '<ellipse cx="100" cy="190" rx="30" ry="24" fill="var(--bear-light)"/>';
    svg += _bearArm(id, 'left', armSpread);
    svg += _bearArm(id, 'right', armSpread);
  }

  /* Ears */
  svg += '<circle class="kawaii-bear-ear" cx="52" cy="44" r="26" fill="url(#' + id + '-fur)" stroke="var(--bear-stroke)" stroke-width="3"/>';
  svg += '<circle cx="52" cy="44" r="12" fill="var(--bear-light)"/>';
  svg += '<circle class="kawaii-bear-ear" cx="148" cy="44" r="26" fill="url(#' + id + '-fur)" stroke="var(--bear-stroke)" stroke-width="3"/>';
  svg += '<circle cx="148" cy="44" r="12" fill="var(--bear-light)"/>';

  /* Head */
  svg += '<circle class="kawaii-bear-head" cx="100" cy="94" r="72" fill="url(#' + id + '-fur)" stroke="var(--bear-stroke)" stroke-width="3"/>';

  if (opts.hat) svg += _bearHat();
  /* Drawn here — after the head/ears, on top of them — not with _bearVeil() above: at the crown
     the flower's own bounds overlap the head circle's top, so drawn earlier the head would paint
     over most of it (see _bearVeilFlower()'s own comment). */
  if (opts.veil && !headOnly) svg += _bearVeilFlower();

  /* Muzzle */
  svg += '<ellipse cx="100" cy="114" rx="34" ry="26" fill="var(--bear-light)"/>';

  /* Blush */
  svg += '<ellipse cx="58" cy="106" rx="13" ry="8" fill="var(--bear-blush)" opacity=".55"/>';
  svg += '<ellipse cx="142" cy="106" rx="13" ry="8" fill="var(--bear-blush)" opacity=".55"/>';

  /* Mood-specific face (eyes + mouth), swapped as one group */
  svg += _bearFace(mood);

  /* Nose */
  svg += '<ellipse cx="100" cy="106" rx="7" ry="5" fill="var(--bear-stroke)"/>';

  if (opts.bowtie && !headOnly) svg += _bearBowtie();

  if (opts.heart && !headOnly) svg += _bearHeldHeart();

  svg += '</svg>';
  return svg;
}

/**
 * Builds two kawaii bears hugging, with a heart above them, as a markup string.
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
  svg += '<defs><radialGradient id="' + id + '-fur" cx="42%" cy="30%" r="75%">' +
    '<stop offset="0%" stop-color="var(--bear-light)"/>' +
    '<stop offset="100%" stop-color="var(--bear-fur)"/>' +
    '</radialGradient></defs>';

  // Two bears side by side, heads tilted in towards each other. Draw order: both bodies first,
  // then both inner arms on top of both bodies, each reaching across to rest on the OTHER bear's
  // shoulder/back at chest height — clear of both faces, which sit well above (see _bearHugArm).
  // The heart floats last, over the gap where the tilted heads meet.
  svg += _bearHugFigure(id, 85, 8, 1);
  svg += _bearHugFigure(id, 175, -8, -1);
  svg += _bearHugArm(id, 85, 8, 'left');
  svg += _bearHugArm(id, 175, -8, 'right');

  svg += '<g transform="translate(130,-4) scale(0.8)"><path class="kawaii-bear-heart" ' +
    'd="M0 8 C-10 -4 -26 4 -26 18 C-26 34 0 52 0 52 C0 52 26 34 26 18 C26 4 10 -4 0 8 Z" ' +
    'fill="var(--rose)" stroke="var(--berry)" stroke-width="2"/></g>';

  svg += '</svg>';
  return svg;
}

/* ── Internal construction helpers ──────────────────── */

function _bearArmSpread(arms) {
  if (arms === 'up' || arms === 'wide') return 1;
  if (arms === 'wave') return 'wave';
  if (arms === undefined || arms === null || arms === 'down') return 0;
  var n = Number(arms);
  return isNaN(n) ? 0 : Math.max(0, Math.min(1, n));
}

function _bearArmHand(side, t) {
  var down = side === 'left' ? { x: 38, y: 208 } : { x: 162, y: 208 };
  var up = side === 'left' ? { x: 14, y: 150 } : { x: 186, y: 150 };
  return {
    x: down.x + (up.x - down.x) * t,
    y: down.y + (up.y - down.y) * t
  };
}

function _bearArm(id, side, spread) {
  var shoulder = side === 'left' ? { x: 50, y: 174 } : { x: 150, y: 174 };
  var t = spread === 'wave' ? (side === 'right' ? 1 : 0) : spread;
  var hand = _bearArmHand(side, t);
  var out = '';
  out += '<line x1="' + shoulder.x + '" y1="' + shoulder.y + '" x2="' + hand.x + '" y2="' + hand.y + '" stroke="var(--bear-stroke)" stroke-width="27" stroke-linecap="round"/>';
  out += '<line x1="' + shoulder.x + '" y1="' + shoulder.y + '" x2="' + hand.x + '" y2="' + hand.y + '" stroke="url(#' + id + '-fur)" stroke-width="21" stroke-linecap="round"/>';
  out += '<circle cx="' + hand.x + '" cy="' + hand.y + '" r="13" fill="var(--bear-light)" stroke="var(--bear-stroke)" stroke-width="2.5"/>';
  return out;
}

function _bearHat() {
  var out = '<g class="kawaii-bear-hat" transform="translate(120,16) rotate(16)">';
  out += '<path d="M0 42 L14 -18 L28 42 Z" fill="var(--rose)" stroke="var(--bear-stroke)" stroke-width="2.5" stroke-linejoin="round"/>';
  out += '<circle cx="14" cy="-18" r="7" fill="var(--peach)" stroke="var(--bear-stroke)" stroke-width="2"/>';
  out += '<circle cx="6" cy="18" r="3.5" fill="var(--paper)"/>';
  out += '<circle cx="18" cy="27" r="3.5" fill="var(--paper)"/>';
  out += '</g>';
  return out;
}

/**
 * Bride's tulle veil, the fabric: a soft shape draped behind the head down past the shoulders.
 * Drawn before the body/head, as the backmost layer, so both sit on top of it. Filled with
 * --blush (not --paper, which is the same near-white as the card behind it and made the veil
 * invisible — 2026-09-30 visual check, tests/checks/dates.mjs's shot review).
 */
function _bearVeil() {
  return '<g class="kawaii-bear-veil">' +
    '<path d="M62 26 C40 70 34 130 46 200 C70 190 130 190 154 200 C166 130 160 70 138 26 C118 46 82 46 62 26 Z" ' +
    'fill="var(--blush)" stroke="var(--rose-100)" stroke-width="2.5" opacity="0.85"/>' +
    '</g>';
}

/**
 * Bride's small flower, worn at the top of the head. Drawn separately from _bearVeil() and much
 * later in bearSVG() — after the head/ears, alongside the hat — so the head circle does not paint
 * over it; drawn behind the head (with the veil fabric) it was almost entirely hidden, leaving
 * only a sliver above the hairline (same 2026-09-30 check).
 */
function _bearVeilFlower() {
  return '<g class="kawaii-bear-veil-flower" transform="translate(100,20)">' +
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
  return '<g class="kawaii-bear-bowtie" transform="translate(100,144)">' +
    '<path d="M-22 0 L-3 -11 L-3 11 Z" fill="var(--rose-strong)" stroke="var(--berry)" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<path d="M22 0 L3 -11 L3 11 Z" fill="var(--rose-strong)" stroke="var(--berry)" stroke-width="1.6" stroke-linejoin="round"/>' +
    '<circle cx="0" cy="0" r="5.5" fill="var(--berry)"/>' +
    '</g>';
}

function _bearHeldHeart() {
  // The pulse animation (bears.css) drives the CSS `transform` property, which would silently
  // replace rather than combine with an SVG `transform` attribute on the same element — so the
  // positioning translate/scale lives on this wrapping <g>, never on the animated path itself.
  return '<g transform="translate(100,160) scale(0.62)"><path class="kawaii-bear-heart" ' +
    'd="M0 8 C-10 -4 -26 4 -26 18 C-26 34 0 52 0 52 C0 52 26 34 26 18 C26 4 10 -4 0 8 Z" ' +
    'fill="var(--rose)" stroke="var(--berry)" stroke-width="2.5"/></g>';
}

function _bearFace(mood) {
  var out = '<g class="kawaii-bear-face">';

  if (mood === 'happy') {
    out += _bearEyeArc(78, 84, false) + _bearEyeArc(122, 84, false);
    out += _bearMouth('big');
  } else if (mood === 'sleepy') {
    out += _bearEyeArc(78, 86, true) + _bearEyeArc(122, 86, true);
    out += _bearMouth('flat');
    out += '<text class="kawaii-bear-z" x="148" y="46" font-size="18">z</text>';
    out += '<text class="kawaii-bear-z kawaii-bear-z--sm" x="162" y="30" font-size="13">z</text>';
  } else if (mood === 'pleading' || mood === 'teary') {
    out += _bearEyeGlossy(78, 84) + _bearEyeGlossy(122, 84);
    out += _bearMouth('wobble');
    if (mood === 'teary') out += _bearTear(129, 96, 1);
  } else if (mood === 'crying') {
    out += _bearEyeArcDown(78, 86) + _bearEyeArcDown(122, 86);
    out += _bearTear(76, 98, 1.3) + _bearTear(124, 98, 1.3);
    out += _bearMouth('wavy');
  } else if (mood === 'love') {
    out += _bearHeartEye(78, 85) + _bearHeartEye(122, 85);
    out += _bearMouth('big');
  } else {
    out += '<circle cx="78" cy="84" r="5.5" fill="var(--bear-stroke)"/>';
    out += '<circle cx="122" cy="84" r="5.5" fill="var(--bear-stroke)"/>';
    out += _bearMouth('smile');
  }

  out += '</g>';
  return out;
}

function _bearEyeArc(cx, cy, droopy) {
  var h = droopy ? 6 : 9;
  return '<path d="M' + (cx - 9) + ' ' + cy + ' Q ' + cx + ' ' + (cy - h) + ' ' + (cx + 9) + ' ' + cy +
    '" fill="none" stroke="var(--bear-stroke)" stroke-width="3.4" stroke-linecap="round"/>';
}

function _bearEyeArcDown(cx, cy) {
  return '<path d="M' + (cx - 9) + ' ' + (cy - 4) + ' Q ' + cx + ' ' + (cy + 6) + ' ' + (cx + 9) + ' ' + (cy - 4) +
    '" fill="none" stroke="var(--bear-stroke)" stroke-width="3.4" stroke-linecap="round"/>';
}

function _bearEyeGlossy(cx, cy) {
  var out = '<circle cx="' + cx + '" cy="' + cy + '" r="10" fill="var(--bear-stroke)"/>';
  out += '<circle cx="' + (cx - 3.5) + '" cy="' + (cy - 3.5) + '" r="3.2" fill="var(--paper)"/>';
  out += '<circle cx="' + (cx + 2.5) + '" cy="' + (cy + 3) + '" r="1.6" fill="var(--paper)" opacity=".8"/>';
  return out;
}

function _bearHeartEye(cx, cy) {
  return '<path transform="translate(' + cx + ',' + cy + ') scale(0.55)" ' +
    'd="M0 6 C-10 -4 -20 4 0 16 C20 4 10 -4 0 6 Z" fill="var(--rose)"/>';
}

function _bearTear(cx, cy, scale) {
  return '<path transform="translate(' + cx + ',' + cy + ') scale(' + scale + ')" ' +
    'd="M0 0 C4 6 4 12 0 14 C-4 12 -4 6 0 0 Z" fill="var(--paper)" stroke="var(--bear-stroke)" stroke-width="1.4" opacity=".92"/>';
}

function _bearMouth(kind) {
  if (kind === 'big') {
    return '<path d="M86 116 Q100 128 114 116" fill="none" stroke="var(--bear-stroke)" stroke-width="3" stroke-linecap="round"/>';
  }
  if (kind === 'flat') {
    return '<path d="M92 116 Q100 119 108 116" fill="none" stroke="var(--bear-stroke)" stroke-width="2.6" stroke-linecap="round"/>';
  }
  if (kind === 'wobble') {
    return '<path d="M92 118 Q96 114 100 118 Q104 122 108 118" fill="none" stroke="var(--bear-stroke)" stroke-width="2.6" stroke-linecap="round"/>';
  }
  if (kind === 'wavy') {
    return '<path d="M84 114 Q90 124 98 114 Q104 124 112 114 Q116 120 116 122" fill="none" stroke="var(--bear-stroke)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>';
  }
  return '<path d="M90 116 Q100 122 110 116" fill="none" stroke="var(--bear-stroke)" stroke-width="2.8" stroke-linecap="round"/>';
}

/**
 * How far (local units) each figure's whole head — ears, head circle, muzzle, blush, eyes, mouth,
 * nose, all drawn as one sub-group below — is pushed away from the other bear, on top of the 8°
 * tilt that already leans it inward. Real people cheek-hugging turn their heads sideways to meet,
 * which shifts the head off the body's own centre line exactly like this. Without it the two
 * r=58 head circles (centres 90 apart on cx alone, pulled to ~83 apart by the inward tilt) overlap
 * by ~28% of a head's width — the right bear's head burying half of the left bear's face
 * (2026-09-28 review). At this offset they land ~107 apart: heads still touch near the cheek, eyes
 * clear of the other head's circle by a comfortable margin, and the near arm (drawn separately by
 * _bearHugArm, unaffected by this — it stays anchored to the BODY, not the head) still lands on
 * the far shoulder inside tests/checks/gate.mjs's existing bounds. Tuned and verified against both
 * checks by simulating this exact translate+rotate math — not eyeballed.
 */
var HUG_HEAD_OUTSET = 12;

function _bearHugFigure(id, cx, tilt, dir) {
  var headDx = -dir * HUG_HEAD_OUTSET;
  var out = '<g transform="translate(' + cx + ',96) rotate(' + tilt + ')">';
  out += '<ellipse cx="0" cy="46" rx="46" ry="38" fill="url(#' + id + '-fur)" stroke="var(--bear-stroke)" stroke-width="3"/>';
  out += '<g transform="translate(' + headDx + ',0)">';
  /* Ears sit at (∓30,-76) r16 — high enough on the head that a good chunk of each ear circle
     falls outside the r=58 head circle (centre distance ~60 from the head's own centre, so
     distance + ear_r ≈ 76 clears the head's rim by ~18 units), unlike the old (±32,-38) r22
     placement, whose centre sat only ~34.9 from the head centre — fully swallowed by the head
     circle (34.9 + 22 = 56.9 < 58), reading as two bald round heads. Verified geometrically by
     tests/checks/gate.mjs's hug ear check, not eyeballed (2026-09-28 review, judge probe
     review-probes/judge/hug_ears.png). */
  out += '<circle cx="-30" cy="-76" r="16" fill="url(#' + id + '-fur)" stroke="var(--bear-stroke)" stroke-width="3"/>';
  out += '<circle cx="-30" cy="-76" r="7.5" fill="var(--bear-light)"/>';
  out += '<circle cx="30" cy="-76" r="16" fill="url(#' + id + '-fur)" stroke="var(--bear-stroke)" stroke-width="3"/>';
  out += '<circle cx="30" cy="-76" r="7.5" fill="var(--bear-light)"/>';
  out += '<circle cx="0" cy="-24" r="58" fill="url(#' + id + '-fur)" stroke="var(--bear-stroke)" stroke-width="3"/>';
  out += '<ellipse cx="0" cy="-8" rx="27" ry="21" fill="var(--bear-light)"/>';
  out += '<ellipse cx="-32" cy="-16" rx="10" ry="6" fill="var(--bear-blush)" opacity=".55"/>';
  out += '<ellipse cx="32" cy="-16" rx="10" ry="6" fill="var(--bear-blush)" opacity=".55"/>';
  out += _bearEyeArc(-14, -30, false);
  out += _bearEyeArc(14, -30, false);
  out += '<path d="M-10 -4 Q0 4 10 -4" fill="none" stroke="var(--bear-stroke)" stroke-width="2.6" stroke-linecap="round"/>';
  out += '<ellipse cx="0" cy="-6" rx="5.5" ry="4" fill="var(--bear-stroke)"/>';
  out += '</g>';
  out += '</g>';
  return out;
}

/**
 * One figure's inner arm, reaching from its own shoulder across and UP to rest on the OTHER
 * bear's shoulder/back. Drawn as its own top-level group (never nested inside _bearHugFigure's
 * own <g>, and never inside its head sub-group either — the arm stays anchored to the BODY,
 * unaffected by HUG_HEAD_OUTSET) so BOTH arms can be layered on top of BOTH bodies. sx/sy is
 * noticeably LOWER than ex/ey (own shoulder near belly height, hand near the far figure's actual
 * shoulder) so the two dir-mirrored arms draw as a real diagonal cross behind both backs, not the
 * old near-flat, near-identical bar the two used to trace right on top of each other, reading as
 * one short bar across both bellies (2026-09-28 review) — sy=36/ey=40 was only a 4-unit rise.
 * sx/sy/ex/ey are LOCAL to this figure's own transform (translate(cx,96) rotate(tilt)), so "does
 * the hand clear the OTHER figure's face" cannot be read off these numbers directly — the other
 * head lives in a different rotated frame, offset from this figure's own by both the tilt AND
 * HUG_HEAD_OUTSET. Checked by actually transforming both figures' geometry into one shared
 * (world) frame — same translate+rotate math the two <g>s carry, own head-outset included —
 * rather than eyeballing local y:
 *   own shoulder (sx,sy)=(30,48) and hand (ex,ey)=(62,28): both clear of this figure's OWN head
 *     circle (local distance, rotation-preserved) with comfortable margin.
 *   hand (ex,ey)=(62,28): lands inside the FAR figure's head-circle bounds with margin on both
 *     sides — clear of the face, and still inside the far figure's own body-ellipse footprint,
 *     i.e. on its back/shoulder, not floating past it. ey=70 puts that far-head distance well
 *     outside the body ellipse, reading as a tube crossing at belly/hip height (the older
 *     belly-overshoot bug). ey=-6 puts it inside the head circle, grazing the chin (the older
 *     face-height bug). Guarded by tests/checks/gate.mjs's hug geometry check (own/far-head
 *     distance bounds), not just a sign — tuned alongside HUG_HEAD_OUTSET by simulating this same
 *     transform math, not eyeballed.
 */
function _bearHugArm(id, cx, tilt, side) {
  var dir = side === "left" ? 1 : -1;
  var sx = dir * 30, sy = 48;
  var ex = dir * 62, ey = 28;
  var out = '<g transform="translate(' + cx + ',96) rotate(' + tilt + ')">';
  out += '<line x1="' + sx + '" y1="' + sy + '" x2="' + ex + '" y2="' + ey + '" stroke="var(--bear-stroke)" stroke-width="18" stroke-linecap="round"/>';
  out += '<line x1="' + sx + '" y1="' + sy + '" x2="' + ex + '" y2="' + ey + '" stroke="url(#' + id + '-fur)" stroke-width="14" stroke-linecap="round"/>';
  out += '<circle cx="' + ex + '" cy="' + ey + '" r="8.5" fill="var(--bear-light)" stroke="var(--bear-stroke)" stroke-width="2.2"/>';
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
