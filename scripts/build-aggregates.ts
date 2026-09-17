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
 * `--check` writes nothing and exits non-zero if the committed file is stale,
 * for CI.
 */
import fs from "node:fs";
import path from "node:path";
import { loadAllSeasons, seasons } from "@/data";
import {
  allStats,
  computeStat,
  caveatSeasons,
  excludedSeasons,
} from "@/utils/stats";
import {
  PRECOMPUTED_VERSION,
  type PrecomputedStat,
  type PrecomputedStats,
} from "@/utils/stats/precomputed";

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
    entries: all.slice(0, LIMIT),
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

if (CHECK) {
  if (!unchanged) {
    console.error("public/data/all-time.json is stale — run `yarn build-aggregates`.");
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
