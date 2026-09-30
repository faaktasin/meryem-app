/**
 * meryem-app tests — checks/memories.mjs
 *
 * Covers the Anılar (memories: gallery + map) package: the polaroid gallery and its sections, the
 * gallery/map segmented switch (a compact centred pill, not a full-width bar), the Leaflet map
 * becoming correctly sized the moment it is shown, and its zoom/attribution controls staying clear
 * of the raised gift-tab nav button.
 */
import { openApp } from "../harness.mjs";

export const name = "memories";

/* A 1x1 fully-transparent PNG (same fixture harness.mjs uses for map tiles) standing in for a
   real photo thumbnail — isValidPhotoUrl() only checks the data: prefix, never decodes it. */
const DATA_PNG = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==";

/* 3 memories with photos: 2 carry lat/lng (go to #gallery-grid), 1 does not (goes to
   #gallery-grid-nomap), exactly as the task's fixture spec asks. */
const MEMORIES_FIXTURE = [
  { id: "m1", title: "İlk Buluşma", date: "2026-03-10", note: "Kahve içtik", lat: 39.92, lng: 32.85, source: "map", thumbnail: DATA_PNG },
  { id: "m2", title: "Deniz Kenarı", date: "2026-06-01", note: "", lat: 36.88, lng: 30.7, source: "gallery", thumbnail: DATA_PNG },
  { id: "m3", title: "Ev Akşamı", date: "2026-07-15", note: "Film gecesi", lat: null, lng: null, source: "gallery", thumbnail: DATA_PNG },
];

/* A memory dropped straight on the map (source: "map") with no thumbnail/photo/driveFileId at
   all — renderGallery() filters photo-less memories out of BOTH gallery grids before the
   location split, so this one never appears there; a tap on its map marker is the only path to
   showMemoryDetail()'s empty-photo branch. lat/lng sit right on CONFIG.mapCenter (js/data.js)
   so the marker lands in view at any zoom, independent of that file's current default. */
const NO_PHOTO_FIXTURE = [
  { id: "m4", title: "Yıldızlı Gece", date: "2026-08-20", note: "", lat: 39.9334, lng: 32.8597, source: "map" },
];

/* M7: one memory whose title was already stripped to '' (a camera default file name at upload
   time), one with a real title — the gallery must show a caption for only the second. */
const CAMERA_TITLE_FIXTURE = [
  { id: "c1", title: "", date: "2026-02-02", note: "", lat: 39.91, lng: 32.86, source: "gallery", thumbnail: DATA_PNG },
  { id: "c2", title: "Kahve Molası", date: "2026-02-03", note: "", lat: 39.92, lng: 32.87, source: "gallery", thumbnail: DATA_PNG },
];

async function openMemories(page, memories = MEMORIES_FIXTURE) {
  await openApp(page, { signedIn: true, memories });
  await page.tap('.nav-btn[data-tab="memories-view"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));
}

async function switchToMap(page) {
  await page.tap('.seg-btn[data-seg="map"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 450)));
}

async function switchToGallery(page) {
  await page.tap('.seg-btn[data-seg="gallery"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
}

export async function run({ page, check }) {
  // 1. The three polaroids render in the right sections
  await openMemories(page);
  const sections = await page.eval(() => ({
    gridCount: document.querySelectorAll("#gallery-grid .anilar-polaroid").length,
    nomapCount: document.querySelectorAll("#gallery-grid-nomap .anilar-polaroid").length,
    nomapVisible: getComputedStyle(document.getElementById("gallery-nomap-section")).display !== "none",
    gridAreButtons: [...document.querySelectorAll("#gallery-grid .anilar-polaroid")].every((el) => el.tagName === "BUTTON"),
  }));
  await check("memories: the 3 fixture memories render as real-button polaroids in the right sections (2 with location, 1 without)", () => ({
    ok: sections.gridCount === 2 && sections.nomapCount === 1 && sections.nomapVisible === true && sections.gridAreButtons === true,
    detail: JSON.stringify(sections),
  }));

  // 2. The switch pill is a compact, centred pill — not a full-width bar
  const switchBox = await page.box("#memories-switch");
  const viewport = 390;
  const switchOk = switchBox.width > 0 && switchBox.width < viewport - 60
    && Math.abs(switchBox.left - (viewport - switchBox.right)) <= 4;
  await check("memories: the switch pill is narrower than the viewport and centred", () => ({
    ok: switchOk,
    detail: JSON.stringify(switchBox),
  }));

  // 3. Switching to Harita shows the map, sized to match its own box (invalidateSize worked —
  // Leaflet initializes against a hidden, zero-size container, so this only matches if something
  // resized it after the tab became visible). The map hint only has real geometry once this
  // subview is the visible one, so its single-line check rides along here too.
  await switchToMap(page);
  const hintBox = await page.box("#map-hint");
  await check("memories: the map hint renders on a single line", () => ({
    ok: hintBox.height > 0 && hintBox.height < 50,
    detail: JSON.stringify(hintBox),
  }));

  const afterMap = await page.eval(() => ({
    galleryActive: document.getElementById("gallery-view").classList.contains("is-active"),
    mapActive: document.getElementById("map-view").classList.contains("is-active"),
    segMapActive: document.querySelector('.seg-btn[data-seg="map"]').classList.contains("is-active"),
  }));
  const mapCompare = await page.eval(() => {
    var box = document.getElementById("map").getBoundingClientRect();
    var size = window.appMap.getSize();
    return { boxW: box.width, boxH: box.height, sizeX: size.x, sizeY: size.y };
  });
  const sizeOk = Math.abs(mapCompare.boxW - mapCompare.sizeX) <= 2 && Math.abs(mapCompare.boxH - mapCompare.sizeY) <= 2
    && mapCompare.boxH > 100;
  await check("memories: switching to Harita shows the map, and its Leaflet size matches the #map box (invalidateSize ran)", () => ({
    ok: !afterMap.galleryActive && afterMap.mapActive && afterMap.segMapActive && sizeOk,
    detail: JSON.stringify({ afterMap, mapCompare }),
  }));

  // 5. Neither Leaflet control's rectangle overlaps the nav's raised gift-tab circle — a real
  // pixel-rectangle test against the pseudo-element's own computed box (top/width/height), not
  // just a single elementFromPoint sample, because the circle only grazes the lower of the two
  // stacked zoom buttons: a centre-point sample on the whole .leaflet-control-zoom box sits above
  // that sliver and would miss it entirely.
  const controls = await page.eval(() => {
    function rect(el) {
      var r = el.getBoundingClientRect();
      return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }
    function overlaps(a, b) {
      return a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    }
    // The raised circle is .nav-gift-bubble::before, centred on the bubble (whose rect already
    // includes its lift transform).
    var bubble = document.querySelector(".nav-btn--gift .nav-gift-bubble");
    var bubbleRect = bubble.getBoundingClientRect();
    var cs = getComputedStyle(bubble, "::before");
    var w = parseFloat(cs.width);
    var h = parseFloat(cs.height);
    var cx = bubbleRect.left + bubbleRect.width / 2;
    var cy = bubbleRect.top + bubbleRect.height / 2;
    var circle = { left: cx - w / 2, right: cx + w / 2, top: cy - h / 2, bottom: cy + h / 2 };
    var zoom = rect(document.querySelector(".leaflet-control-zoom"));
    var attr = rect(document.querySelector(".leaflet-control-attribution"));
    var nav = rect(document.querySelector(".bottom-nav"));
    return {
      circle: circle,
      zoom: zoom,
      attr: attr,
      navTop: nav.top,
      zoomOverlapsCircle: overlaps(zoom, circle),
      attrOverlapsCircle: overlaps(attr, circle),
      /* The nav bar itself is translucent (blur + <100% opacity), not just the raised circle —
         a control whose box dips below the nav's own top edge reads as smudged through it even
         where the circle never reaches, so this is checked on top of the circle-specific test. */
      attrUnderNavBar: attr.bottom > nav.top,
    };
  });
  await check("memories: neither the zoom control nor the attribution overlaps the nav's raised gift-tab circle or the nav bar itself", () => ({
    ok: !controls.zoomOverlapsCircle && !controls.attrOverlapsCircle && !controls.attrUnderNavBar,
    detail: JSON.stringify(controls),
  }));

  // 6. Switching back restores the gallery
  await switchToGallery(page);
  const afterGallery = await page.eval(() => ({
    galleryActive: document.getElementById("gallery-view").classList.contains("is-active"),
    mapActive: document.getElementById("map-view").classList.contains("is-active"),
  }));
  await check("memories: switching back to Galeri restores the gallery view", () => ({
    ok: afterGallery.galleryActive && !afterGallery.mapActive,
    detail: JSON.stringify(afterGallery),
  }));

  // 7. Opening a polaroid shows the detail modal, itself styled as a polaroid
  await page.tap("#gallery-grid .anilar-polaroid");
  await page.eval(() => new Promise((r) => setTimeout(r, 250)));
  const detail = await page.eval(() => {
    var overlay = document.getElementById("detail-modal");
    var card = document.querySelector("#detail-content .anilar-detail-polaroid");
    return {
      open: overlay.classList.contains("open"),
      hasCard: !!card,
      hasPhoto: !!(card && card.querySelector(".anilar-polaroid-photo img")),
      title: document.querySelector("#detail-content h3")?.textContent || "",
    };
  });
  await check("memories: opening a polaroid shows the detail modal styled as a polaroid", () => ({
    ok: detail.open && detail.hasCard && detail.hasPhoto && detail.title === "İlk Buluşma",
    detail: JSON.stringify(detail),
  }));
  await page.tap('[data-close-modal="detail-modal"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 150)));

  // 8. Empty state: no memories at all shows the sweet-bear empty state, not the old bare text
  await openMemories(page, []);
  const empty = await page.eval(() => {
    var wrap = document.querySelector("#gallery-grid .anilar-empty");
    return {
      hasWrap: !!wrap,
      hasBear: !!(wrap && wrap.querySelector("svg.kawaii-bear")),
      hasText: !!(wrap && wrap.querySelector(".anilar-empty-text")),
      nomapHidden: getComputedStyle(document.getElementById("gallery-nomap-section")).display === "none",
    };
  });
  await check("memories: the empty gallery shows a bear, not a bare paragraph", () => ({
    ok: empty.hasWrap && empty.hasBear && empty.hasText && empty.nomapHidden,
    detail: JSON.stringify(empty),
  }));

  // 9. A map pin with no photo at all (no thumbnail/photo/driveFileId) shows a small bear in the
  // polaroid's photo slot in the detail modal — never a blank box, never a broken <img>.
  await openApp(page, { signedIn: true, memories: NO_PHOTO_FIXTURE });
  await page.tap('.nav-btn[data-tab="memories-view"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
  await switchToMap(page);
  await page.tap(".heart-marker");
  await page.eval(() => new Promise((r) => setTimeout(r, 250)));
  const noPhoto = await page.eval(() => {
    var overlay = document.getElementById("detail-modal");
    var slot = document.querySelector("#detail-content .anilar-polaroid-photo--empty");
    return {
      open: overlay.classList.contains("open"),
      hasEmptySlot: !!slot,
      hasBear: !!(slot && slot.querySelector("svg.kawaii-bear")),
      hasImg: !!document.querySelector("#detail-content .anilar-polaroid-photo img"),
    };
  });
  await check("memories: a map pin with no photo shows a bear in the detail modal, not a blank box", () => ({
    ok: noPhoto.open && noPhoto.hasEmptySlot && noPhoto.hasBear && !noPhoto.hasImg,
    detail: JSON.stringify(noPhoto),
  }));
  await page.tap('[data-close-modal="detail-modal"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 150)));

  // 10. No console errors or exceptions across the whole tour
  await check("memories: no console errors or exceptions across the tour", () => ({
    ok: page.errors.length === 0,
    detail: page.errors.slice(0, 5).join(" ; "),
  }));

  // ── judge-verdict fixes (shell-memories group) ──────────────────────────
  // Appended after the pre-existing checks above (past check 10's own "no console errors" read)
  // so a malformed data: URI in the m1 fixture below can never be blamed on an earlier check.

  // 11. M7: galleryUploadTitle() strips camera default file names to '', real titles pass through.
  const cameraTitleTests = await page.eval(() => {
    var camera = [
      "IMG_4821.JPG", "DSC00012.jpg", "dscn0007.png",
      "PXL_20260101_120000.jpg", "image.png", "photo123.jpeg", "foto_2.png",
    ];
    var normal = ["Kahve Molası.jpg", "Sahilde.png", "image-editing-tips.jpg"];
    return {
      cameraResults: camera.map(function (n) { return galleryUploadTitle(n); }),
      normalResults: normal.map(function (n) { return galleryUploadTitle(n); }),
    };
  });
  await check("memories: camera default file names (IMG_/DSC_/PXL_/photo…) upload with an empty title, real titles pass through (M7)", () => ({
    ok: cameraTitleTests.cameraResults.every((t) => t === "")
      && JSON.stringify(cameraTitleTests.normalResults) === JSON.stringify(["Kahve Molası", "Sahilde", "image-editing-tips"]),
    detail: JSON.stringify(cameraTitleTests),
  }));

  // 12. M7: a memory with no title (a stripped camera filename) shows no caption in the gallery,
  // while a real title still does.
  await openMemories(page, CAMERA_TITLE_FIXTURE);
  const captions = await page.eval(() => {
    var btns = document.querySelectorAll("#gallery-grid .anilar-polaroid");
    return Array.prototype.map.call(btns, function (b) {
      var cap = b.querySelector(".anilar-polaroid-caption");
      return cap ? cap.textContent : null;
    });
  });
  await check("memories: a photo with no title shows no caption in the gallery, a real title still does (M7)", () => ({
    ok: captions.length === 2 && captions.indexOf(null) !== -1 && captions.indexOf("Kahve Molası") !== -1,
    detail: JSON.stringify(captions),
  }));

  // 13. m1: photo URLs are escaped before landing in an <img src="…"> — defense in depth against a
  // crafted title/thumbnail (isValidPhotoUrl only checks the data:/https: prefix, never decodes).
  const XSS_FIXTURE = [{
    id: "x1",
    title: 'Zehir" onmouseover="window.__xssTitle=1',
    date: "2026-01-01",
    note: "",
    lat: 39.9,
    lng: 32.8,
    source: "map",
    thumbnail: 'data:image/png;base64,AAAA" onerror="window.__xssPhoto=1;//',
  }];
  await openMemories(page, XSS_FIXTURE);
  const galleryImg = await page.eval(() => {
    var img = document.querySelector("#gallery-grid .anilar-polaroid img");
    return { hasOnerrorAttr: !!(img && img.hasAttribute("onerror")), src: img ? img.src : null };
  });
  await page.tap("#gallery-grid .anilar-polaroid");
  await page.eval(() => new Promise((r) => setTimeout(r, 250)));
  const detailImg = await page.eval(() => {
    var img = document.querySelector("#detail-content .anilar-polaroid-photo img");
    return { hasOnerrorAttr: !!(img && img.hasAttribute("onerror")), src: img ? img.src : null };
  });
  const xssFired = await page.eval(() => !!window.__xssTitle || !!window.__xssPhoto);
  await check("memories: a crafted title/thumbnail cannot break out of the gallery or detail <img> attribute (m1)", () => ({
    ok: galleryImg.hasOnerrorAttr === false && detailImg.hasOnerrorAttr === false && !xssFired
      && !!galleryImg.src && galleryImg.src.indexOf("data:image/") === 0
      && !!detailImg.src && detailImg.src.indexOf("data:image/") === 0,
    detail: JSON.stringify({ galleryImg, detailImg, xssFired }),
  }));
  await page.tap('[data-close-modal="detail-modal"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 150)));

  // 14. m5: the map hint starts at full opacity (was 0.92, below 4.5:1 contrast), and under
  // reduced motion it stays fully visible instead of racing hintFade straight to invisible.
  await openMemories(page);
  await switchToMap(page);
  const hintNormal = await page.eval(() => {
    var cs = getComputedStyle(document.getElementById("map-hint"));
    return { opacity: parseFloat(cs.opacity) };
  });
  await openApp(page, { signedIn: true, memories: MEMORIES_FIXTURE, reducedMotion: true });
  await page.tap('.nav-btn[data-tab="memories-view"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
  await page.tap('.seg-btn[data-seg="map"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  const hintReduced = await page.eval(() => {
    var cs = getComputedStyle(document.getElementById("map-hint"));
    return { opacity: parseFloat(cs.opacity), animationName: cs.animationName };
  });
  await check("memories: the map hint starts at full opacity and stays fully visible under reduced motion (m5)", () => ({
    ok: hintNormal.opacity >= 0.999 && hintReduced.opacity >= 0.999 && hintReduced.animationName === "none",
    detail: JSON.stringify({ hintNormal, hintReduced }),
  }));

  // 15. m6: map pins carry an accessible name (aria-label) matching the memory title — a divIcon's
  // element is a plain <div>, so Leaflet's own `alt` option is a silent no-op on it.
  await openMemories(page);
  await switchToMap(page);
  const markerA11y = await page.eval(() => {
    var els = document.querySelectorAll(".heart-marker, .camera-marker");
    return Array.prototype.map.call(els, function (el) { return el.getAttribute("aria-label"); }).sort();
  });
  await check("memories: map pins carry an accessible name (aria-label) matching the memory title (m6)", () => ({
    ok: JSON.stringify(markerA11y) === JSON.stringify(["Deniz Kenarı", "İlk Buluşma"]),
    detail: JSON.stringify(markerA11y),
  }));
}

export const mutants = [
  {
    id: "memories-seg-pill-width",
    file: "css/anilar.css",
    find: "#memories-switch.seg-control {\n  display: flex;\n  width: fit-content;\n  height: auto;\n  margin: 14px auto 10px;\n}",
    replace: "#memories-switch.seg-control {\n  display: flex;\n  width: 100%;\n  height: auto;\n  margin: 14px auto 10px;\n}",
    expect: "memories: the switch pill is narrower than the viewport and centred",
  },
  {
    id: "memories-map-hint-wrap",
    file: "css/anilar.css",
    find: ".map-hint {\n  white-space: nowrap;\n}",
    replace: ".map-hint {\n  white-space: normal;\n}",
    expect: "memories: the map hint renders on a single line",
  },
  {
    id: "memories-zoom-position",
    file: "js/map.js",
    find: "L.control.zoom({ position: 'topright' }).addTo(map);",
    replace: "L.control.zoom({ position: 'bottomright' }).addTo(map);",
    expect: "memories: neither the zoom control nor the attribution overlaps the nav's raised gift-tab circle or the nav bar itself",
  },
  {
    id: "memories-attribution-position",
    file: "js/map.js",
    find: "map.attributionControl.setPosition('bottomleft');",
    replace: "map.attributionControl.setPosition('bottomright');",
    expect: "memories: neither the zoom control nor the attribution overlaps the nav's raised gift-tab circle or the nav bar itself",
  },
  {
    id: "memories-attribution-nav-overhang",
    file: "css/anilar.css",
    find: ".leaflet-bottom.leaflet-left {\n  bottom: 10px;\n}",
    replace: ".leaflet-bottom.leaflet-left {\n  bottom: 0px;\n}",
    expect: "memories: neither the zoom control nor the attribution overlaps the nav's raised gift-tab circle or the nav bar itself",
  },
  {
    id: "memories-invalidate-on-switch",
    file: "js/map.js",
    find: "if (seg === 'map') anilarResizeMapNextFrame();",
    replace: "",
    expect: "memories: switching to Harita shows the map, and its Leaflet size matches the #map box (invalidateSize ran)",
  },
  {
    id: "memories-polaroid-class",
    file: "js/map.js",
    find: "'<button type=\"button\" class=\"gallery-item anilar-polaroid\" data-gallery-id=\"'",
    replace: "'<button type=\"button\" class=\"gallery-item\" data-gallery-id=\"'",
    expect: "memories: the 3 fixture memories render as real-button polaroids in the right sections (2 with location, 1 without)",
  },
  {
    id: "memories-empty-photo-bear",
    file: "js/map.js",
    find: "'<span class=\"anilar-polaroid-photo--empty\">' + bearSVG({ mood: 'love', heart: true, size: 72 }) + '</span>'",
    replace: "''",
    expect: "memories: a map pin with no photo shows a bear in the detail modal, not a blank box",
  },
  {
    id: "memories-camera-filename-regex",
    file: "js/map.js",
    find: "var CAMERA_FILENAME_RE = /^(img|dsc|dscn|pxl|image|photo|foto)[\\s_\\d-]*$/i;",
    replace: "var CAMERA_FILENAME_RE = /^$/;",
    expect: "memories: camera default file names (IMG_/DSC_/PXL_/photo…) upload with an empty title, real titles pass through (M7)",
  },
  {
    id: "memories-camera-caption-suppressed",
    file: "js/map.js",
    find: "var showCaption = !!m.title && !isCameraFilenameTitle(m.title);",
    replace: "var showCaption = true;",
    expect: "memories: a photo with no title shows no caption in the gallery, a real title still does (M7)",
  },
  {
    id: "memories-xss-photosrc-unescaped",
    file: "js/map.js",
    find: "'<img src=\"' + escapeHtml(photoSrc) + '\" alt=\"'",
    replace: "'<img src=\"' + photoSrc + '\" alt=\"'",
    expect: "memories: a crafted title/thumbnail cannot break out of the gallery or detail <img> attribute (m1)",
  },
  {
    id: "memories-escapehtml-quote-unsafe",
    file: "js/map.js",
    find: "function escapeHtml(text) {\n  var s = text == null ? '' : String(text);\n  return s\n    .replace(/&/g, '&amp;')\n    .replace(/</g, '&lt;')\n    .replace(/>/g, '&gt;')\n    .replace(/\"/g, '&quot;')\n    .replace(/'/g, '&#39;');\n}",
    replace: "function escapeHtml(text) {\n  var div = document.createElement('div');\n  div.textContent = text;\n  return div.innerHTML;\n}",
    expect: "memories: a crafted title/thumbnail cannot break out of the gallery or detail <img> attribute (m1)",
  },
  {
    id: "memories-map-hint-reduced-motion",
    file: "css/style.css",
    find: "  /* m5: the universal rule above collapses hintFade's 4s duration to ~0, so without this it\n     rushes straight through to its 100% keyframe (opacity: 0) — invisible from the first frame\n     instead of merely \"not animated\". Held fully visible instead. */\n  .map-hint {\n    animation: none;\n    opacity: 1;\n  }\n}",
    replace: "}",
    expect: "memories: the map hint starts at full opacity and stays fully visible under reduced motion (m5)",
  },
  {
    id: "memories-map-hint-opacity",
    file: "css/style.css",
    // The running hintFade animation controls .map-hint's opacity from frame 0 onward, so its own
    // declared base `opacity: 1;` is inert while normal motion is on — the keyframe percentages
    // are what actually reach the screen, so that is what the mutant (and the m5 fix) must target.
    find: "@keyframes hintFade {\n  0%, 70% { opacity: 1; }\n  100% { opacity: 0; }\n}",
    replace: "@keyframes hintFade {\n  0%, 70% { opacity: 0.92; }\n  100% { opacity: 0; }\n}",
    expect: "memories: the map hint starts at full opacity and stays fully visible under reduced motion (m5)",
  },
  {
    id: "memories-marker-aria-label",
    file: "js/map.js",
    find: "  var markerEl = marker.getElement();\n  if (markerEl) markerEl.setAttribute('aria-label', name);\n",
    replace: "",
    expect: "memories: map pins carry an accessible name (aria-label) matching the memory title (m6)",
  },
];

export const shots = [
  { name: "gallery", open: { signedIn: true, memories: MEMORIES_FIXTURE }, act: async (page) => {
    await page.tap('.nav-btn[data-tab="memories-view"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  } },
  { name: "map", open: { signedIn: true, memories: MEMORIES_FIXTURE }, act: async (page) => {
    await page.tap('.nav-btn[data-tab="memories-view"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 150)));
    await page.tap('.seg-btn[data-seg="map"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 500)));
  } },
  { name: "detail", open: { signedIn: true, memories: MEMORIES_FIXTURE }, act: async (page) => {
    await page.tap('.nav-btn[data-tab="memories-view"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 300)));
    await page.tap("#gallery-grid .anilar-polaroid");
    await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  } },
  { name: "detail-nophoto", open: { signedIn: true, memories: NO_PHOTO_FIXTURE }, act: async (page) => {
    await page.tap('.nav-btn[data-tab="memories-view"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 200)));
    await page.tap('.seg-btn[data-seg="map"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 450)));
    await page.tap(".heart-marker");
    await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  } },
  { name: "empty", open: { signedIn: true, memories: [] }, act: async (page) => {
    await page.tap('.nav-btn[data-tab="memories-view"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 250)));
  } },
  { name: "gallery-reduced", open: { signedIn: true, memories: MEMORIES_FIXTURE, reducedMotion: true }, act: async (page) => {
    await page.tap('.nav-btn[data-tab="memories-view"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  } },
  // m5: the map hint must stay visible (not fade to invisible) under reduced motion.
  { name: "map-reduced", open: { signedIn: true, memories: MEMORIES_FIXTURE, reducedMotion: true }, act: async (page) => {
    await page.tap('.nav-btn[data-tab="memories-view"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 150)));
    await page.tap('.seg-btn[data-seg="map"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 500)));
  } },
  // M7: a caption-less polaroid (empty title) beside a normally-captioned one.
  { name: "gallery-camera-title", open: { signedIn: true, memories: CAMERA_TITLE_FIXTURE }, act: async (page) => {
    await page.tap('.nav-btn[data-tab="memories-view"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 300)));
  } },
];
