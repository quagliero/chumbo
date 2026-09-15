#!/usr/bin/env node
/**
 * Computes head-to-head preview stats for every matchup in a given
 * year/week, from the committed Sleeper JSON data directly (no build step,
 * no live site involved).
 *
 * Usage:
 *   node scripts/generate-h2h-preview.mjs --year 2026 --week 1
 *
 * Outputs a JSON array (one entry per matchup pairing). Alongside the core
 * all-time regular-season record (wins/losses/ties, averages, streak,
 * biggest blowout, closest game, career scoring ledger, nailbiter/blowout
 * tally) and the full game log, each entry also carries a grab-bag of
 * "tidbit" material meant to be rotated through week to week rather than
 * always used all at once:
 *
 *   - notablePerformances / worstPerformances: best & worst individual
 *     starter games in the series, each enriched with that player's draft
 *     cost the year they played (round/pick, or "undrafted that year").
 *   - positionSwing: which real-world position (QB/RB/WR/etc.) has most
 *     often aligned with the overall winner of these meetings.
 *   - benchRegret: the single game either manager left the most points on
 *     the bench in, against this specific opponent.
 *   - tradeHistory: any trades these two managers have made directly with
 *     each other, all-time (flagged notable when the count is remarkably
 *     low or high for 14 years of activity).
 *   - managerHonors: championships and regular-season scoring titles for
 *     each manager, all-time (team display names change too often to be a
 *     useful "history" on their own, so this tracks achievements instead).
 *   - scheduleLuck: lucky wins (won the H2H despite a losing record vs the
 *     rest of the field that week) and unlucky losses (lost despite a
 *     winning record vs the field) between these two, all-time.
 *   - weekForm: how each manager has done specifically in this week number
 *     across all seasons, independent of opponent.
 *   - seasonToDateForm / playoffStakes: current-season standings context —
 *     null until there's actually a completed week of games this season
 *     (e.g. week 1 previews will always show these as null).
 *   - meetingMilestones: e.g. "this is their 15th all-time meeting".
 *
 * This is the deterministic "numbers" layer — the actual WhatsApp blurb
 * text is meant to be written from this output, not by this script.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, "..", "src", "data");

// Tunable thresholds for the nailbiter/blowout tally
const NAILBITER_MARGIN = 5;
const BLOWOUT_MARGIN = 30;

// Tunable thresholds for whether a given tidbit is worth featuring at all.
// These mark a stat "notable" when it's a real outlier, not just present —
// e.g. 3 trades in 14 years is remarkably *few*, not a boring middle value.
const NOTABLE = {
  tradeCountLow: 3, // <= this many trades all-time is itself a story
  tradeCountHigh: 8, // >= this many marks "constant trade partners"
  positionSwingRate: 0.75, // alignment rate needed for position-swing to matter
  benchRegretPoints: 20, // points left on the bench to call it a real blunder
  weekFormRate: 0.75, // win% (or its inverse) in a specific week number
  weekFormMinGames: 3, // don't flag week-form off a sample of 1-2
  scheduleLuckMinCount: 1, // any lucky win / unlucky loss is worth a mention
};

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
  const users = readJson(path.join(dir, "users.json"));
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

  const season = { league, rosters, users, matchups, winnersBracket };
  seasonCache.set(year, season);
  return season;
}

// Transactions: 2020+ store one array per week under transactions/<week>.json;
// 2012-2019 store a single flat transactions.json grouped by `leg`. Both
// shapes are plain arrays of the same Sleeper transaction record, so we just
// normalize to a flat list with a `week` field attached.
const transactionsCache = new Map();
function loadTransactions(year) {
  if (transactionsCache.has(year)) return transactionsCache.get(year);

  const dir = path.join(DATA_DIR, String(year));
  let all = [];

  const transactionsDir = path.join(dir, "transactions");
  if (fs.existsSync(transactionsDir)) {
    for (const file of fs.readdirSync(transactionsDir)) {
      const match = file.match(/^(\d+)\.json$/);
      if (!match) continue;
      const week = parseInt(match[1], 10);
      const data = readJson(path.join(transactionsDir, file)) || [];
      data.forEach((t) => all.push({ ...t, week }));
    }
  } else {
    const legacy = readJson(path.join(dir, "transactions.json")) || [];
    legacy.forEach((t) => all.push({ ...t, week: t.leg }));
  }

  transactionsCache.set(year, all);
  return all;
}

const picksCache = new Map();
function loadPicks(year) {
  if (picksCache.has(year)) return picksCache.get(year);
  const picks = readJson(path.join(DATA_DIR, String(year), "picks.json")) || [];
  picksCache.set(year, picks);
  return picks;
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

function resolvePlayer(playerId, year) {
  const idStr = String(playerId);

  const yearPlayers = getYearPlayers(year);
  if (yearPlayers?.[idStr]) {
    const p = yearPlayers[idStr];
    return { name: `${p.first_name} ${p.last_name}`.trim(), position: p.position || "UNK" };
  }

  if (rootPlayers[idStr]) {
    const p = rootPlayers[idStr];
    return { name: `${p.first_name} ${p.last_name}`.trim(), position: p.position || "UNK" };
  }

  // Legacy string-named starter (no numeric player_id on record)
  if (typeof playerId === "string" && playerId.includes(" ")) {
    return { name: playerId, position: "UNK" };
  }

  return { name: idStr, position: "UNK" };
}

function getPlayerName(playerId, year) {
  return resolvePlayer(playerId, year).name;
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

function round2(n) {
  return Math.round(n * 100) / 100;
}

// ---------------------------------------------------------------------------
// Optimal-lineup / bench-regret — mirrors src/utils/lineupAnalysis.ts's
// getOptimalLineup() exactly (same greedy fill: mandatory positions first,
// then best remaining RB/WR/TE into FLEX) so "points left on the bench"
// matches what the site itself would show on a matchup page.
// ---------------------------------------------------------------------------
const STANDARD_LINEUP_REQUIREMENTS = { QB: 1, RB: 2, WR: 2, TE: 1, K: 1, DEF: 1 };

function getOptimalLineupPoints(matchEntry, year) {
  if (!matchEntry?.players || !matchEntry?.players_points) {
    return { optimalTotal: matchEntry?.points ?? 0, pointsLeftOnBench: 0 };
  }

  const allPlayers = matchEntry.players.map((playerId) => {
    const idStr = String(playerId);
    const points = matchEntry.players_points?.[idStr] || 0;
    const { position } = resolvePlayer(playerId, year);
    return { playerId, points, position };
  });

  allPlayers.sort((a, b) => b.points - a.points);

  const optimalStarters = [];
  const used = new Set();

  Object.entries(STANDARD_LINEUP_REQUIREMENTS).forEach(([pos, count]) => {
    const playersInPosition = allPlayers.filter(
      (p) => p.position === pos && !used.has(p.playerId)
    );
    for (let i = 0; i < count && i < playersInPosition.length; i++) {
      optimalStarters.push(playersInPosition[i]);
      used.add(playersInPosition[i].playerId);
    }
  });

  const flexEligible = allPlayers.filter(
    (p) =>
      (p.position === "RB" || p.position === "WR" || p.position === "TE") &&
      !used.has(p.playerId)
  );
  if (flexEligible.length > 0) {
    optimalStarters.push(flexEligible[0]);
    used.add(flexEligible[0].playerId);
  }

  const optimalTotal = round2(optimalStarters.reduce((s, p) => s + p.points, 0));
  const pointsLeftOnBench = round2(optimalTotal - (matchEntry.points || 0));

  return { optimalTotal, pointsLeftOnBench };
}

// ---------------------------------------------------------------------------
// Real-position totals for a single team's starters in one game (used for
// the position-swing tidbit). FLEX-eligible players are bucketed by their
// actual position (RB/WR/TE), not the slot label, so e.g. a WR started in
// the FLEX slot still counts toward "WR".
// ---------------------------------------------------------------------------
function getPositionTotals(starters, startersPoints, year) {
  const totals = { QB: 0, RB: 0, WR: 0, TE: 0, K: 0, DEF: 0 };
  if (!starters || !startersPoints) return totals;

  starters.forEach((playerId, index) => {
    if (playerId === "0" || playerId === 0) return;
    const points = startersPoints[index];
    const pointsNum = typeof points === "number" ? points : 0;
    const { position } = resolvePlayer(playerId, year);
    if (position in totals) totals[position] += pointsNum;
  });

  Object.keys(totals).forEach((k) => (totals[k] = round2(totals[k])));
  return totals;
}

// ---------------------------------------------------------------------------
// "Record vs the field" for one team in one week — mirrors
// calculateWeeklyLeagueRecord() in src/utils/recordUtils.ts exactly: compare
// this team's score against every other team's score that week. This is the
// basis for "schedule luck" (see computeScheduleLuck below), matching the
// site's own Breakdown.tsx definition.
// ---------------------------------------------------------------------------
function getWeeklyAllPlayRecord(ownRosterId, ownPoints, weekMatchups) {
  let wins = 0;
  let losses = 0;
  let ties = 0;

  weekMatchups.forEach((other) => {
    if (other.roster_id === ownRosterId) return;
    const result = determineResult(ownPoints, other.points);
    if (result === "W") wins++;
    else if (result === "L") losses++;
    else ties++;
  });

  return { wins, losses, ties };
}

function allPlayWinPct(record) {
  const total = record.wins + record.losses + record.ties;
  return total === 0 ? 0.5 : record.wins / total;
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
      const { pointsLeftOnBench: benchRegretA } = getOptimalLineupPoints(matchA, year);
      const { pointsLeftOnBench: benchRegretB } = getOptimalLineupPoints(matchB, year);

      const game = {
        year,
        week,
        pointsA: matchA.points,
        pointsB: matchB.points,
        result: determineResult(matchA.points, matchB.points), // from A's perspective
        isPlayoff,
        benchRegretA,
        benchRegretB,
        allPlayA: getWeeklyAllPlayRecord(rosterA.roster_id, matchA.points, weekMatchups),
        allPlayB: getWeeklyAllPlayRecord(rosterB.roster_id, matchB.points, weekMatchups),
        positionTotalsA: getPositionTotals(matchA.starters, matchA.starters_points, year),
        positionTotalsB: getPositionTotals(matchB.starters, matchB.starters_points, year),
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

// Strip the bulky starters/starters_points/position-totals fields once
// we're done mining them, so the printed game log stays compact.
function toGameLogEntry(game) {
  return {
    year: game.year,
    week: game.week,
    pointsA: game.pointsA,
    pointsB: game.pointsB,
    result: game.result,
  };
}

function summarize(games) {
  if (games.length === 0) return null;

  const winsA = games.filter((g) => g.result === "W").length;
  const winsB = games.filter((g) => g.result === "L").length;
  const ties = games.filter((g) => g.result === "T").length;
  const totalPointsA = games.reduce((s, g) => s + g.pointsA, 0);
  const totalPointsB = games.reduce((s, g) => s + g.pointsB, 0);
  const avgA = totalPointsA / games.length;
  const avgB = totalPointsB / games.length;

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

  const nailbiters = games.filter(
    (g) => Math.abs(g.pointsA - g.pointsB) <= NAILBITER_MARGIN
  ).length;
  const blowouts = games.filter(
    (g) => Math.abs(g.pointsA - g.pointsB) >= BLOWOUT_MARGIN
  ).length;
  const avgMargin =
    games.reduce((s, g) => s + Math.abs(g.pointsA - g.pointsB), 0) / games.length;

  return {
    gamesPlayed: games.length,
    recordFromA: { wins: winsA, losses: winsB, ties },
    avgPointsA: round2(avgA),
    avgPointsB: round2(avgB),
    careerLedger: {
      totalPointsA: round2(totalPointsA),
      totalPointsB: round2(totalPointsB),
      diff: round2(totalPointsA - totalPointsB), // positive means A has out-scored B all-time
    },
    marginStats: {
      nailbiterMargin: NAILBITER_MARGIN,
      blowoutMargin: BLOWOUT_MARGIN,
      nailbiters,
      blowouts,
      avgMargin: round2(avgMargin),
    },
    biggestBlowout: toGameLogEntry(biggestBlowout),
    closestGame: toGameLogEntry(closestGame),
    highestCombinedScore: toGameLogEntry(highestCombined),
    bestGameByA: toGameLogEntry(bestA),
    bestGameByB: toGameLogEntry(bestB),
    currentStreak: { result: streakType, count: streakCount }, // from A's perspective
    lastThree: recent.slice(0, 3).map(toGameLogEntry),
  };
}

// ---------------------------------------------------------------------------
// Position swing: for each real position, how often did the side with the
// higher total at that position also win the overall game? Surfaces the
// position most "predictive" of the result in this specific rivalry.
// ---------------------------------------------------------------------------
function computePositionSwing(games, minSample = 5) {
  if (games.length < minSample) return null;

  const positions = ["QB", "RB", "WR", "TE", "K", "DEF"];
  const tally = {};
  positions.forEach((p) => (tally[p] = { aligned: 0, total: 0 }));

  games.forEach((game) => {
    if (game.result === "T") return; // no winner to align with
    const gameWinnerIsA = game.result === "W";

    positions.forEach((pos) => {
      const a = game.positionTotalsA[pos];
      const b = game.positionTotalsB[pos];
      if (a === 0 && b === 0) return; // nobody started at this position
      const positionWinnerIsA = a > b;
      if (a === b) return; // tie at this position, no signal either way
      tally[pos].total++;
      if (positionWinnerIsA === gameWinnerIsA) tally[pos].aligned++;
    });
  });

  const ranked = positions
    .map((pos) => ({
      position: pos,
      aligned: tally[pos].aligned,
      total: tally[pos].total,
      rate: tally[pos].total > 0 ? tally[pos].aligned / tally[pos].total : 0,
    }))
    .filter((p) => p.total >= minSample)
    .sort((a, b) => b.rate - a.rate);

  if (ranked.length === 0) return null;
  const best = { ...ranked[0], notable: ranked[0].rate >= NOTABLE.positionSwingRate };
  return { best, all: ranked };
}

// ---------------------------------------------------------------------------
// Bench regret: the single game (by either side) with the biggest gap
// between what they actually scored and what their optimal lineup would
// have scored, in games against this specific opponent.
// ---------------------------------------------------------------------------
function computeBenchRegret(games) {
  if (games.length === 0) return null;

  const bySide = (side) => {
    const key = side === "A" ? "benchRegretA" : "benchRegretB";
    const sorted = [...games].sort((a, b) => b[key] - a[key]);
    const top = sorted[0];
    if (!top || top[key] <= 0) return null;
    return {
      ...toGameLogEntry(top),
      pointsLeftOnBench: top[key],
      notable: top[key] >= NOTABLE.benchRegretPoints,
    };
  };

  return { teamA: bySide("A"), teamB: bySide("B") };
}

// ---------------------------------------------------------------------------
// Schedule luck: a "lucky win" is a game you won despite a losing record vs
// the rest of the field that week (i.e. most of the league outscored you
// too, you just happened to be paired against someone who scored even
// less); an "unlucky loss" is a game you lost despite a winning record vs
// the field (you outscored most of the league that week and still lost the
// one matchup that mattered). Exactly mirrors getLuckValue() in
// Breakdown.tsx. With only ~14 games a season, a single lucky/unlucky
// result head-to-head carries real weight.
// ---------------------------------------------------------------------------
function computeScheduleLuck(games) {
  const bySide = (side) => {
    const allPlayKey = side === "A" ? "allPlayA" : "allPlayB";
    // From this side's perspective: "W" in game.result means A won, so for
    // side B a game.result of "L" is a win and "W" is a loss.
    const wonKey = side === "A" ? "W" : "L";
    const lostKey = side === "A" ? "L" : "W";

    const luckyWins = [];
    const unluckyLosses = [];

    games.forEach((g) => {
      if (g.result === "T") return;
      const pct = allPlayWinPct(g[allPlayKey]);
      if (g.result === wonKey && pct < 0.5) {
        luckyWins.push({ ...toGameLogEntry(g), allPlay: g[allPlayKey], allPlayWinPct: round2(pct) });
      } else if (g.result === lostKey && pct > 0.5) {
        unluckyLosses.push({ ...toGameLogEntry(g), allPlay: g[allPlayKey], allPlayWinPct: round2(pct) });
      }
    });

    // Most egregious examples: the lowest win% that still won, and the
    // highest win% that still lost.
    const mostLuckyWin = luckyWins.length
      ? [...luckyWins].sort((a, b) => a.allPlayWinPct - b.allPlayWinPct)[0]
      : null;
    const mostUnluckyLoss = unluckyLosses.length
      ? [...unluckyLosses].sort((a, b) => b.allPlayWinPct - a.allPlayWinPct)[0]
      : null;

    return {
      luckyWins: luckyWins.length,
      unluckyLosses: unluckyLosses.length,
      mostLuckyWin,
      mostUnluckyLoss,
      notable:
        luckyWins.length >= NOTABLE.scheduleLuckMinCount ||
        unluckyLosses.length >= NOTABLE.scheduleLuckMinCount,
    };
  };

  return { teamA: bySide("A"), teamB: bySide("B") };
}

// ---------------------------------------------------------------------------
// Notable individual player performances (best & worst) across a set of
// games — mirrors the "Best Performances" logic in H2HContent.tsx: best (or
// worst) single game per player, deduplicated so one guy's monster game (or
// dud) doesn't crowd out everyone else's, sorted by score.
// ---------------------------------------------------------------------------
function collectPerformances(games) {
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
        const { name } = resolvePlayer(playerId, game.year);

        performances[side].push({
          playerId: String(playerId),
          playerName: name,
          points: round2(pointsNum),
          year: game.year,
          week: game.week,
          isPlayoff: game.isPlayoff,
        });
      });
    });
  });

  return performances;
}

function dedupeTop(list, topN, direction) {
  const sorted = [...list].sort((a, b) =>
    direction === "best" ? b.points - a.points : a.points - b.points
  );
  const seen = new Set();
  const out = [];
  for (const perf of sorted) {
    if (seen.has(perf.playerId)) continue;
    seen.add(perf.playerId);
    out.push(perf);
    if (out.length >= topN) break;
  }
  return out;
}

function extractPerformances(games, direction, topN = 3) {
  // Best performances only count real production (>0); worst performances
  // deliberately include 0s — a started player who was on bye and put up a
  // hard zero is exactly the kind of "trap start" this is meant to surface.
  const performances = collectPerformances(games);
  const filterFn = (p) => (direction === "best" ? p.points > 0 : true);

  return {
    teamA: dedupeTop(performances.A.filter(filterFn), topN, direction),
    teamB: dedupeTop(performances.B.filter(filterFn), topN, direction),
  };
}

// ---------------------------------------------------------------------------
// Draft-day context for a performance: was this player drafted by the
// manager who started them, by the opponent (later acquired), or not
// drafted in this league that year at all (waiver/free-agent pickup)?
// ---------------------------------------------------------------------------
function getDraftPick(playerId, year) {
  const picks = loadPicks(year);
  return picks.find((p) => String(p.player_id) === String(playerId));
}

function enrichWithDraftContext(perf, side, managerA, managerB) {
  const pick = getDraftPick(perf.playerId, perf.year);
  const ownManager = side === "A" ? managerA : managerB;
  const otherManager = side === "A" ? managerB : managerA;

  let draftContext;
  if (!pick) {
    draftContext = { drafted: false, note: "not drafted that year (waiver/free-agent addition)" };
  } else {
    const draftedBy =
      pick.picked_by === ownManager.sleeper.id
        ? "self"
        : pick.picked_by === otherManager.sleeper.id
        ? "opponent"
        : "other";
    draftContext = {
      drafted: true,
      round: pick.round,
      pickNo: pick.pick_no,
      draftedBy, // "self" | "opponent" | "other" (drafted by a third manager, later traded/added)
    };
  }

  return { ...perf, draftContext };
}

// ---------------------------------------------------------------------------
// Trade history between two managers, all-time.
// ---------------------------------------------------------------------------
function findTrades(ownerIdA, ownerIdB, years, cutoffYear) {
  const trades = [];

  years.forEach((year) => {
    if (year > cutoffYear) return;
    const season = loadSeason(year);
    if (!season.rosters) return;

    const rosterA = season.rosters.find((r) => r.owner_id === ownerIdA);
    const rosterB = season.rosters.find((r) => r.owner_id === ownerIdB);
    if (!rosterA || !rosterB) return;

    const transactions = loadTransactions(year);
    transactions
      .filter(
        (t) =>
          t.type === "trade" &&
          t.status === "complete" &&
          Array.isArray(t.roster_ids) &&
          t.roster_ids.includes(rosterA.roster_id) &&
          t.roster_ids.includes(rosterB.roster_id)
      )
      .forEach((t) => {
        const playersToA = [];
        const playersToB = [];
        Object.entries(t.adds || {}).forEach(([playerId, destRosterId]) => {
          if (destRosterId === rosterA.roster_id) playersToA.push(getPlayerName(playerId, year));
          if (destRosterId === rosterB.roster_id) playersToB.push(getPlayerName(playerId, year));
        });

        // Some trades move only future draft picks (no players in adds/drops
        // at all) — describe those too so the trade doesn't show up blank.
        const picksToA = [];
        const picksToB = [];
        (t.draft_picks || []).forEach((pick) => {
          const label = `${pick.season} Round ${pick.round}`;
          if (pick.previous_owner_id === rosterA.roster_id && pick.owner_id === rosterB.roster_id) {
            picksToB.push(label);
          } else if (pick.previous_owner_id === rosterB.roster_id && pick.owner_id === rosterA.roster_id) {
            picksToA.push(label);
          }
        });

        trades.push({ year, week: t.week, playersToA, playersToB, picksToA, picksToB });
      });
  });

  trades.sort((a, b) => a.year - b.year || (a.week || 0) - (b.week || 0));
  const notable =
    trades.length <= NOTABLE.tradeCountLow || trades.length >= NOTABLE.tradeCountHigh;
  return {
    count: trades.length,
    trades,
    mostRecent: trades[trades.length - 1] || null,
    notable,
  };
}

// ---------------------------------------------------------------------------
// Manager honors — championships and regular-season scoring titles. Team
// display names change every season for some managers (Sleeper lets them
// rename at will), so raw name history is mostly noise; achievements are
// the durable, meaningful "history" between two managers over 14 years.
// ---------------------------------------------------------------------------
function getChampionRosterId(season) {
  const finalMatch = (season.winnersBracket || []).find((bm) => bm.p === 1);
  return finalMatch?.w ?? null;
}

function getManagerHonors(ownerId, years, cutoffYear) {
  const championships = [];
  const scoringTitles = [];

  years.forEach((year) => {
    if (year >= cutoffYear) return; // strictly prior, completed seasons only
    const season = loadSeason(year);
    if (!season.rosters) return;

    const roster = season.rosters.find((r) => r.owner_id === ownerId);
    if (!roster) return;

    const championRosterId = getChampionRosterId(season);
    if (championRosterId !== null && championRosterId === roster.roster_id) {
      championships.push(year);
    }

    const ranked = [...season.rosters]
      .map((r) => ({
        rosterId: r.roster_id,
        pointsFor: r.settings.fpts + (r.settings.fpts_decimal || 0) / 100,
      }))
      .sort((a, b) => b.pointsFor - a.pointsFor);
    if (ranked[0]?.rosterId === roster.roster_id) {
      scoringTitles.push(year);
    }
  });

  return {
    championships,
    scoringTitles,
    notable: championships.length > 0 || scoringTitles.length > 0,
  };
}

// ---------------------------------------------------------------------------
// Week-N form: how has this manager done specifically in this week number,
// across all previous seasons, regardless of opponent?
// ---------------------------------------------------------------------------
function getManagerWeekForm(ownerId, weekNum, years, cutoffYear) {
  const games = [];

  years.forEach((year) => {
    if (year >= cutoffYear) return; // strictly prior seasons only
    const season = loadSeason(year);
    if (!season.league || !season.rosters || !season.matchups) return;
    if (!isWeekCompleted(weekNum, season.league)) return;

    const roster = season.rosters.find((r) => r.owner_id === ownerId);
    if (!roster) return;

    const weekMatchups = season.matchups[weekNum];
    if (!weekMatchups) return;

    const own = weekMatchups.find((m) => m.roster_id === roster.roster_id);
    if (!own) return;

    const opponent = weekMatchups.find(
      (m) => m.matchup_id === own.matchup_id && m.roster_id !== own.roster_id
    );
    const oppRoster = opponent
      ? season.rosters.find((r) => r.roster_id === opponent.roster_id)
      : undefined;
    const oppManager = oppRoster
      ? managerBySleeperId.get(oppRoster.owner_id)
      : undefined;

    games.push({
      year,
      points: own.points,
      opponentPoints: opponent?.points ?? null,
      result: opponent ? determineResult(own.points, opponent.points) : null,
      opponentName: oppManager?.teamName ?? null,
    });
  });

  if (games.length === 0) return null;

  const wins = games.filter((g) => g.result === "W").length;
  const losses = games.filter((g) => g.result === "L").length;
  const ties = games.filter((g) => g.result === "T").length;
  const avgPoints = round2(games.reduce((s, g) => s + g.points, 0) / games.length);
  const winPct = (wins + ties * 0.5) / games.length;
  const notable =
    games.length >= NOTABLE.weekFormMinGames &&
    (winPct >= NOTABLE.weekFormRate || winPct <= 1 - NOTABLE.weekFormRate);

  return { record: { wins, losses, ties }, avgPoints, games, notable };
}

// ---------------------------------------------------------------------------
// Season-to-date form (null until at least one week has been completed this
// season — always null for a week-1 preview, by design).
// ---------------------------------------------------------------------------
function getSeasonToDateForm(ownerId, year) {
  const season = loadSeason(year);
  if (!season.league || !season.rosters) return null;

  const roster = season.rosters.find((r) => r.owner_id === ownerId);
  if (!roster) return null;

  const { wins, losses, ties, fpts, fpts_decimal: fptsDecimal } = roster.settings;
  if (wins + losses + ties === 0) return null; // nothing played yet

  const pointsFor = round2(fpts + (fptsDecimal || 0) / 100);

  const ranked = [...season.rosters]
    .map((r) => ({
      rosterId: r.roster_id,
      pointsFor: r.settings.fpts + (r.settings.fpts_decimal || 0) / 100,
    }))
    .sort((a, b) => b.pointsFor - a.pointsFor);
  const pointsForRank = ranked.findIndex((r) => r.rosterId === roster.roster_id) + 1;

  return {
    record: { wins, losses, ties },
    pointsFor,
    pointsForRank,
    totalTeams: season.rosters.length,
  };
}

// ---------------------------------------------------------------------------
// Playoff stakes — a simplified, standings-based version (current rank vs.
// the playoff cutoff line), not a full odds simulation. Null until the
// season has actually started. See src/utils/playoffOdds.ts for the site's
// full Monte Carlo version, which this deliberately doesn't try to
// replicate here.
// ---------------------------------------------------------------------------
function getPlayoffStakes(ownerId, year) {
  const season = loadSeason(year);
  if (!season.league || !season.rosters) return null;

  const playoffTeams = season.league.settings?.playoff_teams;
  if (!playoffTeams) return null;

  const withRecord = season.rosters.map((r) => ({
    rosterId: r.roster_id,
    wins: r.settings.wins,
    losses: r.settings.losses,
    ties: r.settings.ties,
    pointsFor: r.settings.fpts + (r.settings.fpts_decimal || 0) / 100,
  }));

  const gamesPlayed = withRecord[0]?.wins + withRecord[0]?.losses + withRecord[0]?.ties;
  if (!gamesPlayed) return null; // nothing played yet

  withRecord.sort((a, b) => {
    const aPct = (a.wins + a.ties * 0.5) / (a.wins + a.losses + a.ties || 1);
    const bPct = (b.wins + b.ties * 0.5) / (b.wins + b.losses + b.ties || 1);
    if (aPct !== bPct) return bPct - aPct;
    return b.pointsFor - a.pointsFor;
  });

  const roster = season.rosters.find((r) => r.owner_id === ownerId);
  if (!roster) return null;
  const rank = withRecord.findIndex((r) => r.rosterId === roster.roster_id) + 1;

  return {
    rank,
    totalTeams: withRecord.length,
    playoffTeams,
    inPlayoffPosition: rank <= playoffTeams,
    gamesBackFromCutoff:
      rank <= playoffTeams
        ? 0
        : withRecord[playoffTeams - 1].wins - withRecord[rank - 1].wins,
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
function main() {
  const { year, week } = parseArgs();
  const years = getYears();
  const season = loadSeason(year);

  // Upcoming weeks have no matchup file until they're played, so fall back to
  // the pairings in schedule.json (written by the fetch script in-season).
  const schedule = readJson(path.join(DATA_DIR, String(year), "schedule.json"));
  const weekMatchups = season.matchups[week] ?? schedule?.[week];

  if (!weekMatchups) {
    console.error(`No matchup or schedule data found for ${year} week ${week}.`);
    process.exit(1);
  }
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
    const allGames = [...regularSeason, ...playoffs];

    const bestPerformances = extractPerformances(allGames, "best");
    const worstPerformances = extractPerformances(allGames, "worst");
    const enrich = (list, side) =>
      list.map((p) => enrichWithDraftContext(p, side, managerA, managerB));

    const lastMeeting = regularSeason[regularSeason.length - 1];

    results.push({
      matchupId,
      year,
      week,
      teamA: { managerId: managerA.id, teamName: managerA.teamName },
      teamB: { managerId: managerB.id, teamName: managerB.teamName },

      allTimeRegularSeason: summarize(regularSeason),
      meaningfulPlayoffMeetings: playoffs.map(toGameLogEntry),
      gameLog: [...regularSeason]
        .sort((a, b) => b.year - a.year || b.week - a.week)
        .map(toGameLogEntry),

      meetingMilestones: {
        meetingNumber: regularSeason.length + 1, // this upcoming game
        isFirstMeeting: regularSeason.length === 0,
        lastMeetingYear: lastMeeting?.year ?? null,
        yearsSinceLastMeeting: lastMeeting ? year - lastMeeting.year : null,
      },

      notablePerformances: {
        teamA: enrich(bestPerformances.teamA, "A"),
        teamB: enrich(bestPerformances.teamB, "B"),
      },
      worstPerformances: {
        teamA: enrich(worstPerformances.teamA, "A"),
        teamB: enrich(worstPerformances.teamB, "B"),
      },

      positionSwing: computePositionSwing(regularSeason),
      benchRegret: computeBenchRegret(allGames),
      scheduleLuck: computeScheduleLuck(allGames),
      tradeHistory: findTrades(managerA.sleeper.id, managerB.sleeper.id, years, year),
      managerHonors: {
        teamA: getManagerHonors(managerA.sleeper.id, years, year),
        teamB: getManagerHonors(managerB.sleeper.id, years, year),
      },
      weekForm: {
        teamA: getManagerWeekForm(managerA.sleeper.id, week, years, year),
        teamB: getManagerWeekForm(managerB.sleeper.id, week, years, year),
      },
      seasonToDateForm: {
        teamA: getSeasonToDateForm(managerA.sleeper.id, year),
        teamB: getSeasonToDateForm(managerB.sleeper.id, year),
      },
      playoffStakes: {
        teamA: getPlayoffStakes(managerA.sleeper.id, year),
        teamB: getPlayoffStakes(managerB.sleeper.id, year),
      },
    });
  }

  console.log(JSON.stringify(results, null, 2));
}

main();
