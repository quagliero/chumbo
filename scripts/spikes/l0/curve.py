"""
L0 spike, part two: turn a week's scoring events into two teams' curves,
reconciled to the official score, with lead changes and the deciding play.

usage: python3 scripts/spikes/l0/curve.py TIMELINE.json MATCHUP_ID OUT.svg
       node scripts/spikes/l0/render.cjs OUT.svg   # -> OUT.png
"""
import json, os, sys
from datetime import datetime, timezone, timedelta

tl = json.load(open(sys.argv[1]))
mid = int(sys.argv[2])
out = sys.argv[3]
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
players = json.load(open(f"{REPO}/src/data/players.json"))

teams = [(name, v) for name, v in tl.items() if v["matchup_id"] == mid]
assert len(teams) == 2, teams

UK = timezone.utc  # printed times are UTC; the chart uses the NFL slots below
def when(iso):
    return datetime.fromisoformat(iso.replace("Z", "+00:00"))

def label(sid):
    p = players.get(sid)
    if not p or p.get("position") == "DEF":
        return f"{sid} D/ST"
    return f"{p['first_name'][0]}. {p['last_name']}"

# The NFL's slots, named from US Eastern time, which is how the week is spoken
# about: nobody calls Thursday night's game "Friday".
ET = timezone(timedelta(hours=-4))
def slot(t):
    e = t.astimezone(ET)
    day = e.strftime("%a")
    if day == "Sun":
        return "Sun early" if e.hour < 16 else "Sun late" if e.hour < 19 else "Sunday night"
    return {"Thu": "Thursday night", "Mon": "Monday night", "Tue": "Monday night"}.get(day, day)

series = {}
for name, v in teams:
    evs = sorted(v["events"], key=lambda e: e[0])
    total = sum(e[2] for e in evs)
    # Reconcile: whatever the rebuild missed goes in at the last moment,
    # so the line ends exactly on Sleeper's score.
    residual = round(v["official"] - total, 2)
    if abs(residual) >= 0.01 and evs:
        evs.append((evs[-1][0], "adj", residual, "stat correction"))
    series[name] = evs

# merge into one timeline of (time, team, pts, player, why)
merged = sorted(
    ((when(t), name, pts, sid, why) for name, evs in series.items() for t, sid, pts, why in evs),
    key=lambda e: e[0],
)
(a, _), (b, _) = teams
score = {a: 0.0, b: 0.0}
points = []  # (time, score a, score b)
leader, lead_changes, took_lead_for_good = None, [], None
for t, name, pts, sid, why in merged:
    score[name] += pts
    points.append((t, score[a], score[b]))
    now = a if score[a] > score[b] else b if score[b] > score[a] else None
    if now and now != leader:
        if leader is not None:
            lead_changes.append((t, now, sid, why))
        leader = now
        took_lead_for_good = (t, now, sid, why, score[a], score[b])

winner = a if score[a] > score[b] else b
print(f"{a} {score[a]:.2f} – {score[b]:.2f} {b}   (official {dict(teams)[a]['official']} – {dict(teams)[b]['official']})")
print(f"{len(lead_changes)} lead changes")
for t, who, sid, why in lead_changes:
    print(f"  {t.astimezone(UK):%a %H:%M} {who} ahead — {label(sid) if sid != 'adj' else 'correction'}, {why}")
decided_at, who, sid, why, sa, sb = took_lead_for_good
print(f"decided: {who} took the lead for good, {slot(decided_at)} ({decided_at.astimezone(UK):%a %H:%M} UTC) — {label(sid)}, {why} ({sa:.1f}–{sb:.1f})")

# --- SVG: time axis with the dead hours squeezed out ---------------------------
W, H, PAD = 1100, 420, 56
GAP = timedelta(hours=2)
xs, cursor, last = [], 0.0, None
for t, *_ in points:
    if last is not None:
        step = (t - last).total_seconds()
        cursor += min(step, 1800) if step > GAP.total_seconds() else step
    xs.append(cursor)
    last = t
span = xs[-1] or 1
top = max(max(p[1], p[2]) for p in points) * 1.05
X = lambda x: PAD + (W - 2 * PAD) * x / span
Y = lambda y: H - PAD - (H - 2 * PAD) * y / top

def path(idx):
    d, prev = [], None
    for x, p in zip(xs, points):
        y = p[idx]
        if prev is not None:
            d.append(f"L{X(x):.1f},{Y(prev):.1f}")  # steps: hold, then jump
        d.append(f"{'M' if prev is None else 'L'}{X(x):.1f},{Y(y):.1f}")
        prev = y
    return " ".join(d)

days, seen = [], set()
for x, p in zip(xs, points):
    day = slot(p[0])
    if day not in seen:
        seen.add(day)
        days.append((x, day))

colour = {a: "#2a78d6", b: "#eb6834"}
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" font-family="Helvetica, Arial, sans-serif">',
       f'<rect width="{W}" height="{H}" fill="#fff"/>',
       f'<text x="{PAD}" y="30" font-size="20" font-weight="700" fill="#151922">{a} {score[a]:.1f} – {score[b]:.1f} {b}: how the week unfolded</text>']
for x, day in days:
    svg.append(f'<line x1="{X(x):.1f}" x2="{X(x):.1f}" y1="{PAD}" y2="{H-PAD}" stroke="#dce0e9"/>')
    svg.append(f'<text x="{X(x)+4:.1f}" y="{H-PAD+18}" font-size="13" fill="#69738a">{day}</text>')
for y in range(0, int(top), 25):
    svg.append(f'<text x="{PAD-8}" y="{Y(y)+4:.1f}" font-size="12" fill="#98a0b3" text-anchor="end">{y}</text>')
for idx, name in ((1, a), (2, b)):
    svg.append(f'<path d="{path(idx)}" fill="none" stroke="{colour[name]}" stroke-width="3"/>')
    svg.append(f'<text x="{W-PAD+6}" y="{Y(points[-1][idx])+4:.1f}" font-size="14" font-weight="700" fill="{colour[name]}">{name}</text>')
tx = xs[[p[0] for p in points].index(decided_at)]
svg.append(f'<circle cx="{X(tx):.1f}" cy="{Y(max(sa, sb)):.1f}" r="6" fill="none" stroke="#151922" stroke-width="2"/>')
svg.append(f'<text x="{X(tx)-8:.1f}" y="{Y(max(sa, sb))-12:.1f}" font-size="13" fill="#151922" text-anchor="end">{who} ahead for good: {label(sid)}, {why}</text>')
svg.append("</svg>")
open(out, "w").write("\n".join(svg))
print(f"-> {out}")
