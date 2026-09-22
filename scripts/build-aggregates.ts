/**
 * Precompute the stat registry at build time (A4).
 *
 * Every stat in the registry is a question about all of history, so answering
 * one in the browser means first downloading all of history: 305 kB gzip of
 * matchups and 243 kB of transactions, to produce a few kB of answer. This
 * runs the same registry at build time and writes the answers to
 * `public/data/all-time.json`, so a records or Explorer page can render from a
 * small file instead of the whole archive.
 *
 * It runs through vite-node rather than plain node, so it uses the real
 * TypeScript registry and the real `@/data` loader — there is no second
 * implementation to drift.
 *
 *   yarn build-aggregates [--limit N] [--check]
 *
 * `--check` writes nothing and exits non-zero if a committed file is stale,
 * for CI.
 *
 * It writes one more thing for the same reason, `src/data/legacyPlayers.generated.ts`
 * — see the block at the bottom.
 */
import fs from "node:fs";
import path from "node:path";
import { loadAllSeasons, seasons } from "@/data";
import { deriveLegacyPlayers } from "@/data/legacyPlayers";
import {
  allStats,
  computeStat,
  caveatSeasons,
  excludedSeasons,
} from "@/utils/stats";
import { loadTimelines } from "@/utils/stats/loadTimelines";
import {
  PRECOMPUTED_VERSION,
  type PrecomputedStat,
  type PrecomputedStats,
} from "@/utils/stats/precomputed";
import { buildSeasonTops } from "@/utils/stats/seasonTops";

const arg = (flag: string, fallback: number) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? fallback : Number(process.argv[i + 1]);
};

/**
 * How many ranked entries to keep per stat.
 *
 * The full lists are far longer than anything is going to show — every draft
 * pick ever made is 2,460 entries — and the whole point is to ship a small
 * file. Each stat records its true `total`, so a page can still say "of 2,460"
 * honestly, and anything that genuinely needs the tail can compute it from the
 * season data it would have had to load anyway.
 */
const LIMIT = arg("--limit", 25);
const CHECK = process.argv.includes("--check");

const OUT = path.resolve(process.cwd(), "public/data/all-time.json");

await loadAllSeasons();
// The L2 records read the weeks' play-by-play timelines, which are not season
// data and are never loaded by a page. Here, all of them at once.
await loadTimelines();

const years = Object.keys(seasons)
  .map(Number)
  .sort((a, b) => a - b);

const stats: PrecomputedStat[] = allStats().map((definition) => {
  const all = computeStat(definition.id);
  return {
    id: definition.id,
    label: definition.label,
    description: definition.description,
    scope: definition.scope,
    format: definition.format,
    direction: definition.direction,
    /** Seasons this stat cannot see at all. */
    excluded: excludedSeasons(definition),
    /** Seasons it includes, but whose per-player data is reconstructed. */
    caveat: caveatSeasons(definition),
    /** How many entries the stat actually has, before the cap below. */
    total: all.length,
    // Every entry for a stat whose page chooses by the reader's date.
    entries: definition.precomputeAll ? all : all.slice(0, LIMIT),
  };
});

const payload: PrecomputedStats = {
  version: PRECOMPUTED_VERSION,
  generatedAt: new Date().toISOString(),
  years,
  limit: LIMIT,
  stats,
};

// Stable enough to diff: only `generatedAt` moves when nothing else has.
const serialise = (value: PrecomputedStats) => JSON.stringify(value, null, 2) + "\n";
const withoutTimestamp = (text: string) =>
  text.replace(/^\s*"generatedAt".*$/m, "");

const next = serialise(payload);
const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8") : null;
const unchanged =
  previous !== null && withoutTimestamp(previous) === withoutTimestamp(next);

/* ------------------------------------------------------------------ *
 * Each record's top three in every season (`records-by-season.json`).
 *
 * The record pages show the all-time list and then season by season, and a
 * season's best is mostly not in the all-time top 25 — so it is worked out
 * here, from the full list, into a file only those pages fetch.
 * ------------------------------------------------------------------ */
const SEASON_OUT = path.resolve(process.cwd(), "public/data/records-by-season.json");

const seasonTops = buildSeasonTops();
const seasonNext = JSON.stringify(seasonTops, null, 2) + "\n";
const seasonUnchanged =
  fs.existsSync(SEASON_OUT) && fs.readFileSync(SEASON_OUT, "utf8") === seasonNext;
if (!CHECK && !seasonUnchanged) {
  fs.writeFileSync(SEASON_OUT, seasonNext);
  console.log(
    `records-by-season.json  ${Object.keys(seasonTops.stats).length} stats  ` +
      `${(Buffer.byteLength(seasonNext) / 1024).toFixed(0)} kB`
  );
}

/* ------------------------------------------------------------------ *
 * The legacy string-named players.
 *
 * Same argument as the stats above, at 1/20th the size: the pre-Sleeper
 * seasons stored some players as a name rather than an id, and the only
 * record of them is the matchup files. The players page used to sweep
 * `seasons[].matchups` for them, which after A2a meant either downloading
 * the whole archive to find thirty-nine names or — as it actually
 * behaved — searching only the seasons the visitor happened to have
 * opened. It is a static fact about a closed archive, so derive it here.
 * ------------------------------------------------------------------ */
const LEGACY_OUT = path.resolve(process.cwd(), "src/data/legacyPlayers.generated.ts");

const legacy = deriveLegacyPlayers(
  Object.values(seasons).flatMap((season) =>
    Object.values(season.matchups ?? {})
  )
);

const legacyModule =
  `// GENERATED by \`yarn build-aggregates\` — do not edit by hand.\n` +
  `// The legacy string-named players, derived from every season's matchups.\n` +
  `// See \`src/data/legacyPlayers.ts\` for what they are and why this is a file.\n` +
  `export const legacyPlayerPositions: Record<string, string> = ${JSON.stringify(
    legacy,
    null,
    2
  )};\n`;

const legacyPrevious = fs.existsSync(LEGACY_OUT)
  ? fs.readFileSync(LEGACY_OUT, "utf8")
  : null;
const legacyUnchanged = legacyPrevious === legacyModule;

if (!CHECK && !legacyUnchanged) {
  fs.writeFileSync(LEGACY_OUT, legacyModule);
  console.log(
    `legacyPlayers.generated.ts  ${Object.keys(legacy).length} names  ` +
      `${Buffer.byteLength(legacyModule)} bytes`
  );
}

if (CHECK) {
  if (!legacyUnchanged) {
    console.error(
      "src/data/legacyPlayers.generated.ts is stale — run `yarn build-aggregates`."
    );
    process.exit(1);
  }
  if (!unchanged) {
    console.error("public/data/all-time.json is stale — run `yarn build-aggregates`.");
    process.exit(1);
  }
  if (!seasonUnchanged) {
    console.error("public/data/records-by-season.json is stale — run `yarn build-aggregates`.");
    process.exit(1);
  }
  console.log("all-time.json is up to date.");
} else if (unchanged) {
  // Don't rewrite just to move the timestamp; it makes every build a diff.
  console.log(`all-time.json unchanged (${stats.length} stats, ${years.length} seasons).`);
} else {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, next);
  const kb = (Buffer.byteLength(next) / 1024).toFixed(0);
  console.log(
    `all-time.json  ${stats.length} stats  ${years.length} seasons  ` +
      `top ${LIMIT} each  ${kb} kB`
  );
}
