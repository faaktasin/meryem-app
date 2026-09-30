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

  // ── judge-verdict fixes (shell-memories group) ──────────────────────────
  // Appended after the pre-existing checks above rather than interleaved, so none of the
  // existing checks (in particular "no console errors or exceptions") read state these new
  // fixtures might disturb.

  // 11. M4: form inputs render at >=16px so iOS Safari does not zoom the page on focus — login,
  // to-do, the memory modal and the map geocoder all share this contract.
  await openApp(page, { signedIn: true });
  await page.eval(() => new Promise((r) => setTimeout(r, 250)));
  const inputFontSizes = await page.eval(() => {
    function fs(sel) {
      var el = document.querySelector(sel);
      return el ? parseFloat(getComputedStyle(el).fontSize) : null;
    }
    return {
      login: fs(".auth-form input"),
      todo: fs(".todo-form input"),
      memoryTitle: fs("#memory-title"),
      memoryNote: fs("#memory-note"),
      geocoder: fs(".leaflet-control-geocoder-form input"),
    };
  });
  await check("shell: form inputs (login, to-do, memory modal, geocoder) render at >=16px so iOS Safari does not zoom on focus (M4)", () => {
    const bad = Object.entries(inputFontSizes).filter(([, v]) => !(v >= 16)).map(([k, v]) => `${k}=${v}`);
    return { ok: bad.length === 0, detail: bad.length ? bad.join(", ") : JSON.stringify(inputFontSizes) };
  });

  // 12. m2: .overlay, .modal-overlay and .modal all contain overscroll instead of chaining a
  // scroll/bounce through to whatever sits behind them.
  const overscroll = await page.eval(() => {
    function ob(sel) {
      var el = document.querySelector(sel);
      return el ? getComputedStyle(el).overscrollBehaviorY : null;
    }
    return { overlay: ob(".overlay"), modalOverlay: ob(".modal-overlay"), modal: ob(".modal") };
  });
  await check("shell: .overlay, .modal-overlay and .modal set overscroll-behavior: contain (m2)", () => ({
    ok: overscroll.overlay === "contain" && overscroll.modalOverlay === "contain" && overscroll.modal === "contain",
    detail: JSON.stringify(overscroll),
  }));

  // 13. m3: .modal-overlay carries -webkit-backdrop-filter alongside backdrop-filter, since Safari
  // before 18 ignores the unprefixed property.
  const styleCssSrc = readFileSync(join(root, "css", "style.css"), "utf8");
  const modalOverlayBlock = (styleCssSrc.match(/\.modal-overlay\s*\{[^}]*\}/) || [""])[0];
  await check("shell: .modal-overlay carries -webkit-backdrop-filter alongside backdrop-filter (m3)", () => ({
    ok: /backdrop-filter:\s*blur\(4px\)/.test(modalOverlayBlock) && /-webkit-backdrop-filter:\s*blur\(4px\)/.test(modalOverlayBlock),
    detail: modalOverlayBlock || "no .modal-overlay rule found",
  }));

  // 14. m7: #memory-modal / #detail-modal declare role=dialog aria-modal=true.
  const modalDialogAttrs = await page.eval(() => {
    var m1 = document.getElementById("memory-modal");
    var m2 = document.getElementById("detail-modal");
    return {
      memoryRole: m1.getAttribute("role"), memoryAriaModal: m1.getAttribute("aria-modal"),
      detailRole: m2.getAttribute("role"), detailAriaModal: m2.getAttribute("aria-modal"),
    };
  });
  await check("shell: #memory-modal and #detail-modal declare role=dialog aria-modal=true (m7)", () => ({
    ok: modalDialogAttrs.memoryRole === "dialog" && modalDialogAttrs.memoryAriaModal === "true"
      && modalDialogAttrs.detailRole === "dialog" && modalDialogAttrs.detailAriaModal === "true",
    detail: JSON.stringify(modalDialogAttrs),
  }));

  // 15. m7: openModal() inerts the app BEHIND the dialog (never the dialog itself, which is a DOM
  // child of #app-content, unlike js/gate.js and js/birthday.js's own overlays) and moves focus in.
  const openModalState = await page.eval(() => {
    var trigger = document.getElementById("shuffle-btn"); // visible on the default Bugün tab
    trigger.focus();
    var focusedTriggerBefore = document.activeElement === trigger;
    openModal("memory-modal");
    return {
      focusedTriggerBefore: focusedTriggerBefore,
      navInert: document.querySelector(".bottom-nav").hasAttribute("inert"),
      todayViewInert: document.getElementById("today-view").hasAttribute("inert"),
      modalItselfInert: document.getElementById("memory-modal").hasAttribute("inert"),
      focusedIsCloseBtn: document.activeElement === document.querySelector("#memory-modal .modal-close"),
    };
  });
  await check("shell: openModal() inerts the app behind the dialog (not the dialog itself) and moves focus onto its close button (m7)", () => ({
    ok: openModalState.focusedTriggerBefore === true && openModalState.navInert === true
      && openModalState.todayViewInert === true && openModalState.modalItselfInert === false
      && openModalState.focusedIsCloseBtn === true,
    detail: JSON.stringify(openModalState),
  }));

  // 16. m7: Escape closes the open modal, clears the inert siblings, and restores focus to the
  // element that opened it.
  const escapeState = await page.eval(() => {
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    return {
      modalOpen: document.getElementById("memory-modal").classList.contains("open"),
      navInert: document.querySelector(".bottom-nav").hasAttribute("inert"),
      focusReturned: document.activeElement === document.getElementById("shuffle-btn"),
    };
  });
  await check("shell: Escape closes the open modal, clears inert from the app, and restores focus (m7)", () => ({
    ok: escapeState.modalOpen === false && escapeState.navInert === false && escapeState.focusReturned === true,
    detail: JSON.stringify(escapeState),
  }));

  // 17. m8: toast notifications carry role=status aria-live=polite so VoiceOver announces them.
  const toastAttrs = await page.eval(() => {
    return new Promise((resolve) => {
      showToast("Test mesajı");
      setTimeout(function () {
        var t = document.querySelector(".toast");
        resolve({ role: t ? t.getAttribute("role") : null, live: t ? t.getAttribute("aria-live") : null });
      }, 20);
    });
  });
  await check("shell: toast notifications carry role=status aria-live=polite (m8)", () => ({
    ok: toastAttrs.role === "status" && toastAttrs.live === "polite",
    detail: JSON.stringify(toastAttrs),
  }));

  // 18. m13: js/drive.js error strings use real Turkish characters, not ASCII stand-ins (console-
  // only strings — verified by source text, since they never reach the screen).
  const driveJsSrc = readFileSync(join(root, "js", "drive.js"), "utf8");
  const expectedDriveStrings = [
    "Google API henüz yüklenmedi. Sayfayı yenile.",
    "Google giriş zaman aşımı. Popup engellenmiş olabilir.",
    "Google giriş hatası: ",
    "Google giriş açılamadı: ",
    "Drive upload hatası: ",
    "Drive silme hatası:",
  ];
  const missingDriveStrings = expectedDriveStrings.filter((s) => driveJsSrc.indexOf(s) === -1);
  const staleAsciiDrive = ["henuz", "yuklenmedi", "Sayfayi", "asimi", "acilamadi", "hatasi"].filter((s) => driveJsSrc.indexOf(s) !== -1);
  await check("shell: js/drive.js error strings use real Turkish characters, not ASCII stand-ins (m13)", () => ({
    ok: missingDriveStrings.length === 0 && staleAsciiDrive.length === 0,
    detail: missingDriveStrings.length ? `missing: ${missingDriveStrings.join(" | ")}` : (staleAsciiDrive.length ? `stale ascii: ${staleAsciiDrive.join(", ")}` : "ok"),
  }));

  // The gift icon sits in the middle of its raised pink circle — read from the painted pixels, on
  // two phone sizes and with the Sürpriz tab both idle and selected (the selected state once
  // dropped the icon out of the circle). From the icon's edges the scan walks outwards through the
  // pink ring to the circle's rim on all four sides; the rim's midpoint must be the icon's centre.
  const giftCases = [
    { name: "390x844 idle", viewport: { width: 390, height: 844 }, select: false },
    { name: "390x844 selected", viewport: { width: 390, height: 844 }, select: true },
    { name: "412x915 idle", viewport: { width: 412, height: 915 }, select: false },
  ];
  const giftResults = [];
  for (const c of giftCases) {
    await openApp(page, { signedIn: true, viewport: c.viewport });
    await page.eval(() => new Promise((r) => setTimeout(r, 200)));
    if (c.select) await page.tap('.nav-btn[data-tab="birthday-view"]');
    await page.eval(() => new Promise((r) => setTimeout(r, 400)));
    const icon = await page.eval(() => {
      var r = document.querySelector(".nav-btn--gift svg").getBoundingClientRect();
      return { left: r.left, right: r.right, top: r.top, bottom: r.bottom, dpr: window.devicePixelRatio };
    });
    const { data } = await page.send("Page.captureScreenshot", { format: "png" });
    const rim = await page.eval((b64, icon) => new Promise((resolve, reject) => {
      var img = new Image();
      img.onload = function () {
        var canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        var ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0);
        var d = icon.dpr;
        function pink(x, y) {
          var p = ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data;
          return p[0] >= 180 && p[1] <= 130 && p[2] >= 90 && p[2] <= 170 && p[0] - p[1] >= 80;
        }
        function walk(x, y, dx, dy) {
          var steps = 0;
          while (pink(x + dx, y + dy) && steps < 200) { x += dx; y += dy; steps++; }
          return { x: x, y: y, steps: steps };
        }
        var cx = (icon.left + icon.right) / 2 * d;
        var cy = (icon.top + icon.bottom) / 2 * d;
        var top = walk(cx, icon.top * d - 3, 0, -1);
        var bottom = walk(cx, icon.bottom * d + 3, 0, 1);
        var left = walk(icon.left * d - 3, cy, -1, 0);
        var right = walk(icon.right * d + 3, cy, 1, 0);
        resolve({
          rimCx: (left.x + right.x) / 2 / d, rimCy: (top.y + bottom.y) / 2 / d,
          iconCx: cx / d, iconCy: cy / d,
          width: (right.x - left.x) / d, height: (bottom.y - top.y) / d,
          startsPink: pink(cx, icon.top * d - 3) && pink(cx, icon.bottom * d + 3),
        });
      };
      img.onerror = function () { reject(new Error("screenshot did not decode")); };
      img.src = "data:image/png;base64," + b64;
    }), data, icon);
    giftResults.push({ name: c.name, dx: +(rim.rimCx - rim.iconCx).toFixed(2), dy: +(rim.rimCy - rim.iconCy).toFixed(2), w: +rim.width.toFixed(1), h: +rim.height.toFixed(1), startsPink: rim.startsPink });
  }
  await check("shell: the Sürpriz icon is centred in its raised circle (painted pixels, two sizes, idle and selected)", () => ({
    ok: giftResults.every((r) => r.startsPink && Math.abs(r.dx) <= 1.5 && Math.abs(r.dy) <= 1.5 && r.w >= 44 && r.h >= 44),
    detail: JSON.stringify(giftResults),
  }));
}

export const mutants = [
  {
    id: "shell-gift-circle-offcentre",
    file: "css/style.css",
    find: "  transform: translate(-50%, -50%);\n  border-radius: 50%;\n  background: linear-gradient(160deg, var(--rose), var(--rose-strong));",
    replace: "  transform: translate(-50%, -38%);\n  border-radius: 50%;\n  background: linear-gradient(160deg, var(--rose), var(--rose-strong));",
    expect: "shell: the Sürpriz icon is centred in its raised circle (painted pixels, two sizes, idle and selected)",
  },
  {
    id: "shell-gift-active-shift",
    file: "css/style.css",
    find: ".nav-btn.is-active .nav-gift-bubble svg {\n  transform: scale(1.08);",
    replace: ".nav-btn.is-active .nav-gift-bubble svg {\n  transform: translateY(12px) scale(1.08);",
    expect: "shell: the Sürpriz icon is centred in its raised circle (painted pixels, two sizes, idle and selected)",
  },
  {
    id: "shell-input-font-size-todo",
    file: "css/style.css",
    find: "  /* 16px, not 0.9rem (=14.4px) — same iOS zoom-on-focus guard as .auth-form input (M4). */\n  font-size: 16px;\n  background: var(--cream);",
    replace: "  font-size: 0.9rem;\n  background: var(--cream);",
    expect: "shell: form inputs (login, to-do, memory modal, geocoder) render at >=16px so iOS Safari does not zoom on focus (M4)",
  },
  {
    id: "shell-overscroll-modal",
    file: "css/style.css",
    find: "  overflow-y: auto;\n  /* m2: .modal is the element that actually scrolls (overflow-y:auto above) — this is what stops\n     a scroll at its top/bottom from chaining into whatever sits behind the opaque overlay on\n     Safari 16+, the part .modal-overlay's own overscroll-behavior (a non-scrolling element) cannot\n     cover by itself. */\n  overscroll-behavior: contain;\n  padding: 24px;",
    replace: "  overflow-y: auto;\n  padding: 24px;",
    expect: "shell: .overlay, .modal-overlay and .modal set overscroll-behavior: contain (m2)",
  },
  {
    id: "shell-webkit-backdrop-filter",
    file: "css/style.css",
    find: "  /* Safari before 18 ignores unprefixed backdrop-filter (m3) — without this the Anı modals get a\n     flat backdrop, unlike the header/nav which already carry both. */\n  -webkit-backdrop-filter: blur(4px);\n",
    replace: "",
    expect: "shell: .modal-overlay carries -webkit-backdrop-filter alongside backdrop-filter (m3)",
  },
  {
    id: "shell-modal-dialog-role",
    file: "index.html",
    find: '<div class="modal-overlay" id="memory-modal" role="dialog" aria-modal="true" aria-label="Yeni Anı">',
    replace: '<div class="modal-overlay" id="memory-modal">',
    expect: "shell: #memory-modal and #detail-modal declare role=dialog aria-modal=true (m7)",
  },
  {
    id: "shell-modal-inert-siblings",
    file: "js/app.js",
    find: "  var appContent = document.getElementById('app-content');\n  if (appContent) {\n    Array.prototype.forEach.call(appContent.children, function (child) {\n      if (child !== modal) child.setAttribute('inert', '');\n    });\n  }\n\n  var closeBtn",
    replace: "  var closeBtn",
    expect: "shell: openModal() inerts the app behind the dialog (not the dialog itself) and moves focus onto its close button (m7)",
  },
  {
    id: "shell-modal-escape",
    file: "js/app.js",
    find: "function _modalKeydown(e) {\n  if (e.key === 'Escape' && _modalOpenId) closeModal(_modalOpenId);\n}",
    replace: "function _modalKeydown(e) {}",
    expect: "shell: Escape closes the open modal, clears inert from the app, and restores focus (m7)",
  },
  {
    id: "shell-toast-aria-live",
    file: "js/app.js",
    find: "  toast.setAttribute('role', 'status');\n  toast.setAttribute('aria-live', 'polite');\n  toast.textContent = message;",
    replace: "  toast.textContent = message;",
    expect: "shell: toast notifications carry role=status aria-live=polite (m8)",
  },
  {
    id: "shell-drive-turkish-chars",
    file: "js/drive.js",
    find: "reject(new Error('Google giriş zaman aşımı. Popup engellenmiş olabilir.'));",
    replace: "reject(new Error('Google giris zaman asimi. Popup engellenmis olabilir.'));",
    expect: "shell: js/drive.js error strings use real Turkish characters, not ASCII stand-ins (m13)",
  },
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
