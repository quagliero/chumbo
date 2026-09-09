#!/usr/bin/env node
/**
 * Computes head-to-head preview stats for every matchup in a given
 * year/week, from the committed Sleeper JSON data directly (no build step,
 * no live site involved).
 *
 * Usage:
 *   node scripts/generate-h2h-preview.mjs --year 2026 --week 1
 *
 * Outputs a JSON array (one entry per matchup pairing) with the all-time
 * regular-season head-to-head record, notable games (biggest blowout,
 * closest game, best individual scores), current streak, notable individual
 * player performances from those games, the full game log (for rendering a
 * "previous matchups" table), and any meaningful playoff meetings between
 * the two managers. This is the deterministic "numbers" layer — the actual
 * WhatsApp blurb text is meant to be written from this output, not by this
 * script.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "src", "data");

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
function parseArgs() {
  const args = process.argv.slice(2);
  const out = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--year") out.year = parseInt(args[++i], 10);
    if (args[i] === "--week") out.week = parseInt(args[++i], 10);
  }
  if (!out.year || !out.week) {
    console.error(
      "Usage: node scripts/generate-h2h-preview.mjs --year <year> --week <week>"
    );
    process.exit(1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Data loading (mirrors src/data/index.ts's discovery, but reads JSON
// straight off disk since this runs outside the Vite/TS build)
// ---------------------------------------------------------------------------
function readJson(p) {
  if (!fs.existsSync(p)) return undefined;
  return JSON.parse(fs.readFileSync(p, "utf8"));
}

function getYears() {
  return fs
    .readdirSync(DATA_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory() && /^\d{4}$/.test(d.name))
    .map((d) => parseInt(d.name, 10))
    .sort((a, b) => a - b);
}

const seasonCache = new Map();
function loadSeason(year) {
  if (seasonCache.has(year)) return seasonCache.get(year);

  const dir = path.join(DATA_DIR, String(year));
  const league = readJson(path.join(dir, "league.json"));
  const rosters = readJson(path.join(dir, "rosters.json"));
  const winnersBracket = readJson(path.join(dir, "winners_bracket.json"));

  const matchups = {};
  const matchupsDir = path.join(dir, "matchups");
  if (fs.existsSync(matchupsDir)) {
    for (const file of fs.readdirSync(matchupsDir)) {
      const match = file.match(/^(\d+)\.json$/);
      if (!match) continue;
      const week = parseInt(match[1], 10);
      if (week >= 1 && week <= 17) {
        matchups[week] = readJson(path.join(matchupsDir, file));
      }
    }
  }

  const season = { league, rosters, matchups, winnersBracket };
  seasonCache.set(year, season);
  return season;
}

const managers = readJson(path.join(DATA_DIR, "managers.json"));
const managerBySleeperId = new Map(managers.map((m) => [m.sleeper?.id, m]));

// Player dictionary — mirrors src/data/index.ts's getPlayer(): prefer a
// year-specific src/data/<year>/players.json (only 2025 has one currently),
// fall back to the root players.json, and finally fall back to treating the
// "id" itself as a literal name (legacy seasons stored some starters as
// plain name strings, e.g. "Danario Alexander").
const rootPlayers = readJson(path.join(DATA_DIR, "players.json")) || {};
const yearPlayersCache = new Map();
function getYearPlayers(year) {
  if (yearPlayersCache.has(year)) return yearPlayersCache.get(year);
  const data = readJson(path.join(DATA_DIR, String(year), "players.json"));
  yearPlayersCache.set(year, data);
  return data;
}

function getPlayerName(playerId, year) {
  const idStr = String(playerId);

  const yearPlayers = getYearPlayers(year);
  if (yearPlayers?.[idStr]) {
    const p = yearPlayers[idStr];
    return `${p.first_name} ${p.last_name}`.trim();
  }

  if (rootPlayers[idStr]) {
    const p = rootPlayers[idStr];
    return `${p.first_name} ${p.last_name}`.trim();
  }

  // Legacy string-named starter (no numeric player_id on record)
  if (typeof playerId === "string" && playerId.includes(" ")) {
    return playerId;
  }

  return idStr;
}

// ---------------------------------------------------------------------------
// Week-completion / playoff logic — mirrors src/utils/weekUtils.ts and
// src/utils/playoffUtils.ts (post-fix: leg === 1 with no last_scored_leg
// means 0 completed weeks, not "everything's done")
// ---------------------------------------------------------------------------
function getCompletedWeek(league) {
  if (!league) return null;
  if (!league.settings?.leg) return null;
  const lastScoredLeg = league.settings.last_scored_leg;
  const currentLeg = league.settings.leg;
  if (lastScoredLeg) return lastScoredLeg;
  return currentLeg - 1;
}

function isWeekCompleted(week, league) {
  const completedWeek = getCompletedWeek(league);
  if (completedWeek === null) return league !== undefined;
  return week <= completedWeek;
}

function getPlayoffWeekStart(league) {
  return league?.settings?.playoff_week_start || 15;
}

function determineResult(pointsFor, pointsAgainst) {
  if (pointsFor > pointsAgainst) return "W";
  if (pointsFor < pointsAgainst) return "L";
  return "T";
}

// ---------------------------------------------------------------------------
// Core: find every meeting between two owner_ids across all seasons, up to
// (but not including) a given year/week cutoff
// ---------------------------------------------------------------------------
function findMeetings(ownerIdA, ownerIdB, years, cutoffYear, cutoffWeek) {
  const regularSeason = [];
  const playoffs = [];

  years.forEach((year) => {
    if (year > cutoffYear) return;

    const season = loadSeason(year);
    if (!season.league || !season.rosters || !season.matchups) return;

    const rosterA = season.rosters.find((r) => r.owner_id === ownerIdA);
    const rosterB = season.rosters.find((r) => r.owner_id === ownerIdB);
    if (!rosterA || !rosterB) return;

    const playoffWeekStart = getPlayoffWeekStart(season.league);

    Object.entries(season.matchups).forEach(([weekStr, weekMatchups]) => {
      const week = parseInt(weekStr, 10);
      if (!weekMatchups) return;

      // Never include the game we're previewing (or anything after it)
      if (year === cutoffYear && week >= cutoffWeek) return;

      if (!isWeekCompleted(week, season.league)) return;

      const matchA = weekMatchups.find((m) => m.roster_id === rosterA.roster_id);
      const matchB = weekMatchups.find((m) => m.roster_id === rosterB.roster_id);
      if (!matchA || !matchB) return;
      if (matchA.matchup_id === null || matchA.matchup_id !== matchB.matchup_id)
        return;

      const isPlayoff = week >= playoffWeekStart;
      const game = {
        year,
        week,
        pointsA: matchA.points,
        pointsB: matchB.points,
        result: determineResult(matchA.points, matchB.points), // from A's perspective
        isPlayoff,
        // Kept for individual-performance extraction; stripped before the
        // game log is included in the final output (see toGameLogEntry).
        startersA: matchA.starters,
        startersPointsA: matchA.starters_points,
        startersB: matchB.starters,
        startersPointsB: matchB.starters_points,
      };

      if (!isPlayoff) {
        regularSeason.push(game);
        return;
      }

      // Only count "meaningful" playoff meetings (elimination/championship,
      // not consolation brackets) — same rule H2HContent.tsx uses.
      const bracketMatch = (season.winnersBracket || []).find(
        (bm) =>
          (bm.t1 === rosterA.roster_id || bm.t2 === rosterA.roster_id) &&
          (bm.t1 === rosterB.roster_id || bm.t2 === rosterB.roster_id)
      );
      const isMeaningful =
        bracketMatch && (!bracketMatch.p || bracketMatch.p === 1);
      if (isMeaningful) playoffs.push(game);
    });
  });

  regularSeason.sort((a, b) => (a.year - b.year) || (a.week - b.week));
  playoffs.sort((a, b) => (a.year - b.year) || (a.week - b.week));
  return { regularSeason, playoffs };
}

function summarize(games) {
  if (games.length === 0) return null;

  const winsA = games.filter((g) => g.result === "W").length;
  const winsB = games.filter((g) => g.result === "L").length;
  const ties = games.filter((g) => g.result === "T").length;
  const avgA = games.reduce((s, g) => s + g.pointsA, 0) / games.length;
  const avgB = games.reduce((s, g) => s + g.pointsB, 0) / games.length;

  const byMargin = [...games].sort(
    (a, b) => Math.abs(b.pointsA - b.pointsB) - Math.abs(a.pointsA - a.pointsB)
  );
  const biggestBlowout = byMargin[0];
  const closestGame = byMargin[byMargin.length - 1];

  const highestCombined = [...games].sort(
    (a, b) => b.pointsA + b.pointsB - (a.pointsA + a.pointsB)
  )[0];

  const bestA = [...games].sort((a, b) => b.pointsA - a.pointsA)[0];
  const bestB = [...games].sort((a, b) => b.pointsB - a.pointsB)[0];

  // Current streak, most recent game first
  const recent = [...games].reverse();
  let streakType = recent[0].result;
  let streakCount = 0;
  for (const g of recent) {
    if (g.result === streakType) streakCount++;
    else break;
  }

  return {
    gamesPlayed: games.length,
    recordFromA: { wins: winsA, losses: winsB, ties },
    avgPointsA: round2(avgA),
    avgPointsB: round2(avgB),
    biggestBlowout: toGameLogEntry(biggestBlowout),
    closestGame: toGameLogEntry(closestGame),
    highestCombinedScore: toGameLogEntry(highestCombined),
    bestGameByA: toGameLogEntry(bestA),
    bestGameByB: toGameLogEntry(bestB),
    currentStreak: { result: streakType, count: streakCount }, // from A's perspective
    lastThree: recent.slice(0, 3).map(toGameLogEntry),
  };
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Notable individual player performances across a set of games (regular
// season + meaningful playoffs both work here) — mirrors the "Best
// Performances" logic in H2HContent.tsx: best single game per player,
// deduplicated so the same guy's monster game doesn't crowd out everyone
// else's, sorted by score.
// ---------------------------------------------------------------------------
function extractPerformances(games, topN = 3) {
  const performances = { A: [], B: [] };

  games.forEach((game) => {
    ["A", "B"].forEach((side) => {
      const starters = side === "A" ? game.startersA : game.startersB;
      const startersPoints =
        side === "A" ? game.startersPointsA : game.startersPointsB;
      if (!starters || !startersPoints) return;

      starters.forEach((playerId, index) => {
        if (playerId === "0" || playerId === 0) return; // empty slot
        const points = startersPoints[index];
        const pointsNum = typeof points === "number" ? points : 0;
        if (pointsNum <= 0) return;

        performances[side].push({
          playerId: String(playerId),
          playerName: getPlayerName(playerId, game.year),
          points: round2(pointsNum),
          year: game.year,
          week: game.week,
          isPlayoff: game.isPlayoff,
        });
      });
    });
  });

  const topDeduped = (list) => {
    const sorted = [...list].sort((a, b) => b.points - a.points);
    const seen = new Set();
    const out = [];
    for (const perf of sorted) {
      if (seen.has(perf.playerId)) continue;
      seen.add(perf.playerId);
      out.push(perf);
      if (out.length >= topN) break;
    }
    return out;
  };

  return {
    teamA: topDeduped(performances.A),
    teamB: topDeduped(performances.B),
  };
}

// Strip the bulky starters/starters_points fields once we're done mining
// them for individual performances, so the printed game log stays compact.
function toGameLogEntry(game) {
  return {
    year: game.year,
    week: game.week,
    pointsA: game.pointsA,
    pointsB: game.pointsB,
    result: game.result,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const { year, week } = parseArgs();
  const years = getYears();
  const season = loadSeason(year);

  if (!season.matchups[week]) {
    console.error(`No matchup data found for ${year} week ${week}.`);
    process.exit(1);
  }

  const weekMatchups = season.matchups[week];
  const byMatchupId = new Map();
  weekMatchups.forEach((m) => {
    if (m.matchup_id === null || m.matchup_id === undefined) return;
    if (!byMatchupId.has(m.matchup_id)) byMatchupId.set(m.matchup_id, []);
    byMatchupId.get(m.matchup_id).push(m);
  });

  const results = [];

  for (const [matchupId, pair] of byMatchupId.entries()) {
    if (pair.length !== 2) continue; // skip byes / malformed groups

    const [entryA, entryB] = pair;
    const rosterA = season.rosters.find((r) => r.roster_id === entryA.roster_id);
    const rosterB = season.rosters.find((r) => r.roster_id === entryB.roster_id);
    const managerA = managerBySleeperId.get(rosterA?.owner_id);
    const managerB = managerBySleeperId.get(rosterB?.owner_id);

    if (!managerA || !managerB) continue;

    const { regularSeason, playoffs } = findMeetings(
      managerA.sleeper.id,
      managerB.sleeper.id,
      years,
      year,
      week
    );

    const notablePerformances = extractPerformances([
      ...regularSeason,
      ...playoffs,
    ]);

    results.push({
      matchupId,
      year,
      week,
      teamA: { managerId: managerA.id, teamName: managerA.teamName },
      teamB: { managerId: managerB.id, teamName: managerB.teamName },
      allTimeRegularSeason: summarize(regularSeason),
      meaningfulPlayoffMeetings: playoffs.map(toGameLogEntry),
      notablePerformances,
      // Full history, most recent first — for a "previous matchups" table.
      gameLog: [...regularSeason]
        .sort((a, b) => b.year - a.year || b.week - a.week)
        .map(toGameLogEntry),
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main();
