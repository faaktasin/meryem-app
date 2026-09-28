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
    var giftBtn = document.querySelector(".nav-btn--gift");
    var giftRect = giftBtn.getBoundingClientRect();
    var cs = getComputedStyle(giftBtn, "::before");
    var w = parseFloat(cs.width);
    var h = parseFloat(cs.height);
    var topOffset = parseFloat(cs.top);
    var cx = giftRect.left + giftRect.width / 2;
    var circleTop = giftRect.top + topOffset;
    var circle = { left: cx - w / 2, right: cx + w / 2, top: circleTop, bottom: circleTop + h };
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
];
