/**
 * meryem-app tests — checks/shell.mjs
 *
 * Covers the foundation this build delivers: auth screens, header/bottom-nav shell, the five
 * views and the memories gallery/map subview switch, the gate-replay button's default hidden
 * state, no console errors across a sign-in + tab tour, the three fonts, the floating-hearts fx
 * layer under normal and reduced motion, and the appNow()/isPreviewMode() clock contract.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { openApp } from "../harness.mjs";

export const name = "shell";

const TABS = [
  { id: "today-view", tab: "today-view" },
  { id: "words-view", tab: "words-view" },
  { id: "memories-view", tab: "memories-view" },
  { id: "dates-view", tab: "dates-view" },
  { id: "birthday-view", tab: "birthday-view" },
];

export async function run({ page, check, root }) {
  // 1. Signed-out shows the login screen with a bear
  await openApp(page, { signedIn: false });
  await check("shell: signed-out shows the login screen with a bear", async () => {
    const info = await page.eval(() => ({
      authDisplay: getComputedStyle(document.getElementById("auth-screen")).display,
      appDisplay: getComputedStyle(document.getElementById("app-content")).display,
      bearSvg: !!document.querySelector(".auth-bear svg"),
    }));
    return {
      ok: info.authDisplay !== "none" && info.appDisplay === "none" && info.bearSvg,
      detail: JSON.stringify(info),
    };
  });
  // openApp's next call navigates again, which resets page.errors — read it before that happens,
  // or a real error on the login screen alone would never be seen by anyone.
  const signedOutErrors = page.errors.slice();

  await check("shell: the login bear is centred over the title", async () => {
    const info = await page.eval(() => {
      const b = document.querySelector(".auth-bear svg").getBoundingClientRect();
      const t = document.querySelector(".auth-title").getBoundingClientRect();
      return { bear: b.left + b.width / 2, title: t.left + t.width / 2 };
    });
    return { ok: Math.abs(info.bear - info.title) <= 4, detail: JSON.stringify(info) };
  });

  // The auth callback may fire the moment firebase.js registers it, and onAppReady() calls
  // functions from every other script, so firebase.js must be the last local script.
  await check("shell: js/firebase.js is the last local script in index.html", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    const local = [...html.matchAll(/<script\s+src="(js\/[^"]+)"/g)].map((m) => m[1]);
    return { ok: local[local.length - 1] === "js/firebase.js", detail: local.join(", ") };
  });

  // 2. Signed-in shows the app with Bugün active
  await openApp(page, { signedIn: true });
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
  await check("shell: signed-in shows the app with Bugün active", async () => {
    const info = await page.eval(() => ({
      appDisplay: getComputedStyle(document.getElementById("app-content")).display,
      todayActive: document.getElementById("today-view").classList.contains("is-active"),
      navActive: document.querySelector(".nav-btn.is-active")?.dataset.tab,
    }));
    return {
      ok: info.appDisplay !== "none" && info.todayActive === true && info.navActive === "today-view",
      detail: JSON.stringify(info),
    };
  });

  // 3. Every nav button shows its own view, whose content sits strictly between header and nav
  const geomFailures = [];
  for (const t of TABS) {
    await page.tap(`.nav-btn[data-tab="${t.tab}"]`);
    await page.eval(() => new Promise((r) => setTimeout(r, 150)));
    await page.settle(); // the view's own fade-in animates opacity + a 6px translateY
    const state = await page.eval((id) => {
      var view = document.getElementById(id);
      var header = document.querySelector(".header");
      var nav = document.querySelector(".bottom-nav");

      window.scrollTo(0, 0);
      var csTop = getComputedStyle(view);
      var contentTop = view.getBoundingClientRect().top + parseFloat(csTop.paddingTop);
      var headerBottom = header.getBoundingClientRect().bottom;

      window.scrollTo(0, document.body.scrollHeight);
      var csBottom = getComputedStyle(view);
      var contentBottom = view.getBoundingClientRect().bottom - parseFloat(csBottom.paddingBottom);
      var navTop = nav.getBoundingClientRect().top;
      window.scrollTo(0, 0);

      return {
        isActive: view.classList.contains("is-active"),
        contentTop: contentTop,
        headerBottom: headerBottom,
        contentBottom: contentBottom,
        navTop: navTop,
      };
    }, t.id);
    const ok = state.isActive
      && state.contentTop >= state.headerBottom - 0.5
      && state.contentBottom <= state.navTop + 0.5;
    if (!ok) geomFailures.push(`${t.id}: ${JSON.stringify(state)}`);
  }
  await check("shell: every view's content starts below the header and ends above the nav", () => ({
    ok: geomFailures.length === 0,
    detail: geomFailures.slice(0, 3).join(" ; ") || `${TABS.length} tabs checked`,
  }));

  // 4. The memories segmented control toggles the gallery/map subviews
  await page.tap('.nav-btn[data-tab="memories-view"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 100)));
  await page.tap('.seg-btn[data-seg="map"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 250)));
  const afterMap = await page.eval(() => ({
    galleryActive: document.getElementById("gallery-view").classList.contains("is-active"),
    mapActive: document.getElementById("map-view").classList.contains("is-active"),
    segMapActive: document.querySelector('.seg-btn[data-seg="map"]').classList.contains("is-active"),
  }));
  await page.tap('.seg-btn[data-seg="gallery"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
  const afterGallery = await page.eval(() => ({
    galleryActive: document.getElementById("gallery-view").classList.contains("is-active"),
    mapActive: document.getElementById("map-view").classList.contains("is-active"),
  }));
  await check("shell: the memories segmented control toggles the gallery/map subviews", () => ({
    ok: !afterMap.galleryActive && afterMap.mapActive && afterMap.segMapActive
      && afterGallery.galleryActive && !afterGallery.mapActive,
    detail: JSON.stringify({ afterMap, afterGallery }),
  }));

  // 5. #gate-replay-btn is hidden by default
  await check("shell: #gate-replay-btn is hidden by default", async () => {
    const info = await page.eval(() => {
      var btn = document.getElementById("gate-replay-btn");
      return { hasHiddenAttr: btn.hasAttribute("hidden"), display: getComputedStyle(btn).display };
    });
    return { ok: info.hasHiddenAttr === true && info.display === "none", detail: JSON.stringify(info) };
  });

  // 6. No console errors or exceptions on the login screen, or across the sign-in + tab tour
  await check("shell: no console errors or exceptions", () => ({
    ok: signedOutErrors.length === 0 && page.errors.length === 0,
    detail: [...signedOutErrors, ...page.errors].slice(0, 5).join(" ; "),
  }));

  // Every local script/stylesheet index.html asks for actually exists on disk — the guard the
  // placeholder files (js/dates.js, css/gate.css, ...) exist for, since a missing one only ever
  // shows up as a filtered network-level log entry, never a page-side exception.
  const html = readFileSync(join(root, "index.html"), "utf8");
  const localRefs = [...html.matchAll(/<(?:script[^>]*\ssrc|link[^>]*\shref)="([^"]+)"/g)]
    .map((m) => m[1])
    .filter((h) => !/^https?:|^\/\//.test(h));
  const missing = localRefs.filter((h) => !existsSync(join(root, h)));
  // img/icon-180.png is excepted deliberately — the task hands that file to a later Icons agent.
  const realMissing = missing.filter((h) => h !== "img/icon-180.png");
  await check("shell: every local script/stylesheet index.html references exists on disk", () => ({
    ok: realMissing.length === 0,
    detail: realMissing.length ? realMissing.join(", ") : `${localRefs.length} local refs checked (pending: ${missing.join(", ") || "none"})`,
  }));

  // 7. The three app fonts are loaded and render the Turkish sample distinctly from the fallback
  const fontChecks = await page.eval(async () => {
    var sample = "Ğ İ Ş ğ ı ş";
    function widthWith(fontFamily) {
      var span = document.createElement("span");
      span.style.position = "absolute";
      span.style.visibility = "hidden";
      span.style.whiteSpace = "nowrap";
      span.style.fontSize = "28px";
      span.style.fontFamily = fontFamily;
      span.textContent = sample;
      document.body.appendChild(span);
      var w = span.getBoundingClientRect().width;
      span.remove();
      return w;
    }
    var families = [
      { name: "Dancing Script", fallback: "cursive", weight: "700" },
      { name: "Fredoka", fallback: "sans-serif", weight: "600" },
      { name: "Quicksand", fallback: "sans-serif", weight: "600" },
    ];
    var out = [];
    for (var i = 0; i < families.length; i++) {
      var f = families[i];
      try { await document.fonts.load(f.weight + " 28px \"" + f.name + "\"", sample); } catch (e) {}
      var loaded = document.fonts.check(f.weight + " 28px \"" + f.name + "\"", sample);
      var withFont = widthWith("\"" + f.name + "\", " + f.fallback);
      var fallbackOnly = widthWith(f.fallback);
      out.push({ name: f.name, loaded: loaded, withFont: withFont, fallbackOnly: fallbackOnly, differs: Math.abs(withFont - fallbackOnly) > 0.5 });
    }
    return out;
  });
  await check("shell: the three app fonts are loaded and render the Turkish sample distinctly from the fallback", () => ({
    ok: fontChecks.every((f) => f.loaded && f.differs),
    detail: JSON.stringify(fontChecks),
  }));

  // 7b. Body-text contrast (window.__app.readable(), installed by harness.mjs on every goto).
  // .seg-btn is checked only in its inactive state — readable() reads the PARENT's background,
  // never the element's own, so the active segment (background on the button itself, not its
  // parent) would misreport; the active state was verified once by hand (white on --rose-strong,
  // 4.80:1) and does not need a mechanical guard the helper cannot evaluate correctly.
  await page.tap('.nav-btn[data-tab="today-view"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 100)));
  await page.settle();
  const contrastToday = await page.eval(() => ({
    messageLabel: window.__app.readable(document.querySelector(".message-label")),
    todoEmpty: window.__app.readable(document.querySelector(".todo-empty")),
    navSpans: [...document.querySelectorAll(".nav-btn span")].map((el) => window.__app.readable(el)),
  }));
  await page.tap('.nav-btn[data-tab="memories-view"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
  await page.settle();
  const contrastMemories = await page.eval(() => ({
    galleryEmpty: window.__app.readable(document.querySelector(".gallery-empty")),
    segInactive: window.__app.readable(document.querySelector(".seg-btn:not(.is-active)")),
  }));
  await page.tap('.nav-btn[data-tab="dates-view"]');
  await page.eval(() => new Promise((r) => setTimeout(r, 100)));
  await page.settle();
  const contrastDates = await page.eval(() => ({
    countdownUnitLabel: window.__app.readable(document.querySelector(".countdown-unit-label")),
  }));
  await openApp(page, { signedIn: false });
  const contrastAuth = await page.eval(() => ({ authSubtitle: window.__app.readable(document.querySelector(".auth-subtitle")) }));
  const contrastAll = { ...contrastToday, ...contrastMemories, ...contrastDates, ...contrastAuth };
  const contrastFailures = Object.entries(contrastAll).flatMap(([k, v]) => {
    const vals = Array.isArray(v) ? v : [v];
    return vals.filter((n) => n < 4.5).map((n) => `${k} ${n.toFixed(2)}`);
  });
  await check("shell: body text reaches 4.5:1 contrast (message label, todo/gallery empty state, nav labels, countdown unit label, auth subtitle, inactive segment button)", () => ({
    ok: contrastFailures.length === 0,
    detail: contrastFailures.join(" ; ") || JSON.stringify(contrastAll),
  }));

  // 7c. fx.js gets at least one real run of each export, normal and reduced-motion
  await openApp(page, { signedIn: true });
  const fxNormal = await page.eval(() => {
    var before = document.querySelectorAll(".fx-confetti-canvas").length;
    fxConfetti({ duration: 80 });
    var duringCount = document.querySelectorAll(".fx-confetti-canvas").length;
    var burstBefore = document.querySelectorAll(".fx-heart-burst").length;
    fxHeartBurst(document.querySelector(".message-card"));
    var burstDuring = document.querySelectorAll(".fx-heart-burst").length;
    var el = document.createElement("div");
    document.body.appendChild(el);
    return new Promise(function (resolve) {
      var cancel = fxTypewriter(el, "Meryem", {
        speed: 1,
        onDone: function () {
          // fxHeartBurst's own cleanup fires at 900ms (fixed, no opts) — outlast it, not just
          // the 80ms confetti duration, or "afterBurst" reads the layer before it ever left.
          setTimeout(function () {
            resolve({
              before: before, duringCount: duringCount,
              burstBefore: burstBefore, burstDuring: burstDuring,
              afterConfetti: document.querySelectorAll(".fx-confetti-canvas").length,
              afterBurst: document.querySelectorAll(".fx-heart-burst").length,
              typedText: el.textContent,
            });
          }, 950);
        },
      });
      void cancel;
    });
  });
  await openApp(page, { signedIn: true, reducedMotion: true });
  const fxReduced = await page.eval(() => {
    fxConfetti({ duration: 80 });
    var el = document.createElement("div");
    document.body.appendChild(el);
    fxTypewriter(el, "Meryem", { speed: 1 });
    return { canvasCount: document.querySelectorAll(".fx-confetti-canvas").length, typedTextImmediately: el.textContent };
  });
  await check("shell: fx.js effects run (confetti, heart burst, typewriter) and confetti/typewriter are instant/absent under reduced motion", () => ({
    ok: fxNormal.before === 0 && fxNormal.duringCount === 1 && fxNormal.afterConfetti === 0
      && fxNormal.burstBefore === 0 && fxNormal.burstDuring === 1 && fxNormal.afterBurst === 0
      && fxNormal.typedText === "Meryem"
      && fxReduced.canvasCount === 0 && fxReduced.typedTextImmediately === "Meryem",
    detail: JSON.stringify({ fxNormal, fxReduced }),
  }));

  // 7d. mic modes actually change navigator.mediaDevices.getUserMedia
  const micDeny = await (async () => {
    await openApp(page, { signedIn: true, mic: "deny" });
    return page.eval(() => navigator.mediaDevices.getUserMedia().then(
      () => ({ resolved: true }),
      (e) => ({ resolved: false, name: e.name })
    ));
  })();
  await openApp(page, { signedIn: true, mic: "none" });
  const micNone = await page.eval(() => typeof navigator.mediaDevices.getUserMedia);
  await openApp(page, { signedIn: true, mic: "fake" });
  const micFake = await page.eval(() => navigator.mediaDevices.getUserMedia().then((s) => ({ tracks: s.getAudioTracks().length })));
  await check("shell: openApp's mic option actually governs getUserMedia (deny/none/fake)", () => ({
    ok: micDeny.resolved === false && micDeny.name === "NotAllowedError" && micNone === "undefined" && micFake.tracks === 1,
    detail: JSON.stringify({ micDeny, micNone, micFake }),
  }));

  // 8. Floating hearts animate normally, and are hidden under reduced motion
  await openApp(page, { signedIn: true, reducedMotion: false });
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
  const heartsNormal = await page.eval(() => {
    var layer = document.getElementById("fx-hearts");
    var items = layer.querySelectorAll(".fx-hearts-item");
    var running = items.length > 0 && Array.prototype.every.call(items, function (el) {
      var cs = getComputedStyle(el);
      return cs.animationName !== "none" && cs.animationPlayState === "running";
    });
    return { count: items.length, running: running, visibility: getComputedStyle(layer).visibility };
  });
  await openApp(page, { signedIn: true, reducedMotion: true });
  await page.eval(() => new Promise((r) => setTimeout(r, 200)));
  const heartsReduced = await page.eval(() => {
    var layer = document.getElementById("fx-hearts");
    return { count: layer.querySelectorAll(".fx-hearts-item").length, visibility: getComputedStyle(layer).visibility };
  });
  await check("shell: floating hearts animate normally and are hidden under reduced motion", () => ({
    ok: heartsNormal.count > 0 && heartsNormal.running && heartsReduced.count === 0 && heartsReduced.visibility === "hidden",
    detail: JSON.stringify({ heartsNormal, heartsReduced }),
  }));

  // 9. appNow() honours the injected time
  await openApp(page, { signedIn: true, now: "2026-05-01T09:00:00" });
  const injected = await page.eval(() => appNow().toISOString());
  await check("shell: appNow() honours the injected time", () => ({
    ok: injected.slice(0, 10) === "2026-05-01",
    detail: injected,
  }));

  // 10. isPreviewMode(): false normally, true with the query, and lands appNow() on 4 Oct
  await openApp(page, { signedIn: true });
  const previewOff = await page.eval(() => isPreviewMode());
  await openApp(page, { signedIn: true, query: "?onizleme=dogumgunu" });
  const previewOn = await page.eval(() => ({ preview: isPreviewMode(), month: appNow().getMonth(), date: appNow().getDate() }));
  await check("shell: isPreviewMode() is false normally, true with the query, and lands appNow() on 4 Oct", () => ({
    ok: previewOff === false && previewOn.preview === true && previewOn.month === 9 && previewOn.date === 4,
    detail: JSON.stringify({ previewOff, previewOn }),
  }));
}

export const mutants = [
  {
    id: "shell-header-nav-padding",
    file: "css/style.css",
    find: "padding-top: var(--header-h);\n  padding-bottom: var(--nav-h);",
    replace: "padding-top: 0;\n  padding-bottom: 0;",
    expect: "shell: every view's content starts below the header and ends above the nav",
  },
  {
    id: "shell-preview-mode-query",
    file: "js/time.js",
    find: "params.get('onizleme') === 'dogumgunu'",
    replace: "params.get('onizleme') === 'nope'",
    expect: "shell: isPreviewMode() is false normally, true with the query, and lands appNow() on 4 Oct",
  },
  {
    id: "shell-nav-label-contrast",
    file: "css/style.css",
    find: "background: none;\n  color: var(--ink-soft);\n  font-family: var(--font-body);\n  font-size: 0.68rem;",
    replace: "background: none;\n  color: var(--rose-100);\n  font-family: var(--font-body);\n  font-size: 0.68rem;",
    expect: "shell: body text reaches 4.5:1 contrast (message label, todo/gallery empty state, nav labels, countdown unit label, auth subtitle, inactive segment button)",
  },
  {
    id: "shell-local-ref-missing",
    file: "index.html",
    find: 'src="js/gate.js"',
    replace: 'src="js/gaet.js"',
    expect: "shell: every local script/stylesheet index.html references exists on disk",
  },
  {
    id: "shell-login-bear-left",
    file: "css/style.css",
    find: ".auth-bear {\n  display: flex;\n  justify-content: center;",
    replace: ".auth-bear {\n  display: block;\n  justify-content: center;",
    expect: "shell: the login bear is centred over the title",
  },
  {
    id: "shell-firebase-not-last",
    file: "index.html",
    find: '  <script src="js/app.js"></script>\n  <!-- Last on purpose: the auth callback calls functions from every script above. -->\n  <script src="js/firebase.js"></script>',
    replace: '  <script src="js/firebase.js"></script>\n  <script src="js/app.js"></script>',
    expect: "shell: js/firebase.js is the last local script in index.html",
  },
];

export const shots = [
  { name: "login", open: { signedIn: false } },
  { name: "today", open: { signedIn: true } },
  { name: "words-empty", open: { signedIn: true }, act: async (page) => { await page.tap('.nav-btn[data-tab="words-view"]'); } },
  { name: "memories-gallery", open: { signedIn: true }, act: async (page) => { await page.tap('.nav-btn[data-tab="memories-view"]'); } },
  {
    name: "memories-map",
    open: { signedIn: true },
    act: async (page) => {
      await page.tap('.nav-btn[data-tab="memories-view"]');
      await page.eval(() => new Promise((r) => setTimeout(r, 100)));
      await page.tap('.seg-btn[data-seg="map"]');
      await page.eval(() => new Promise((r) => setTimeout(r, 500)));
    },
  },
  { name: "dates", open: { signedIn: true }, act: async (page) => { await page.tap('.nav-btn[data-tab="dates-view"]'); } },
  { name: "birthday-empty", open: { signedIn: true }, act: async (page) => { await page.tap('.nav-btn[data-tab="birthday-view"]'); } },
  { name: "bears", open: { signedIn: true, page: "tests/fixtures/bears.html" } },
];
