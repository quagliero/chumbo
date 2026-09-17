#!/usr/bin/env node
/**
 * One-off repair of the 2019 season.
 *
 * WHY
 * ---
 * 2012-2019 were played on NFL.com and scraped into Sleeper's shape. In Jan 2025
 * (chumbo-api commit dcdbeef, "use sleeper API for 2019 season") the 2019 folder
 * was replaced with data pulled from Sleeper, where the season had been re-entered
 * by hand. The NFL.com version was kept as data/2019-old.
 *
 * That swap broke the season in four ways:
 *
 *   1. Scores were recomputed. Sleeper's `points` is exactly sum(starters) for all
 *      184 team-weeks, so the recorded NFL.com scores were overwritten by sums of
 *      a lineup that does not reproduce them. Three managers' records flipped:
 *      thd 8-5 -> 7-6, htc 4-9 -> 6-7, dix 8-5 -> 7-6. dix's week 5 win over htc
 *      became a loss.
 *   2. Roster ids were remapped. NFL.com team numbers (which managers.json teamId
 *      still uses, and which 2012-2018 follow) were replaced by Sleeper's ordering.
 *   3. Players were mis-matched. Two same-name pairs resolve to different ids:
 *      David Johnson (362 vs 2391) and Mike Williams (748 vs 4068).
 *   4. Defensive scoring config drifted: st_fum_rec 2 -> 0, def_kr_td 6 -> 0,
 *      def_pr_td 6 -> 0, while def_st_fum_rec stayed at 2.
 *
 * WHAT THIS DOES
 * --------------
 * Rebuilds src/data/2019 with 2019-old as the base (it reconciles to the penny:
 * matchup-derived records and points match rosters.settings for all 12 teams), then
 * grafts in the only thing Sleeper has that NFL.com's scrape lacks - per-player
 * points. Nothing is invented: where a starter has no Sleeper score, the shortfall
 * is recorded in `points_adjustment` rather than being attributed to a guess.
 *
 * Run:  node scripts/rebuild-2019.js [--source ../chumbo-api/data/2019-old] [--dry]
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const argVal = (flag, fallback) => {
  const i = args.indexOf(flag);
  return path.resolve(root, i !== -1 ? args[i + 1] : fallback);
};

// Both inputs live outside this repo, in the sibling chumbo-api checkout.
// OLD_DIR  - the NFL.com scrape: authoritative scores, lineups and roster ids.
// SLEEPER_DIR - the hand-entered Sleeper season: the only source of per-player
//               points, plus avatars, transactions and division assignments.
// OUT_DIR is written to and never read, so this script is idempotent.
const OLD_DIR = argVal("--source", "../chumbo-api/data/2019-old");
const SLEEPER_DIR = argVal("--sleeper", "../chumbo-api/data/2019");
const OUT_DIR = path.join(root, "src/data/2019");

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const exists = (p) => fs.existsSync(p);
const round2 = (n) => Math.round(n * 100) / 100;

for (const [label, dir, flag] of [
  ["NFL.com source", OLD_DIR, "--source"],
  ["Sleeper source", SLEEPER_DIR, "--sleeper"],
]) {
  if (!exists(dir)) {
    console.error(`${label} not found: ${dir}`);
    console.error(`Pass ${flag} <path>.`);
    process.exit(1);
  }
}

const oldRosters = read(path.join(OLD_DIR, "rosters.json"));
const sleeperRosters = read(path.join(SLEEPER_DIR, "rosters.json"));

// Sleeper roster_id -> NFL.com roster_id, joined on owner_id.
const n2o = {};
for (const o of oldRosters) {
  const c = sleeperRosters.find((r) => r.owner_id === o.owner_id);
  if (!c) throw new Error(`No Sleeper roster for owner ${o.owner_id}`);
  n2o[c.roster_id] = o.roster_id;
}

// ---------------------------------------------------------- player id aliases
// The NFL.com scrape and the Sleeper import disagree on some player ids: two
// same-name pairs (David Johnson, Mike Williams) and a handful of entries the
// scrape left as literal names. Build an OLD id -> current id map from the
// evidence, so a player's points aren't lost to an id mismatch.
const playersDict = read(path.join(root, "src/data/players.json"));
const nameOf = (id) => {
  const p = playersDict[id];
  if (!p) return null;
  return (p.full_name || `${p.first_name || ""} ${p.last_name || ""}`).trim().toLowerCase();
};
const isTeamAbbr = (id) => /^[A-Z]{2,3}$/.test(String(id));
const looksLikeName = (id) => isNaN(Number(id)) && !isTeamAbbr(id);

const alias = {};
const aliasEvidence = [];
for (const w of fs
  .readdirSync(path.join(OLD_DIR, "matchups"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => parseInt(f, 10))) {
  const oldWeek = read(path.join(OLD_DIR, `matchups/${w}.json`));
  const curPath = path.join(SLEEPER_DIR, `matchups/${w}.json`);
  if (!exists(curPath)) continue;
  const curWeek = read(curPath);
  for (const om of oldWeek) {
    const cur = curWeek.find((c) => n2o[c.roster_id] === om.roster_id);
    if (!cur) continue;
    const curPP = cur.players_points || {};
    const onlyOld = (om.players || []).filter((id) => curPP[id] === undefined);
    const onlyCur = Object.keys(curPP).filter((id) => !(om.players || []).includes(id));
    for (const o of onlyOld) {
      if (alias[o] || isTeamAbbr(o)) continue;
      const target = looksLikeName(o) ? String(o).trim().toLowerCase() : nameOf(o);
      if (!target) continue;
      const hit = onlyCur.find((c) => nameOf(c) === target);
      if (hit) {
        alias[o] = hit;
        aliasEvidence.push(`${o} -> ${hit}  (${target})`);
      }
    }
  }
}

const resolve = (id, pp) => (pp[id] !== undefined ? id : alias[id] ?? id);

/**
 * Deltas we deliberately do NOT attribute, despite fitting the shape. Add an
 * entry here when the arithmetic produces a score the season cannot support.
 *
 * Currently empty. jay's week 7 KC defence (+27.00) sat here until the game was
 * checked properly: Kansas City WON that Thursday nighter 30-6, holding Denver
 * to six, which is the pts_allow_1_6 tier at 10 points before a single sack or
 * turnover. 27 is an ordinary line for that performance, and both sources agree
 * he started KC, so it is attributed like the rest.
 */
const EXCEPTIONS = [];

/**
 * Scores looked up from the real 2019 box scores, for the three team-weeks with
 * more than one unscored starter - where the gap cannot be split by arithmetic
 * alone. Each set sums exactly to that week's shortfall.
 *
 * ryan, week 3 (gap 11.38) -- SF 24-20 PIT / NO 33-27 SEA
 *   Garoppolo 277 pass yds, 1 TD, 2 INT, 3 rush yds, 1 fumble lost
 *             = 11.08 + 4 - 4 + 0.3 - 2                            =  9.38
 *   Seattle   allowed 33 (-1), 1 sack (+1), 1 fumble rec (+2)      =  2.00
 *   (also confirms pts_allow counts all points against, including the Saints'
 *    defensive and special-teams scores - excluding them gives 5 and fails)
 *
 * kitch, week 3 (gap 29.70) -- NO 33-27 SEA / PHI 24-27 DET / NYG 32-31 TB
 *   Metcalf   2 rec, 67 yds                                        =  6.70
 *   Agholor   8 rec, 50 yds, 2 TD                                  = 17.00
 *   Tampa Bay by remainder. Recomputing from its own line - allowed 32 (-1),
 *             5 sacks (+5), 2 fumble recs (+4) - gives 8, so NFL.com credited
 *             one recovery, not two. Same 2-point st_fum_rec / def_st_fum_rec
 *             discrepancy as the 30 other negative residuals.              6.00
 *
 * ryan, week 6 (gap 14.10) -- WSH 17-16 MIA
 *   Preston Williams 2 rec, 31 yds                                 =  3.10
 *   Washington allowed 16 (+2), 5 sacks (+5), 2 INT (+4)           = 11.00
 */
const MANUAL = [
  { week: 3, roster_id: 12, scores: { 1837: 9.38, SEA: 2 } },
  { week: 3, roster_id: 8, scores: { "D.K. Metcalf": 6.7, 2325: 17, TB: 6 } },
  { week: 6, roster_id: 12, scores: { 6148: 3.1, "Washington Redskins": 11 } },
];
const manualFor = (week, roster_id) =>
  (MANUAL.find((m) => m.week === week && m.roster_id === roster_id) || {}).scores;
const isException = (week, roster_id, player) =>
  EXCEPTIONS.some(
    (e) => e.week === week && e.roster_id === roster_id && e.player === player
  );

const report = {
  weeks: 0,
  teamWeeks: 0,
  exact: 0,
  adjusted: 0,
  totalAdjustment: 0,
  unscoredStarters: [],
  lineupDiffs: 0,
  attributedMissing: 0,
  attributedManual: 0,
  attributedDefense: 0,
  residuals: [],
};

// ---------------------------------------------------------------- matchups
const weeks = fs
  .readdirSync(path.join(OLD_DIR, "matchups"))
  .filter((f) => f.endsWith(".json"))
  .map((f) => parseInt(f, 10))
  .sort((a, b) => a - b);

const outMatchups = {};

for (const w of weeks) {
  const oldWeek = read(path.join(OLD_DIR, `matchups/${w}.json`));
  const curPath = path.join(SLEEPER_DIR, `matchups/${w}.json`);
  const curWeek = exists(curPath) ? read(curPath) : [];
  report.weeks++;

  outMatchups[w] = oldWeek.map((om) => {
    const cur = curWeek.find((c) => n2o[c.roster_id] === om.roster_id);
    const curPP = (cur && cur.players_points) || {};
    report.teamWeeks++;

    if (
      cur &&
      [...om.starters].sort().join() !== [...cur.starters].sort().join()
    ) {
      report.lineupDiffs++;
    }

    // Per-player points, keyed by the NFL.com lineup (which is authoritative).
    const players_points = {};
    const unscored = [];
    for (const id of om.players || []) {
      const src = resolve(id, curPP);
      if (curPP[src] !== undefined) players_points[id] = curPP[src];
    }
    for (const id of om.starters || []) {
      if (players_points[id] === undefined) unscored.push(id);
    }

    const starterSum = round2(
      (om.starters || []).reduce((s, id) => s + (players_points[id] || 0), 0)
    );
    const adjustment = round2(om.points - starterSum);

    if (adjustment === 0) report.exact++;
    else {
      report.adjusted++;
      report.totalAdjustment = round2(
        report.totalAdjustment + Math.abs(adjustment)
      );
      report.unscoredStarters.push({
        week: w,
        roster_id: om.roster_id,
        unscored,
        adjustment,
      });
    }

    // ---- attribute the shortfall where the evidence supports it ----------
    // Three shapes, only one of which is genuinely unattributable:
    //
    //  a) Exactly one starter has no score. The gap is that player's missing
    //     score - they were a waiver pickup, and the Sleeper rosters were
    //     rebuilt from draft + trades only, so they never made it across.
    //     Cross-validated where the player is rostered elsewhere the same week
    //     (LAC in week 5 scored exactly the 15 the gap needed).
    //  b) Every starter is scored, so the gap is pure scoring-rule drift. All
    //     of it is defensive: st_fum_rec 2 -> 0, def_kr_td / def_pr_td 6 -> 0,
    //     while def_st_fum_rec stayed at 2. Every one of these team-weeks
    //     started a defence, and every delta is a small integer consistent with
    //     a return touchdown or a special-teams fumble recovery.
    //  c) More than one starter unscored - the gap cannot be split. Left as a
    //     residual.
    let residual = adjustment;
    const manual = manualFor(w, om.roster_id);
    if (residual !== 0 && manual) {
      // Looked-up box-score values; assert they close the gap exactly.
      for (const [id, v] of Object.entries(manual)) players_points[id] = v;
      const check = round2(
        (om.starters || []).reduce((t, id) => t + (players_points[id] || 0), 0)
      );
      if (check !== om.points) {
        throw new Error(
          `Manual attribution for week ${w} roster ${om.roster_id} gives ${check}, expected ${om.points}`
        );
      }
      residual = 0;
      report.attributedManual++;
    } else if (residual !== 0) {
      if (unscored.length === 1 && !isException(w, om.roster_id, unscored[0])) {
        players_points[unscored[0]] = residual;
        residual = 0;
        report.attributedMissing++;
      } else if (unscored.length === 0) {
        const def = (om.starters || []).find(isTeamAbbr);
        if (def !== undefined && players_points[def] !== undefined) {
          players_points[def] = round2(players_points[def] + residual);
          residual = 0;
          report.attributedDefense++;
        }
      }
    }
    if (residual !== 0) report.residuals.push({ week: w, roster_id: om.roster_id, residual, unscored });

    // starters_points is a parallel array to starters; managerStats.ts indexes
    // into it directly, so it has to exist and line up.
    const starters_points = (om.starters || []).map(
      (id) => players_points[id] ?? 0
    );

    const out = {
      points: om.points, // NFL.com record - authoritative
      players: om.players,
      roster_id: om.roster_id,
      custom_points: cur && cur.custom_points !== undefined ? cur.custom_points : null,
      matchup_id: om.matchup_id,
      starters: om.starters,
      starters_points,
      players_points,
    };
    // Only present when the lineup still cannot account for the recorded score.
    if (residual !== 0) out.points_adjustment = residual;
    return out;
  });
}

// ---------------------------------------------------------------- rosters
// OLD settings reconcile with OLD matchups exactly, so keep them verbatim - but
// the NFL.com scrape has no division field, and 2019 had four divisions (their
// names are still in league.metadata). Graft the assignment across by owner.
const outRosters = oldRosters.map((o) => {
  const sleeper = sleeperRosters.find((r) => r.owner_id === o.owner_id);
  const division = sleeper && sleeper.settings && sleeper.settings.division;
  return division === undefined
    ? { ...o }
    : { ...o, settings: { ...o.settings, division } };
});
report.divisionsGrafted = outRosters.filter(
  (r) => r.settings.division !== undefined
).length;

// ---------------------------------------------------------------- users
// Keep the current users: same user_ids, but they carry Sleeper avatars that the
// NFL.com scrape never had, and nothing here is keyed by roster_id.
const outUsers = read(path.join(SLEEPER_DIR, "users.json"));

// ---------------------------------------------------------------- transactions
// Present only in the current data; its roster_ids are in Sleeper space and must
// be inverted. Each trade carries an NFL.com "Team N" note we verify against.
let outTransactions = null;
const txPath = path.join(SLEEPER_DIR, "transactions.json");
let txChecked = 0;
let txAgree = 0;
if (exists(txPath)) {
  outTransactions = read(txPath).map((t) => {
    const mapped = { ...t };
    if (Array.isArray(t.roster_ids)) {
      mapped.roster_ids = t.roster_ids.map((r) => n2o[r] ?? r);
    }
    for (const key of ["adds", "drops"]) {
      if (t[key] && typeof t[key] === "object") {
        mapped[key] = Object.fromEntries(
          Object.entries(t[key]).map(([p, r]) => [p, n2o[r] ?? r])
        );
      }
    }
    const note = t.metadata && t.metadata.notes;
    if (note && Array.isArray(mapped.roster_ids)) {
      const teams = [...note.matchAll(/Team (\d+)/g)].map((m) => Number(m[1]));
      if (teams.length) {
        txChecked++;
        const a = [...new Set(teams)].sort((x, y) => x - y).join();
        const b = [...mapped.roster_ids].sort((x, y) => x - y).join();
        if (a === b) txAgree++;
      }
    }
    return mapped;
  });
}

// ---------------------------------------------------------------- league
// Keep the real Sleeper league_id/draft_id the rest of the app expects, but take
// the scoring rules and roster slots the season was actually played under.
const oldLeague = read(path.join(OLD_DIR, "league.json"));
const curLeague = read(path.join(SLEEPER_DIR, "league.json"));
// The archive declares roster_positions as "... TE K DEF FLEX", but every
// starters array that season is ordered "... TE FLEX K DEF" (measured in H9
// across the full season). Mapping starters[i] to roster_positions[i] is the
// obvious way to derive a slot, so ship the order the data actually uses.
const rosterPositions = [...oldLeague.roster_positions];
const flex = rosterPositions.indexOf("FLEX");
const kicker = rosterPositions.indexOf("K");
if (flex > kicker && kicker !== -1) {
  rosterPositions.splice(flex, 1);
  rosterPositions.splice(kicker, 0, "FLEX");
}

const outLeague = {
  ...curLeague,
  scoring_settings: oldLeague.scoring_settings,
  roster_positions: rosterPositions,
};

// ---------------------------------------------------------------- passthrough
const passthrough = {};
for (const f of ["draft.json", "picks.json", "winners_bracket.json", "losers_bracket.json"]) {
  const p = path.join(OLD_DIR, f);
  if (exists(p)) passthrough[f] = read(p);
}

// ------------------------------------------------------------------- picks
// The NFL.com archive has no picks of its own — 2019-old/picks.json is a copy of
// the Sleeper import, so its roster_ids are in Sleeper space while everything
// else we write is in NFL.com space. Left alone, only thd's 15 picks join to a
// roster (he is roster 1 in both), and the draft can't be tied to the season.
// Every pick carries picked_by, so the remap is fully determined: resolve the
// owner through the Sleeper rosters, then look that owner's NFL.com roster up.
const ownerOfSleeperRoster = Object.fromEntries(
  sleeperRosters.map((r) => [r.roster_id, r.owner_id])
);
const oldRosterOfOwner = Object.fromEntries(
  oldRosters.map((r) => [r.owner_id, r.roster_id])
);
let picksRemapped = 0;
if (passthrough["picks.json"]) {
  passthrough["picks.json"] = passthrough["picks.json"].map((pick) => {
    // picked_by is authoritative; fall back to the roster join for any pick that
    // somehow lacks it (none do in 2019, but don't silently drop one if that
    // ever changes).
    const owner = pick.picked_by || ownerOfSleeperRoster[pick.roster_id];
    const mapped = oldRosterOfOwner[owner];
    if (mapped === undefined) {
      throw new Error(`Pick ${pick.pick_no}: no NFL.com roster for owner ${owner}`);
    }
    if (mapped !== pick.roster_id) picksRemapped++;
    return { ...pick, roster_id: mapped };
  });

  // Assert the join we just repaired, so a future rebuild can't quietly lose it.
  const rosterIds = new Set(outRosters.map((r) => r.roster_id));
  const unjoined = passthrough["picks.json"].filter((pk) => !rosterIds.has(pk.roster_id));
  if (unjoined.length) {
    throw new Error(`${unjoined.length} picks do not join to a roster`);
  }
  for (const pick of passthrough["picks.json"]) {
    if (oldRosterOfOwner[pick.picked_by] !== pick.roster_id) {
      throw new Error(`Pick ${pick.pick_no} roster_id disagrees with picked_by`);
    }
  }
}

// draft.slot_to_roster_id points into the same Sleeper space; remap it too so
// the draft board's slot columns line up with the rosters.
if (passthrough["draft.json"] && passthrough["draft.json"].slot_to_roster_id) {
  const d = passthrough["draft.json"];
  passthrough["draft.json"] = {
    ...d,
    slot_to_roster_id: Object.fromEntries(
      Object.entries(d.slot_to_roster_id).map(([slot, r]) => [slot, n2o[r] ?? r])
    ),
  };
}

// ---------------------------------------------------------------- write
const write = (rel, data) => {
  const p = path.join(OUT_DIR, rel);
  if (DRY) return;
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n");
};

for (const [w, data] of Object.entries(outMatchups)) write(`matchups/${w}.json`, data);
write("rosters.json", outRosters);
write("users.json", outUsers);
write("league.json", outLeague);
if (outTransactions) write("transactions.json", outTransactions);
for (const [f, data] of Object.entries(passthrough)) write(f, data);

// ---------------------------------------------------------------- report
console.log(DRY ? "DRY RUN - nothing written\n" : "2019 rebuilt\n");
console.log(`  weeks                      ${report.weeks}`);
console.log(`  team-weeks                 ${report.teamWeeks}`);
console.log(`  reconciled exactly         ${report.exact}`);
console.log(`  attributed from box scores      ${report.attributedManual}`);
console.log(`  attributed to a missing starter ${report.attributedMissing}`);
console.log(`  attributed to the defence       ${report.attributedDefense}`);
console.log(`  left as an unattributed residual ${report.residuals.length}`);
console.log(`  total |adjustment|         ${report.totalAdjustment}`);
console.log(`  lineups differing from Sleeper ${report.lineupDiffs}`);
console.log(`  divisions grafted          ${report.divisionsGrafted}`);
console.log(`  picks remapped to rosters  ${picksRemapped} of ${(passthrough["picks.json"] || []).length}`);
console.log(`  player id aliases resolved ${Object.keys(alias).length}`);
for (const e of aliasEvidence) console.log(`    ${e}`);
if (outTransactions) {
  console.log(
    `  transactions remapped      ${outTransactions.length} (${txAgree}/${txChecked} verified against their NFL.com notes)`
  );
}
console.log("\n  unattributed residuals:");
for (const r of report.residuals) {
  console.log(
    `    wk${String(r.week).padStart(2)} roster ${String(r.roster_id).padStart(2)}  ${String(r.residual).padStart(8)}  unscored: ${r.unscored.join(", ") || "none"}`
  );
}
