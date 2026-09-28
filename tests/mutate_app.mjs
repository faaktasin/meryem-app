/**
 * meryem-app tests — mutate_app.mjs
 *
 * Proves the suite can fail. Each mutation, declared by the check module that owns it, is
 * applied to a fresh copy of the app in tests/.tmp/; the suite then runs against that copy
 * (APP_ROOT) with just the owning module, and the mutation counts as CAUGHT only if the check it
 * names FAILs. Same contract as D:/code-base/active/web-ui-kit/tests/mutate_kit.mjs:
 *   ANCHOR    the find string does not occur exactly once — the mutation is stale, fix it
 *   NO CHECK  no check carries the expected name — the mutation or the check was renamed
 *   CRASHED   the run never printed its result line — a crash proves nothing about the guard
 *   MISSED    the named check stayed green — the guard is decoration until it is rewritten
 *
 *   node tests/mutate_app.mjs                every mutation
 *   node tests/mutate_app.mjs --only shell   by owning module (or an id prefix)
 *   node tests/mutate_app.mjs shell          the same, as test_app.mjs takes it
 * Exit 0 only when every mutation is caught.
 */
import { spawn } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { REAL_ROOT, TESTS_DIR, TMP_DIR, sleep } from "./harness.mjs";

const CONCURRENCY = 2;
const CHECKS = join(TESTS_DIR, "checks");
const onlyAt = process.argv.indexOf("--only");
const positional = process.argv.slice(2).find((a) => !a.startsWith("-"));
const only = onlyAt >= 0 ? process.argv[onlyAt + 1] : positional || null;

const all = [];
for (const file of readdirSync(CHECKS).filter((f) => f.endsWith(".mjs"))) {
  const owner = basename(file, ".mjs");
  const mod = await import(pathToFileURL(join(CHECKS, file)).href);
  // The task's own schema for a mutant is {file, find, replace, expect} — `id` is this runner's
  // addition (for --only and the report line), so a module that skips it still runs.
  (mod.mutants || []).forEach((m, i) => all.push({ ...m, id: m.id || `${owner}-${i}`, owner }));
}
const list = only ? all.filter((m) => m.owner === only || m.id.startsWith(only)) : all;

/** A fresh copy of the app (everything but tests/ and .git/) under tests/.tmp/. */
function copyApp() {
  mkdirSync(TMP_DIR, { recursive: true });
  const dir = mkdtempSync(join(TMP_DIR, "mut-"));
  for (const entry of readdirSync(REAL_ROOT, { withFileTypes: true })) {
    if (entry.name === "tests" || entry.name === ".git") continue;
    const from = join(REAL_ROOT, entry.name);
    const to = join(dir, entry.name);
    if (entry.isDirectory()) cpSync(from, to, { recursive: true });
    else cpSync(from, to);
  }
  return dir;
}

async function removeDir(dir) {
  for (let i = 0; i < 20; i++) {
    try { rmSync(dir, { recursive: true, force: true }); } catch {}
    if (!existsSync(dir)) return;
    await sleep(150);
  }
}

function runOne(m) {
  return new Promise((resolve) => {
    const dir = copyApp();
    const finish = async (state, detail) => {
      await removeDir(dir);
      resolve({ id: m.id, state, expect: m.expect, detail });
    };
    const target = join(dir, m.file);
    const src = existsSync(target) ? readFileSync(target, "utf8") : null;
    const count = src === null ? 0 : src.split(m.find).length - 1;
    if (count !== 1) return finish("ANCHOR", `find string occurs ${count}x in ${m.file}`);
    writeFileSync(target, src.replace(m.find, () => m.replace));
    const child = spawn(process.execPath, [join(TESTS_DIR, "test_app.mjs"), "--json", m.owner], {
      env: { ...process.env, APP_ROOT: dir },
      windowsHide: true,
    });
    let out = "";
    child.stdout.on("data", (d) => { out += d; });
    child.stderr.on("data", (d) => { out += d; });
    const timer = setTimeout(() => child.kill(), 240000);
    child.on("close", () => {
      clearTimeout(timer);
      const line = out.split(/\r?\n/).reverse().find((l) => l.startsWith("APP_RESULT "));
      if (!line) return finish("CRASHED", out.trim().split(/\r?\n/).slice(-3).join(" | "));
      const res = JSON.parse(line.slice("APP_RESULT ".length));
      if (res.harnessError) return finish("CRASHED", res.harnessError.split("\n")[0]);
      const hit = res.results.find((r) => r.name === m.expect);
      if (!hit) {
        const broke = res.results.filter((r) => !r.ok && r.name.endsWith("module ran to the end")).map((r) => `${r.name}: ${r.detail}`);
        return finish("NO CHECK", `no check named "${m.expect}"${broke.length ? `; ${broke.join(" ; ")}` : ""}`);
      }
      if (!hit.ok) return finish("CAUGHT", hit.detail);
      const others = res.results.filter((r) => !r.ok).map((r) => r.name);
      return finish("MISSED", others.length ? `failed instead: ${others.slice(0, 3).join(" ; ")}` : "every check stayed green");
    });
  });
}

const queue = [...list];
const results = [];
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
  while (queue.length) {
    const m = queue.shift();
    let r = await runOne(m);
    if (r.state === "CRASHED" || r.state === "NO CHECK") {
      const first = r;
      r = await runOne(m);
      r.retried = true;
      r.detail = `${r.state === "CAUGHT" ? "caught on the retry" : `retry ${r.state}: ${r.detail}`}; first run ${first.state}: ${first.detail}`;
    }
    results.push(r);
    console.log(`${r.state.padEnd(8)}  ${r.id.padEnd(40)}  ${r.expect}${r.state === "CAUGHT" && !r.retried ? "" : `  —  ${r.detail}`}`);
  }
}));

const caught = results.filter((r) => r.state === "CAUGHT").length;
console.log(`caught ${caught}/${results.length}`);
process.exitCode = caught === results.length && results.length > 0 ? 0 : 1;
