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
// 1132 kB to 398 kB, so these came down with it. A2b (the rest of the season
// data on demand) did not move `initial`: that data was never preloaded, it
// arrived with the first route. What A2b changed is that route's download --
// 668 kB to 228 kB for `/` -- which `src/data/__tests__/routeLoads.test.ts`
// pins down part by part, since no size budget can see it.
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
  // 120 leaves room for vendor to grow and still fails if the player
  // dictionary (108) is ever pulled onto the critical path again. A single
  // season's data is smaller than the headroom, so that has a check of its
  // own, by name, below.
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
  //
  // Currently 1056. A2b added 12 kB, knowingly and not moved for: the season
  // base data compresses 7 kB worse as thirty per-season chunks than as one,
  // and the dictionary 4 kB worse as a JSON.parse string (see vite.config.ts).
  //
  // Replaced by J1 with the three below. `total` counted every season's data,
  // which grows by design: the automatic update adds a week of the live season
  // two or three times a week, a full season is ~72 kB, and at 1060 today the
  // build would have started failing around week 8 -- over data that was
  // meant to arrive, which is exactly the failure a budget must not have.
  // Split, each number measures one thing and can stay tight:
  //
  // Every chunk that is code: everything but season data and the dictionary.
  // This is the one that catches a dependency nobody meant to add.
  //
  // 280 -> 300 on 2026-09-22, decided with the commissioner: Round 3's
  // features (J2/K1/J3, L1/L2's timelines, charts and records, the Draft
  // explorer) took it from 254 to 282, all of it page code loaded when a page
  // is opened — the `initial` budget, which every visit pays, is untouched at
  // 78 of 120. 300 leaves room for Chumbo Wrapped; it is not headroom for a
  // dependency, which is still what this number is here to catch.
  code: 300,
  // The player dictionary. Currently 109; it grows by a handful of players
  // when the update refreshes it for a waiver pickup it did not know.
  players: 125,
  // Each season's four chunks together. The biggest is 2020 at 85; a whole
  // Sleeper season is 67-85. Catches a season that ships something it should
  // not -- picks.json untrimmed, a raw 6 MB players dump left in its folder.
  season: 100,
  // One week's box scores and scoring timelines (L1, L2), fetched by that
  // week's matchup pages alone. About 10 kB each — the timelines are most of
  // it — and ~230 of them, so each is held to a ceiling rather than counted
  // in a total that grows with every week played.
  week: 15,
};

const SEASON_CHUNK = /^(core|draft|matchups|transactions)-(\d{4})-/;
const PLAYERS_CHUNK = /^players-/;
const WEEK_CHUNK = /^week-(\d{4})-(\d+)-/;

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
const sum = (list) => list.reduce((acc, s) => acc + s.kb, 0);
const code = sum(
  sizes.filter(
    ({ file }) =>
      !SEASON_CHUNK.test(file) &&
      !PLAYERS_CHUNK.test(file) &&
      !WEEK_CHUNK.test(file)
  )
);
const weeks = sizes.filter(({ file }) => WEEK_CHUNK.test(file));
const [biggestWeek] = [...weeks].sort((a, b) => b.kb - a.kb);
const players = sum(sizes.filter(({ file }) => PLAYERS_CHUNK.test(file)));
const bySeason = new Map();
for (const { file, kb } of sizes) {
  const year = SEASON_CHUNK.exec(file)?.[2];
  if (year) bySeason.set(year, (bySeason.get(year) ?? 0) + kb);
}
const [biggestYear, biggestSeason] = [...bySeason].sort((a, b) => b[1] - a[1])[0] ?? [
  "-",
  0,
];

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
console.log(`  ${fmt(code).padStart(9)}  code                  (budget ${BUDGET_KB.code} kB)`);
console.log(`  ${fmt(players).padStart(9)}  player dictionary     (budget ${BUDGET_KB.players} kB)`);
console.log(
  `  ${fmt(biggestSeason).padStart(9)}  largest season, ${biggestYear}  (budget ${BUDGET_KB.season} kB each, ${bySeason.size} seasons)`
);
console.log(
  `  ${fmt(biggestWeek?.kb ?? 0).padStart(9)}  largest week of play-by-play  (budget ${BUDGET_KB.week} kB each, ${weeks.length} weeks)`
);
console.log(`  ${fmt(total).padStart(9)}  total, for the record`);
console.log("");

const failures = [];
if (initial > BUDGET_KB.initial)
  failures.push(`critical path ${fmt(initial)} exceeds ${BUDGET_KB.initial} kB`);
if (code > BUDGET_KB.code)
  failures.push(`code ${fmt(code)} exceeds ${BUDGET_KB.code} kB`);
if (players > BUDGET_KB.players)
  failures.push(`player dictionary ${fmt(players)} exceeds ${BUDGET_KB.players} kB`);
for (const { file, kb } of weeks) {
  if (kb > BUDGET_KB.week)
    failures.push(`${file} ${fmt(kb)} exceeds ${BUDGET_KB.week} kB`);
}
for (const [year, kb] of bySeason) {
  if (kb > BUDGET_KB.season)
    failures.push(`${year}'s season data ${fmt(kb)} exceeds ${BUDGET_KB.season} kB`);
}

// Season data is loaded per season, on demand (A2b), and must never be on the
// critical path. One season's chunk is 2-20 kB -- inside the headroom above --
// so the kB check alone would let one slip in. The names come from
// manualChunks in vite.config.ts.
const preloadedSeasons = preloaded.filter((file) => SEASON_CHUNK.test(file));
if (preloadedSeasons.length)
  failures.push(
    `season data on the critical path: ${preloadedSeasons.join(", ")}`
  );


if (failures.length) {
  console.error("Bundle budget exceeded:");
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    "\nIf this growth is deliberate, raise BUDGET_KB in scripts/check-bundle-size.js\nand explain why in the commit message.\n"
  );
  process.exit(1);
}
console.log("Within budget.\n");
