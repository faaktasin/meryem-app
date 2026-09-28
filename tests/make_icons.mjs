/**
 * meryem-app tests — make_icons.mjs
 *
 * Renders the home-screen icon set from the app's own bear illustration (js/bears.js): a cute
 * bear head plus a small heart, full-bleed on an opaque background — no manual rounding (iOS/
 * Android apply their own mask) and no transparency anywhere (iOS composites alpha onto BLACK on
 * the home screen, which would otherwise ruin the apple-touch-icon). The "any" icons get the
 * app's soft blush-to-rose gradient; the maskable icon gets a flat pink so its corner colour is a
 * single, checkable value, and keeps its artwork inside the central 80% safe circle.
 *
 *   node tests/make_icons.mjs
 * Writes img/icon-180.png, img/icon-192.png, img/icon-512.png, img/icon-maskable-512.png.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { APP_ROOT, TMP_DIR, launch, serve } from "./harness.mjs";

/** Same heart glyph already used for the header title / bottom-nav "Bugün" icon in index.html —
 *  duplicated here (a hardcoded path, not a shared import) because index.html is frozen and this
 *  script has no access to anything it defines. */
const HEART_PATH = "M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z";

/** Flat pink for the maskable variant — a single literal colour so the "corner = background"
 *  check compares against a known value, not just corner-to-corner sameness. */
const MASKABLE_BG = "#FFD1DC";

/**
 * Render-page fixture, written to tests/.tmp/ (gitignored scratch dir) rather than tracked under
 * tests/fixtures/ — this script is the only thing that opens it, so it lives entirely in the
 * harness's own throwaway space. Two levels deep under APP_ROOT, same as tests/fixtures/bears.html,
 * so the relative refs to css/style.css and js/bears.js match that established pattern.
 */
const PAGE_HTML = `<!doctype html>
<html lang="tr"><head><meta charset="UTF-8"><title>Icon Render</title>
<link rel="stylesheet" href="../../css/style.css">
<style>
  html, body { margin: 0; padding: 0; }
  #stage { position: relative; overflow: hidden; }
  #bear-slot, #heart-slot { position: absolute; }
</style></head>
<body>
<div id="stage"><div id="bear-slot"></div><div id="heart-slot"></div></div>
<script src="../../js/bears.js"></script>
<script>
(function () {
  var HEART_PATH = ${JSON.stringify(HEART_PATH)};
  var MASKABLE_BG = ${JSON.stringify(MASKABLE_BG)};

  /**
   * Lays out one icon variant into #stage: a bear head (bearSVG, headOnly) with a small heart
   * beneath it, centred as one block. maskable=true shrinks the block to fit the central 80%
   * safe-zone circle and swaps in the flat background colour.
   */
  function renderIcon(opts) {
    var size = opts.size, maskable = !!opts.maskable, mood = opts.mood || 'love';
    var stage = document.getElementById('stage');
    stage.style.width = size + 'px';
    stage.style.height = size + 'px';
    stage.style.background = maskable ? MASKABLE_BG : 'linear-gradient(150deg, #FFE3EA 0%, #F06A8F 100%)';

    var bearSize = maskable ? size * 0.44 : size * 0.62;
    var bearW = bearSize;
    var bearH = bearSize * (172 / 180); // bearSVG's own headOnly aspect ratio
    var heartSize = size * (maskable ? 0.11 : 0.18);
    var gap = size * 0.02;
    var blockH = bearH + gap + heartSize;
    var blockTop = (size - blockH) / 2;

    var bearSlot = document.getElementById('bear-slot');
    bearSlot.style.left = ((size - bearW) / 2) + 'px';
    bearSlot.style.top = blockTop + 'px';
    bearSlot.innerHTML = bearSVG({ mood: mood, headOnly: true, size: bearSize });

    var heart = document.getElementById('heart-slot');
    heart.style.left = ((size - heartSize) / 2) + 'px';
    heart.style.top = (blockTop + bearH + gap) + 'px';
    heart.innerHTML = '<svg width="' + heartSize + '" height="' + heartSize +
      '" viewBox="0 0 24 24" aria-hidden="true"><path fill="#C93A6E" stroke="#FFFDFB" stroke-width="0.8" d="' + HEART_PATH + '"/></svg>';
  }

  window.renderIcon = renderIcon;
})();
</script>
</body></html>`;

const TARGETS = [
  { file: "icon-180.png", size: 180, maskable: false, mood: "love" },
  { file: "icon-192.png", size: 192, maskable: false, mood: "love" },
  { file: "icon-512.png", size: 512, maskable: false, mood: "love" },
  { file: "icon-maskable-512.png", size: 512, maskable: true, mood: "love" },
];

async function setExactViewport(page, size) {
  await page.send("Emulation.setDeviceMetricsOverride", {
    width: size, height: size, deviceScaleFactor: 1, mobile: false, screenWidth: size, screenHeight: size,
  });
}

async function main() {
  mkdirSync(TMP_DIR, { recursive: true });
  const renderPagePath = join(TMP_DIR, "icon-render.html");
  writeFileSync(renderPagePath, PAGE_HTML, "utf8");

  const server = await serve(APP_ROOT);
  const { page, close } = await launch();
  try {
    await page.goto(server.base + "tests/.tmp/icon-render.html");
    for (const t of TARGETS) {
      await setExactViewport(page, t.size);
      await page.eval((opts) => window.renderIcon(opts), { size: t.size, maskable: t.maskable, mood: t.mood });
      await page.eval(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true)))));
      const { data } = await page.send("Page.captureScreenshot", {
        format: "png",
        clip: { x: 0, y: 0, width: t.size, height: t.size, scale: 1 },
      });
      const outPath = join(APP_ROOT, "img", t.file);
      writeFileSync(outPath, Buffer.from(data, "base64"));
      console.log(`wrote  ${outPath}  (${t.size}x${t.size}${t.maskable ? " maskable" : ""})`);
    }
  } finally {
    await close();
    await server.close();
  }
}

await main();
