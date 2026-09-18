#!/usr/bin/env node

/**
 * Rebuild the player dictionary as one base file plus small per-season overlays.
 *
 *   src/data/players.json              base: the union of every dictionary we have
 *                                      ever held, newest attributes win, 8 fields,
 *                                      minified.
 *   src/data/<year>/players.delta.json { "<playerId>": { "t": team, "p": position } }
 *                                      only where that season differed from base.
 *
 * Sleeper's /players/nfl endpoint only ever returns *current* state, so a
 * year-specific snapshot is the only record of who played where that season.
 * Merging them all newest-wins would throw that away, hence the overlays.
 *
 * The script is idempotent. Each season's full team/position state is archived to
 * `scripts/data/season-players/<year>.json` — outside src/data, so it costs the
 * bundle nothing — and a season whose 6 MB raw dump has been deleted is restored
 * from that archive. Without it the newest season would be unrecoverable: its
 * overlay is empty (it *is* the base), so once a later season arrived and shifted
 * the base there would be nothing left saying where those players played.
 *
 * Run with: yarn build-players
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, "..");
const dataRoot = path.join(projectRoot, "src/data");

/** Positions this league actually fields. Everything else is dead weight. */
const VALID_POSITIONS = ["QB", "RB", "WR", "TE", "K", "DEF"];

/** The only fields the app reads. Everything else is dropped. */
const KEPT_FIELDS = [
  "player_id",
  "first_name",
  "last_name",
  "full_name",
  "position",
  "team",
  "number",
  "fantasy_positions",
];

/**
 * External ids worth preserving for A1d (joining nflverse historical rosters).
 * The raw dumps are the last place these exist, so they are dumped to a side file
 * before the trim.
 */
const EXTERNAL_ID_FIELDS = [
  "gsis_id",
  "espn_id",
  "pfr_id",
  "sportradar_id",
  "yahoo_id",
  "fantasy_data_id",
  "rotowire_id",
  "stats_id",
  "swish_id",
];

const ID_MAP_PATH = path.join(projectRoot, "scripts/data/player-id-map.json");
const ARCHIVE_DIR = path.join(projectRoot, "scripts/data/season-players");
/** Each season's teams from the play-by-play (L1), for seasons with no dump. */
const SEASON_TEAMS_DIR = path.join(projectRoot, "scripts/data/season-teams");
/** Seasons whose state came from SEASON_TEAMS_DIR: they get no archive. */
const derivedYears = new Set();

// --- helpers -------------------------------------------------------------------

/** YEARS is the single source of truth (H5); read it rather than restating it. */
function readYears() {
  const source = fs.readFileSync(
    path.join(projectRoot, "src/domain/constants.ts"),
    "utf8"
  );
  const match = source.match(/export const YEARS = \[([\s\S]*?)\]/);
  if (!match) {
    throw new Error("Could not find YEARS in src/domain/constants.ts");
  }
  const years = match[1]
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean)
    .map(Number);
  if (years.some(Number.isNaN)) {
    throw new Error("YEARS in src/domain/constants.ts is not a list of numbers");
  }
  return years.sort((a, b) => a - b);
}

function readJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value));
}

function isFantasyRelevant(player) {
  if (!player || typeof player !== "object") return false;
  return (
    (Array.isArray(player.fantasy_positions) &&
      player.fantasy_positions.some((pos) => VALID_POSITIONS.includes(pos))) ||
    VALID_POSITIONS.includes(player.position)
  );
}

/** Keep the 8 fields, drop anything null/undefined so the JSON stays small. */
function trim(player, playerId) {
  const out = {};
  for (const field of KEPT_FIELDS) {
    const value = player[field];
    if (value === null || value === undefined) continue;
    if (Array.isArray(value) && value.length === 0) continue;
    out[field] = value;
  }
  if (out.player_id === undefined) out.player_id = playerId;
  return out;
}

/**
 * `null` and `undefined` both mean "no team" but compare unequal, so without this
 * every free agent registers as a change and the overlays balloon — 3,432 bogus
 * entries instead of 405, measured.
 */
function normalise(value) {
  return value === undefined || value === "" ? null : value;
}

// --- collect the sources, oldest first -----------------------------------------

const years = readYears();
const externalIds = readJson(ID_MAP_PATH) ?? {};

/**
 * Harvest the external ids a raw dump carries, merging into whatever earlier runs
 * already captured. Newer dumps win per-field, but a field only present in an old
 * dump is never lost.
 */
function captureExternalIds(playerId, player) {
  const ids = {};
  for (const field of EXTERNAL_ID_FIELDS) {
    const value = player[field];
    if (value === null || value === undefined || value === "") continue;
    ids[field] = value;
  }
  if (Object.keys(ids).length === 0) return;

  const existing = externalIds[playerId];
  externalIds[playerId] = {
    ...existing,
    ...ids,
    full_name:
      player.full_name ||
      `${player.first_name || ""} ${player.last_name || ""}`.trim() ||
      existing?.full_name,
    position: player.position ?? existing?.position,
  };
}

console.log("Building player dictionary\n");

/**
 * The root file is the oldest snapshot we hold, and the only source carrying the
 * full 8 fields for players who have since left the league. It seeds the base.
 */
const rootRaw = readJson(path.join(dataRoot, "players.json"));
if (!rootRaw) {
  console.error("src/data/players.json is missing — nothing to build from.");
  process.exit(1);
}

const base = {};
let rootFiltered = 0;
for (const [playerId, player] of Object.entries(rootRaw)) {
  if (!isFantasyRelevant(player)) {
    rootFiltered++;
    continue;
  }
  captureExternalIds(playerId, player);
  base[playerId] = trim(player, playerId);
}
console.log(
  `  root   ${String(Object.keys(base).length).padStart(5)} kept, ${String(
    rootFiltered
  ).padStart(5)} filtered out`
);

/**
 * Each season's state, keyed by year: { [playerId]: { team, position } }.
 * Sourced from the raw dump when one is still on disk, otherwise from the archive.
 */
const seasonState = new Map();

for (const year of years) {
  const dump = readJson(path.join(dataRoot, String(year), "players.json"));

  if (dump) {
    const state = {};
    let filtered = 0;
    for (const [playerId, player] of Object.entries(dump)) {
      if (!isFantasyRelevant(player)) {
        filtered++;
        continue;
      }
      captureExternalIds(playerId, player);
      state[playerId] = {
        team: normalise(player.team),
        position: normalise(player.position),
      };
      // A raw dump carries every field, so it replaces the base record outright.
      base[playerId] = trim(player, playerId);
    }
    seasonState.set(year, state);
    console.log(
      `  ${year} ${String(Object.keys(state).length).padStart(5)} kept, ${String(
        filtered
      ).padStart(5)} filtered out`
    );
    continue;
  }

  const archived = readJson(path.join(ARCHIVE_DIR, `${year}.json`));
  if (!archived) {
    // L1: a season with neither a dump nor an archive still knows, from the
    // NFL's play-by-play, which team each of its rostered players played for
    // (`yarn build-gamedays` writes it). Only the team: the position stays
    // whatever that season's overlay already said (trim-picks salvaged a few)
    // or the base. And it never touches the base, which is today — a player
    // who retired in 2016 is not made a 2013 Jaguar again by it.
    const teams = readJson(path.join(SEASON_TEAMS_DIR, `${year}.json`));
    if (!teams) continue;
    const overlay =
      readJson(path.join(dataRoot, String(year), "players.delta.json")) ?? {};
    const state = {};
    for (const [playerId, teamCode] of Object.entries(teams)) {
      if (!base[playerId]) continue;
      state[playerId] = {
        team: normalise(teamCode),
        position: normalise(overlay[playerId]?.p ?? base[playerId].position),
      };
    }
    // Positions trim-picks salvaged for players the play-by-play did not see.
    for (const [playerId, entry] of Object.entries(overlay)) {
      if (state[playerId] || !base[playerId]) continue;
      state[playerId] = {
        team: normalise(entry.t ?? base[playerId].team),
        position: normalise(entry.p ?? base[playerId].position),
      };
    }
    seasonState.set(year, state);
    derivedYears.add(year);
    console.log(
      `  ${year} ${String(Object.keys(state).length).padStart(5)} from the play-by-play`
    );
    continue;
  }

  const state = {};
  for (const [playerId, entry] of Object.entries(archived)) {
    state[playerId] = { team: normalise(entry.t), position: normalise(entry.p) };
    // The archive only holds team and position; names and numbers already live in
    // the committed base. Patch those two fields, newest season wins.
    const baseEntry = base[playerId];
    if (!baseEntry) continue;
    if (state[playerId].team === null) delete baseEntry.team;
    else baseEntry.team = state[playerId].team;
    if (state[playerId].position !== null) {
      baseEntry.position = state[playerId].position;
    }
  }
  seasonState.set(year, state);
  console.log(
    `  ${year} ${String(Object.keys(state).length).padStart(5)} restored from archive`
  );
}

console.log(`\nBase: ${Object.keys(base).length} unique players`);

// --- write the base dictionary --------------------------------------------------

// Re-emit every record in KEPT_FIELDS order so the bytes are deterministic
// regardless of whether a season came from a raw dump or from the archive.
const orderedBase = {};
for (const [playerId, record] of Object.entries(base)) {
  orderedBase[playerId] = trim(record, playerId);
}

const basePath = path.join(dataRoot, "players.json");
writeJson(basePath, orderedBase);
const baseSize = fs.statSync(basePath).size;
console.log(`  src/data/players.json  ${(baseSize / 1024).toFixed(0)} KB`);

// --- write the per-season overlays and archives ---------------------------------

console.log("\nOverlays (only where the season differed from base):");

let overlayTotal = 0;

for (const year of years) {
  const state = seasonState.get(year);
  const overlayPath = path.join(dataRoot, String(year), "players.delta.json");

  // No dictionary and no archive: the season resolves to base, which is exactly
  // today's behaviour. Nothing to write, and nothing to clean up.
  if (!state) continue;

  // The archive is the durable, un-bundled record of this season's state.
  const archive = {};
  for (const [playerId, entry] of Object.entries(state)) {
    archive[playerId] = { t: entry.team, p: entry.position };
  }
  // A derived season is not an archive: it knows teams for rostered players
  // only, and an archive is read back as the season's whole truth.
  if (!derivedYears.has(year)) {
    writeJson(path.join(ARCHIVE_DIR, `${year}.json`), archive);
  }

  const overlay = {};
  let teamChanges = 0;
  let positionChanges = 0;

  for (const [playerId, seasonEntry] of Object.entries(state)) {
    const baseEntry = base[playerId];
    if (!baseEntry) continue;

    const entry = {};
    if (normalise(seasonEntry.team) !== normalise(baseEntry.team)) {
      entry.t = seasonEntry.team;
      teamChanges++;
    }
    if (normalise(seasonEntry.position) !== normalise(baseEntry.position)) {
      entry.p = seasonEntry.position;
      positionChanges++;
    }
    if (Object.keys(entry).length > 0) overlay[playerId] = entry;
  }

  const count = Object.keys(overlay).length;
  if (count === 0) {
    if (fs.existsSync(overlayPath)) fs.rmSync(overlayPath);
    console.log(`  ${year}     0 entries  (identical to base)`);
    continue;
  }

  writeJson(overlayPath, overlay);
  const size = fs.statSync(overlayPath).size;
  overlayTotal += size;
  console.log(
    `  ${year}  ${String(count).padStart(4)} entries  (${teamChanges} team, ${positionChanges} position)  ${(
      size / 1024
    ).toFixed(1)} KB`
  );
}

// --- write the external id side file --------------------------------------------

writeJson(ID_MAP_PATH, externalIds);
const gsisCount = Object.values(externalIds).filter((e) => e.gsis_id).length;
console.log(
  `\nExternal ids: ${Object.keys(externalIds).length} players, ${gsisCount} with a gsis_id` +
    `\n  -> scripts/data/player-id-map.json (for A1d's nflverse join)`
);

console.log(
  `\nShipped to the browser: ${((baseSize + overlayTotal) / 1024).toFixed(0)} KB ` +
    `(${(baseSize / 1024).toFixed(0)} KB base + ${(overlayTotal / 1024).toFixed(0)} KB overlays)`
);

const staleDumps = years
  .map((year) => path.join(dataRoot, String(year), "players.json"))
  .filter((file) => fs.existsSync(file));
if (staleDumps.length > 0) {
  console.log(
    "\nThese per-season dumps are now folded into the base, the overlays and the\n" +
      "archive, and can be deleted:\n" +
      staleDumps.map((file) => `  ${path.relative(projectRoot, file)}`).join("\n")
  );
}
