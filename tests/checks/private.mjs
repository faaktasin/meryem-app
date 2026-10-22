/**
 * meryem-app tests — checks/private.mjs
 *
 * The couple's private texts load from one Firestore document after sign-in (js/private.js):
 * users/{uid}/private/texts = { json: "<payload>", updatedAt }. The stub serves no such document
 * unless a check seeds it (openApp's `privateTexts`), so every other module runs on the texts in
 * js/content.js and js/data.js. These checks prove, from what the page shows:
 *   1. a seeded payload replaces the texts on screen, and leaves an untouched UI string alone;
 *   2. payload dates arrive as Dates and the counters are computed from them;
 *   3. a slow document keeps the splash up and writes no gate/surprise flag before it arrives;
 *   4. a failed read, a broken document, a wrong-typed value: one toast, repo texts, tabs work;
 *      a missing document is silent;
 *   5. the ?ozel-metin panel uploads a valid file as written, refuses a bad one, downloads what
 *      is stored;
 *   6. the no-leak guard: no string literal or comment in the app files or the tests may be a
 *      sentence the couple wrote (SHA-256 list in tests/fixtures/private-hashes.json);
 *   7. the birthday preview lands on the payload's birthday (no clock call before the load).
 * (Check numbers follow the plan.)
 *
 * Hand-computed dates, Europe/Istanbul (no DST in 2026), default clock 2026-09-20T10:00:
 *   2026-01-01 00:00 -> 2026-09-20 10:00: Jan-Aug = 243 days to 1 Sep, +19 = 262 days (+10 h)
 *   2026-08-01 00:00 -> 2026-09-20 10:00: 31 (Aug) + 19 = 50 days (+10 h)
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { runInNewContext } from "node:vm";
import { TESTS_DIR, openApp, sleep } from "../harness.mjs";

export const name = "private";

const N_REPLACE = "private: a seeded payload replaces the Bugün greeting, the daily message, a Sözler letter and a Takip habit on screen, and leaves a UI string it does not carry alone";
const N_DATES = "private: payload dates arrive as Dates and Bugün and Tarihler count from them (262 days together, 50 since the engagement), the engagement label comes from the payload";
const N_WRONG_TYPE = "private: a value of the wrong type is skipped, the rest of the payload still applies";
const N_DELAY = "private: while the document is slow the splash stays, the app stays hidden and no gate or surprise flag is written; the gate then shows the payload's opener";
const N_FAIL_GET = "private: a failed read gives exactly one toast, the repo texts stay and the tabs work";
const N_MISSING = "private: a missing document is silent (no toast) and the repo texts stay";
const N_BROKEN = "private: a broken or invalid document (bad JSON, wrong version) gives one toast and the repo texts stay";
const N_UPLOAD = "private: ?ozel-metin opens the panel and a valid file is written as exactly the uploaded text";
const N_REJECT = "private: the panel refuses bad JSON, a wrong version and an unknown key: a toast, nothing written";
const N_DOWNLOAD = "private: İndir hands over the stored text as ozel-metinler.json, and says so when nothing is stored";
const N_PREVIEW = "private: ?onizleme=dogumgunu lands on the payload's birthday at 10:00, not the repo's";
const N_NOLEAK = "private: no string literal or comment in js/, index.html, css/, sw.js, manifest.json or tests/ is one of the couple's own sentences (hash list), and the scanner finds a planted canary in every literal form";

/* ── The no-leak guard ─────────────────────────────────────────────────────────────────────
 * tests/fixtures/private-hashes.json holds the SHA-256 of every private sentence of 25+ characters
 * (hashes reveal nothing; sentences under 25 characters are left out because their hashes could be
 * guessed). Every string literal and every comment line of the app and of the tests is normalised
 * as the file says (NFC, no-break space = space, whitespace runs = one space, trimmed) and hashed.
 *
 * LIMIT, stated: the guard catches an EXACT re-addition of a listed sentence only. A reworded
 * sentence, a sentence split over concatenated literals, and any string under 25 characters pass it.
 *
 * `canary` is a neutral made-up sentence whose hash is kept apart from `hashes`. It counts as a hit
 * in the app files only (never in tests/, where the mutant and the scanner's own self-test must be
 * able to spell it); the mutant writes it into js/content.js, which proves the scan can fail. */
const MIN_LEN = 25;
const normalise = (s) => s.normalize("NFC").replace(/ /g, " ").replace(/\s+/g, " ").trim();
const sha256 = (s) => createHash("sha256").update(s, "utf8").digest("hex");

function unescapeJs(raw) {
  return raw.replace(/\\(u\{([0-9a-fA-F]+)\}|u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|\r?\n|[\s\S])/g, (all, c, braced, u4, x2) => {
    if (braced) return String.fromCodePoint(parseInt(braced, 16));
    if (u4) return String.fromCharCode(parseInt(u4, 16));
    if (x2) return String.fromCharCode(parseInt(x2, 16));
    if (c === "n") return "\n";
    if (c === "t") return "\t";
    if (c === "r") return "\r";
    if (/^\r?\n$/.test(c)) return "";
    return c;
  });
}

/** Every string literal (' " `) and every comment of JS / CSS source, as { text, line }. */
function scanScript(src) {
  const out = [];
  let i = 0, line = 1;
  const n = src.length;
  while (i < n) {
    const ch = src[i];
    const two = src.substr(i, 2);
    if (two === "//" ) {
      let j = src.indexOf("\n", i); if (j < 0) j = n;
      out.push({ text: src.slice(i + 2, j), line });
      i = j;
    } else if (two === "/*") {
      let j = src.indexOf("*/", i + 2); if (j < 0) j = n;
      const body = src.slice(i + 2, j);
      body.split("\n").forEach((l, k) => out.push({ text: l.replace(/^\s*\*+/, ""), line: line + k }));
      out.push({ text: body, line });
      line += body.split("\n").length - 1;
      i = Math.min(n, j + 2);
    } else if (ch === "'" || ch === '"' || ch === "`") {
      let j = i + 1;
      while (j < n && src[j] !== ch && !(ch !== "`" && src[j] === "\n")) j += src[j] === "\\" ? 2 : 1;
      out.push({ text: unescapeJs(src.slice(i + 1, j)), line });
      for (let k = i; k < Math.min(j, n); k++) if (src[k] === "\n") line++;
      i = j + 1;
    } else {
      if (ch === "\n") line++;
      i++;
    }
  }
  return out;
}

/** Quoted attribute values, text nodes and comments of HTML, plus the literals of inline scripts. */
function scanHtml(src) {
  const out = [];
  const lineOf = (idx) => src.slice(0, idx).split("\n").length;
  for (const m of src.matchAll(/="([^"]*)"|='([^']*)'/g)) out.push({ text: m[1] ?? m[2], line: lineOf(m.index) });
  for (const m of src.matchAll(/>([^<>]+)</g)) out.push({ text: m[1], line: lineOf(m.index) });
  for (const m of src.matchAll(/<!--([\s\S]*?)-->/g)) {
    m[1].split("\n").forEach((l, k) => out.push({ text: l, line: lineOf(m.index) + k }));
  }
  for (const m of src.matchAll(/<(script|style)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    const base = lineOf(m.index);
    for (const s of scanScript(m[2])) out.push({ text: s.text, line: base + s.line - 1 });
  }
  return out;
}

/** Every string of a JSON file. */
function scanJson(src) {
  const out = [];
  (function walk(v) {
    if (typeof v === "string") out.push({ text: v, line: 0 });
    else if (v && typeof v === "object") Object.values(v).forEach(walk);
  })(JSON.parse(src));
  return out;
}

function scanFile(file, src) {
  if (/\.html?$/.test(file)) return scanHtml(src);
  if (/\.json$/.test(file)) return scanJson(src);
  return scanScript(src);
}

/** Text files under `dir` whose names match `pattern`, never descending into `skipDirs`. */
function filesUnder(dir, pattern, skipDirs = []) {
  const out = [];
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) { if (!skipDirs.includes(e.name)) out.push(...filesUnder(p, pattern, skipDirs)); }
    else if (pattern.test(e.name)) out.push(p);
  }
  return out;
}

/** The hash of every candidate (len >= MIN_LEN after normalising) of `files`, with where it sits. */
function candidates(files, base) {
  const found = [];
  let count = 0;
  for (const file of files) {
    const rel = relative(base, file).replace(/\\/g, "/");
    for (const s of scanFile(file, readFileSync(file, "utf8"))) {
      const t = normalise(s.text);
      if (t.length < MIN_LEN) continue;
      count++;
      found.push({ where: `${rel}:${s.line}`, hash: sha256(t) });
    }
  }
  return { found, count };
}

function leakScan(root) {
  const list = JSON.parse(readFileSync(join(TESTS_DIR, "fixtures", "private-hashes.json"), "utf8"));
  const sentences = new Set(list.hashes);
  const appFiles = [
    ...filesUnder(join(root, "js"), /\.js$/),
    ...filesUnder(join(root, "css"), /\.css$/),
    join(root, "index.html"), join(root, "sw.js"), join(root, "manifest.json"),
  ];
  // tests/ of THIS checkout (a mutant copy has none); .tmp holds mutant copies of the app, and the
  // hash file is the one place the hashes may sit.
  const testFiles = filesUnder(TESTS_DIR, /\.(mjs|js|html|css|json)$/, [".tmp"])
    .filter((f) => relative(TESTS_DIR, f).replace(/\\/g, "/") !== "fixtures/private-hashes.json");
  const app = candidates(appFiles, root);
  const tests = candidates(testFiles, TESTS_DIR);
  const hits = [
    ...app.found.filter((c) => sentences.has(c.hash) || c.hash === list.canary),
    ...tests.found.filter((c) => sentences.has(c.hash)).map((c) => ({ ...c, where: `tests/${c.where}` })),
  ].map((c) => c.where);
  return { hits, files: appFiles.length + testFiles.length, strings: app.count + tests.count, listSize: sentences.size, canary: list.canary };
}

/** The scanner against a planted canary in every literal form it has to read. */
function scannerSelfTest(canary) {
  const C = "Mavi kalem sabahın erken saatinde pencerenin önünde bekledi.";
  const forms = {
    single: `var a = '${C}';`,
    double: `var a = "${C}";`,
    template: `var a = \`${C}\`;`,
    escapedNbsp: `var a = 'Mavi kalem sabahın erken saatinde pencerenin\\u00a0önünde bekledi.';`,
    escapedQuote: `var a = "${C.replace("kalem", "kal\\x65m")}";`,
    lineComment: `var a = 1; // ${C}`,
    blockComment: `/* first line\n   ${C}\n*/`,
    htmlText: `<p>${C}</p>`,
    htmlAttr: `<p title="${C}"></p>`,
  };
  const missed = [];
  for (const [form, src] of Object.entries(forms)) {
    const list = /^html/.test(form) ? scanHtml(src) : scanScript(src);
    if (!list.some((s) => sha256(normalise(s.text)) === canary)) missed.push(form);
  }
  return missed;
}

/** The repo's own content.js, evaluated on its own: what the page shows when no document exists. */
function repoContent(root) {
  return runInNewContext(readFileSync(join(root, "js", "content.js"), "utf8") + "\n;CONTENT");
}

const PAYLOAD = {
  version: 1,
  content: {
    greetings: {
      morning: ["PRIV-GREET-MORNING"],
      afternoon: ["PRIV-GREET-AFTERNOON"],
      evening: ["PRIV-GREET-EVENING"],
      night: ["PRIV-GREET-NIGHT"],
      birthday: ["PRIV-GREET-BIRTHDAY"],
    },
    words: {
      letters: [{ id: "miss", title: "PRIV-LETTER-TITLE", emoji: "💌", birthdayOnly: false, body: ["PRIV-LETTER-BODY"] }],
    },
    dates: { engagementLabel: "PRIV-ENGAGED" },
    gate: { opener: { q: "PRIV-GATE-OPENER", reply: "PRIV-GATE-REPLY" } },
  },
  config: {
    habitsStart: "2026-09",
    habits: [{ id: "privhabit", label: "PRIV-HABIT", owners: ["furkan", "meryem"], weekdaysOnly: false, since: "2026-09-01", note: "n" }],
    loveDate: "2026-01-01T00:00:00",
    engagementDate: "2026-08-01T00:00:00",
  },
  loveMessages: ["PRIV-LOVE-MESSAGE"],
};

async function until(fn, ms = 3000) {
  const deadline = Date.now() + ms;
  let last;
  for (;;) {
    last = await fn();
    if (last || Date.now() >= deadline) return last;
    await sleep(40);
  }
}

const toasts = (page) => page.eval(() => window.__toastLog.slice());
const settle = (page, ms = 250) => page.eval((n) => new Promise((r) => setTimeout(r, n)), ms);
const privateDoc = async (page) => ((await page.stubDb())["users/test-uid/private"] || {}).texts;

async function openTab(page, tab) {
  await page.tap(`.nav-btn[data-tab="${tab}"]`);
  await settle(page, 150);
}

/** Puts `text` into the panel's file input as a file and fires its change event. */
function uploadFile(page, text) {
  return page.eval((t) => {
    const dt = new DataTransfer();
    dt.items.add(new File([t], "ozel-metinler.json", { type: "application/json" }));
    const input = document.getElementById("private-file-input");
    if (!input) return false;
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    return true;
  }, text);
}

export async function run({ page, check, root }) {
  const repo = repoContent(root);

  // 1. A seeded payload replaces what is shown
  await openApp(page, { privateTexts: PAYLOAD, storage: { "meryem-habits-me": "furkan" } });
  await settle(page);
  const greeting = await page.text("#today-greeting .bgn-greeting-text");
  const daily = await page.text("#daily-message");
  await openTab(page, "words-view");
  await page.eval(() => document.querySelector('.wz-envelope[data-letter-id="miss"]').scrollIntoView({ block: "center" }));
  await page.tap('.wz-envelope[data-letter-id="miss"]');
  const letter = await until(() => page.text("#wz-letter-body p"));
  const jarHint = await page.text("#wz-jar-hint");
  await page.eval(() => document.getElementById("wz-letter-close").click());
  await openTab(page, "habits-view");
  const habitLabels = await page.eval(() => Array.prototype.map.call(document.querySelectorAll(".hb-row-label"), (el) => el.textContent));
  await check(N_REPLACE, () => ({
    ok: greeting === "PRIV-GREET-MORNING" && daily === "PRIV-LOVE-MESSAGE" && letter === "PRIV-LETTER-BODY"
      && habitLabels.includes("PRIV-HABIT") && jarHint === repo.words.ui.jarHint,
    detail: JSON.stringify({ greeting, daily, letter, habitLabels, jarHint }),
  }));

  // 2. Dates arrive as Dates; the counters are computed from them
  await openApp(page, { privateTexts: PAYLOAD });
  await settle(page);
  const dateInfo = await page.eval(() => ({
    loveIsDate: CONFIG.loveDate instanceof Date && !isNaN(CONFIG.loveDate.getTime()),
    engagementIsDate: CONFIG.engagementDate instanceof Date,
    meetStillDate: CONFIG.firstMeetDate instanceof Date,
    together: (document.querySelector(".bgn-together-days") || {}).textContent,
    sinceEngagement: (document.querySelector('[data-dts-unit="engagement-days"]') || {}).textContent,
    engagementLabel: (document.querySelector('[data-dts-card="engagement"] .countdown-label') || {}).textContent,
  }));
  await check(N_DATES, () => ({
    ok: dateInfo.loveIsDate && dateInfo.engagementIsDate && dateInfo.meetStillDate
      && dateInfo.together === "262" && dateInfo.sinceEngagement === "50" && dateInfo.engagementLabel === "PRIV-ENGAGED",
    detail: JSON.stringify(dateInfo),
  }));

  // 2b. A value of another type than the current one is skipped (and never throws)
  await openApp(page, {
    privateTexts: {
      version: 1,
      content: { gate: { skip: "wrong", yesLabel: 5 }, greetings: { morning: ["PRIV-STILL-APPLIED"] } },
      config: { name: 42, loveDate: "not a date", habitsStart: "2026-09" },
    },
  });
  await settle(page);
  const wrong = await page.eval(() => ({
    skip: CONTENT.gate.skip.label,
    yes: CONTENT.gate.yesLabel,
    name: CONFIG.name,
    loveIsDate: CONFIG.loveDate instanceof Date && !isNaN(CONFIG.loveDate.getTime()),
    habitsStart: CONFIG.habitsStart,
    greeting: (document.querySelector("#today-greeting .bgn-greeting-text") || {}).textContent,
  }));
  await check(N_WRONG_TYPE, () => ({
    ok: wrong.skip === repo.gate.skip.label && wrong.yes === repo.gate.yesLabel && wrong.name === "Meryem" && wrong.loveIsDate
      && wrong.habitsStart === "2026-09" && wrong.greeting === "PRIV-STILL-APPLIED",
    detail: JSON.stringify(wrong),
  }));

  // 3. A slow document: nothing is drawn, nothing is marked, until it has arrived
  const GATE_WEEK = "2026-11-26T10:00:00";
  await openApp(page, { now: GATE_WEEK, privateTexts: PAYLOAD, stubFlags: { __STUB_GET_DELAY_MS: 2500 }, waitReady: false });
  const during = await page.eval(() => ({
    splash: getComputedStyle(document.getElementById("splash-screen")).display,
    app: getComputedStyle(document.getElementById("app-content")).display,
    auth: getComputedStyle(document.getElementById("auth-screen")).display,
    gateFlag: localStorage.getItem("meryem-gate-played-year"),
    seenFlag: localStorage.getItem("meryem-birthday-seen-year"),
    ready: window.appInitialized === true,
  }));
  const arrived = await until(() => page.eval(() => window.appInitialized === true), 6000);
  const gateText = await until(() => page.eval(() => {
    const el = document.querySelector(".gate-question-text");
    return el ? el.textContent : null;
  }), 3000);
  await check(N_DELAY, () => ({
    ok: during.splash !== "none" && during.app === "none" && during.auth === "none" && during.gateFlag === null
      && during.seenFlag === null && during.ready === false && arrived === true && gateText === "PRIV-GATE-OPENER"
      && gateText !== repo.gate.opener.q,
    detail: JSON.stringify({ during, arrived, gateText }),
  }));

  // 4. Failure paths
  await openApp(page, { stubFlags: { __STUB_FAIL_GET: { texts: true } } });
  await settle(page);
  const failed = await page.eval(() => ({
    greeting: (document.querySelector("#today-greeting .bgn-greeting-text") || {}).textContent,
    app: getComputedStyle(document.getElementById("app-content")).display,
  }));
  await openTab(page, "words-view");
  const failedTab = await page.eval(() => document.getElementById("words-view").classList.contains("is-active"));
  const failedToasts = await toasts(page);
  await check(N_FAIL_GET, () => ({
    ok: failedToasts.length === 1 && failedToasts[0] === repo.privateTexts.loadError
      && repo.greetings.morning.includes(failed.greeting) && failed.app === "block" && failedTab === true,
    detail: JSON.stringify({ failedToasts, failed, failedTab }),
  }));

  await openApp(page, {});
  await settle(page);
  const missing = await page.eval(() => ({
    greeting: (document.querySelector("#today-greeting .bgn-greeting-text") || {}).textContent,
    toasts: window.__toastLog.slice(),
  }));
  await check(N_MISSING, () => ({
    ok: missing.toasts.length === 0 && repo.greetings.morning.includes(missing.greeting),
    detail: JSON.stringify(missing),
  }));

  const brokenRuns = [];
  for (const [label, doc] of [
    ["bad JSON", "{not json"],
    ["wrong version", { version: 2, content: { greetings: { morning: ["PRIV-SHOULD-NOT-APPLY"] } } }],
  ]) {
    await openApp(page, { privateTexts: doc });
    await settle(page);
    brokenRuns.push(Object.assign({ label }, await page.eval(() => ({
      toasts: window.__toastLog.slice(),
      greeting: (document.querySelector("#today-greeting .bgn-greeting-text") || {}).textContent,
    }))));
  }
  await check(N_BROKEN, () => ({
    ok: brokenRuns.every((r) => r.toasts.length === 1 && r.toasts[0] === repo.privateTexts.loadError && repo.greetings.morning.includes(r.greeting)),
    detail: JSON.stringify(brokenRuns),
  }));

  // 5. The panel
  const UPLOAD = JSON.stringify({ version: 1, content: { greetings: { morning: ["PRIV-UPLOADED"] } }, loveMessages: ["PRIV-UPLOADED-MSG"] }, null, 2) + "\n";
  await openApp(page, { query: "?ozel-metin" });
  const opened = await until(() => page.eval(() => !!document.getElementById("private-modal") && document.getElementById("private-modal").classList.contains("open")), 2000);
  const before = await privateDoc(page);
  await uploadFile(page, UPLOAD);
  const stored = await until(() => privateDoc(page), 2000);
  const savedToasts = await toasts(page);
  await check(N_UPLOAD, () => ({
    ok: opened === true && before === undefined && !!stored && stored.json === UPLOAD && !!stored.updatedAt
      && savedToasts[savedToasts.length - 1] === repo.privateTexts.panel.saved,
    detail: JSON.stringify({ opened, before, stored, savedToasts }),
  }));

  const BAD_FILES = [
    ["bad JSON", "{nope"],
    ["wrong version", JSON.stringify({ version: 2, content: {} })],
    ["unknown key", JSON.stringify({ version: 1, bogus: {} })],
  ];
  const rejected = [];
  for (const [label, text] of BAD_FILES) {
    await openApp(page, { query: "?ozel-metin" });
    await until(() => page.eval(() => !!document.getElementById("private-file-input")), 2000);
    await uploadFile(page, text);
    await settle(page, 400);
    const log = await toasts(page);
    rejected.push({ label, written: (await privateDoc(page)) !== undefined, toast: log[log.length - 1] || null });
  }
  await check(N_REJECT, () => ({
    ok: rejected.every((r) => r.written === false && typeof r.toast === "string" && r.toast.startsWith("Dosya geçersiz:")),
    detail: JSON.stringify(rejected),
  }));

  const STORED = JSON.stringify({ version: 1, loveMessages: ["PRIV-STORED"] });
  const capture = () => page.eval(() => {
    window.__downloads = [];
    HTMLAnchorElement.prototype.click = function () {
      const link = this;
      fetch(link.href).then((r) => r.text()).then((body) => window.__downloads.push({ name: link.download, body }));
    };
    return true;
  });
  await openApp(page, { query: "?ozel-metin", privateTexts: STORED });
  await until(() => page.eval(() => !!document.getElementById("private-download-btn")), 2000);
  await capture();
  await page.eval(() => document.getElementById("private-download-btn").click());
  const got = await until(() => page.eval(() => window.__downloads[0] || null), 2000);

  await openApp(page, { query: "?ozel-metin" });
  await until(() => page.eval(() => !!document.getElementById("private-download-btn")), 2000);
  await capture();
  await page.eval(() => document.getElementById("private-download-btn").click());
  await settle(page, 400);
  const none = await page.eval(() => ({ downloads: window.__downloads.length, toasts: window.__toastLog.slice() }));
  await check(N_DOWNLOAD, () => ({
    ok: !!got && got.name === "ozel-metinler.json" && got.body === STORED && none.downloads === 0
      && none.toasts[none.toasts.length - 1] === repo.privateTexts.panel.noDocument,
    detail: JSON.stringify({ got, none }),
  }));

  // 6. No-leak guard (static)
  const leak = leakScan(root);
  const scannerMissed = scannerSelfTest(leak.canary);
  await check(N_NOLEAK, () => ({
    ok: leak.hits.length === 0 && scannerMissed.length === 0 && leak.listSize === 392 && leak.files >= 30 && leak.strings >= 1000,
    detail: JSON.stringify({ hits: leak.hits, scannerMissed, listSize: leak.listSize, files: leak.files, strings: leak.strings }),
  }));

  // 7. The rehearsal clock reads the payload's birthday (20 Nov), never the repo's, because the
  // texts are in before anything asks for the time.
  await openApp(page, { query: "?onizleme=dogumgunu", privateTexts: { version: 1, config: { herBirthday: { month: 11, day: 20 } } } });
  await settle(page);
  const preview = await page.eval(() => {
    const n = appNow();
    return { month: n.getMonth() + 1, day: n.getDate(), hour: n.getHours() };
  });
  await check(N_PREVIEW, () => ({
    ok: preview.month === 11 && preview.day === 20 && preview.hour === 10,
    detail: JSON.stringify(preview),
  }));
}

export const mutants = [
  {
    id: "private-content-not-merged",
    file: "js/private.js",
    find: "if (_isPlainObject(payload.content)) _mergeInto(CONTENT, payload.content, 'content');",
    replace: "",
    expect: N_REPLACE,
  },
  {
    id: "private-love-messages-not-applied",
    file: "js/private.js",
    find: "if (Array.isArray(payload.loveMessages)) {",
    replace: "if (false) {",
    expect: N_REPLACE,
  },
  {
    id: "private-config-not-merged",
    file: "js/private.js",
    find: "if (_isPlainObject(payload.config)) _mergeInto(CONFIG, payload.config, 'config');",
    replace: "",
    expect: N_REPLACE,
  },
  {
    id: "private-dates-stay-strings",
    file: "js/private.js",
    find: "if (parsed && !isNaN(parsed.getTime())) target[key] = parsed;",
    replace: "if (parsed && !isNaN(parsed.getTime())) target[key] = next;",
    expect: N_DATES,
  },
  {
    id: "private-dates-lazy-read-dropped",
    file: "js/dates.js",
    find: "    readDatesContent();\n\n    _refs = {",
    replace: "    _refs = {",
    expect: N_DATES,
  },
  {
    id: "private-wrong-type-accepted",
    file: "js/private.js",
    find: "} else if (typeof next === typeof current) {",
    replace: "} else if (true) {",
    expect: N_WRONG_TYPE,
  },
  {
    id: "private-invalid-date-accepted",
    file: "js/private.js",
    find: "if (parsed && !isNaN(parsed.getTime())) target[key] = parsed;",
    replace: "if (parsed) target[key] = parsed;",
    expect: N_WRONG_TYPE,
  },
  {
    id: "private-app-not-held-for-load",
    file: "js/firebase.js",
    find: "    loadPrivateTexts().then(function () {",
    replace: "    loadPrivateTexts();\n    Promise.resolve().then(function () {",
    expect: N_DELAY,
  },
  {
    id: "private-read-error-silent",
    file: "js/private.js",
    find: "    }).catch(_privateLoadFailed);",
    replace: "    }).catch(function () {});",
    expect: N_FAIL_GET,
  },
  {
    id: "private-missing-document-toasts",
    file: "js/private.js",
    find: "      if (!snap.exists) return;\n      var payload",
    replace: "      if (!snap.exists) throw new Error('missing');\n      var payload",
    expect: N_MISSING,
  },
  {
    id: "private-load-skips-validation",
    file: "js/private.js",
    find: "      if (!verdict.ok) throw new Error('invalid private payload: ' + verdict.reason);",
    replace: "",
    expect: N_BROKEN,
  },
  {
    id: "private-panel-never-opens",
    file: "js/firebase.js",
    find: "  maybeOpenPrivatePanel();\n",
    replace: "",
    expect: N_UPLOAD,
  },
  {
    id: "private-upload-rewrites-text",
    file: "js/private.js",
    find: "      json: text,",
    replace: "      json: JSON.stringify(payload),",
    expect: N_UPLOAD,
  },
  {
    id: "private-upload-skips-validation",
    file: "js/private.js",
    find: "    if (!verdict.ok) {\n      _privateToast('invalid', verdict.reason);",
    replace: "    if (false) {\n      _privateToast('invalid', verdict.reason);",
    expect: N_REJECT,
  },
  {
    id: "private-version-not-checked",
    file: "js/private.js",
    find: "  if (obj.version !== PRIVATE_VERSION) return { ok: false, reason: 'version must be ' + PRIVATE_VERSION };\n",
    replace: "",
    expect: N_REJECT,
  },
  {
    id: "private-unknown-key-accepted",
    file: "js/private.js",
    find: "  if (unknown.length) return { ok: false, reason: 'unknown key ' + unknown[0] };\n",
    replace: "",
    expect: N_REJECT,
  },
  {
    id: "private-download-wrong-name",
    file: "js/private.js",
    find: "link.download = 'ozel-metinler.json';",
    replace: "link.download = 'metinler.json';",
    expect: N_DOWNLOAD,
  },
  {
    id: "private-download-wrong-body",
    file: "js/private.js",
    find: "new Blob([snap.data().json]",
    replace: "new Blob(['{}']",
    expect: N_DOWNLOAD,
  },
  {
    id: "private-download-missing-silent",
    file: "js/private.js",
    find: "      _privateToast('noDocument');\n      return;",
    replace: "      return;",
    expect: N_DOWNLOAD,
  },
  {
    id: "private-canary-sentence-added",
    file: "js/content.js",
    find: "    loadError: 'Özel metinler yüklenemedi',\n",
    replace: "    loadError: 'Özel metinler yüklenemedi',\n    canary: 'Mavi kalem sabahın erken saatinde pencerenin önünde bekledi.',\n",
    expect: N_NOLEAK,
  },
  {
    id: "private-birthday-hard-coded",
    file: "js/time.js",
    find: "return new Date(year, CONFIG.herBirthday.month - 1, CONFIG.herBirthday.day, 0, 0, 0);",
    replace: "return new Date(year, 11 - 1, 25, 0, 0, 0);",
    expect: N_PREVIEW,
  },
];
