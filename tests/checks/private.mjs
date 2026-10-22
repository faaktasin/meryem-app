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
 *   7. the birthday preview lands on the payload's birthday (no clock call before the load).
 * (Check numbers follow the plan; 6, the no-leak guard, belongs to the next stage.)
 *
 * Hand-computed dates, Europe/Istanbul (no DST in 2026), default clock 2026-09-20T10:00:
 *   2026-01-01 00:00 -> 2026-09-20 10:00: Jan-Aug = 243 days to 1 Sep, +19 = 262 days (+10 h)
 *   2026-08-01 00:00 -> 2026-09-20 10:00: 31 (Aug) + 19 = 50 days (+10 h)
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { runInNewContext } from "node:vm";
import { openApp, sleep } from "../harness.mjs";

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
  const GATE_WEEK = "2026-10-05T10:00:00";
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
    id: "private-birthday-hard-coded",
    file: "js/time.js",
    find: "return new Date(year, CONFIG.herBirthday.month - 1, CONFIG.herBirthday.day, 0, 0, 0);",
    replace: "return new Date(year, 10 - 1, 4, 0, 0, 0);",
    expect: N_PREVIEW,
  },
];
