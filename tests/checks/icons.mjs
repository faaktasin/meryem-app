/**
 * meryem-app tests — checks/icons.mjs
 *
 * Covers the home-screen icon set: manifest.json parses and lists the four delivered PNGs (plus
 * the SVG kept last), each PNG is a real PNG of its declared size, every icon is fully opaque at
 * its corners (iOS composites transparency onto BLACK on the home screen — the one thing that
 * would otherwise ruin apple-touch-icon silently), and the maskable icon is full-bleed with its
 * artwork kept inside the central 80% safe zone.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openApp } from "../harness.mjs";

export const name = "icons";

const ICONS = [
  { file: "img/icon-180.png", size: 180 },
  { file: "img/icon-192.png", size: 192 },
  { file: "img/icon-512.png", size: 512 },
  { file: "img/icon-maskable-512.png", size: 512 },
];

/** Must match MASKABLE_BG in tests/make_icons.mjs (#FFD1DC) — a literal colour, so "corner =
 *  background" is checked against a known value rather than just corner-to-corner sameness. */
const MASKABLE_BG = { r: 255, g: 209, b: 220 };

function readPngIHDR(buf) {
  const sigOk = buf.length >= 24 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a;
  if (!sigOk) return { sigOk: false, width: null, height: null };
  return { sigOk: true, width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

function closeColor(a, b, tol = 6) {
  return Math.abs(a.r - b.r) <= tol && Math.abs(a.g - b.g) <= tol && Math.abs(a.b - b.b) <= tol;
}

export async function run({ page, check, root }) {
  // 1. manifest.json parses and lists the delivered files
  const manifestPath = join(root, "manifest.json");
  let manifest = null;
  let parseError = "";
  try {
    manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  } catch (e) {
    parseError = String(e.message);
  }
  await check("icons: manifest.json parses as JSON", () => ({ ok: manifest !== null, detail: parseError }));

  const icons = (manifest && manifest.icons) || [];
  const srcs = icons.map((i) => i.src);
  const expectedSrcs = ["img/icon-180.png", "img/icon-192.png", "img/icon-512.png", "img/icon-maskable-512.png"];
  await check("icons: manifest lists the four delivered icon files", () => ({
    ok: expectedSrcs.every((s) => srcs.includes(s)),
    detail: JSON.stringify(srcs),
  }));

  const maskableEntry = icons.find((i) => i.src === "img/icon-maskable-512.png");
  await check("icons: the maskable icon is marked purpose maskable", () => ({
    ok: !!maskableEntry && String(maskableEntry.purpose).indexOf("maskable") !== -1,
    detail: JSON.stringify(maskableEntry || null),
  }));

  const lastEntry = icons[icons.length - 1];
  await check("icons: the SVG icon is kept as the last manifest entry", () => ({
    ok: !!lastEntry && lastEntry.src === "img/heart.svg",
    detail: JSON.stringify(lastEntry || null),
  }));

  // 2. Every PNG exists, is a real PNG, and its declared IHDR size matches
  for (const { file, size } of ICONS) {
    await check(`icons: ${file} exists and is a ${size}x${size} PNG`, () => {
      const full = join(root, file);
      if (!existsSync(full)) return { ok: false, detail: "missing" };
      const info = readPngIHDR(readFileSync(full));
      return { ok: info.sigOk && info.width === size && info.height === size, detail: JSON.stringify(info) };
    });
  }

  await check("icons: img/icon-180.png exists (the apple-touch-icon target index.html references)", () => ({
    ok: existsSync(join(root, "img/icon-180.png")),
  }));

  // 3. Pixel-level checks — read back through a real <canvas> in the browser, not by hand-decoding
  // PNG bytes: loads each PNG as an <img>, draws it, and samples pixels via getImageData().
  await openApp(page, { signedIn: true });
  const pixelReport = await page.eval(async () => {
    function loadImage(src) {
      return new Promise((resolve, reject) => {
        var img = new Image();
        img.onload = function () { resolve(img); };
        img.onerror = function () { reject(new Error("failed to load " + src)); };
        img.src = src;
      });
    }
    function sample(ctx, x, y) {
      var d = ctx.getImageData(x, y, 1, 1).data;
      return { r: d[0], g: d[1], b: d[2], a: d[3] };
    }
    var files = ["img/icon-180.png", "img/icon-192.png", "img/icon-512.png", "img/icon-maskable-512.png"];
    var out = {};
    for (var i = 0; i < files.length; i++) {
      var img = await loadImage(files[i]);
      var canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      var ctx = canvas.getContext("2d");
      ctx.drawImage(img, 0, 0);
      var w = canvas.width, h = canvas.height;
      out[files[i]] = {
        w: w,
        h: h,
        corners: [sample(ctx, 0, 0), sample(ctx, w - 1, 0), sample(ctx, 0, h - 1), sample(ctx, w - 1, h - 1)],
      };
      if (files[i] === "img/icon-maskable-512.png") {
        var cx = w / 2, cy = h / 2, ringR = w * 0.44; // just outside the 80%-diameter safe circle
        var ring = [];
        for (var a = 0; a < 360; a += 15) {
          var rad = (a * Math.PI) / 180;
          var x = Math.round(cx + Math.cos(rad) * ringR);
          var y = Math.round(cy + Math.sin(rad) * ringR);
          var p = sample(ctx, x, y);
          ring.push({ x: x, y: y, r: p.r, g: p.g, b: p.b, a: p.a });
        }
        out[files[i]].ring = ring;
      }
    }
    return out;
  });

  const allCorners = ICONS.flatMap(({ file }) => pixelReport[file].corners.map((c) => ({ file, ...c })));
  await check("icons: every icon PNG is fully opaque at its corners (iOS composites alpha onto black on the home screen)", () => {
    const transparent = allCorners.filter((c) => c.a !== 255);
    return { ok: transparent.length === 0, detail: JSON.stringify(transparent) };
  });

  const maskableCorners = pixelReport["img/icon-maskable-512.png"].corners;
  await check("icons: the maskable icon's corners are the flat background colour (full bleed)", () => {
    const bad = maskableCorners.filter((c) => !closeColor(c, MASKABLE_BG));
    return { ok: bad.length === 0, detail: JSON.stringify(maskableCorners) };
  });

  const ring = pixelReport["img/icon-maskable-512.png"].ring;
  await check("icons: the maskable icon's artwork stays inside the central 80% safe zone", () => {
    const offenders = ring.filter((p) => !closeColor(p, MASKABLE_BG, 14));
    return { ok: offenders.length === 0, detail: JSON.stringify(offenders) };
  });
}

export const mutants = [
  {
    id: "icons-manifest-invalid-json",
    file: "manifest.json",
    find: '"display": "standalone",',
    replace: '"display": "standalone"',
    expect: "icons: manifest.json parses as JSON",
  },
  {
    id: "icons-manifest-missing-icon",
    file: "manifest.json",
    find: '"src": "img/icon-192.png"',
    replace: '"src": "img/icon-192-missing.png"',
    expect: "icons: manifest lists the four delivered icon files",
  },
  {
    id: "icons-manifest-maskable-purpose",
    file: "manifest.json",
    find: '"purpose": "maskable"',
    replace: '"purpose": "any"',
    expect: "icons: the maskable icon is marked purpose maskable",
  },
  {
    id: "icons-manifest-svg-not-last",
    file: "manifest.json",
    find: '"src": "img/heart.svg"',
    replace: '"src": "img/heart-old.svg"',
    expect: "icons: the SVG icon is kept as the last manifest entry",
  },
];

export const shots = [
  {
    name: "icon-set",
    open: { signedIn: true },
    act: async (page) => {
      await page.eval(() => {
        var wrap = document.createElement("div");
        wrap.id = "__icon-shot";
        wrap.style.cssText = "position:fixed;inset:0;z-index:99999;background:#B9C4C8;display:flex;flex-wrap:wrap;align-items:center;justify-content:center;gap:20px;padding:20px;";
        [
          ["img/icon-180.png", "180 (any)"],
          ["img/icon-192.png", "192 (any)"],
          ["img/icon-512.png", "512 (any)"],
          ["img/icon-maskable-512.png", "512 (maskable)"],
        ].forEach(function (pair) {
          var col = document.createElement("div");
          col.style.cssText = "display:flex;flex-direction:column;align-items:center;gap:6px;";
          var img = document.createElement("img");
          img.src = pair[0];
          img.style.cssText = "width:120px;height:120px;object-fit:contain;border-radius:22%;box-shadow:0 4px 14px rgba(0,0,0,.25);";
          var label = document.createElement("span");
          label.textContent = pair[1];
          label.style.cssText = "font:600 12px sans-serif;color:#222;";
          col.appendChild(img);
          col.appendChild(label);
          wrap.appendChild(col);
        });
        document.body.appendChild(wrap);
      });
    },
  },
];
