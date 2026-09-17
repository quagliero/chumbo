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
// A2a (matchups and transactions loaded on demand) took the critical path from
// 1132 kB to 398 kB, so these came down with it. A2b (serving the season JSON
// as static files rather than JS modules) should take it lower again.
//
// Update deliberately, never to make a build pass.
const BUDGET_KB = {
  // Everything the browser must parse before the first render. Currently 347 --
  // 145 of it the small per-season files, 104 the player dictionary.
  initial: 370,
  // Every JS chunk together, including the lazily-loaded routes and the
  // per-season matchup (305) and transaction (243) chunks. Currently 966.
  //
  // Ratcheted from 1220 by D0. The plan's risk table says "D0 sets a +40 kB
  // budget; H4 enforces it in CI" -- but 1220 left 254 kB of headroom, so a
  // 200 kB charting library would have passed this check without a murmur. The
  // budget only enforces the decision if it is set where the decision is.
  // Raised from 1006 by G1. M6 added the command palette, the random-matchup
  // picker, "on this day" and table URL state, which took the figure to 1002 --
  // 4 kB of headroom, and the share cards still to come. The +25 below is
  // workstream G's allowance, the same deal workstream D got.
  total: 1030,
  // D0: workstream D gets 40 kB gzipped for seven charts. Hand-rolled SVG, with
  // visx or d3 only if something genuinely needs them -- and if one is ever
  // added, this is the line that fails. Chart code lives in its own chunk (see
  // vite.config.ts) so the figure means what it says.
  charts: 40,
  // G1's renderer plus G2's templates. Currently 0: nothing imports the
  // renderer yet, so it is tree-shaken out entirely. The line exists now so
  // that G2/G3/G4 land against a number rather than setting one afterwards.
  share: 25,
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

const charts = sizes
  .filter(({ file }) => /^charts-/.test(file))
  .reduce((sum, s) => sum + s.kb, 0);

const share = sizes
  .filter(({ file }) => /^share-/.test(file))
  .reduce((sum, s) => sum + s.kb, 0);

const fmt = (kb) => `${kb.toFixed(0)} kB`;
console.log("\nGzipped JavaScript");
for (const { file, kb } of sizes.slice(0, 6)) {
  console.log(`  ${fmt(kb).padStart(9)}  ${file}`);
}
if (sizes.length > 6) console.log(`  ${"…".padStart(9)}  +${sizes.length - 6} more`);
console.log(`  ${"—".repeat(9)}`);
console.log(`  ${fmt(initial).padStart(9)}  on the critical path  (budget ${BUDGET_KB.initial} kB)`);
console.log(`  ${fmt(total).padStart(9)}  total                 (budget ${BUDGET_KB.total} kB)`);
console.log(`  ${fmt(charts).padStart(9)}  charts (workstream D) (budget ${BUDGET_KB.charts} kB)`);
console.log(`  ${fmt(share).padStart(9)}  share  (workstream G) (budget ${BUDGET_KB.share} kB)\n`);

const failures = [];
if (initial > BUDGET_KB.initial)
  failures.push(`critical path ${fmt(initial)} exceeds ${BUDGET_KB.initial} kB`);
if (total > BUDGET_KB.total)
  failures.push(`total ${fmt(total)} exceeds ${BUDGET_KB.total} kB`);
if (charts > BUDGET_KB.charts)
  failures.push(`charts ${fmt(charts)} exceeds ${BUDGET_KB.charts} kB`);
if (share > BUDGET_KB.share)
  failures.push(`share ${fmt(share)} exceeds ${BUDGET_KB.share} kB`);

if (failures.length) {
  console.error("Bundle budget exceeded:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nIf this growth is deliberate, raise BUDGET_KB in scripts/check-bundle-size.js\nand explain why in the commit message.\n"
  );
  process.exit(1);
}
console.log("Within budget.\n");
