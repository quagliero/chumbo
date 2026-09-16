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
const srcArg = args.indexOf("--source");
const OLD_DIR = path.resolve(
  root,
  srcArg !== -1 ? args[srcArg + 1] : "../chumbo-api/data/2019-old"
);
const CUR_DIR = path.join(root, "src/data/2019");

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const exists = (p) => fs.existsSync(p);
const round2 = (n) => Math.round(n * 100) / 100;

if (!exists(OLD_DIR)) {
  console.error(`Source not found: ${OLD_DIR}`);
  console.error("Pass --source <path to a 2019-old folder>.");
  process.exit(1);
}

const oldRosters = read(path.join(OLD_DIR, "rosters.json"));
const curRosters = read(path.join(CUR_DIR, "rosters.json"));

// Sleeper roster_id -> NFL.com roster_id, joined on owner_id.
const n2o = {};
for (const o of oldRosters) {
  const c = curRosters.find((r) => r.owner_id === o.owner_id);
  if (!c) throw new Error(`No current roster for owner ${o.owner_id}`);
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
  const curPath = path.join(CUR_DIR, `matchups/${w}.json`);
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

const report = {
  weeks: 0,
  teamWeeks: 0,
  exact: 0,
  adjusted: 0,
  totalAdjustment: 0,
  unscoredStarters: [],
  lineupDiffs: 0,
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
  const curPath = path.join(CUR_DIR, `matchups/${w}.json`);
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
    // Only present when the lineup cannot fully account for the recorded score.
    if (adjustment !== 0) out.points_adjustment = adjustment;
    return out;
  });
}

// ---------------------------------------------------------------- rosters
// OLD settings reconcile with OLD matchups exactly; keep them verbatim.
const outRosters = oldRosters.map((o) => ({ ...o }));

// ---------------------------------------------------------------- users
// Keep the current users: same user_ids, but they carry Sleeper avatars that the
// NFL.com scrape never had, and nothing here is keyed by roster_id.
const outUsers = read(path.join(CUR_DIR, "users.json"));

// ---------------------------------------------------------------- transactions
// Present only in the current data; its roster_ids are in Sleeper space and must
// be inverted. Each trade carries an NFL.com "Team N" note we verify against.
let outTransactions = null;
const txPath = path.join(CUR_DIR, "transactions.json");
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
const curLeague = read(path.join(CUR_DIR, "league.json"));
const outLeague = {
  ...curLeague,
  scoring_settings: oldLeague.scoring_settings,
  roster_positions: oldLeague.roster_positions,
};

// ---------------------------------------------------------------- passthrough
const passthrough = {};
for (const f of ["draft.json", "picks.json", "winners_bracket.json", "losers_bracket.json"]) {
  const p = path.join(OLD_DIR, f);
  if (exists(p)) passthrough[f] = read(p);
}

// ---------------------------------------------------------------- write
const write = (rel, data) => {
  const p = path.join(CUR_DIR, rel);
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
console.log(`  needed a points_adjustment ${report.adjusted}`);
console.log(`  total |adjustment|         ${report.totalAdjustment}`);
console.log(`  lineups differing from Sleeper ${report.lineupDiffs}`);
console.log(`  player id aliases resolved ${Object.keys(alias).length}`);
for (const e of aliasEvidence) console.log(`    ${e}`);
if (outTransactions) {
  console.log(
    `  transactions remapped      ${outTransactions.length} (${txAgree}/${txChecked} verified against their NFL.com notes)`
  );
}
console.log("\n  adjustments by week:");
for (const r of report.unscoredStarters) {
  console.log(
    `    wk${String(r.week).padStart(2)} roster ${String(r.roster_id).padStart(2)}  ${String(r.adjustment).padStart(8)}  unscored starters: ${r.unscored.join(", ") || "none"}`
  );
}
