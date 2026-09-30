/**
 * meryem-app tests — checks/sw.mjs
 *
 * The installed PWA on her phone serves whatever sw.js cached. Two ways that goes wrong:
 *   1. a site file missing from ASSETS is never cached, so offline it 404s — and a listed file
 *      that does not exist makes cache.addAll() reject, so the new worker never installs at all;
 *   2. site files change but CACHE_NAME does not, so the old cache is never dropped.
 * Both are checked statically against the files on disk and against origin/main.
 */
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { REAL_ROOT, TMP_DIR } from "../harness.mjs";

export const name = "sw";

// "audio" is optional — Furkan has not dropped a voice-message recording into the repo yet, so
// this folder does not exist today. It is scanned like the others so that, the moment a file
// lands there, sw.js's ASSETS is required to list it (check #1 below) exactly as for css/js/img.
const SITE_DIRS = ["css", "js", "img", "audio"];

function readSw(root) {
  const src = readFileSync(join(root, "sw.js"), "utf8");
  const list = /var ASSETS = \[([\s\S]*?)\];/.exec(src);
  const cache = /var CACHE_NAME = '([^']+)';/.exec(src);
  return {
    assets: list ? [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [],
    cacheName: cache ? cache[1] : null,
  };
}

/** Every file the site serves: index.html, manifest.json and everything under css/ js/ img/
 *  (audio/ too, once it exists — it is optional and today it does not). */
function siteFiles(root) {
  const out = ["index.html", "manifest.json"];
  for (const d of SITE_DIRS) {
    const dirPath = join(root, d);
    if (!existsSync(dirPath)) continue;
    for (const f of readdirSync(dirPath)) out.push(`${d}/${f}`);
  }
  return out.sort();
}

function gitShow(path) {
  try {
    return execFileSync("git", ["-C", REAL_ROOT, "show", `origin/main:${path}`], { stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    return null;
  }
}

export async function run({ check, root }) {
  const sw = readSw(root);
  const files = siteFiles(root);

  await check("sw: ASSETS lists exactly the site's files (plus ./), and every entry exists", () => {
    const listed = sw.assets.filter((a) => a !== "./").map((a) => a.replace(/^\.\//, "")).sort();
    const missing = files.filter((f) => !listed.includes(f));
    const extra = listed.filter((f) => !files.includes(f) || !existsSync(join(root, f)));
    return {
      ok: sw.assets.includes("./") && missing.length === 0 && extra.length === 0,
      detail: `missing from ASSETS: [${missing.join(", ")}]; listed but not on disk: [${extra.join(", ")}]`,
    };
  });

  await check("sw: every local file index.html loads is in ASSETS", () => {
    const html = readFileSync(join(root, "index.html"), "utf8");
    const refs = [...html.matchAll(/(?:src|href)="((?:css|js|img)\/[^"]+)"/g)].map((m) => m[1]);
    const listed = new Set(sw.assets.map((a) => a.replace(/^\.\//, "")));
    const missing = refs.filter((r) => !listed.has(r));
    return { ok: refs.length > 0 && missing.length === 0, detail: `${refs.length} refs; missing: [${missing.join(", ")}]` };
  });

  await check("sw: the site-file scan includes files under audio/ when that folder exists, and tolerates it being absent", () => {
    mkdirSync(TMP_DIR, { recursive: true });
    const dir = mkdtempSync(join(TMP_DIR, "sw-audio-"));
    try {
      for (const d of ["css", "js", "img"]) mkdirSync(join(dir, d));
      writeFileSync(join(dir, "index.html"), "");
      writeFileSync(join(dir, "manifest.json"), "{}");
      const withoutAudio = siteFiles(dir);
      mkdirSync(join(dir, "audio"));
      writeFileSync(join(dir, "audio", "sesli-mesaj.wav"), "x");
      const withAudio = siteFiles(dir);
      return {
        ok: !withoutAudio.includes("audio/sesli-mesaj.wav") && withAudio.includes("audio/sesli-mesaj.wav"),
        detail: `without: ${JSON.stringify(withoutAudio)}; with: ${JSON.stringify(withAudio)}`,
      };
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  // The voice-message probe sends HEAD requests. cache.put() rejects anything but GET, and a cached
  // GET copy only answers a HEAD lookup with ignoreMethod — without both, every probe logs a
  // rejection and, offline, the recording is never found although it is in the cache.
  await check("sw: the fetch handler answers HEAD from the network or the cached GET copy, and caches GET only", () => {
    const src = readFileSync(join(root, "sw.js"), "utf8");
    const handler = src.slice(src.indexOf("addEventListener('fetch'"));
    const headBranch = /request\.method === 'HEAD'[\s\S]*?caches\.match\(event\.request, \{ ignoreMethod: true \}\)[\s\S]*?return;/.test(handler);
    const getGuardAt = handler.indexOf("if (event.request.method !== 'GET') return;");
    const putAt = handler.indexOf("cache.put(event.request"); // the call, not the comment above it
    return {
      ok: headBranch && getGuardAt !== -1 && putAt !== -1 && getGuardAt < putAt,
      detail: JSON.stringify({ headBranch, getGuardAt, putAt }),
    };
  });

  await check("sw: CACHE_NAME changes whenever a site file differs from origin/main", () => {
    const mainSw = gitShow("sw.js");
    if (!mainSw) return { ok: true, detail: "origin/main not reachable — nothing to compare against" };
    const mainCache = /var CACHE_NAME = '([^']+)';/.exec(mainSw.toString("utf8"))?.[1];
    const changed = files.filter((f) => {
      const before = gitShow(f);
      return !before || !before.equals(readFileSync(join(root, f)));
    });
    return {
      ok: changed.length === 0 || sw.cacheName !== mainCache,
      detail: `CACHE_NAME ${sw.cacheName} vs origin/main ${mainCache}; ${changed.length} site files differ`,
    };
  });
}

export const mutants = [
  {
    id: "sw-asset-dropped",
    file: "sw.js",
    find: "  './js/gate.js',\n",
    replace: "",
    expect: "sw: ASSETS lists exactly the site's files (plus ./), and every entry exists",
  },
  {
    id: "sw-asset-stale",
    file: "sw.js",
    find: "  './js/words.js',\n",
    replace: "  './js/words.js',\n  './js/today.js',\n",
    expect: "sw: ASSETS lists exactly the site's files (plus ./), and every entry exists",
  },
  {
    id: "sw-cache-not-bumped",
    file: "sw.js",
    find: "var CACHE_NAME = 'meryem-v11';",
    replace: "var CACHE_NAME = 'meryem-v10';",
    expect: "sw: CACHE_NAME changes whenever a site file differs from origin/main",
  },
  {
    id: "sw-get-guard-dropped",
    file: "sw.js",
    find: "  if (event.request.method !== 'GET') return;\n",
    replace: "",
    expect: "sw: the fetch handler answers HEAD from the network or the cached GET copy, and caches GET only",
  },
  {
    id: "sw-head-ignore-method-dropped",
    file: "sw.js",
    find: "return caches.match(event.request, { ignoreMethod: true });",
    replace: "return caches.match(event.request);",
    expect: "sw: the fetch handler answers HEAD from the network or the cached GET copy, and caches GET only",
  },
  // No mutant for the audio-folder scan itself: mutate_app.mjs only mutates files under the
  // copied APP_ROOT (copyApp() explicitly excludes tests/), so a mutation of this check's own
  // source (tests/checks/sw.mjs) can never be applied through that mechanism — it would only ever
  // report ANCHOR. The "tolerates it being absent" and "includes it when present" branches are
  // instead proven directly by the check above (against synthetic before/after directories), and
  // were confirmed to fail without the existsSync() guard by a manual revert-and-run.
];
