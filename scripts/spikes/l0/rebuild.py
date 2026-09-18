"""
L0 spike: rebuild a week of Chumbo starters' fantasy points play by play from
nflverse, with each play's wall-clock time, and compare to Sleeper's official
per-player points.

usage: NFLVERSE_DIR=/path/to/downloads python3 scripts/spikes/l0/rebuild.py YEAR WEEK [--timeline out.json]

NFLVERSE_DIR holds play_by_play_<YEAR>.csv.gz and db_playerids.csv, from
github.com/nflverse/nflverse-data (pbp release) and dynastyprocess/data. They
are ~20 MB a season and never committed.

A spike (L0), kept as the reference for L1: the scoring rules it had to
discover are the valuable part, and each is commented where it is applied.
"""
import csv, gzip, json, sys, os
from collections import defaultdict

HERE = os.environ.get("NFLVERSE_DIR", ".")
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
year, week = int(sys.argv[1]), int(sys.argv[2])
timeline_out = sys.argv[sys.argv.index("--timeline") + 1] if "--timeline" in sys.argv else None

S = json.load(open(f"{REPO}/src/data/{year}/league.json"))["scoring_settings"]
sc = lambda k: S.get(k, 0) or 0

# --- ids: sleeper -> gsis ------------------------------------------------------
gsis_by_sleeper = {}
for row in csv.DictReader(open(f"{HERE}/db_playerids.csv")):
    if row["sleeper_id"] and row["gsis_id"] and row["gsis_id"] != "NA":
        gsis_by_sleeper[row["sleeper_id"].split(".")[0]] = row["gsis_id"]
for sid, ids in json.load(open(f"{REPO}/scripts/data/player-id-map.json")).items():
    if ids.get("gsis_id"):
        gsis_by_sleeper.setdefault(sid, ids["gsis_id"].strip())

# nflverse team codes vs Sleeper's
TEAM_FIX = {"LA": "LAR", "JAC": "JAX", "WSH": "WAS", "LV": "LV"}
fix = lambda t: TEAM_FIX.get(t, t)

# --- the week's play-by-play ---------------------------------------------------
plays = []
with gzip.open(f"{HERE}/play_by_play_{year}.csv.gz", "rt") as f:
    for row in csv.DictReader(f):
        if row["week"] == str(week) and row["season_type"] == "REG":
            plays.append(row)
plays.sort(key=lambda r: (r["time_of_day"] or "9", r["game_id"], float(r["order_sequence"] or 0)))

def num(v):
    try: return float(v)
    except: return 0.0
def yes(v): return v in ("1", "1.0")

# events: (time, key, points, why) — key is gsis id, or "DEF:<team>"
events = []
def add(t, key, pts, why):
    if key and key != "NA" and pts:
        events.append((t, key, pts, why))

final = {}  # game_id -> (home, away, home_score, away_score, last time)
# Points a team scored with its defence or special teams on the other side's
# possession — Sleeper leaves these out of the other side's "points allowed".
not_allowed = defaultdict(float)  # (game, scoring team) -> points
for p in plays:
    t = p["time_of_day"]
    if not t:
        continue
    g = p["game_id"]
    final[g] = (fix(p["home_team"]), fix(p["away_team"]), num(p["home_score"]), num(p["away_score"]), t)
    posteam, defteam = fix(p["posteam"]), fix(p["defteam"])
    two = p["two_point_conv_result"] == "success"

    # Sleeper's points allowed leaves out the 6 of a defensive touchdown (not
    # the conversion after it) and a safety's 2. Kick and punt returns, blocked
    # kicks run back included, still count against the defence.
    scorer_team = fix(p["td_team"]) if p["td_team"] not in ("", "NA") else None
    if (yes(p["touchdown"]) and scorer_team and scorer_team == defteam
            and p["play_type"] in ("pass", "run", "qb_spike", "qb_kneel", "no_play")):
        not_allowed[(g, scorer_team)] += 6
    if yes(p["safety"]) and defteam:
        not_allowed[(g, defteam)] += 2

    # passing
    add(t, p["passer_player_id"], num(p["passing_yards"]) * sc("pass_yd"), "pass yds")
    if yes(p["pass_touchdown"]): add(t, p["passer_player_id"], sc("pass_td"), "pass TD")
    if yes(p["interception"]): add(t, p["passer_player_id"], sc("pass_int"), "INT")
    # rushing / receiving
    add(t, p["rusher_player_id"], num(p["rushing_yards"]) * sc("rush_yd"), "rush yds")
    add(t, p["lateral_rusher_player_id"], num(p["lateral_rushing_yards"]) * sc("rush_yd"), "rush yds")
    add(t, p["receiver_player_id"], num(p["receiving_yards"]) * sc("rec_yd"), "rec yds")
    add(t, p["lateral_receiver_player_id"], num(p["lateral_receiving_yards"]) * sc("rec_yd"), "rec yds")
    if yes(p["touchdown"]) and p["td_player_id"] not in ("", "NA"):
        tdp = p["td_player_id"]
        if yes(p["pass_touchdown"]) and tdp == p["receiver_player_id"]:
            add(t, tdp, sc("rec_td"), "rec TD")
        elif yes(p["rush_touchdown"]) and tdp == p["rusher_player_id"]:
            add(t, tdp, sc("rush_td"), "rush TD")
        elif fix(p["td_team"]) == posteam and p["play_type"] in ("kickoff", "punt") :
            add(t, tdp, sc("st_td"), "return TD")
        elif fix(p["td_team"]) == posteam:
            add(t, tdp, sc("rec_td"), "TD")  # lateral / fumble-recovery TD by the offence
        else:
            add(t, tdp, sc("st_td"), "return TD")  # an offensive player scoring on a return
    # two-point conversions
    if two:
        add(t, p["passer_player_id"], sc("pass_2pt"), "2pt pass")
        add(t, p["receiver_player_id"], sc("rec_2pt"), "2pt rec")
        add(t, p["rusher_player_id"], sc("rush_2pt"), "2pt rush")
    # fumbles lost
    if yes(p["fumble_lost"]):
        add(t, p["fumbled_1_player_id"], sc("fum_lost"), "fumble lost")
    # kicking
    dist = num(p["kick_distance"])
    if p["field_goal_result"] == "made":
        band = "0_19" if dist < 20 else "20_29" if dist < 30 else "30_39" if dist < 40 else "40_49" if dist < 50 else "50p"
        add(t, p["kicker_player_id"], sc(f"fgm_{band}"), f"FG {int(dist)}")
    elif p["field_goal_result"] in ("missed", "blocked"):
        band = "0_19" if dist < 20 else "20_29" if dist < 30 else "30_39" if dist < 40 else "40_49" if dist < 50 else "50p"
        add(t, p["kicker_player_id"], sc(f"fgmiss_{band}"), f"FG miss {int(dist)}")
    if p["extra_point_result"] == "good": add(t, p["kicker_player_id"], sc("xpm"), "XP")
    elif p["extra_point_result"] in ("failed", "blocked"): add(t, p["kicker_player_id"], sc("xpmiss"), "XP miss")

    # team defence / special teams, from the defending side's view
    d = f"DEF:{defteam}" if defteam else None
    if d:
        if yes(p["sack"]): add(t, d, sc("sack"), "sack")
        if yes(p["interception"]): add(t, d, sc("int"), "INT")
        if yes(p["fumble_lost"]) and fix(p["fumble_recovery_1_team"]) == defteam:
            add(t, d, sc("fum_rec"), "fumble rec")
        if p["forced_fumble_player_1_team"] and fix(p["forced_fumble_player_1_team"]) == defteam:
            add(t, d, sc("ff"), "forced fumble")
        if yes(p["safety"]): add(t, d, sc("safe"), "safety")
        if yes(p["punt_blocked"]) or p["field_goal_result"] == "blocked" or p["extra_point_result"] == "blocked":
            add(t, d, sc("blk_kick"), "blocked kick")
        if yes(p["defensive_two_point_conv"]): add(t, d, sc("def_2pt"), "def 2pt")
    # A muffed punt or kick recovered by the kicking side: nflverse has the
    # kicking side in possession, so it is not the defteam above.
    if (p["play_type"] in ("punt", "kickoff") and yes(p["fumble_lost"])
            and fix(p["fumble_recovery_1_team"]) == posteam):
        add(t, f"DEF:{posteam}", sc("def_st_fum_rec") or sc("fum_rec"), "muff recovered")
    if yes(p["touchdown"]) and p["td_team"]:
        scorer = fix(p["td_team"])
        if p["play_type"] in ("kickoff", "punt") and scorer != fix(p["posteam"]) :
            # return team is the defteam on kicks in nflverse's convention
            add(t, f"DEF:{scorer}", sc("def_st_td"), "return TD")
        elif scorer == defteam and p["play_type"] not in ("kickoff", "punt"):
            add(t, f"DEF:{scorer}", sc("def_td"), "defensive TD")
        elif p["play_type"] in ("kickoff", "punt") and scorer == fix(p["posteam"]):
            add(t, f"DEF:{scorer}", sc("def_st_td"), "return TD")

# points allowed, at each game's final whistle
def allowed_points(pts):
    if pts == 0: return sc("pts_allow_0")
    if pts <= 6: return sc("pts_allow_1_6")
    if pts <= 13: return sc("pts_allow_7_13")
    if pts <= 20: return sc("pts_allow_14_20")
    if pts <= 27: return sc("pts_allow_21_27")
    if pts <= 34: return sc("pts_allow_28_34")
    return sc("pts_allow_35p")
for g, (home, away, hs, as_, t) in final.items():
    a_allowed = as_ - not_allowed[(g, away)]
    h_allowed = hs - not_allowed[(g, home)]
    add(t, f"DEF:{home}", allowed_points(a_allowed), f"allowed {int(a_allowed)}")
    add(t, f"DEF:{away}", allowed_points(h_allowed), f"allowed {int(h_allowed)}")

rebuilt = defaultdict(float)
for _, key, pts, _ in events:
    rebuilt[key] += pts

# --- compare with Sleeper ------------------------------------------------------
matchups = json.load(open(f"{REPO}/src/data/{year}/matchups/{week}.json"))
rosters = {r["roster_id"]: r["owner_id"] for r in json.load(open(f"{REPO}/src/data/{year}/rosters.json"))}
managers = {m["sleeper"]["id"]: m["id"] for m in json.load(open(f"{REPO}/src/data/managers.json"))}

def key_for(sid):
    if not sid.isdigit():
        return f"DEF:{sid}"
    return gsis_by_sleeper.get(sid)

diffs, unmapped, teams = [], [], []
for m in matchups:
    team_off, team_re = 0.0, 0.0
    for sid, off in zip(m["starters"], m["starters_points"]):
        if sid == "0":
            continue
        k = key_for(sid)
        re = rebuilt.get(k, 0.0) if k else None
        if k is None:
            unmapped.append(sid)
            re = 0.0
        diffs.append((abs(re - off), sid, k, off, round(re, 2)))
        team_off += off
        team_re += re
    teams.append((managers.get(rosters[m["roster_id"]], "?"), m["matchup_id"], round(m["points"], 2), round(team_re, 2)))

close = sum(1 for d in diffs if d[0] < 0.05)
print(f"{year} week {week}: {len(plays)} plays, {len(events)} scoring events")
print(f"starters: {len(diffs)}; exact (within 0.05): {close}; within 1: {sum(1 for d in diffs if d[0] < 1)}; unmapped: {unmapped}")
print("\nteams (official vs rebuilt):")
for name, mid, off, re in sorted(teams, key=lambda x: x[1] or 0):
    print(f"  #{mid} {name:8} {off:7.2f} {re:7.2f}  diff {re - off:+.2f}")
print("\nlargest player differences:")
for d in sorted(diffs, reverse=True)[:12]:
    if d[0] < 0.05: break
    print(f"  {d[1]:>6} {str(d[2]):12} official {d[3]:6.2f} rebuilt {d[4]:6.2f}")

if timeline_out:
    # per starter: every event, so a curve can be drawn per team
    lineup = {}
    for m in matchups:
        name = managers.get(rosters[m["roster_id"]], "?")
        keys = {key_for(s): s for s in m["starters"] if s != "0"}
        lineup[name] = {"matchup_id": m["matchup_id"], "official": m["points"],
            "events": [(t, keys[k], round(pts, 2), why) for t, k, pts, why in events if k in keys]}
    json.dump(lineup, open(timeline_out, "w"))
    print(f"\ntimeline -> {timeline_out}")
