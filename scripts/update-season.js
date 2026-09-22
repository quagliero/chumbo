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
 *   4. keep our own copy of any new team logo (`own-avatars`)
 *   5. rebuild the season's box scores and scoring timelines from nflverse's
 *      play-by-play (L1, L2), and report which weeks came out with them (L3)
 *
 * Writes the commit message, the box-score line and any weeks whose
 * play-by-play is overdue to $GITHUB_OUTPUT, and a summary to the run's page.
 *
 * Run: yarn update-season [--year 2026]
 */

import fs from "fs";
import path from "path";
import { execFileSync } from "child_process";
import { fileURLToPath } from "url";
import {
  completedWeek,
  describeCoverage,
  gamedayCoverage,
} from "./season-weeks.js";

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

// Our own copy of any team logo the league has not had before. The fetch has
// just written Sleeper's URLs back into users.json; for every logo already
// saved this only puts the local path back, so it changes nothing, and a new
// one is downloaded once. Not fatal, and neither is a logo that will not
// download: it keeps its Sleeper URL, which still works, until a run that can.
try {
  run("own-avatars.js");
} catch {
  console.warn("⚠️  Team logos not checked this run; the results still are.");
}

// L1/L2/L3: the week's box scores and timelines, from the NFL's play-by-play.
// Not fatal: they decorate the matchup pages, and a failed download or a
// season that does not rebuild cleanly leaves the committed box scores as they
// were rather than holding back the results. What it must not do is fail
// quietly — see the coverage report below.
const league = readJson(leaguePath);
const completed = completedWeek(league);

let built = true;
if (completed === 0) {
  // September, before the first week is scored: there is no play-by-play for
  // this season yet, and asking for it would be a 404 every run until kickoff.
  console.log("\n🏈 No week scored yet; not building box scores.");
} else {
  try {
    run("build-gamedays.js", "--year", String(year), "--download", "--refresh");
  } catch {
    built = false;
    console.warn("⚠️  Box scores not updated this run; the results still are.");
  }
}

const scored = league.settings?.last_scored_leg ?? 0;
const message =
  league.status === "complete"
    ? `${year} final data`
    : scored > scoredBefore
      ? `${year} week ${scored} data`
      : `${year} week ${league.settings?.leg ?? scored} mid-week update`;

/**
 * L3: which completed weeks came out with box scores, said out loud.
 *
 * The rebuild covers the whole season on every run, so a week the NFL had not
 * published by Tuesday morning arrives on Wednesday without anyone doing
 * anything. That self-healing is the reason a failure here is not fatal — and
 * the reason it needs reporting, because "it will fix itself next run" and
 * "it has been broken since October" look identical in a log.
 */
// The precomputed records (A4) are regenerated by the fetch above — which
// happens BEFORE the play-by-play is rebuilt, so any record that reads the
// week files (L2's comebacks, Monday nights, latest decisive plays) would be
// a week behind the data beside it. `precomputed.test.ts` compares the file
// with a live run of the registry and would fail the whole update over it, on
// the first Tuesday a new week's play-by-play landed. So: again, after.
if (built && completed > 0) {
  execFileSync("npx", ["vite-node", "scripts/build-aggregates.ts"], {
    stdio: "inherit",
    cwd: root,
  });
}

const weeksDir = path.join(yearDir, "weeks");
const onDisk = fs.existsSync(weeksDir)
  ? fs.readdirSync(weeksDir).flatMap((f) => f.match(/^(\d+)\.json$/)?.[1] ?? [])
  : [];
const coverage = gamedayCoverage(completed, onDisk);
const boxScores =
  describeCoverage(coverage) +
  (built ? "" : " The rebuild itself failed this run.");

console.log(`\n📝 ${message}`);
console.log(`🏈 ${boxScores}`);

// Two separate things the workflow escalates: a week that should have been
// built and was not, and a rebuild that fell over. Either one means the
// charts are not keeping up; neither one holds back the week's results.
if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(
    process.env.GITHUB_OUTPUT,
    [
      `message=${message}`,
      `box_scores=${boxScores}`,
      `behind=${coverage.behind.join(",")}`,
      `rebuild=${built ? "ok" : "failed"}`,
      "",
    ].join("\n")
  );
}
if (process.env.GITHUB_STEP_SUMMARY) {
  fs.appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `### ${message}\n\n${boxScores}\n`
  );
}
