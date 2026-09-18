#!/usr/bin/env node
/**
 * Box scores from the NFL's play-by-play (L1).
 *
 * For every week of a season, every player on a Chumbo roster that week gets
 * his real stat line — "22/31, 287 yds, 2 TD, 1 INT · 3 car, 12 yds" — and the
 * NFL team he played for, written to `src/data/<year>/weeks/<week>.json`,
 * with the week's scoring timelines (L2) beside them.
 *
 * The source is nflverse's play-by-play (github.com/nflverse/nflverse-data,
 * CC-BY 4.0, credited on the site), ~18 MB a season, read from NFLVERSE_DIR
 * and never committed. `--download` fetches the seasons asked for into
 * `.cache/nflverse` first.
 *
 * **It checks itself.** The same pass rebuilds every starter's fantasy points
 * from the plays, with that season's own `scoring_settings`, and compares
 * them with Sleeper's. L0 found them equal to the hundredth for 1,828 of
 * 1,834 starters in 2025 and 1,403 of 1,404 in 2018; a starter who rebuilds
 * to nothing while Sleeper has points is usually the wrong player on the
 * roster (2018's "M Harris" was), so those are reported for fixing in
 * `fix-player-ids.js`. The scoring rules were all found by that comparison,
 * and each is commented where it is applied — see BUILD_PLAN.md, L0.
 *
 *   NFLVERSE_DIR=/path yarn build-gamedays [--year 2025]… [--week 7]… [--download [--refresh]]
 *
 * With no --year, every season with a play-by-play file present.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(root, "src/data");
const args = process.argv.slice(2);
const values = (flag) =>
  args.flatMap((arg, i) => (arg === flag ? [args[i + 1]] : []));
const DIR = process.env.NFLVERSE_DIR || path.join(root, ".cache/nflverse");
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));

const PBP_URL = (year) =>
  `https://github.com/nflverse/nflverse-data/releases/download/pbp/play_by_play_${year}.csv.gz`;
const IDS_URL =
  "https://raw.githubusercontent.com/dynastyprocess/data/master/files/db_playerids.csv";

/* ------------------------------------------------------------------ CSV */

/** RFC 4180, the whole file at once: nflverse quotes play descriptions. */
const parseCsv = (text) => {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(field);
      field = "";
    } else if (c === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (c !== "\r") field += c;
  }
  if (field || row.length) {
    row.push(field);
    rows.push(row);
  }
  const [header, ...body] = rows;
  return body.map((cells) =>
    Object.fromEntries(header.map((name, i) => [name, cells[i] ?? ""]))
  );
};

const readCsv = (file) => {
  const buffer = fs.readFileSync(file);
  return parseCsv(
    (file.endsWith(".gz") ? zlib.gunzipSync(buffer) : buffer).toString("utf8")
  );
};

/* ------------------------------------------------------------- the ids */

/** Sleeper id → gsis id, and a legacy name → gsis id for the NFL.com years. */
const loadIds = () => {
  const gsisBySleeper = new Map();
  const gsisByName = new Map();
  for (const row of readCsv(path.join(DIR, "db_playerids.csv"))) {
    const gsis = row.gsis_id;
    if (!gsis || gsis === "NA") continue;
    if (row.sleeper_id && row.sleeper_id !== "NA") {
      gsisBySleeper.set(row.sleeper_id.split(".")[0], gsis);
    }
    if (row.name && !gsisByName.has(row.name)) gsisByName.set(row.name, gsis);
  }
  // The raw Sleeper dumps carried gsis ids too (A1); fill any gaps.
  const map = readJson(path.join(root, "scripts/data/player-id-map.json"));
  for (const [sleeperId, ids] of Object.entries(map)) {
    if (ids.gsis_id && !gsisBySleeper.has(sleeperId)) {
      gsisBySleeper.set(sleeperId, String(ids.gsis_id).trim());
    }
  }
  return { gsisBySleeper, gsisByName };
};

/** nflverse's team codes where Sleeper's differ. */
const TEAM = { LA: "LAR", JAC: "JAX", WSH: "WAS" };
const team = (code) => (!code || code === "NA" ? "" : TEAM[code] ?? code);

/* ---------------------------------------------------------- the season */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const yes = (v) => v === "1" || v === "1.0";
const id = (v) => (v && v !== "NA" ? v : "");

/** Plays of one regular or post season, grouped by week, times filled in. */
const loadPlays = (year) => {
  const byWeek = new Map();
  for (const play of readCsv(path.join(DIR, `play_by_play_${year}.csv.gz`))) {
    if (!play.play_type || play.play_type === "NA") continue;
    const week = Number(play.week);
    if (!byWeek.has(week)) byWeek.set(week, []);
    byWeek.get(week).push(play);
  }
  for (const plays of byWeek.values()) {
    plays.sort(
      (a, b) =>
        a.game_id.localeCompare(b.game_id) || num(a.play_id) - num(b.play_id)
    );
    // About 1% of 2018's plays have no wall-clock time, 64 of them scoring.
    // Dropped, they took whole field goals with them; a timeless play takes
    // the time of the play before it in the same game (after it, at the start).
    const time = (p) => (p.time_of_day && p.time_of_day !== "NA" ? p.time_of_day : "");
    for (let i = 0; i < plays.length; i++) {
      plays[i].time_of_day = time(plays[i]);
      if (!plays[i].time_of_day && i && plays[i - 1].game_id === plays[i].game_id) {
        plays[i].time_of_day = plays[i - 1].time_of_day;
      }
    }
    for (let i = plays.length - 2; i >= 0; i--) {
      if (!plays[i].time_of_day && plays[i + 1].game_id === plays[i].game_id) {
        plays[i].time_of_day = plays[i + 1].time_of_day;
      }
    }
  }
  return byWeek;
};

/**
 * One week: every player's counting stats, every D/ST's, and every fantasy
 * point with the time it was scored. Keys are gsis ids, and `DEF:<team>`.
 */
const scoreWeek = (plays, scoring) => {
  const sc = (key) => scoring[key] ?? 0;
  const lines = new Map();
  const line = (key) => {
    if (!lines.has(key)) lines.set(key, { stats: {}, teams: new Map() });
    return lines.get(key);
  };
  const count = (key, stat, n = 1) => {
    if (!key || !n) return;
    const s = line(key).stats;
    s[stat] = (s[stat] ?? 0) + n;
  };
  const playedFor = (key, teamCode) => {
    if (!key || !teamCode) return;
    const teams = line(key).teams;
    teams.set(teamCode, (teams.get(teamCode) ?? 0) + 1);
  };
  const points = new Map();
  // L2: every scoring moment, one per player per play — a 40-yard touchdown
  // catch is one moment worth 10, not a 4 and a 6 — with the play it came
  // from, for the week's timelines.
  const moments = new Map();
  let current = null;
  const add = (time, key, pts, why) => {
    if (!key || !pts) return;
    points.set(key, (points.get(key) ?? 0) + pts);
    const id = `${current?.id ?? time}|${key}`;
    const moment = moments.get(id);
    if (moment) {
      moment.pts += pts;
      moment.whys.push(why);
    } else {
      moments.set(id, { time, key, pts, whys: [why], play: current });
    }
  };

  const finals = new Map();
  // Sleeper's points allowed leaves out the 6 of a defensive touchdown (not
  // the conversion after it) and a safety's 2. Kick and punt returns, blocked
  // kicks run back included, still count against the defence.
  const notAllowed = new Map();
  const forgive = (game, teamCode, pts) =>
    notAllowed.set(`${game}|${teamCode}`, (notAllowed.get(`${game}|${teamCode}`) ?? 0) + pts);

  const ordered = [...plays].sort(
    (a, b) =>
      (Date.parse(a.time_of_day) || Infinity) - (Date.parse(b.time_of_day) || Infinity) ||
      a.game_id.localeCompare(b.game_id) ||
      num(a.play_id) - num(b.play_id)
  );

  for (const p of ordered) {
    const t = p.time_of_day;
    const game = p.game_id;
    current = {
      id: `${game}|${p.play_id}`,
      desc: p.desc,
      game: `${team(p.away_team)} @ ${team(p.home_team)}`,
      quarter: p.qtr,
    };
    finals.set(game, {
      home: team(p.home_team),
      away: team(p.away_team),
      homeScore: num(p.home_score),
      awayScore: num(p.away_score),
      time: t,
    });
    const pos = team(p.posteam);
    const def = team(p.defteam);
    const passer = id(p.passer_player_id);
    const rusher = id(p.rusher_player_id);
    const receiver = id(p.receiver_player_id);
    const kicker = id(p.kicker_player_id);
    const twoPoint = yes(p.two_point_attempt);
    const twoGood = p.two_point_conv_result === "success";
    const scorerTeam = team(p.td_team);

    if (
      yes(p.touchdown) && scorerTeam && scorerTeam === def &&
      ["pass", "run", "qb_spike", "qb_kneel", "no_play"].includes(p.play_type)
    ) {
      forgive(game, scorerTeam, 6);
    }
    if (yes(p.safety) && def) forgive(game, def, 2);

    for (const key of [passer, rusher, receiver, kicker]) playedFor(key, pos);

    // Passing. Sacks are not attempts; a two-point try is not either.
    const attempt =
      passer && !yes(p.sack) && !twoPoint &&
      (yes(p.complete_pass) || yes(p.incomplete_pass) || yes(p.interception));
    if (attempt) {
      count(passer, "pAtt");
      if (yes(p.complete_pass)) count(passer, "pCmp");
      if (receiver) count(receiver, "tgt");
    }
    count(passer, "pYd", num(p.passing_yards));
    add(t, passer, num(p.passing_yards) * sc("pass_yd"), "pass yds");
    if (yes(p.pass_touchdown)) {
      count(passer, "pTd");
      add(t, passer, sc("pass_td"), "pass TD");
    }
    if (yes(p.interception)) {
      count(passer, "int");
      add(t, passer, sc("pass_int"), "INT");
    }

    // Rushing and receiving, laterals included.
    if (rusher && yes(p.rush_attempt) && !twoPoint) count(rusher, "rAtt");
    count(rusher, "rYd", num(p.rushing_yards));
    add(t, rusher, num(p.rushing_yards) * sc("rush_yd"), "rush yds");
    const lateralRusher = id(p.lateral_rusher_player_id);
    count(lateralRusher, "rYd", num(p.lateral_rushing_yards));
    add(t, lateralRusher, num(p.lateral_rushing_yards) * sc("rush_yd"), "rush yds");
    if (receiver && yes(p.complete_pass) && !twoPoint) count(receiver, "rec");
    count(receiver, "reYd", num(p.receiving_yards));
    add(t, receiver, num(p.receiving_yards) * sc("rec_yd"), "rec yds");
    const lateralReceiver = id(p.lateral_receiver_player_id);
    count(lateralReceiver, "reYd", num(p.lateral_receiving_yards));
    add(t, lateralReceiver, num(p.lateral_receiving_yards) * sc("rec_yd"), "rec yds");

    const tdPlayer = id(p.td_player_id);
    if (yes(p.touchdown) && tdPlayer) {
      if (yes(p.pass_touchdown) && tdPlayer === receiver) {
        count(tdPlayer, "reTd");
        add(t, tdPlayer, sc("rec_td"), "rec TD");
      } else if (yes(p.rush_touchdown) && tdPlayer === rusher) {
        count(tdPlayer, "rTd");
        add(t, tdPlayer, sc("rush_td"), "rush TD");
      } else if (scorerTeam === pos && !["kickoff", "punt"].includes(p.play_type)) {
        // A lateral or a recovered fumble taken in by the offence.
        count(tdPlayer, "reTd");
        add(t, tdPlayer, sc("rec_td"), "TD");
      } else {
        // A kick or punt returned by an offensive player.
        count(tdPlayer, "stTd");
        add(t, tdPlayer, sc("st_td"), "return TD");
      }
    }

    if (twoGood) {
      count(passer, "2pt");
      count(receiver, "2pt");
      count(rusher, "2pt");
      add(t, passer, sc("pass_2pt"), "2pt pass");
      add(t, receiver, sc("rec_2pt"), "2pt rec");
      add(t, rusher, sc("rush_2pt"), "2pt rush");
    }

    // A play can hold two fumbles, and `fumble_lost` says only that one of
    // them was lost. Each is charged to its own fumbler, and only if the other
    // side recovered it: Carr's sack-fumble his lineman fell on, before the
    // lineman fumbled it away, is not Carr's lost fumble.
    const fumbles = [
      [id(p.fumbled_1_player_id), team(p.fumbled_1_team), team(p.fumble_recovery_1_team)],
      [id(p.fumbled_2_player_id), team(p.fumbled_2_team), team(p.fumble_recovery_2_team)],
    ];
    const lost = fumbles.filter(
      ([fumbler, by, recoveredBy]) => fumbler && by && recoveredBy && by !== recoveredBy
    );
    // Some lost fumbles carry no recovery team at all; then the play's own
    // flag is all there is, and it means the first fumbler.
    if (!lost.length && yes(p.fumble_lost) && id(p.fumbled_1_player_id)) {
      lost.push(fumbles[0]);
    }
    for (const [fumbler] of lost) {
      count(fumbler, "fl");
      add(t, fumbler, sc("fum_lost"), "fumble lost");
    }

    // Kicking.
    const distance = num(p.kick_distance);
    const band =
      distance < 20 ? "0_19" : distance < 30 ? "20_29" : distance < 40 ? "30_39" : distance < 50 ? "40_49" : "50p";
    if (kicker && p.field_goal_result && p.field_goal_result !== "NA") {
      count(kicker, "fgAtt");
      if (p.field_goal_result === "made") {
        count(kicker, "fgm");
        const s = line(kicker).stats;
        (s.fgLong = Math.max(s.fgLong ?? 0, distance));
        // 2020-21 scored a field goal by the yard — 3, plus 0.1 a yard past
        // 30 — where every other season uses distance bands.
        const byYard = sc("fgm") + Math.max(0, distance - 30) * sc("fgm_yds_over_30");
        add(t, kicker, sc(`fgm_${band}`) + byYard, `FG ${distance}`);
      } else {
        add(t, kicker, sc(`fgmiss_${band}`), `FG miss ${distance}`);
      }
    }
    if (kicker && p.extra_point_result && p.extra_point_result !== "NA") {
      count(kicker, "xpAtt");
      if (p.extra_point_result === "good") {
        count(kicker, "xpm");
        add(t, kicker, sc("xpm"), "XP");
      } else {
        add(t, kicker, sc("xpmiss"), "XP miss");
      }
    }

    // Team defence and special teams.
    const d = def ? `DEF:${def}` : "";
    if (d) {
      if (yes(p.sack)) {
        count(d, "sk");
        add(t, d, sc("sack"), "sack");
      }
      if (yes(p.interception)) {
        count(d, "int");
        add(t, d, sc("int"), "INT");
      }
      const forcedBy = team(p.forced_fumble_player_1_team);
      if (forcedBy === def) {
        count(d, "ff");
        add(t, d, sc("ff"), "forced fumble");
      }
      if (yes(p.safety)) {
        count(d, "sf");
        add(t, d, sc("safe"), "safety");
      }
      if (
        yes(p.punt_blocked) ||
        p.field_goal_result === "blocked" ||
        p.extra_point_result === "blocked"
      ) {
        count(d, "blk");
        add(t, d, sc("blk_kick"), "blocked kick");
      }
      if (yes(p.defensive_two_point_conv)) add(t, d, sc("def_2pt"), "def 2pt");
      // 2020-21 only: half a point a tackle for loss — and Sleeper counts a
      // sack as one, which nflverse's tackle-for-loss column does not.
      if (yes(p.tackled_for_loss) || yes(p.sack)) {
        count(d, "tfl");
        add(t, d, sc("tkl_loss"), "tackle for loss");
      }
    }
    // A fumble recovery is the recovering team's if it did not fumble, whoever
    // had the ball: on a punt nflverse has the kicking side in possession, and
    // a defender can fumble an interception back to the offence.
    for (const [, fumbled, recovered] of fumbles) {
      if (!fumbled || !recovered || fumbled === recovered) continue;
      const kick = ["punt", "kickoff"].includes(p.play_type);
      count(`DEF:${recovered}`, "fr");
      add(t, `DEF:${recovered}`, (kick ? sc("def_st_fum_rec") : 0) || sc("fum_rec"), "fumble rec");
    }
    if (yes(p.touchdown) && scorerTeam) {
      const kick = ["kickoff", "punt"].includes(p.play_type);
      if (kick || scorerTeam === def) {
        count(`DEF:${scorerTeam}`, "td");
        add(t, `DEF:${scorerTeam}`, sc(kick ? "def_st_td" : "def_td"), kick ? "return TD" : "defensive TD");
      }
    }
  }

  const allowedPoints = (pts) =>
    pts === 0 ? sc("pts_allow_0")
    : pts <= 6 ? sc("pts_allow_1_6")
    : pts <= 13 ? sc("pts_allow_7_13")
    : pts <= 20 ? sc("pts_allow_14_20")
    : pts <= 27 ? sc("pts_allow_21_27")
    : pts <= 34 ? sc("pts_allow_28_34")
    : sc("pts_allow_35p");
  for (const [game, f] of finals) {
    for (const [side, opponentScore, opponent] of [
      [f.home, f.awayScore, f.away],
      [f.away, f.homeScore, f.home],
    ]) {
      const allowed = opponentScore - (notAllowed.get(`${game}|${opponent}`) ?? 0);
      current = {
        id: `${game}|final|${side}`,
        desc: `Final: ${f.away} ${f.awayScore}, ${f.home} ${f.homeScore}. ${side} allowed ${allowed} for fantasy.`,
        game: `${f.away} @ ${f.home}`,
        quarter: "final",
      };
      line(`DEF:${side}`).stats.pa = allowed;
      playedFor(`DEF:${side}`, side);
      // Bands in most seasons; 2020-21 took a tenth of a point per point.
      add(
        f.time,
        `DEF:${side}`,
        allowedPoints(allowed) + allowed * sc("pts_allow"),
        `allowed ${allowed}`
      );
    }
  }

  return { lines, points, moments: [...moments.values()] };
};

/* ---------------------------------------------------------------- output */

/** The team he played most snaps-with-the-ball for that week. */
const mainTeam = (teams) =>
  [...teams.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "";

const round = (n) => Math.round(n * 100) / 100;

/**
 * Where a season's saved `scoring_settings` do not describe how it was
 * actually scored. 2012-2016's say a kick or punt returned for a touchdown is
 * worth 6 to the returner, but not one of that era's official scores
 * includes it — every return touchdown by a rostered player in those five
 * seasons (Sproles, Spiller, Harvin, Antonio Brown, Landry, Lockett, Tyreek
 * Hill…) rebuilt exactly 6 over Sleeper's number. The NFL.com years scored
 * the returner nothing; from 2017 the settings are true.
 */
const SCORING_AS_PLAYED = {
  2012: { st_td: 0 },
  2013: { st_td: 0 },
  2014: { st_td: 0 },
  2015: { st_td: 0 },
  2016: { st_td: 0 },
};

const buildSeason = (year, weeksWanted, ids) => {
  const seasonDir = path.join(dataRoot, String(year));
  const scoring = {
    ...readJson(path.join(seasonDir, "league.json")).scoring_settings,
    ...SCORING_AS_PLAYED[year],
  };
  const rosters = new Map(
    readJson(path.join(seasonDir, "rosters.json")).map((r) => [r.roster_id, r.owner_id])
  );
  const plays = loadPlays(year);

  // The play-by-play's own abbreviated names ("W.McGahee"), for players the
  // id table does not know — retired before it was built, or keyed by name
  // in the NFL.com years. Only a name that is one player all season counts.
  const byShortName = new Map();
  for (const weekPlays of plays.values()) {
    for (const p of weekPlays) {
      for (const role of ["passer", "rusher", "receiver", "kicker"]) {
        const name = p[`${role}_player_name`];
        const gsis = id(p[`${role}_player_id`]);
        if (!name || name === "NA" || !gsis) continue;
        if (!byShortName.has(name)) byShortName.set(name, new Set());
        byShortName.get(name).add(gsis);
      }
    }
  }
  const dictionary = readJson(path.join(dataRoot, "players.json"));
  const shortName = (full) => {
    const parts = String(full).replace(/\./g, "").trim().split(/\s+/);
    if (parts.length < 2) return "";
    return `${parts[0][0]}.${parts.slice(1).join(" ")}`;
  };
  const byName = (pid) => {
    const full = dictionary[pid]?.full_name ?? pid;
    const found = byShortName.get(shortName(full));
    return found?.size === 1 ? [...found][0] : null;
  };
  const outDir = path.join(seasonDir, "weeks");
  // Held until the season has passed its check: a season that fails leaves
  // the files already committed exactly as they were.
  const pending = new Map();
  // Each rostered player's team the first week he played that season — the
  // team a draft board should show him on. Read by `yarn build-players`.
  const seasonTeams = {};

  // Players and team defences are counted apart. A player is either the
  // right man or not; a D/ST can be a point or two out on a stat the two
  // sources define differently (2020-21's tackles for loss) with nothing wrong.
  const report = {
    starters: 0, exact: 0, withinOne: 0,
    defences: 0, defencesExact: 0,
    suspects: [], unmapped: new Set(), weeks: 0,
  };

  const keyFor = (playerId) => {
    const pid = String(playerId);
    if (pid === "0") return null;
    if (/^[A-Z]{2,3}$/.test(pid)) return `DEF:${pid}`;
    return ids.gsisBySleeper.get(pid) ?? ids.gsisByName.get(pid) ?? byName(pid);
  };

  for (let week = 1; week <= 17; week++) {
    if (weeksWanted.length && !weeksWanted.includes(week)) continue;
    const matchupFile = path.join(seasonDir, "matchups", `${week}.json`);
    if (!fs.existsSync(matchupFile) || !plays.has(week)) continue;
    const matchups = readJson(matchupFile);
    if (!matchups.some((m) => (m.points ?? 0) > 0)) continue;

    const { lines, points, moments } = scoreWeek(plays.get(week), scoring);
    const players = {};
    const timelines = {};

    for (const matchup of matchups) {
      const starters = new Set((matchup.starters ?? []).map(String));
      timelines[matchup.roster_id] = timelineFor(matchup, moments, keyFor);
      for (const playerId of matchup.players ?? []) {
        const pid = String(playerId);
        if (!pid || pid === "0") continue;
        const key = keyFor(pid);
        if (!key) {
          report.unmapped.add(pid);
          // A starter nobody can find is a miss, not a skip.
          if (starters.has(pid)) {
            report.starters++;
            report.suspects.push({
              week, playerId: pid, gsis: "?", official: matchup.players_points?.[pid] ?? 0, rebuilt: 0,
            });
          }
          continue;
        }
        const found = lines.get(key);
        if (found) {
          const stats = Object.fromEntries(
            Object.entries(found.stats).map(([k, v]) => [k, round(v)])
          );
          players[pid] = { t: mainTeam(found.teams), s: stats };
          if (!/^[A-Z]{2,3}$/.test(pid) && players[pid].t && !(pid in seasonTeams)) {
            seasonTeams[pid] = players[pid].t;
          }
        }

        if (!starters.has(pid)) continue;
        const official = matchup.players_points?.[pid] ?? 0;
        const rebuilt = round(points.get(key) ?? 0);
        const gap = Math.abs(rebuilt - official);
        if (key.startsWith("DEF:")) {
          report.defences++;
          if (gap < 0.05) report.defencesExact++;
          continue;
        }
        report.starters++;
        if (gap < 0.05) report.exact++;
        if (gap < 1) report.withinOne++;
        // Points with nothing behind them is the wrong player, not a stat
        // correction: 2018's "M Harris" looked exactly like this.
        if (gap >= 1) {
          report.suspects.push({
            week, playerId: pid, gsis: key, official, rebuilt,
            owner: rosters.get(matchup.roster_id),
          });
        }
      }
    }

    const sorted = Object.fromEntries(
      Object.entries(players).sort(([a], [b]) => a.localeCompare(b))
    );
    // One file a week (L1 + L2): the matchup page wants both, together.
    pending.set(
      week,
      JSON.stringify({ v: 1, players: sorted, ...encodeTimelines(timelines) }) + "\n"
    );
    report.weeks++;
  }
  report.write = () => {
    const teamsFile = path.join(root, "scripts/data/season-teams", `${year}.json`);
    fs.mkdirSync(path.dirname(teamsFile), { recursive: true });
    const sortedTeams = Object.fromEntries(
      Object.entries(seasonTeams).sort(([a], [b]) => a.localeCompare(b))
    );
    fs.writeFileSync(teamsFile, JSON.stringify(sortedTeams, null, 0) + "\n");
    fs.mkdirSync(outDir, { recursive: true });
    for (const [week, text] of pending) {
      const file = path.join(outDir, `${week}.json`);
      // Unchanged files are left alone, so a rerun is not a commit.
      if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) continue;
      fs.writeFileSync(file, text);
    }
  };
  return report;
};

/* ------------------------------------------------------------- timelines */

/** A key play: a touchdown, or anything worth more than 5 to one starter. */
const isKey = (moment) =>
  moment.pts > 5 || moment.whys.some((why) => /TD$/.test(why));

/** "(8:24) (Shotgun) 7-J.Brissett sacked…" → the clock, and the rest. */
const splitDesc = (desc = "") => {
  const match = desc.match(/^\((\d{1,2}:\d{2})\)\s*(.*)$/);
  const text = (match ? match[2] : desc).replace(/^\((?:No Huddle, )?Shotgun\)\s*/, "");
  return { clock: match?.[1] ?? "", text: text.length > 220 ? `${text.slice(0, 217)}…` : text };
};

/**
 * One team's week (L2): its starters' scoring moments in order, each starter
 * reconciled to Sleeper's number. Whatever the rebuild missed — a stat
 * correction, the abandoned 2022 Bills–Bengals game — goes in after that
 * starter's last moment as a correction, so the line ends exactly on the
 * official score, and a correction is never drawn as a play.
 */
const timelineFor = (matchup, moments, keyFor) => {
  const starters = (matchup.starters ?? []).map(String).filter((pid) => pid !== "0");
  const events = [];
  const lastTime = moments.reduce(
    (latest, m) => (!latest || Date.parse(m.time) > Date.parse(latest) ? m.time : latest),
    ""
  );
  starters.forEach((pid, index) => {
    const key = keyFor(pid);
    const mine = key ? moments.filter((m) => m.key === key) : [];
    let total = 0;
    for (const moment of mine) {
      total += moment.pts;
      events.push({ moment, index });
    }
    const official = matchup.players_points?.[pid] ?? 0;
    const residual = round(official - total);
    if (Math.abs(residual) >= 0.01) {
      const at = mine.length ? mine[mine.length - 1].time : lastTime;
      events.push({ moment: { time: at, pts: residual, whys: ["correction"] }, index, correction: true });
    }
  });
  // By the clock, not the text: "…27Z" and "…27.5Z" sort the wrong way round
  // as strings.
  events.sort(
    (a, b) => Date.parse(a.moment.time) - Date.parse(b.moment.time) || a.index - b.index
  );
  // Sixteen NFL.com-era team scores are not quite the sum of their starters.
  // The team score is the official one, so it gets the last word: a team
  // correction (starter -1) at the end of the week.
  const startersTotal = starters.reduce(
    (sum, pid) => sum + (matchup.players_points?.[pid] ?? 0),
    0
  );
  const teamResidual = round((matchup.points ?? 0) - startersTotal);
  if (Math.abs(teamResidual) >= 0.01) {
    events.push({
      moment: { time: lastTime, pts: teamResidual, whys: ["correction"] },
      index: -1,
      correction: true,
    });
  }
  return { starters, events };
};

/**
 * The week's timelines. Times are seconds from the week's first moment,
 * points in hundredths — integers, so the file is small and the sums exact:
 *
 *   { t0, teams: { [rosterId]: { s: [starter ids], e: [[dt, starter, pts100, extra?]] } } }
 *
 * `starter` is -1 for a team-level correction (see `timelineFor`).
 * `extra` is 1 for a correction, or a key play's details:
 * { w: what scored, d: the play, g: "LV @ KC", q: quarter, c: clock }.
 */
const encodeTimelines = (timelines) => {
  const times = Object.values(timelines).flatMap((t) => t.events.map((e) => e.moment.time));
  const t0 = times.length ? Math.min(...times.map((t) => Date.parse(t))) : 0;
  const teams = {};
  for (const [rosterId, { starters, events }] of Object.entries(timelines)) {
    teams[rosterId] = {
      s: starters,
      e: events.map(({ moment, index, correction }) => {
        const row = [
          Math.round((Date.parse(moment.time) - t0) / 1000),
          index,
          Math.round(moment.pts * 100),
        ];
        if (correction) row.push(1);
        else if (isKey(moment)) {
          const { clock, text } = splitDesc(moment.play?.desc);
          row.push({
            w: [...new Set(moment.whys)].join(", "),
            d: text,
            g: moment.play?.game ?? "",
            q: moment.play?.quarter ?? "",
            c: clock,
          });
        }
        return row;
      }),
    };
  }
  return { t0: Math.round(t0 / 1000), teams };
};

/* ------------------------------------------------------------------ main */

const download = async (url, file) => {
  // --refresh: the live season's file grows every week, so a cached copy is
  // last week's. Past seasons do not change and are fetched once.
  if (fs.existsSync(file) && !args.includes("--refresh")) return;
  console.log(`Downloading ${url}`);
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, Buffer.from(await response.arrayBuffer()));
};

const main = async () => {
  const onDisk = fs.existsSync(DIR)
    ? fs.readdirSync(DIR).flatMap((f) => f.match(/^play_by_play_(\d{4})\.csv\.gz$/)?.[1] ?? []).map(Number)
    : [];
  const years = values("--year").map(Number);
  const weeks = values("--week").map(Number);
  const wanted = (years.length ? years : onDisk).sort((a, b) => a - b);

  if (args.includes("--download")) {
    await download(IDS_URL, path.join(DIR, "db_playerids.csv"));
    for (const year of wanted) {
      await download(PBP_URL(year), path.join(DIR, `play_by_play_${year}.csv.gz`));
    }
  }

  const ids = loadIds();
  let failed = false;
  for (const year of wanted) {
    if (!fs.existsSync(path.join(dataRoot, String(year), "league.json"))) continue;
    const r = buildSeason(year, weeks, ids);
    const pct = r.starters ? ((100 * r.exact) / r.starters).toFixed(1) : "—";
    console.log(
      `${year}: ${r.weeks} weeks · players ${r.exact}/${r.starters} exact (${pct}%), ${r.withinOne} within a point` +
        ` · D/ST ${r.defencesExact}/${r.defences} exact` +
        (r.unmapped.size ? ` · unmapped: ${[...r.unmapped].join(", ")}` : "")
    );
    for (const s of r.suspects) {
      console.log(
        `    week ${s.week}: ${s.playerId} (${s.gsis}) official ${s.official}, rebuilt ${s.rebuilt}`
      );
    }
    if (r.starters && r.exact / r.starters < 0.97) {
      console.error(`    ${year} NOT written: its players rebuilt under 97% exact.`);
      failed = true;
    } else {
      r.write();
    }
  }
  // A season that rebuilds this badly has a broken join or a changed file
  // format, not a few stat corrections: fail rather than publish it.
  if (failed) {
    console.error("\nA season's players rebuilt under 97% exact. Not trusting it.");
    process.exit(1);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
