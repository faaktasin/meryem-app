/**
 * meryem-app tests — harness.mjs
 *
 * Shared by test_app.mjs, mutate_app.mjs, shoot.mjs and every module in checks/. Serves the app
 * over http, drives a throwaway headless Brave (Chrome fallback) over the DevTools protocol, and
 * stubs every third-party network dependency (Firebase, Google Identity/Drive, map tiles,
 * geocoder) so the app runs deterministically with no real network or credentials.
 *
 * Modelled on D:/code-base/active/web-ui-kit/tests/harness.mjs (http serve, DevToolsActivePort
 * launch, a CDP Page class, screenshot + checker helpers) with the additions this app needs:
 * Fetch-domain interception, a Date-offset injection, storage seeding, and a real-coordinate tap.
 * Node 24 built-ins only.
 */
import { spawn, spawnSync } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

export const TESTS_DIR = dirnameOf(import.meta.url);
export const REAL_ROOT = resolve(TESTS_DIR, "..");
export const APP_ROOT = resolve(process.env.APP_ROOT || REAL_ROOT);
export const TMP_DIR = join(TESTS_DIR, ".tmp");

function dirnameOf(metaUrl) {
  const p = fileURLToPath(metaUrl);
  return p.slice(0, p.lastIndexOf(sep));
}

const BROWSERS = [
  process.env.APP_BROWSER,
  "C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe",
  "C:/Program Files/Google/Chrome/Application/chrome.exe",
].filter(Boolean);

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
};

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A tiny 1x1 fully-transparent PNG, base64-encoded — stands in for a map tile / blocked image.
    (Verified by decoding: RGBA (0,0,0,0). An earlier string here decoded to an OPAQUE black
    pixel, which painted the whole Leaflet map solid black — always decode a "blank" fixture and
    check its actual pixels before trusting it.) */
const BLANK_PNG_B64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABpfZFQAAAAABJRU5ErkJggg==";

/**
 * A minimal, safe replacement for Google's real GIS client script: defines just enough of
 * `google.accounts.oauth2` that drive.js's onGisLoaded() runs without throwing. Never talks to a
 * real Google endpoint.
 */
const GIS_STUB_SRC = `
window.google = window.google || {};
google.accounts = google.accounts || {};
google.accounts.oauth2 = {
  initTokenClient: function (opts) {
    return {
      callback: opts && opts.callback,
      requestAccessToken: function () {
        /* Never resolves on its own in tests — nothing in the shell suite exercises Drive auth. */
      }
    };
  }
};
`;

/** A minimal, safe replacement for Google's real gapi client script — same idea as GIS_STUB_SRC. */
const GAPI_STUB_SRC = `
window.gapi = window.gapi || {};
gapi.load = function (name, cb) { setTimeout(cb, 0); };
gapi.client = gapi.client || {
  init: function () { return Promise.resolve(); },
  drive: { files: {}, permissions: {} }
};
`;

/** Every page/file at the app root the http server may be asked for. */
export function serve(root = APP_ROOT) {
  return new Promise((res, rej) => {
    const server = createServer((req, reply) => {
      let pathname = "/";
      try { pathname = new URL(req.url, "http://app").pathname; } catch {}
      if (pathname === "/__blank.html") {
        reply.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        reply.end("<!doctype html><title>blank</title><body>");
        return;
      }
      let file = null;
      try { file = resolve(root, "." + decodeURIComponent(pathname)); } catch {}
      if (!file || !file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) {
        reply.writeHead(404);
        reply.end();
        return;
      }
      reply.writeHead(200, { "content-type": TYPES[extname(file)] || "application/octet-stream", "cache-control": "no-store" });
      reply.end(readFileSync(file));
    });
    server.on("error", rej);
    server.listen(0, "127.0.0.1", () => res({
      base: `http://127.0.0.1:${server.address().port}/`,
      close: () => new Promise((r) => { server.closeAllConnections?.(); server.close(() => r()); }),
    }));
  });
}

/**
 * Colour maths installed into every page as window.__app, for the contrast checks. Trimmed from
 * D:/code-base/active/web-ui-kit/tests/harness.mjs's pageHelpers() — kept parse/over/lum/contrast/
 * backdrop/ink/readable, dropped colourScan/motionScan (kit-specific, about CSS authoring rules
 * this app doesn't have).
 */
function pageHelpers() {
  const parse = (css) => {
    const text = String(css).trim();
    const m = /^rgba?\(([^)]+)\)$/.exec(text);
    if (m) {
      const p = m[1].split(/[\s,/]+/).filter(Boolean).map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : Number(v)));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }
    const c = /^color\(srgb ([^)]+)\)$/.exec(text);
    if (c) {
      const p = c[1].split(/[\s/]+/).filter(Boolean).map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : Number(v)));
      return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p.length > 3 ? p[3] : 1 };
    }
    return null;
  };
  const over = (top, bottom) => {
    if (!top || !bottom) throw new Error("unparsed colour");
    const a = top.a + bottom.a * (1 - top.a);
    if (a === 0) return { r: 0, g: 0, b: 0, a: 0 };
    const mix = (t, b) => (t * top.a + b * bottom.a * (1 - top.a)) / a;
    return { r: mix(top.r, bottom.r), g: mix(top.g, bottom.g), b: mix(top.b, bottom.b), a };
  };
  const lum = ({ r, g, b }) => {
    const f = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const contrast = (x, y) => {
    const [hi, lo] = [lum(x), lum(y)].sort((p, q) => q - p);
    return (hi + 0.05) / (lo + 0.05);
  };
  /** The solid colour behind `el`: ancestors' background colours composited to the first opaque
   *  one. Cannot see a painted sibling or a gradient — a check over one reads pixels instead. */
  const backdrop = (el) => {
    const layers = [];
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const cs = getComputedStyle(n);
      const c = parse(cs.backgroundColor);
      const o = parseFloat(cs.opacity);
      if (o === 0) throw new Error("backdrop(): an ancestor is at opacity 0 — nothing here is visible yet");
      if (c && c.a > 0) {
        const dimmed = { ...c, a: c.a * (Number.isFinite(o) ? o : 1) };
        layers.push(dimmed);
        if (dimmed.a >= 1) break;
      }
    }
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return acc;
  };
  /** An element's own ink colour, folded with every ancestor opacity between it and the page. */
  const ink = (el) => {
    const c = parse(getComputedStyle(el).color);
    if (!c) return null;
    let a = c.a;
    for (let n = el; n && n.nodeType === 1; n = n.parentElement) {
      const o = parseFloat(getComputedStyle(n).opacity);
      if (Number.isFinite(o)) a *= o;
    }
    return { ...c, a };
  };
  /** The contrast an element's text actually reaches over what is behind it. */
  const readable = (el) => contrast(over(ink(el), backdrop(el.parentElement || el)), backdrop(el.parentElement || el));
  window.__app = { parse, over, lum, contrast, backdrop, ink, readable };
  return true;
}

/** One browser tab driven over CDP. */
class Page {
  #ws;
  #id = 0;
  #pending = new Map();
  #waiters = [];
  #listeners = new Map(); // method -> Set<fn>
  #forced = new Set();
  #rootId = 0;
  #dateScriptId = null;
  #voiceAudio = null; // { ext, buffer, mime } | null — see setVoiceAudioFixture()
  touchEnabled = true;
  errors = [];

  constructor(ws) {
    this.#ws = ws;
    ws.addEventListener("message", (ev) => this.#onMessage(JSON.parse(String(ev.data))));
  }

  #onMessage(m) {
    if (m.id && this.#pending.has(m.id)) {
      const p = this.#pending.get(m.id);
      this.#pending.delete(m.id);
      if (m.error) p.rej(new Error(`${p.method}: ${m.error.message}`));
      else p.res(m.result);
      return;
    }
    if (!m.method) return;
    if (m.method === "Runtime.exceptionThrown") {
      const d = m.params.exceptionDetails;
      this.errors.push(`exception: ${d?.exception?.description?.split("\n")[0] || d?.text}`);
    } else if (m.method === "Runtime.consoleAPICalled" && m.params.type === "error") {
      this.errors.push(`console.error: ${m.params.args.map((a) => a.value ?? a.description).join(" ")}`);
    } else if (m.method === "Log.entryAdded" && m.params.entry.level === "error" && m.params.entry.source !== "network") {
      // Network-level log entries (a blocked/404 subresource) are noise the checks are told to
      // ignore; a real page-side error never carries source "network".
      this.errors.push(`${m.params.entry.source}: ${m.params.entry.text} ${m.params.entry.url || ""}`.trim());
    }
    const set = this.#listeners.get(m.method);
    if (set) for (const fn of set) fn(m.params);
    this.#waiters = this.#waiters.filter((w) => {
      if (w.method !== m.method) return true;
      w.res(m.params);
      return false;
    });
  }

  send(method, params = {}) {
    const id = ++this.#id;
    return new Promise((res, rej) => {
      this.#pending.set(id, { res, rej, method });
      this.#ws.send(JSON.stringify({ id, method, params }));
    });
  }

  /** Persistent event subscription (unlike #once, never auto-removes itself). */
  on(method, fn) {
    if (!this.#listeners.has(method)) this.#listeners.set(method, new Set());
    this.#listeners.get(method).add(fn);
    return () => this.#listeners.get(method)?.delete(fn);
  }

  #once(method, timeoutMs) {
    return new Promise((res, rej) => {
      this.#waiters.push({ method, res });
      setTimeout(() => rej(new Error(`timed out waiting for ${method}`)), timeoutMs).unref();
    });
  }

  async init() {
    for (const domain of ["Page", "Runtime", "Log", "DOM", "CSS", "Network"]) await this.send(`${domain}.enable`);
    await this.#installFetchInterception();
    await this.viewport(390, 844, { mobile: true });
  }

  /** Intercepts every request once per Page lifetime; safe across any number of navigations. */
  async #installFetchInterception() {
    this.on("Fetch.requestPaused", async (params) => {
      const { requestId, request } = params;
      const url = request.url;
      try {
        if (/\/firebasejs\/[\d.]+\/firebase-app-compat\.js/.test(url)) {
          await this.#fulfillText(requestId, readFileSync(join(TESTS_DIR, "fixtures", "firebase-stub.js"), "utf8"), "application/javascript");
        } else if (/\/firebasejs\/[\d.]+\/firebase-(auth|firestore)-compat\.js/.test(url)) {
          await this.#fulfillText(requestId, "", "application/javascript");
        } else if (/accounts\.google\.com/.test(url)) {
          // These two load async — a real Google CDN round-trip is slow enough that drive.js (a
          // later, blocking <script>) has always finished defining onGisLoaded/onGapiLoaded by
          // the time onload fires. Answering instantly from localhost breaks that ordering
          // (measured: an intermittent "onGisLoaded is not defined"), so a small artificial delay
          // restores it rather than changing app code.
          await sleep(120);
          await this.#fulfillText(requestId, GIS_STUB_SRC, "application/javascript");
        } else if (/apis\.google\.com/.test(url)) {
          await sleep(120);
          await this.#fulfillText(requestId, GAPI_STUB_SRC, "application/javascript");
        } else if (/\.tile\.openstreetmap\.org/.test(url)) {
          await this.send("Fetch.fulfillRequest", { requestId, responseCode: 200, responseHeaders: [{ name: "content-type", value: "image/png" }], body: BLANK_PNG_B64 });
        } else if (/nominatim/.test(url)) {
          await this.#fulfillText(requestId, "[]", "application/json");
        } else if (this.#voiceAudio && new RegExp(`/audio/sesli-mesaj\\.${this.#voiceAudio.ext}(\\?|$)`).test(url)) {
          // Both the birthday scene's own HEAD probe and the <audio> element's real GET land here —
          // faked at the network level (not by placing a real file under the site's own audio/
          // folder, which must stay absent until Furkan drops his real recording there).
          await this.send("Fetch.fulfillRequest", {
            requestId, responseCode: 200,
            responseHeaders: [{ name: "content-type", value: this.#voiceAudio.mime }],
            body: this.#voiceAudio.buffer.toString("base64"),
          });
        } else {
          await this.send("Fetch.continueRequest", { requestId });
        }
      } catch {
        try { await this.send("Fetch.failRequest", { requestId, errorReason: "Failed" }); } catch {}
      }
    });
    await this.send("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  }

  #fulfillText(requestId, text, contentType) {
    return this.send("Fetch.fulfillRequest", {
      requestId,
      responseCode: 200,
      responseHeaders: [{ name: "content-type", value: contentType }],
      body: Buffer.from(text, "utf8").toString("base64"),
    });
  }

  /**
   * Registers (replacing any previous one) a page-init script that offsets Date to `nowIso`
   * (parsed as local time under whatever timezone Emulation has set — never frozen, keeps
   * ticking), stubs navigator.serviceWorker.register, seeds window.__STUB_MEMORIES /
   * __STUB_SIGNED_IN for the firebase stub, and applies the requested mic behaviour.
   */
  async setupNewDocumentScript({ nowIso, memories, signedIn, mic }) {
    if (this.#dateScriptId) {
      await this.send("Page.removeScriptToEvaluateOnNewDocument", { identifier: this.#dateScriptId });
      this.#dateScriptId = null;
    }
    const source = `(function () {
      var NOW_ISO = ${JSON.stringify(nowIso || null)};
      var RealDate = Date;
      if (NOW_ISO) {
        var OFFSET = new RealDate(NOW_ISO).getTime() - RealDate.now();
        function FakeDate() {
          if (arguments.length === 0) return new RealDate(RealDate.now() + OFFSET);
          var args = Array.prototype.slice.call(arguments);
          return new (Function.prototype.bind.apply(RealDate, [null].concat(args)))();
        }
        FakeDate.prototype = RealDate.prototype;
        FakeDate.now = function () { return RealDate.now() + OFFSET; };
        FakeDate.parse = RealDate.parse;
        FakeDate.UTC = RealDate.UTC;
        window.Date = FakeDate;
      }

      window.__STUB_MEMORIES = ${JSON.stringify(memories || [])};
      window.__STUB_SIGNED_IN = ${signedIn ? "true" : "false"};

      var MIC = ${JSON.stringify(mic || "none")};
      if (navigator.mediaDevices) {
        if (MIC === "deny") {
          navigator.mediaDevices.getUserMedia = function () {
            var err = new Error("Permission denied");
            err.name = "NotAllowedError";
            return Promise.reject(err);
          };
        } else if (MIC === "fake") {
          navigator.mediaDevices.getUserMedia = function () {
            try {
              var Ctx = window.AudioContext || window.webkitAudioContext;
              var ctx = new Ctx();
              var dest = ctx.createMediaStreamDestination();
              return Promise.resolve(dest.stream);
            } catch (e) { return Promise.reject(e); }
          };
        } else {
          // getUserMedia lives on MediaDevices.prototype — "delete" on the instance removes
          // nothing (no own property) and the method stays callable. An own-property override
          // (even to undefined) is what actually shadows the prototype method.
          navigator.mediaDevices.getUserMedia = undefined;
        }
      }

      if (navigator.serviceWorker) {
        navigator.serviceWorker.register = function () {
          return Promise.resolve({ scope: location.origin + "/", addEventListener: function () {}, installing: null, waiting: null, active: null });
        };
      }
    })();`;
    const { identifier } = await this.send("Page.addScriptToEvaluateOnNewDocument", { source });
    this.#dateScriptId = identifier;
  }

  /**
   * Fakes audio/sesli-mesaj.<ext> as present at the network level (both the HEAD probe and the
   * real GET an <audio> element issues on play), using tests/fixtures/silent-voice.wav's bytes
   * regardless of `ext` — the fixture is real, playable WAV data, which is all the birthday
   * voice-message check needs. Pass null to go back to every extension answering a real 404
   * (the default — matches the live site, where audio/ does not exist yet).
   * @param {string|null} ext - 'wav' | 'mp3' | 'm4a' | 'ogg' | 'opus' | null
   */
  setVoiceAudioFixture(ext) {
    if (!ext) {
      this.#voiceAudio = null;
      return;
    }
    const mimeByExt = { wav: "audio/wav", mp3: "audio/mpeg", m4a: "audio/mp4", ogg: "audio/ogg", opus: "audio/ogg" };
    const buffer = readFileSync(join(TESTS_DIR, "fixtures", "silent-voice.wav"));
    this.#voiceAudio = { ext, buffer, mime: mimeByExt[ext] || "application/octet-stream" };
  }

  /** Loads `url`, waits for load and fonts, and installs window.__app (contrast helpers). */
  async goto(url) {
    this.errors = [];
    const loaded = this.#once("Page.loadEventFired", 30000);
    const nav = await this.send("Page.navigate", { url });
    if (nav.errorText) throw new Error(`navigation to ${url} failed: ${nav.errorText}`);
    await loaded;
    await this.eval(() => document.fonts.ready.then(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r(true))))));
    await this.eval(pageHelpers);
    this.#rootId = (await this.send("DOM.getDocument", { depth: 0 })).root.nodeId;
  }

  /** Runs `fn(...args)` in the page and returns its JSON value; a page-side throw becomes a throw here. */
  async eval(fn, ...args) {
    const expression = typeof fn === "function" ? `(${fn})(...${JSON.stringify(args)})` : fn;
    const r = await this.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true, userGesture: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description?.split("\n")[0] || r.exceptionDetails.text);
    return r.result.value;
  }

  async #nodeId(selector) {
    const { nodeId } = await this.send("DOM.querySelector", { nodeId: this.#rootId, selector });
    if (!nodeId) throw new Error(`no element matches ${selector}`);
    return nodeId;
  }

  /** Forces pseudo-classes (hover, active, focus...) on the first match, then settles. */
  async force(selector, states) {
    const nodeId = await this.#nodeId(selector);
    await this.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: states });
    if (states.length) this.#forced.add(nodeId);
    else this.#forced.delete(nodeId);
    await this.settle();
  }

  async unforceAll() {
    for (const nodeId of this.#forced) {
      try { await this.send("CSS.forcePseudoState", { nodeId, forcedPseudoClasses: [] }); } catch {}
    }
    this.#forced.clear();
  }

  /** Jumps every running CSS transition, and every FINITE CSS animation (e.g. the .view fade-in),
   *  to its end — skips infinite ones (bear idle loops, drifting hearts): Web Animations'
   *  finish() throws on an animation with iterations: Infinity, so those are left running. */
  async settle() {
    await this.eval(() => {
      for (const a of document.getAnimations()) {
        try {
          const timing = a.effect && a.effect.getComputedTiming ? a.effect.getComputedTiming() : {};
          if (timing.iterations === Infinity) continue;
          a.finish();
        } catch (e) { /* not finishable — leave it running */ }
      }
      return new Promise((r) => requestAnimationFrame(() => r(true)));
    });
  }

  /** The bounding box of the first match, in viewport (CSS px) coordinates. */
  box(selector) {
    return this.eval((sel) => {
      const el = document.querySelector(sel);
      if (!el) throw new Error("no element matches " + sel);
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, width: r.width, height: r.height, top: r.top, bottom: r.bottom, left: r.left, right: r.right };
    }, selector);
  }

  /** Text content of the first match. */
  text(selector) {
    return this.eval((sel) => {
      const el = document.querySelector(sel);
      return el ? el.textContent : null;
    }, selector);
  }

  /** A real CDP mouse click dispatched at an element's centre — hit-tests for real. */
  async tap(selector) {
    const b = await this.box(selector);
    const x = b.x + b.width / 2;
    const y = b.y + b.height / 2;
    await this.send("Input.dispatchMouseEvent", { type: "mouseMoved", x, y });
    await this.send("Input.dispatchMouseEvent", { type: "mousePressed", x, y, button: "left", clickCount: 1 });
    await this.send("Input.dispatchMouseEvent", { type: "mouseReleased", x, y, button: "left", clickCount: 1 });
  }

  /** Every key/value currently in localStorage. */
  storageDump() {
    return this.eval(() => {
      var out = {};
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        out[k] = localStorage.getItem(k);
      }
      return out;
    });
  }

  /** Emulated media features, e.g. [{ name: "prefers-reduced-motion", value: "reduce" }]; [] resets. */
  async media(features) {
    await this.send("Emulation.setEmulatedMedia", { media: "", features });
  }

  async viewport(width, height, { mobile = true } = {}) {
    this.touchEnabled = mobile;
    await this.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 2, mobile, screenWidth: width, screenHeight: height });
    await this.send("Emulation.setTouchEmulationEnabled", { enabled: mobile, maxTouchPoints: mobile ? 5 : 0 });
  }

  /** PNG written to the absolute path `file`. `fullPage: false` captures just the viewport. */
  async shot(file, { fullPage = false } = {}) {
    const params = { format: "png" };
    if (fullPage) {
      const { w, h } = await this.eval(() => ({ w: document.documentElement.clientWidth, h: document.documentElement.scrollHeight }));
      Object.assign(params, { captureBeyondViewport: true, clip: { x: 0, y: 0, width: w, height: h, scale: 1 } });
    }
    const { data } = await this.send("Page.captureScreenshot", params);
    writeFileSync(file, Buffer.from(data, "base64"));
  }
}

/** Starts a headless browser with a fresh profile under tests/.tmp/ and returns { page, close }. */
export async function launch() {
  const exe = BROWSERS.find((p) => existsSync(p));
  if (!exe) throw new Error("no Brave or Chrome found; set APP_BROWSER to a Chromium executable");
  mkdirSync(TMP_DIR, { recursive: true });
  const profile = mkdtempSync(join(TMP_DIR, "profile-"));
  const child = spawn(exe, [
    "--headless=new", "--remote-debugging-port=0", `--user-data-dir=${profile}`,
    "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--hide-scrollbars", "--mute-audio", "about:blank",
  ], { stdio: "ignore", windowsHide: true, cwd: TMP_DIR });
  let ws;
  const close = async () => {
    try { ws?.close(); } catch {}
    if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore", windowsHide: true });
    else child.kill("SIGKILL");
    for (let i = 0; i < 20; i++) {
      try { rmSync(profile, { recursive: true, force: true }); } catch {}
      if (!existsSync(profile)) break;
      await sleep(150);
    }
  };
  try {
    let port = null;
    for (let i = 0; i < 400 && !port; i++) {
      const f = join(profile, "DevToolsActivePort");
      if (existsSync(f)) port = Number(readFileSync(f, "utf8").split("\n")[0]) || null;
      if (!port) await sleep(50);
    }
    if (!port) throw new Error("the browser did not open a debugger port");
    const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    const target = targets.find((t) => t.type === "page");
    if (!target) throw new Error("the browser has no page target");
    ws = new WebSocket(target.webSocketDebuggerUrl);
    await new Promise((res, rej) => {
      ws.addEventListener("open", res, { once: true });
      ws.addEventListener("error", () => rej(new Error("debugger socket failed")), { once: true });
    });
    const page = new Page(ws);
    await page.init();
    return { page, close };
  } catch (e) {
    await close();
    throw e;
  }
}

let _server = null;
async function ownServer() {
  if (!_server) _server = await serve(APP_ROOT);
  return _server;
}

/** Closes the shared http server openApp() started, so a script that is done can exit. */
export async function closeServer() {
  if (!_server) return;
  const s = _server;
  _server = null;
  await s.close();
}

/**
 * Opens the app in `page`, fully configured for a deterministic test:
 *   opts.now         ISO local datetime string; injects a Date offset (never freezes) so
 *                     appNow() lands there and keeps ticking. Omit for real time.
 *   opts.query        query string appended to the app URL, e.g. '?onizleme=dogumgunu'
 *   opts.storage      object seeded into localStorage before load (via a same-origin blank page)
 *   opts.keepStorage  true: reload without clearing storage first ("next open" tests)
 *   opts.memories     array fed to the Firestore stub's memories collection
 *   opts.signedIn     default true — whether the stub auth reports a signed-in user
 *   opts.reducedMotion default false
 *   opts.mic          'deny' | 'none' | 'fake', default 'none'
 *   opts.voiceAudio   'wav' | 'mp3' | 'm4a' | 'ogg' | 'opus' | null (default) — fakes
 *                     audio/sesli-mesaj.<ext> as present (real playable bytes); null matches the
 *                     live site today, where audio/ does not exist and every probe 404s
 *   opts.viewport     { width, height }, default 390x844 (mobile, touch)
 *   opts.page         which html file to open, default 'index.html'
 */
export async function openApp(page, opts = {}) {
  const {
    now = null,
    query = "",
    storage = null,
    keepStorage = false,
    memories = [],
    signedIn = true,
    reducedMotion = false,
    mic = "none",
    voiceAudio = null,
    viewport = { width: 390, height: 844 },
    page: appPage = "index.html",
  } = opts;

  const server = await ownServer();

  await page.viewport(viewport.width, viewport.height, { mobile: true });
  await page.send("Emulation.setTimezoneOverride", { timezoneId: "Europe/Istanbul" });
  await page.media(reducedMotion ? [{ name: "prefers-reduced-motion", value: "reduce" }] : []);
  page.setVoiceAudioFixture(voiceAudio);
  await page.setupNewDocumentScript({ nowIso: now, memories, signedIn, mic });

  if (!keepStorage) {
    await page.goto(server.base + "__blank.html");
    await page.eval((seed) => {
      try {
        localStorage.clear();
        sessionStorage.clear();
      } catch (e) {}
      if (seed) {
        for (var k in seed) if (Object.prototype.hasOwnProperty.call(seed, k)) localStorage.setItem(k, seed[k]);
      }
      return true;
    }, storage);
  }

  await page.goto(server.base + appPage + (query || ""));
}

/**
 * Records named checks. A condition returns true/false or { ok, detail }; one that throws is a
 * FAIL with the error as its detail, never a crash of the suite.
 */
export function checker({ quiet = false } = {}) {
  const results = [];
  async function check(name, cond) {
    let ok = false;
    let detail = "";
    try {
      const v = await cond();
      if (v && typeof v === "object") { ok = v.ok === true; detail = v.detail ?? ""; }
      else ok = v === true;
    } catch (e) {
      detail = `threw: ${String(e?.message ?? e).split("\n")[0]}`;
    }
    results.push({ name, ok, detail: String(detail) });
    if (!quiet) console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`);
    return ok;
  }
  return { check, results };
}
