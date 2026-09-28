/**
 * meryem-app tests — test_app.mjs
 *
 * Runs every check module in tests/checks/ against the app in a real headless browser.
 *   node tests/test_app.mjs                every module
 *   node tests/test_app.mjs shell          only the named module(s), space-separated
 *   node tests/test_app.mjs --json         last line APP_RESULT {...}, read by mutate_app.mjs
 * APP_ROOT (env var) points the suite at another copy of the app — mutate_app.mjs uses it.
 * Exit 0 when every check passes, 1 when any fails, 2 when the harness itself fails.
 */
import { readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { APP_ROOT, TESTS_DIR, checker, launch } from "./harness.mjs";

const args = process.argv.slice(2);
const has = (flag) => args.includes(flag);
const only = args.filter((a) => !a.startsWith("--"));
const CHECKS = join(TESTS_DIR, "checks");

let modules = readdirSync(CHECKS).filter((f) => f.endsWith(".mjs")).map((f) => basename(f, ".mjs")).sort();
if (only.length) {
  const unknown = only.filter((m) => !modules.includes(m));
  if (unknown.length) {
    console.error(`unknown module: ${unknown.join(", ")}`);
    process.exit(2);
  }
  modules = modules.filter((m) => only.includes(m));
}

const { check, results } = checker();
let browser;
let harnessError = null;
try {
  browser = await launch();
  const { page } = browser;
  const ctx = { page, check, root: APP_ROOT };
  for (const name of modules) {
    const mod = await import(pathToFileURL(join(CHECKS, `${name}.mjs`)).href);
    try {
      await mod.run(ctx);
    } catch (e) {
      await check(`${name}: module ran to the end`, () => ({ ok: false, detail: String(e?.stack ?? e).split("\n").slice(0, 2).join(" ") }));
    }
  }
} catch (e) {
  harnessError = String(e?.stack ?? e);
  console.error(`HARNESS  ${harnessError.split("\n")[0]}`);
} finally {
  await browser?.close();
}

const failed = results.filter((r) => !r.ok);
console.log(harnessError ? "HARNESS FAILED" : failed.length ? `${failed.length} FAIL of ${results.length}` : `${results.length}/${results.length} PASS`);
if (has("--json")) console.log(`APP_RESULT ${JSON.stringify({ harnessError, results })}`);
process.exitCode = harnessError ? 2 : failed.length ? 1 : 0;
setTimeout(() => process.exit(), 3000).unref();
