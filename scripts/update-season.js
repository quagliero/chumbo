#!/usr/bin/env node
/**
 * The automatic weekly update (J1): everything a person used to run by hand
 * after Monday Night Football, in order. `.github/workflows/update-season.yml`
 * runs it, then `yarn test:run` and `yarn build`, and commits only if both pass.
 *
 *   1. fetch every week Sleeper has scored (`fetch-sleeper-data --completed`)
 *   2. trim picks.json, which Sleeper sends fat on every fetch
 *   3. refresh the player dictionary, but only if a player on a roster, in a
 *      lineup or in a transaction is missing from it — a practice-squad
 *      call-up picked up on waivers would otherwise show as a number
 *   4. rebuild the season's box scores from nflverse's play-by-play (L1)
 *
 * Writes the commit message to $GITHUB_OUTPUT when there is one.
 *
 * Run: yarn update-season [--year 2026]
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(root, "src/data");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const run = (script, ...args) =>
  execFileSync("node", [path.join("scripts", script), ...args], {
    stdio: "inherit",
    cwd: root,
  });

const yearArg = process.argv.indexOf("--year");
const year =
  yearArg > -1
    ? Number(process.argv[yearArg + 1])
    : Math.max(
        ...fs
          .readdirSync(dataRoot)
          .filter((dir) => /^\d{4}$/.test(dir))
          .map(Number)
      );
const yearDir = path.join(dataRoot, String(year));
const leaguePath = path.join(yearDir, "league.json");
const scoredBefore = readJson(leaguePath).settings?.last_scored_leg ?? 0;

run("fetch-sleeper-data.js", "--year", String(year), "--completed");
run("trim-picks.js");

/** Every player id the season's files mention that the dictionary lacks. */
function missingPlayers() {
  const players = readJson(path.join(dataRoot, "players.json"));
  const ids = new Set();
  const addAll = (list) => list?.forEach((id) => ids.add(String(id)));

  for (const roster of readJson(path.join(yearDir, "rosters.json"))) {
    addAll(roster.players);
    addAll(roster.reserve);
    addAll(roster.taxi);
  }
  for (const pick of readJson(path.join(yearDir, "picks.json"))) {
    ids.add(String(pick.player_id));
  }
  for (const dir of ["matchups", "transactions"]) {
    const full = path.join(yearDir, dir);
    if (!fs.existsSync(full)) continue;
    for (const file of fs.readdirSync(full)) {
      for (const entry of readJson(path.join(full, file))) {
        addAll(entry.players);
        addAll(Object.keys(entry.adds ?? {}));
        addAll(Object.keys(entry.drops ?? {}));
      }
    }
  }
  // "0" is an empty lineup slot.
  return [...ids].filter((id) => id !== "0" && !(id in players));
}

const missing = missingPlayers();
if (missing.length > 0) {
  console.log(
    `\n👤 ${missing.length} player(s) not in the dictionary (${missing.join(
      ", "
    )}); refreshing it from Sleeper...`
  );
  const response = await fetch("https://api.sleeper.app/v1/players/nfl");
  if (!response.ok) {
    throw new Error(`Sleeper /players/nfl: HTTP ${response.status}`);
  }
  // build-players folds the dump into the base and this season's overlay; the
  // raw dump is ~6 MB and never committed.
  const dump = path.join(yearDir, "players.json");
  fs.writeFileSync(dump, await response.text());
  try {
    run("build-players.js");
  } finally {
    fs.rmSync(dump, { force: true });
  }
  const still = missingPlayers();
  if (still.length > 0) {
    // Not fatal: the page falls back to the id, which is what it did before.
    console.warn(`⚠️  Still not in the dictionary: ${still.join(", ")}`);
  }
}

// L1: the week's box scores, from the NFL's play-by-play. Not fatal: they
// decorate the matchup pages, and a failed download or a season that does not
// rebuild cleanly leaves the committed box scores as they were rather than
// holding back the results.
try {
  run("build-gamedays.js", "--year", String(year), "--download", "--refresh");
} catch {
  console.warn("⚠️  Box scores not updated this run; the results still are.");
}

const league = readJson(leaguePath);
const scored = league.settings?.last_scored_leg ?? 0;
const message =
  league.status === "complete"
    ? `${year} final data`
    : scored > scoredBefore
      ? `${year} week ${scored} data`
      : `${year} week ${league.settings?.leg ?? scored} mid-week update`;

console.log(`\n📝 ${message}`);
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `message=${message}\n`);
}
