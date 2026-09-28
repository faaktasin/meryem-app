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
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { REAL_ROOT } from "../harness.mjs";

export const name = "sw";

const SITE_DIRS = ["css", "js", "img"];

function readSw(root) {
  const src = readFileSync(join(root, "sw.js"), "utf8");
  const list = /var ASSETS = \[([\s\S]*?)\];/.exec(src);
  const cache = /var CACHE_NAME = '([^']+)';/.exec(src);
  return {
    assets: list ? [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]) : [],
    cacheName: cache ? cache[1] : null,
  };
}

/** Every file the site serves: index.html, manifest.json and everything under css/ js/ img/. */
function siteFiles(root) {
  const out = ["index.html", "manifest.json"];
  for (const d of SITE_DIRS) {
    for (const f of readdirSync(join(root, d))) out.push(`${d}/${f}`);
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
    find: "var CACHE_NAME = 'meryem-v8';",
    replace: "var CACHE_NAME = 'meryem-v7';",
    expect: "sw: CACHE_NAME changes whenever a site file differs from origin/main",
  },
];
