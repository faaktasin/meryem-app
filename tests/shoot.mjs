/**
 * meryem-app tests — shoot.mjs
 *   node tests/shoot.mjs <absolute out dir> [module...]
 * Writes one 390x844 viewport PNG per `shots` entry declared by a check module, plus a `-full`
 * full-page variant of the same shot.
 */
import { mkdirSync, readdirSync } from "node:fs";
import { basename, join } from "node:path";
import { pathToFileURL } from "node:url";
import { TESTS_DIR, closeServer, launch, openApp } from "./harness.mjs";

const outDir = process.argv[2];
if (!outDir) {
  console.error("usage: node tests/shoot.mjs <absolute out dir> [module...]");
  process.exit(2);
}
const only = process.argv.slice(3);
mkdirSync(outDir, { recursive: true });

const CHECKS = join(TESTS_DIR, "checks");
let modules = readdirSync(CHECKS).filter((f) => f.endsWith(".mjs")).map((f) => basename(f, ".mjs")).sort();
if (only.length) modules = modules.filter((m) => only.includes(m));

const { page, close } = await launch();
try {
  for (const name of modules) {
    const mod = await import(pathToFileURL(join(CHECKS, `${name}.mjs`)).href);
    for (const shot of mod.shots || []) {
      await openApp(page, shot.open || {});
      if (shot.act) await shot.act(page);
      await page.eval(() => new Promise((r) => setTimeout(r, 150)));
      const file = join(outDir, `${name}-${shot.name}.png`);
      await page.shot(file, { fullPage: false });
      console.log(`shot  ${file}`);
      const fullFile = join(outDir, `${name}-${shot.name}-full.png`);
      await page.shot(fullFile, { fullPage: true });
      console.log(`shot  ${fullFile}`);
    }
  }
} finally {
  await close();
  await closeServer();
}
/* Same backstop as test_app.mjs: never hang after the work is done. */
setTimeout(() => process.exit(), 3000).unref();
