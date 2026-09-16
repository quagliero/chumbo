#!/usr/bin/env node
/**
 * Bundle budget (H4).
 *
 * The whole point of A1 and A2 is to get the payload down and keep it there.
 * Without a check, that erodes one convenient import at a time: before A1 the
 * site shipped 2.89 MB of gzipped JavaScript, and nobody noticed it happening.
 *
 * Fails the build when gzipped JS exceeds the budget below. If you have made a
 * deliberate change that legitimately costs more, move the number and say why
 * in the commit message -- that is the point, the number should only move on
 * purpose.
 *
 * Run: yarn check-size   (also runs as part of yarn build)
 */

import fs from "fs";
import path from "path";
import zlib from "zlib";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.join(__dirname, "../dist/assets");

// Gzipped kilobytes. Set just above the current figures so a regression is
// caught rather than absorbed, and RATCHETED DOWN as the payload improves --
// A2 (loading season data on demand) should take the critical path under
// 400 kB, at which point these numbers come down with it.
//
// Update deliberately, never to make a build pass.
const BUDGET_KB = {
  // Everything the browser must parse before the first render. Currently 1132.
  initial: 1200,
  // Every JS chunk together, including lazily-loaded routes. Currently 1202.
  total: 1260,
};

if (!fs.existsSync(dist)) {
  console.error("No dist/assets — run `yarn build` first.");
  process.exit(1);
}

const gzipKb = (file) =>
  zlib.gzipSync(fs.readFileSync(path.join(dist, file))).length / 1024;

const js = fs.readdirSync(dist).filter((f) => f.endsWith(".js"));
const sizes = js
  .map((file) => ({ file, kb: gzipKb(file) }))
  .sort((a, b) => b.kb - a.kb);

const total = sizes.reduce((sum, s) => sum + s.kb, 0);

// The data and vendor chunks are imported by every route, so they land on the
// critical path however the routes are split. Named lazily so that A2 moving
// data out of the bundle is reflected automatically.
const initial = sizes
  .filter(({ file }) => /^(data|players|vendor|index)-/.test(file))
  .reduce((sum, s) => sum + s.kb, 0);

const fmt = (kb) => `${kb.toFixed(0)} kB`;
console.log("\nGzipped JavaScript");
for (const { file, kb } of sizes.slice(0, 6)) {
  console.log(`  ${fmt(kb).padStart(9)}  ${file}`);
}
if (sizes.length > 6) console.log(`  ${"…".padStart(9)}  +${sizes.length - 6} more`);
console.log(`  ${"—".repeat(9)}`);
console.log(`  ${fmt(initial).padStart(9)}  on the critical path  (budget ${BUDGET_KB.initial} kB)`);
console.log(`  ${fmt(total).padStart(9)}  total                 (budget ${BUDGET_KB.total} kB)\n`);

const failures = [];
if (initial > BUDGET_KB.initial)
  failures.push(`critical path ${fmt(initial)} exceeds ${BUDGET_KB.initial} kB`);
if (total > BUDGET_KB.total)
  failures.push(`total ${fmt(total)} exceeds ${BUDGET_KB.total} kB`);

if (failures.length) {
  console.error("Bundle budget exceeded:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nIf this growth is deliberate, raise BUDGET_KB in scripts/check-bundle-size.js\nand explain why in the commit message.\n"
  );
  process.exit(1);
}
console.log("Within budget.\n");
