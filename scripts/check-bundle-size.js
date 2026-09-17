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
  // Everything the browser fetches before the first render, read from
  // index.html. Currently 77: the 4 kB entry and the 73 kB vendor chunk.
  //
  // Ratcheted from 370, which was measuring a different thing -- a name-based
  // guess that summed data + players + vendor + index to 344. Those data and
  // player chunks are NOT preloaded; they arrive with the first route. So the
  // old figure over-counted by ~267 kB while simultaneously missing the 24 kB
  // of charts that genuinely was preloaded.
  //
  // 120 leaves room for vendor to grow and still fails if either data (145) or
  // the player dictionary (104) is ever pulled onto the critical path again.
  initial: 120,
  // Every JS chunk together, including the lazily-loaded routes and the
  // per-season matchup (305) and transaction (243) chunks. Currently 966.
  //
  // Ratcheted from 1220 by D0. The plan's risk table says "D0 sets a +40 kB
  // budget; H4 enforces it in CI" -- but 1220 left 254 kB of headroom, so a
  // 200 kB charting library would have passed this check without a murmur. The
  // budget only enforces the decision if it is set where the decision is.
  // Every JS chunk together, including the lazily-loaded routes and the
  // per-season matchup (305) and transaction (243) chunks. Currently 1030.
  //
  // Raised from 1030 by D4, which landed the workstream's last chart and took
  // the figure to exactly the ceiling -- the next byte would have failed a
  // build for no reason anyone would have understood at the time. Moved here,
  // deliberately, while the cause is known.
  //
  // What this number is FOR: catching a dependency nobody meant to add. It is
  // not a per-feature allowance -- that experiment is what dragged the charts
  // onto the critical path (see vite.config.ts) -- and it is not the figure
  // that matters to a visitor, which is `initial` above. A 200 kB charting
  // library or a moment.js still cannot hide from it at 1080.
  total: 1080,
};

// D0's +40 kB chart allowance and G1's +25 kB share allowance are enforced by
// `initial` and `total` above rather than by per-chunk lines. The per-chunk
// version required a manual chunk per workstream, and that is precisely what
// dragged the charts onto the critical path -- see vite.config.ts. A charting
// library large enough to matter cannot hide from either number.

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

// What the browser actually fetches before the first render, read out of
// index.html rather than guessed from chunk names.
//
// This used to be a regex over the filenames — /^(data|players|vendor|index)-/
// — and that is how D0's mistake stayed invisible. Rollup had put a shared
// module inside the `charts` chunk, so every page statically depended on it and
// Vite added it to index.html's `modulepreload`; 24 kB downloaded on every
// visit while this script reported a critical path that excluded it. A budget
// that measures the wrong bytes is worse than no budget, because it is trusted.
//
// The entry script and every modulepreload in index.html IS the critical path,
// by definition. Nothing to keep in sync.
const html = fs.readFileSync(path.join(__dirname, "../dist/index.html"), "utf8");
const preloaded = [...html.matchAll(/(?:href|src)="\/assets\/([^"]+\.js)"/g)].map(
  (match) => match[1]
);
const missing = preloaded.filter((file) => !js.includes(file));
if (missing.length) {
  console.error(`index.html references files not in dist/assets: ${missing.join(", ")}`);
  process.exit(1);
}
const initial = preloaded.reduce((sum, file) => sum + gzipKb(file), 0);

const fmt = (kb) => `${kb.toFixed(0)} kB`;
console.log("\nGzipped JavaScript");
for (const { file, kb } of sizes.slice(0, 6)) {
  console.log(`  ${fmt(kb).padStart(9)}  ${file}`);
}
if (sizes.length > 6) console.log(`  ${"…".padStart(9)}  +${sizes.length - 6} more`);
console.log(`  ${"—".repeat(9)}`);
console.log(
  `  ${fmt(initial).padStart(9)}  on the critical path  (budget ${BUDGET_KB.initial} kB, ${preloaded.length} files from index.html)`
);
console.log(`  ${fmt(total).padStart(9)}  total                 (budget ${BUDGET_KB.total} kB)`);
console.log("");

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
