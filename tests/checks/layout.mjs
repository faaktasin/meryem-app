/**
 * meryem-app tests — checks/layout.mjs
 *
 * Guards against cramped and overlapping controls. Every tab, the ?ozel-metin panel and an opened
 * Sözler letter are opened at 360x780, 390x844 and 1536x864 (the mobile form of the viewport; the
 * desktop form disables touch emulation and fails), and every visible interactive element is
 * measured:
 *   - no two overlap (nested pairs, e.g. a label around its input, are not pairs);
 *   - no two sit closer than 8 px (6 px for two Takip day cells, which share a seven-column grid);
 *   - each, scrolled to the centre of the screen, is the top element at its own centre;
 *   - no button's content spills out of it;
 *   - the opened letter's close button does not straddle the edge of the envelope drawing;
 *   - the spots that were fixed keep their spacing: panel hint above its buttons, Sözler pill above
 *     the quote box, envelope grid in equal columns with a 14 px gap.
 *
 * Designed groups that are left out of the pair checks on purpose: the header and the bottom tab bar
 * (one bar, its buttons touch), the Galeri/Harita segmented switch, Leaflet's own map controls.
 * Designed overflow: #bday-gift-trigger ("Hediye kutusu") - the bear leans out of the gift box, so
 * its content is wider than the button by design; a locked Takip heart carries its lock badge on
 * the corner.
 */
import { openApp } from "../harness.mjs";

export const name = "layout";

const VIEWPORTS = [
  { width: 360, height: 780 },
  { width: 390, height: 844 },
  { width: 1536, height: 864 },
];

const STORAGE = { "meryem-habits-me": "furkan", "meryem-birthday-seen-year": "2026", "meryem-gate-played-year": "2026" };
const NOW = "2026-10-26T10:00:00";

const TAB_SCENES = ["today-view", "habits-view", "words-view", "memories-view", "dates-view", "birthday-view"];

const N_OVERLAP = "layout: no two visible interactive elements overlap on any tab, in the ?ozel-metin panel or in an opened letter, at 360, 390 and 1536 px wide";
const N_CLOSE = "layout: no two visible interactive elements sit closer than 8 px (6 px between two Takip day cells), at 360, 390 and 1536 px wide";
const N_COVERED = "layout: every visible interactive element, scrolled to the centre, is the top element at its own centre (nothing covers it)";
const N_OVERFLOW = "layout: no button's content is wider or taller than the button itself (the Hediye kutusu trigger and the lock badge of a locked heart overflow by design)";
const N_LETTER = "layout: the opened letter's close button does not straddle the edge of the envelope drawing";
const N_PANEL = "layout: in the ?ozel-metin panel the hint keeps 16 px above the first button and the two buttons are 12 px apart";
const N_PILL = "layout: in Sözler the Favorilerim pill keeps at least 12 px above the quote box";
const N_GRID = "layout: the Sözler envelopes sit in equal-width columns, at least 14 px apart, at every width";

/* Runs inside the page. Measures the interactive elements under `root`, in the page's current
 * state, and returns the offending pairs / elements as short strings. */
function scan(cfg) {
  var root = document.querySelector(cfg.root);
  var out = { overlap: [], close: [], covered: [], overflow: [] };
  if (!root) return { missing: true, overlap: [], close: [], covered: [], overflow: [] };
  window.scrollTo(0, 0);

  function describe(el) {
    var d = el.tagName.toLowerCase();
    if (el.id) return d + "#" + el.id;
    var c = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 2).join(".") : "";
    var r = el.getBoundingClientRect();
    return d + (c ? "." + c : "") + "@" + Math.round(r.left) + "," + Math.round(r.top + window.scrollY);
  }
  function shown(el) {
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      var cs = getComputedStyle(n);
      if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    }
    var r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  }
  var all = Array.prototype.slice.call(root.querySelectorAll(cfg.selector)).filter(function (el) {
    if (el.closest(cfg.skip)) return false;
    return shown(el);
  });
  var rects = all.map(function (el) { return el.getBoundingClientRect(); });

  for (var i = 0; i < all.length; i++) {
    for (var j = i + 1; j < all.length; j++) {
      var a = all[i], b = all[j];
      if (a.contains(b) || b.contains(a)) continue;
      var ra = rects[i], rb = rects[j];
      var dx = Math.max(ra.left, rb.left) - Math.min(ra.right, rb.right);
      var dy = Math.max(ra.top, rb.top) - Math.min(ra.bottom, rb.bottom);
      var pair = describe(a) + " / " + describe(b);
      if (dx < -0.5 && dy < -0.5) { out.overlap.push(pair); continue; }
      var gap = dx > 0 && dy > 0 ? Math.sqrt(dx * dx + dy * dy) : Math.max(dx, dy);
      var min = a.classList.contains("hb-day") && b.classList.contains("hb-day") ? 6 : 8;
      if (gap < min - 0.01) out.close.push(pair + " (" + gap.toFixed(1) + " px)");
    }
  }

  all.forEach(function (el) {
    el.scrollIntoView({ block: "center", inline: "center", behavior: "instant" });
    var r = el.getBoundingClientRect();
    var x = r.left + r.width / 2, y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x >= window.innerWidth || y >= window.innerHeight) return;
    var top = document.elementFromPoint(x, y);
    if (top !== el && !(top && el.contains(top))) out.covered.push(describe(el) + " under " + (top ? describe(top) : "nothing"));
  });
  window.scrollTo(0, 0);

  all.forEach(function (el) {
    if (!el.matches(cfg.buttons) || el.matches(cfg.overflowExempt)) return;
    if (el.scrollWidth > el.clientWidth + 2) {
      out.overflow.push(describe(el) + " content " + el.scrollWidth + " px wide in " + el.clientWidth + " px");
    }
  });
  return out;
}

const CFG = {
  selector: "button, a[href], input:not([type=hidden]), select, textarea, label[for], [role=button], [role=tab], .btn",
  skip: ".header, .bottom-nav, .seg-control, .leaflet-control",
  buttons: "button, a[href], [role=button], [role=tab], .btn",
  // Designed: the bear leans out of the gift box, and a locked Takip heart wears its lock badge
  // on the corner (position: absolute, -5 px), so their content is wider than the button.
  overflowExempt: "#bday-gift-trigger, .hb-heart.is-locked",
};

const wait = (page, ms) => page.eval((t) => new Promise((r) => setTimeout(r, t)), ms);
const open = (page, vp, extra = {}) => openApp(page, { signedIn: true, now: NOW, viewport: vp, storage: STORAGE, ...extra });

export async function run({ page, check }) {
  const found = { overlap: [], close: [], covered: [], overflow: [] };
  const sceneErrors = [];
  const tell = (tag, res) => {
    if (res.missing) { sceneErrors.push(`${tag}: scan root not found`); return; }
    for (const k of Object.keys(found)) for (const s of res[k]) found[k].push(`${tag} ${s}`);
  };
  const letter = [];
  const panel = [];
  const pill = [];
  const grid = [];

  for (const vp of VIEWPORTS) {
    const size = `${vp.width}x${vp.height}`;

    for (const tab of TAB_SCENES) {
      await open(page, vp);
      await page.eval((id) => { showTab(id); window.scrollTo(0, 0); }, tab);
      await wait(page, 300);
      tell(`${size} ${tab}`, await page.eval(scan, { ...CFG, root: `#${tab}` }));

      if (tab === "words-view") {
        const m = await page.eval(() => {
          var head = document.getElementById("wz-fav-toggle").getBoundingClientRect();
          var deck = document.getElementById("wz-deck").getBoundingClientRect();
          var cols = Array.prototype.slice.call(document.querySelectorAll(".wz-envelope")).map(function (e) {
            var r = e.getBoundingClientRect();
            return { l: r.left, t: r.top, w: r.width, h: r.height };
          });
          return { pillToDeck: deck.top - head.bottom, cols: cols };
        });
        pill.push(`${size} pill-to-quote-box ${m.pillToDeck.toFixed(1)} px`);
        const widths = m.cols.map((c) => c.w);
        const same = widths.length > 1 && Math.max(...widths) - Math.min(...widths) < 1;
        // horizontal gap between neighbours on the same row, vertical gap between rows
        let minGap = Infinity;
        for (let i = 0; i < m.cols.length; i++) {
          for (let j = i + 1; j < m.cols.length; j++) {
            const a = m.cols[i], b = m.cols[j];
            const g = Math.abs(a.t - b.t) < 1 ? Math.min(Math.abs(b.l - (a.l + a.w)), Math.abs(a.l - (b.l + b.w)))
              : Math.abs(a.l - b.l) < 1 ? Math.min(Math.abs(b.t - (a.t + a.h)), Math.abs(a.t - (b.t + b.h))) : Infinity;
            if (g < minGap) minGap = g;
          }
        }
        grid.push({ size, n: widths.length, same, minGap, widths: widths.map((w) => Math.round(w)).join("/") });
      }
    }

    // The ?ozel-metin panel.
    await open(page, vp, { query: "?ozel-metin" });
    await wait(page, 600);
    tell(`${size} ozel-metin panel`, await page.eval(scan, { ...CFG, root: "#private-modal" }));
    const pm = await page.eval(() => {
      var hint = document.querySelector("#private-modal p").getBoundingClientRect();
      var a = document.getElementById("private-choose-btn").getBoundingClientRect();
      var b = document.getElementById("private-download-btn").getBoundingClientRect();
      return { hintToButton: a.top - hint.bottom, between: b.top - a.bottom };
    });
    panel.push({ size, ...pm });

    // An opened letter.
    await open(page, vp);
    await page.eval(() => { showTab("words-view"); window.scrollTo(0, 0); });
    await wait(page, 300);
    const clicked = await page.eval(() => {
      var env = document.querySelector(".wz-envelope:not(.wz-envelope--locked)");
      if (env) env.click();
      return !!env;
    });
    await wait(page, 900);
    if (!clicked) {
      sceneErrors.push(`${size}: no unlocked envelope to open`);
    } else {
      tell(`${size} opened letter`, await page.eval(scan, { ...CFG, root: "#wz-letter-reader" }));
      const lm = await page.eval(() => {
        var c = document.getElementById("wz-letter-close").getBoundingClientRect();
        var parts = [".wz-letter-envelope", ".wz-letter-pocket", ".wz-letter-flap"];
        var bad = [];
        parts.forEach(function (sel) {
          var e = document.querySelector(sel).getBoundingClientRect();
          var touches = c.left < e.right && c.right > e.left && c.top < e.bottom && c.bottom > e.top;
          var inside = c.left >= e.left && c.right <= e.right && c.top >= e.top && c.bottom <= e.bottom;
          if (touches && !inside) bad.push(sel);
        });
        return { bad: bad, close: [c.left, c.top, c.right, c.bottom].map(Math.round).join(",") };
      });
      letter.push({ size, ...lm });
    }
  }

  const list = (xs) => (xs.length ? xs.slice(0, 12).join("; ") + (xs.length > 12 ? `; ... ${xs.length} in all` : "") : "none");
  await check(N_OVERLAP, () => ({ ok: found.overlap.length === 0 && sceneErrors.length === 0, detail: list(found.overlap.concat(sceneErrors)) }));
  await check(N_CLOSE, () => ({ ok: found.close.length === 0, detail: list(found.close) }));
  await check(N_COVERED, () => ({ ok: found.covered.length === 0, detail: list(found.covered) }));
  await check(N_OVERFLOW, () => ({ ok: found.overflow.length === 0, detail: list(found.overflow) }));
  await check(N_LETTER, () => ({
    ok: letter.length === VIEWPORTS.length && letter.every((l) => l.bad.length === 0),
    detail: letter.map((l) => `${l.size} close [${l.close}] crosses ${l.bad.join(",") || "nothing"}`).join("; "),
  }));
  await check(N_PANEL, () => ({
    ok: panel.length === VIEWPORTS.length && panel.every((p) => p.hintToButton >= 16 - 0.5 && p.between >= 12 - 0.5),
    detail: panel.map((p) => `${p.size} hint-to-button ${p.hintToButton.toFixed(1)}, between ${p.between.toFixed(1)}`).join("; "),
  }));
  await check(N_PILL, () => ({
    ok: pill.length === VIEWPORTS.length && pill.every((s) => parseFloat(s.split("quote-box ")[1]) >= 12),
    detail: pill.join("; "),
  }));
  await check(N_GRID, () => ({
    ok: grid.length === VIEWPORTS.length && grid.every((g) => g.n >= 2 && g.same && g.minGap >= 14 - 0.5),
    detail: grid.map((g) => `${g.size} n=${g.n} widths ${g.widths} minGap ${g.minGap.toFixed(1)}`).join("; "),
  }));
}

export const mutants = [
  {
    id: "layout-panel-gap-removed",
    file: "css/style.css",
    find: ".private-actions {\n  display: flex;\n  flex-direction: column;\n  gap: 12px;\n}",
    replace: ".private-actions {\n  display: flex;\n  flex-direction: column;\n  gap: 0;\n}",
    expect: N_PANEL,
  },
  {
    id: "layout-panel-hint-margin-removed",
    file: "css/style.css",
    find: ".private-hint {\n  margin-bottom: 16px;\n}",
    replace: ".private-hint {\n  margin-bottom: 0;\n}",
    expect: N_PANEL,
  },
  {
    id: "layout-pill-margin-removed",
    file: "css/words.css",
    find: ".wz-section-head {\n  margin-bottom: 14px;\n}",
    replace: ".wz-section-head {\n  margin-bottom: 0;\n}",
    expect: N_PILL,
  },
  {
    id: "layout-envelope-gap-back-to-10",
    file: "css/words.css",
    find: "grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 14px;",
    replace: "grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 10px;",
    expect: N_GRID,
  },
  {
    id: "layout-envelope-columns-uneven",
    file: "css/words.css",
    find: "grid-template-columns: repeat(2, minmax(0, 1fr));\n  gap: 14px;\n}",
    replace: "grid-template-columns: repeat(2, 1fr);\n  gap: 14px;\n}\n\n@media (min-width: 480px) {\n  .wz-letters-grid {\n    grid-template-columns: repeat(4, 1fr);\n  }\n}",
    expect: N_GRID,
  },
  {
    id: "layout-calendar-gap-back-to-2",
    file: "css/habits.css",
    find: "grid-template-columns: repeat(7, minmax(0, 1fr));\n  gap: 6px;",
    replace: "grid-template-columns: repeat(7, minmax(0, 1fr));\n  gap: 2px;",
    expect: N_CLOSE,
  },
  {
    id: "layout-letter-close-back-on-the-edge",
    file: "css/words.css",
    find: "  top: 108px;\n  right: 10px;\n  z-index: 5;",
    replace: "  top: -8px;\n  right: -8px;\n  z-index: 3;",
    expect: N_LETTER,
  },
];
