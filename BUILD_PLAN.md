# The Chumbo — Build Plan

Everything from the site review, planned, sequenced and made checkable.

**How to use this doc.** Tasks are grouped into eight **workstreams** (A–H) by
subject matter, and delivered in seven **milestones** (M0–M6) by dependency and
value. The workstream sections are the specification; the milestone table at the
bottom is the running order. Tick boxes as you go.

Every task has: an ID, a size, its blockers, the files it touches, and an
acceptance test — the thing that has to be true before it's done.

**Sizes.** `XS` < 30 min · `S` ~1 hr · `M` a half day · `L` a full day · `XL` 2+ days.

**Guardrails that apply to every task**
- Nothing merges that regresses the gzipped bundle. Record the number before and after.
- Stat changes land with a test (see `H1`). The whole site is derived numbers; a
  silent arithmetic regression is the worst possible bug here because nobody
  notices until someone quotes it in the group chat.
- Mobile first on anything visual. Most opens come from a WhatsApp link on a phone.
- Two year lists must stay in sync (`YEARS`, `ValidYear`) until `H5` removes the
  duplication — see CLAUDE.md.

---

## Dependency map

The only hard ordering constraints. Everything else can run in parallel.

```
H1 (tests) ─────────────► A3, A5, C*, H2       "don't refactor stats without a net"
A1 (player dictionary) ─► A2                   "don't split data still carrying 17MB"
A2 (data loading) ──────► A4 (precompute)
B1 (tokens) ────────────► B2 (Card), B3 (DataTable)
B3 (DataTable) ─────────► B4 (column types), E8 (table deep links)
C1 (stat registry) ─────► C2–C6, D*, E7 (narrative)
F2 (manager colours) ───► D1, D2, D4, F3, G2
G1 (SVG card renderer) ─► G3 (clipboard), G6 (build-time OG images)
```

---

## Workstream A — Performance & the data layer

The single most consequential workstream. Current state: **~2.9 MB gzipped JS
parsed on every page load**, of which the overwhelming majority is never read.

### A1 · Rebuild the player dictionary as base + per-season overlays `L`
**Blocks:** A2 · **Blocked by:** — · **Impact:** 17.3 MB → ~683 KB (105 KB gzipped)

Three dictionaries (`src/data/players.json`, `2025/players.json`,
`2026/players.json`) hold 12,266 records that collapse to **4,389 unique
players**, each carrying 52 fields of which the app reads **8**
(`player_id`, `first_name`, `last_name`, `full_name`, `position`, `team`,
`number`, `fantasy_positions`).

A straight newest-wins merge would lose the player's team and position *as at that
season*, so the format is a base dictionary plus small per-season overlays.

**What actually varies between years** (measured):

| | root → 2025 | 2025 → 2026 |
|---|---|---|
| new players | 300 | 300 |
| **team changed** | **429** | **400** |
| **position changed** | **1** | **4** |
| unchanged | 3,358 | 3,683 |

Position is effectively static — one to five players a year. The overlay is almost
entirely a team map.

**Format**

```
src/data/players.json          base: union of all players, newest attributes,
                               8 fields, minified.  665 KB / 105 KB gzipped
src/data/<year>/players.delta.json
                               { "<playerId>": { "t": "<team>", "p": "<pos>" } }
                               only where that season differed from base.
                               ~400–550 entries, ~8–10 KB per season.
```

Rookies need no special handling — the base is a union, so a 2026 rookie is simply
present and never referenced by older seasons. A season with no overlay resolves
to base, which is exactly today's behaviour, so nothing regresses.

**Measured cost:** base + both overlays = 683 KB. Projected across all fifteen
seasons ≈ 800 KB raw / ~120 KB gzipped. Year-accuracy costs **+18 KB** over a flat
merge — free, relative to the 17.3 MB being removed.

**A1a — build the dictionary**
1. Rewrite `scripts/filter-players.js` into `scripts/build-players.js`:
   - merge every dictionary into one base, newest-year-wins, 8 fields, drop nulls;
   - emit a `players.delta.json` per season for any player whose team or position
     that year differed from base — normalise `null`/`undefined` before comparing,
     or every free agent falsely registers as a change;
   - keep the existing position filter; write **minified** (no `null, 2`);
   - write in place and idempotently — no `_filtered` / `_backup` files and no
     manual `mv` step in the output instructions;
   - read years from `src/domain/constants.ts`, not its own hardcoded list (`H5`).
2. Delete `src/data/2025/players.json` and `src/data/2026/players.json`.
3. `getPlayer(id, year)` in `src/data/index.ts` becomes: base lookup, then apply
   that year's overlay if one exists. The per-season scan loop and the 50-field
   fallback object (44 of them literally `undefined`) both collapse — the fallback
   for legacy string-named players becomes a 5-field literal.
4. Narrow `Player` in `src/types/player.ts` to the 8 fields so the compiler catches
   anything quietly relying on a dropped field.
5. Teach `scripts/fetch-sleeper-data.js` to emit the season's overlay, so future
   seasons accrue year-accuracy automatically.

**A1b — thread the year through to the render sites**

The overlays are invisible until this lands. `.team` is displayed in exactly two
places and **neither has year context**:
- `src/presentation/components/Players/PlayerResults.tsx:54` — search results
- `src/presentation/pages/playerDetail.tsx:87` — fed by
  `src/hooks/playerDetail/usePlayerData.ts:15`, which calls `getPlayer(playerId)`
  with no year argument

On the player detail page the right fix is per-row resolution: the ownership and
performance tables already know their season, so each row should show the team as
at that row's year rather than one team in the header. Search results have no year
and should keep showing the most recent team, labelled as such.

**A1c — prefer ground truth for position** `S`

For position specifically the dictionary isn't the best source: the slot a player
actually occupied is derivable from the matchup `starters` array against
`roster_positions`. `getPlayerPositionFromMatchups` already exists in
`playerDataUtils.ts` as a fallback — promote it ahead of the dictionary where a
matchup context is available, and treat the overlay's `p` field as a rarely-used
correction.

**Files:** `scripts/filter-players.js` → `scripts/build-players.js`,
`scripts/fetch-sleeper-data.js`, `src/data/players.json`,
`src/data/<year>/players.delta.json` (new), `src/data/2025|2026/players.json`
(delete), `src/data/index.ts`, `src/types/player.ts`,
`src/utils/playerDataUtils.ts`, `src/hooks/playerDetail/usePlayerData.ts`,
`src/presentation/pages/playerDetail.tsx`,
`src/presentation/components/Players/PlayerResults.tsx`, `package.json`, `CLAUDE.md`

**Acceptance:** `players` chunk under 150 kB gzipped · a 2025 player who changed
team in 2026 shows the 2025 team on 2025 pages and the 2026 team on 2026 pages ·
player search returns the same result set for a sample of 20 queries · every
player page still resolves a name and position · `yarn build` clean.

> ⚠️ Update the "Adding a new season" and "Gotchas" sections of CLAUDE.md in the
> same commit — step 5 currently tells you to drop in a year-specific
> `players.json`, which this task replaces with the overlay format.

- [x] A1a
- [x] A1b
- [x] A1c

### A1d · Backfill historical teams from nflverse `M`
**Downgraded again after `A1`.** `H1` promoted this to a correctness bug because
`getOptimalLineup` returned impossible results in 57 matchups. Rebuilding the
dictionary fixed 51 of them — positions now resolve instead of coming back
`UNK`. **6 remain** (2012:1, 2015:1, 2019:4), so this is worth doing for
historical team accuracy and the last few lineups, but it no longer blocks `C2`.

**There are currently no player dictionaries for 2012–2024** — only 2025 and 2026
exist, so thirteen of the fifteen seasons already resolve against a modern
snapshot and show players on the wrong teams in old draft boards. A1's overlay
format fixes this going forward but cannot fix it retroactively, because Sleeper's
`/players/nfl` only ever returns current state.

nflverse publishes free historical roster data going back well before 2012. A
one-off script could join it to Sleeper IDs (via `gsis_id`, which the unfiltered
dumps still carry — **capture the mapping during A1a before those fields are
dropped**) and generate an overlay per season.

`H1` found `getOptimalLineup` returning *less* than the lineup actually started in
**57 matchups**, which is arithmetically impossible — the started lineup is always
a candidate. Worst case: 2012 w4 r8, actual 115.40 vs "optimal" 83.50. The cause
is this task: positions resolve against a modern snapshot, so retired and legacy
string-named players come back `"UNK"` and the optimiser cannot fill the slots
they occupied. All 57 are 2012–2019. A companion test scoped to 2020+ passes, so
there is a real net on the modern seasons meanwhile.

**Acceptance:** the 2018 draft board shows 2018 teams · optimal >= actual across
all seasons, not just 2020+.

- [ ] A1d

### A1e · Trim `picks.json` `S`
**Done.** Every pick carried a 13-field `metadata` block duplicating the player
dictionary — 1.0 MB of the 1.7 MB still shipping eagerly, and never displayed,
because `getPlayer()` resolves for all 2,640 picks and the metadata fallbacks in
`DraftBoard` and `useDraftPicks` were unreachable. `draft_id`, `is_keeper` and
`reactions` went too; nothing read them.

```
picks.json      0.94 MB -> 0.29 MB
critical path    398 kB -> 347 kB gzipped
```

Salvaged before deleting: three positions that differed from the dictionary went
into that season's `players.delta.json`. They were genuinely year-accurate —
Devin Funchess and N'Keal Harry were WRs when drafted and Sleeper lists them TE
today. This *lowered* the 2019/2020 optimal-lineup totals, correctly: a WR
mislabelled TE had been letting the optimiser fill the TE slot with someone
ineligible for it.

Forty names also differed, but almost all are formatting (`O.J.` vs `OJ`, `Jr.`
suffixes). Only three are real renames — Robby Anderson → Robbie Chosen,
Washington Football Team → Commanders, Hollywood → Marquise Brown. The script
reports them; they are not kept, because there is no per-season name overlay and
building one for three players is not worth it.

> **If the draft board should show period-accurate names**, that is the task to
> write: a `name` field alongside `t`/`p` in the season overlay, populated from
> the pick metadata before it was stripped (recoverable from git history, or
> from `scripts/data/player-id-map.json`).

**Chase:** Sleeper returns the fat pick objects on every fetch, so
`yarn trim-picks` must be re-run after `fetch-data` / `fetch-season`.

- [x] A1e

### A2 · Load season data on demand `XL`
**Blocks:** A4 · **Blocked by:** A1

After A1 there's still ~11 MB of season JSON in one eager chunk, dominated by
transactions (6.0 MB) and matchups (2.3 MB). `src/data/index.ts` forces this with
`import.meta.glob(..., { eager: true })`, which is also why the lazy routes in
`App.tsx` buy nothing.

Do it in two steps so there's a safe stopping point:

**A2a — un-eager the heavy files.** Drop `eager: true` for `matchups/*` and
`transactions/*`. Vite emits one chunk per season; make `useSeasonData` async and
let the existing `<Suspense>` boundary cover it. All-time pages get an explicit
`loadAllSeasons()` await.

**A2b — move data out of the bundle.** Relocate `src/data/*` season JSON to
`public/data/` and fetch it through a small cache module
(`src/data/loader.ts`: in-flight dedupe, resolved cache, typed accessors).
`JSON.parse` on a fetched string beats evaluating an equivalent JS module, and it
puts 2012–2025 — which never change between deploys — into the HTTP cache. Add
long-lived `Cache-Control` for `/data/` at the host.

**Files:** `src/data/index.ts`, new `src/data/loader.ts`,
`src/hooks/useSeasonData.ts`, `vite.config.ts` (drop the now-pointless
`manualChunks` data/players branches), every all-time page.

**Acceptance:** initial JS under 400 kB gzipped · landing on `/` fetches no
season older than the current year · navigating to a 2014 page fetches exactly
one season file · a second visit to that page issues no network request.

- [x] A2a
- [ ] A2b

### A3 · Memoise the history scans `M`
**Blocked by:** H1

There is no caching anywhere in `src/utils/` — no `Map`, no memo wrapper — while
`managerStats.ts` makes three separate full-history passes, and `h2h.ts`,
`standings.ts`, `playerDataUtils.ts` and the three `playerDetail` hooks each do
their own full sweep. Managers → a manager → back re-runs all of it.

Add `src/utils/cache.ts` — a module-level `Map` keyed on
`(fnName, ...args)` — and wrap `getManagerStats`, `getAllTimeH2HRecord`,
`getCumulativeStandings`, `getStrengthOfSchedule`. The data is immutable at
runtime so there is no invalidation problem. Roughly 20 lines.

**Acceptance:** second navigation to a manager page does zero recomputation
(assert via a call counter in a test) · numbers identical to pre-change snapshots.

- [ ] A3

### A4 · Precompute all-time aggregates at build time `L`
**Blocked by:** A2, C1

Nothing about 2012–2025 changes between deploys, so recomputing all-time
standings, H2H and records in every browser on every visit is pure waste.
Add `scripts/build-aggregates.js` that runs the stat registry (`C1`) over
completed seasons and emits `public/data/all-time.json`. The client merges that
with the live season only.

Wire it into `yarn build` and into the fetch scripts so it refreshes whenever new
week data lands.

**Acceptance:** `/` renders all-time standings from the prebuilt file with no
client-side aggregation · the file regenerates on `yarn fetch-latest`.

**Landed, with the first acceptance criterion deliberately not met.** Measured
before building: `getCumulativeStandings` over all fifteen seasons is **0.9 ms**
cold and 0.0 ms warm (it reads `rosters[].settings`, not the matchups), all-time
H2H across every manager pair is 6.3 ms, and every other home tab is under a
millisecond. Serving `/` standings from a file would save about one millisecond,
add a network round trip and a staleness failure mode, and break the year filter
— the table takes an arbitrary subset of seasons, so there is no single
"all-time" answer to precompute.

The real cost is the stat registry: **147 ms** for all 25 stats, and more
importantly ~550 kB gzip of matchups and transactions that have to be downloaded
before any of them can be answered. So the precompute covers the registry
instead. `scripts/build-aggregates.ts` runs it through `vite-node` (the real
registry, not a second implementation) and writes the top 25 of each stat, with
each stat's true `total` and its data-quality flags, to
`public/data/all-time.json` — 131 kB, **19.2 kB gzip**. Wired into `yarn build`
and into `fetch-sleeper-data.js`. `src/utils/stats/precomputed.ts` is the shared
contract, `usePrecomputedStats` the reader.

Nothing consumes it yet; the pages that will are M5.

- [x] A4

### A5 · Fix `usePlayerSearch` `S`
**Blocked by:** H1

`src/hooks/players/usePlayerSearch.ts:15` rebuilds a 12,266-entry `Map` from
scratch **on every keystroke**, because its `useMemo` is keyed on `searchTerm`.
Build the index once at module level, filter it per query, and add a ~150 ms
debounce.

**Largely landed with `A1`:** the 12,266-entry Map is gone — the base dictionary
is now the whole search corpus, so the hook filters it directly instead of
rebuilding a Map per keystroke. What remains is the debounce and, if it ever
matters, a prebuilt lowercase index. Filtering 4,389 entries per keystroke is
sub-millisecond, so this is now a polish item rather than a fix.

**Acceptance:** typing a 10-character query builds the index once, not ten times.

- [x] A5

### A6 · Fix the mobile horizontal scroll `XS`
**Blocked by:** —

On a 375 px viewport `document.scrollWidth` is **532 px** — the entire page slides
sideways, header and all. The cause is the tab strip at
`src/presentation/pages/home.tsx:39`:

```jsx
<nav className="flex gap-8">
```

"Schedule Comparison" and "Trades" overflow with no scroll container. The header's
own `<menu>` already does this correctly with `overflow-x-auto`; apply the same.
Then sweep every other tab strip (`history.tsx`, `managerDetail.tsx`) for the same
bug.

**Acceptance:** `document.scrollWidth === clientWidth` at 375 px on every route.

- [x] A6

---

## Workstream B — Design system

You already have `src/presentation/components/Table/Table.tsx` exporting `Table`,
`TableHeader`, `TableRow`, `TableCell`, `SortIcon` and `StandardTable`. **Two
files use it.** Everything else rolls its own markup, and the drift is measurable:
header cells split `px-6 py-3` (10×) against `px-3 py-3` (1× — and the shared
component uses the minority spelling); body cells run to six distinct
padding/size combinations; card containers have ten variants, led by
`bg-white rounded-lg shadow` (44×) and `bg-white p-6 rounded-lg shadow` (9×).

### B1 · Design tokens `M`
**Blocks:** B2, B3

`tailwind.config.js` is empty (`theme.extend: {}`). Define the actual system
there: surface/border/text colours, the elevation scale, radii, the numeric font
stack with `tabular-nums`, position colours (QB/RB/WR/TE/K/DEF — currently
hardcoded in `DraftBoard`), and result colours (win/loss/tie).

**Acceptance:** no new component hardcodes a hex or an ad-hoc shadow.

- [x] B1

### B2 · `<Card>` primitive `S`
**Blocked by:** B1

`<Card>` / `<CardHeader>` / `<CardBody>` / `<CardFooter>`. Replace the 60+ ad-hoc
`bg-white rounded-lg shadow…` strings across the app.

**Acceptance:** `grep -r "bg-white rounded-lg shadow" src/presentation` returns
only the Card component.

- [x] B2

### B3 · `<DataTable>` `L`
**Blocks:** B4, E8 · **Blocked by:** B1

Six components use `@tanstack/react-table` (`AllTimeBreakdown`, `OwnershipTable`,
`Standings`, `AllTimeTable`, `AllTimeTrades`, `H2HTable`) and each renders its own
`<thead>`/`<tbody>`. Sorting UI, striping, hover, empty states and sticky headers
are reimplemented six times.

Build one `<DataTable columns={} data={} />` that owns: sorting + indicator,
**sticky header**, **sticky first column**, zebra rows, density toggle, empty
state, and mobile card-collapse. Migrate all six, plus the four raw-`<table>`
sites (`MatchupDetail`, `StatsResults`, `DraftBoard`).

The payoff beyond consistency: sticky header and sticky first column fix mobile
tables **in one place** rather than twelve.

**Acceptance:** every table on the site scrolls with its team column pinned on a
375 px viewport · one sort-indicator implementation remains.

**Done.** The audit above undercounted: nine further components rendered their
own markup on the legacy primitives in `Table/Table.tsx`, so neither the pinned
column nor the single sort indicator reached them. All nine are migrated —
`PlayoffOdds` (which carried a second, competing `getSortIcon`),
`AllTimeScheduleComparison` (both views), `Breakdown`, `ScheduleComparison`,
`PerformanceTable`, `H2HContent` (four table shapes), `DraftStatsCard`,
`AllStarLineup`, and the season table on the manager page, which moved out to
`ManagerDetail/SeasonBreakdown.tsx` alongside its siblings.

`Table/Table.tsx` is deleted: `SortIcon`, `StandardTable` and the six primitives
had no callers left. One sort indicator remains, in `DataTable`.

Three additions to the column meta were needed to migrate the last sites without
losing behaviour:
- `linkTitle` — the per-row tooltip on the three link kinds, for cells whose
  text and destination are not the same words (a team name linking to a
  manager).
- `rowCellClassName` / `rowCellStyle` — a background that is a row-AND-column
  fact rather than a column one. Three sites need it: the two comparison
  matrices shade their diagonal, and Breakdown's Schedule Luck toggle heat-maps
  every week cell. The style variant exists only because that heat map's colour
  is computed and Tailwind cannot emit a class it never saw in the source.

One bug found and fixed in the process, in `PlayoffOdds`: tanstack gates
`getCanSort()` on a column having an accessor function, so a `display` column
ignores even an explicit `sortingFn`. The first migration left the table
unsortable and stuck in the simulation's own order. Every sortable column is now
an `accessor`, and the original comparison chain — the 0.0001 epsilon on the
odds, then wins, then points, then name — is preserved as a `sortingFn`, along
with the asc-first/desc-first direction each header had.

Verified in the browser at 375 px: Breakdown scrolls 600 px sideways with the
team name pinned and opaque, and the page itself has no horizontal overflow.
171 tests pass unchanged; the gzipped bundle is unmoved at 347 kB on the
critical path.

- [x] B3

### B4 · Semantic column types `M`
**Blocked by:** B3

`numeric` (tabular-nums, right-aligned), `record` (W-L-T), `points`, `manager`
(avatar + link), `player` (headshot + position chip), `year` (link to season).
Today points columns are left-aligned in some tables and right in others, and
digits don't line up anywhere because `tabular-nums` is never applied.

Note that `manager` and `player` column types deliver a large slice of `E1` for
free — every table that uses them becomes linked automatically.

**Acceptance:** no table declares its own alignment or cell link markup.

- [x] B4

---

## Workstream C — The stats engine

### C1 · Stat registry `L`
**Blocks:** C2–C6, D*, E7, A4 · **Blocked by:** H1

Before adding twenty statistics, give them somewhere to live. A registry where
each stat declares `id`, `label`, `description`, `scope` (league / manager /
player / season / matchup), `format`, and a `compute(data)` — so that a new stat
automatically becomes available to the records page, the Explorer, the narrative
engine (`E7`), the share cards (`G4`) and the build-time precompute (`A4`)
without being wired into each by hand.

**Acceptance:** adding a stat is one file and one registry line.

- [ ] C1

### C2 · Lineup stats `M`
**Blocked by:** C1

`getOptimalLineup` already exists in `src/utils/lineupAnalysis.ts` and only feeds
the All-Star Lineup tile. Surface what it can already tell you:

- [ ] **C2a** Points left on the bench — per manager, per season, all-time
- [ ] **C2b** Manager efficiency % (actual ÷ optimal) — separates drafting from managing
- [ ] **C2c** The single worst start/sit in league history — week, player, manager, margin
- [ ] **C2d** The Bench Bandit — most points scored while benched

### C3 · Matchup stats `M`
**Blocked by:** C1

- [ ] **C3a** Biggest and closest margins ever (top scores exist; margins don't)
- [ ] **C3b** Unluckiest loss (highest-scoring loss) and its twin, the lowest-scoring win
- [ ] **C3c** "Beat almost everyone" — scores that would have won against 12 of 13 opponents and still lost
- [ ] **C3d** Longest win/loss streaks, all-time and current (`getCurrentStreak` exists; streaks are not shown as records)
- [ ] **C3e** Rivalry intensity — average margin per H2H pairing
- [ ] **C3f** Revenge games — record in the rematch following a blowout loss

### C4 · Draft stats `M`
**Blocked by:** C1

- [ ] **C4a** Best and worst picks ever — points per draft slot vs the slot average
- [ ] **C4b** Draft position luck — does pick 1 actually win in this league? Fifteen years is enough to answer
- [ ] **C4c** Most-drafted players league-wide, and who kept going back
- [ ] **C4d** The one that got away — drafted, dropped, then scored for someone else

### C5 · Transaction stats `L`
**Blocked by:** C1

6.0 MB of transaction data is currently near-unused — the largest untapped
dataset in the repo.

- [ ] **C5a** Waiver wire hit rate — points added via waivers per manager
- [ ] **C5b** Trade ledger — points received vs given up, scored retrospectively. Who won each trade?
- [ ] **C5c** Most churned roster — transactions per manager per season

### C6 · Identity & fun stats `M`
**Blocked by:** C1

- [ ] **C6a** Manager archetypes — derived labels ("The Streamer", "The Set-and-Forget", "The Heartbreaker" for most narrow losses)
- [ ] **C6b** Championship probability by week, retrospectively — at what point did each title become inevitable?
- [ ] **C6c** On this day in Chumbo history — same week, previous seasons (feeds `E6`)

---

## Workstream D — Visualisation

The site is currently ~95% tables and stat tiles, with **no charts at all**.

### D0 · Pick the chart approach `S`
Hand-rolled SVG for the simple marks (sparklines, bars, heatmap cells), `visx`
only if something genuinely needs scales and axes. **Do not undo Workstream A by
adding a 200 kB charting library.** Budget: +40 kB gzipped for the whole
workstream.

**Decided: hand-rolled, no chart dependency at all.** What visx or d3 would
supply here is a linear interpolation, a band position and a 1/2/5/10 tick
series — about ninety lines, now in `components/Chart/scale.ts` with the tests
d3 would have come with. `d3-scale` + `d3-shape` alone is ~15 kB gzip, which is
over a third of the workstream budget for the smallest part of the job.

`components/Chart/` holds the three things every chart needs and none should
re-solve: `Chart` (measures the container, reserves margins, announces itself),
`XAxis`/`YAxis`, and the scales. The frame measures in real CSS pixels via
`ResizeObserver` rather than scaling a fixed `viewBox`, because a scaled viewBox
also scales the type — and most of this league reads the site on a phone.

**The budget was not being enforced.** The risk table said "D0 sets a +40 kB
budget; H4 enforces it in CI", but H4's total sat at 1220 kB against an actual
966 kB — 254 kB of headroom, so a 200 kB charting library would have passed
without a murmur. Ratcheted to 1006 (966 + the 40 kB allowance), initial 420 →
370, and chart code now builds into its own `charts` chunk with its own 40 kB
line in the check. Verified the check fails rather than only that it passes.

- [x] D0

Every chart must be clickable through to the underlying matchup, season or
player. A chart that's a dead end is worth much less here — see Workstream E.

- [x] **D1** Season arc — cumulative wins or points-for by week, one line per manager, on the Seasons page. Shows instantly who collapsed in November. *(needs F2)*
- [x] **D2** All-time power ribbon — every manager's finishing position 2012→2026 as a bump chart. **The single highest-value visual on this list**: the whole league's story in one image. *(needs F2)* — on `/careers`. Colour carries no identity: every line is neutral until a manager is chosen, then theirs takes their accent and the rest fade, which is the F2 constraint met rather than worked around. Click pins, hover previews, so the choice survives the mouse leaving and a phone can make one at all. Needed a real finishing position first (`utils/finalStandings.ts`) — the brackets, not regular-season order.
- [x] **D3** H2H matrix — replace the two scroll-lists on `h2h.tsx` with a 14×14 colour-coded grid (green = winning record, red = losing, cell = record, click = detail). Today you must pick two managers from lists to learn anything; a matrix shows all 91 rivalries at once, including who owns whom. — **17×17 and 136 rivalries, not 14×14 and 91.** All seventeen managers in `managers.json` have real games (`karsten` 14 team-weeks, `phil` 15, `jimmie` 16); the four legacy accounts carry 2012-2019, and dropping them would cut the archive the page exists to show. Shading is win rate *tempered by sample size* — `phil`'s 2-0 pairings would otherwise be the most dominant cells in the grid. Rows sort by record against the field, so the pecking order reads off the diagonal.
- [ ] **D4** Score distribution — violin or histogram per manager. Separates the boom/bust managers from the metronomes, which W-L records hide entirely. *(needs F2)*
- [x] **D5** Weekly score heatmap — season × week grid for one manager, coloured by score. A whole career in one image.
- [x] **D6** Draft value scatter — pick number vs points scored that season, across all drafts. Every steal and every bust, using your league's real history rather than generic ADP.
- [x] **D7** Luck chart — actual wins vs expected wins (from the all-play record you already compute in `calculateWeeklyLeagueRecord`), scatter against the diagonal. Distance from the line is a luck score. Managers will argue about this for years.

---

## Workstream E — Navigation & discovery

The "get lost in Chumbo history" workstream. The audit is unambiguous —
**components with zero outbound links**: `DraftBoard`, `Trades`, `TradeCard`,
`OwnershipTable`, `PlayerStatsCard`, `DraftStatsCard`, `Breakdown`,
`PlayoffOdds`, `ScenarioPlanner`, `AllTimeTrades`, `ManagerStatsCard`,
`hallOfFame`, `stats`, `players`.

### E1 · Link everything, bidirectionally `L`

Every player name → player page. Every manager/team name → manager page. Every
score → matchup detail. Every year → that season. Every H2H record → H2H detail.

**The Draft Board is the worst offender and the biggest loss.** It is the best
looking thing on the site — position colours, headshots, manager attribution —
and it is a total dead end. Every one of its 200+ cells should link to the player;
every column header to the manager. Do this one first.

`MatchupDetail` links to players (twice) and to nothing else — not either
manager, not the H2H page for the pairing, not that season's standings.

Mechanical work, highest delight-per-hour on the list. `B4` does a chunk of it
for free.

- [x] E1a DraftBoard
- [x] E1b MatchupDetail
- [x] E1c Trades / TradeCard / AllTimeTrades
- [x] E1d Player detail tables (Ownership, PlayerStats, DraftStats)
- [x] E1e Breakdown, PlayoffOdds, ScenarioPlanner, ManagerStatsCard
- [x] E1f hallOfFame, stats, players

### E2 · Contextual "see also" rails `M`
**Blocked by:** E1, C1

On a matchup: *"These two have met 23 times → H2H"*, *"Other games this week"*,
*"Both managers' seasons"*. On a player: *"Drafted 7 times by 4 managers"*,
*"Best week: 41.2 for thd, 2019 W8"*.

- [ ] E2

### E3 · Command palette (⌘K) `L`
**Blocked by:** A5

Fuzzy search across managers, players, seasons and weeks from anywhere. For a site
that is fundamentally an index of fifteen years, **this is the best single
navigation addition available.** The search infrastructure already exists in
`usePlayerSearch`.

- [x] E3

### E4 · Breadcrumbs `S`

Manager detail currently offers "← Back to Managers" and nothing else.
`Seasons › 2024 › Week 8 › thd vs jay` is orientation and navigation at once.

- [x] E4

### E5 · Random matchup button `S`
**Blocked by:** E1

A dice icon that drops you into a random matchup from league history. Genuinely:
this is the exact mechanic that manufactures the WhatsApp nuggets you want.

- [x] E5

### E6 · "On this day" homepage module `M`
**Blocked by:** C6c

- [x] E6

### E7 · Narrative engine `L`
**Blocked by:** C1

A small rules engine turning records into sentences on the page they belong to:
*"This was the highest-scoring loss in Chumbo history."* *"jay has won 7 of the
last 8 against fin."* **Facts get shared; tables don't.** This is also what makes
`G4`'s share cards write themselves.

- [x] E7

### E8 · Deep links for table state `M`
**Blocked by:** B3

Tab state already lives in the URL — sorted and filtered table state doesn't. If a
manager sorts by "most bench points" and can't paste that link into the group
chat, the nugget dies with them.

- [x] E8

---

## Workstream F — Pages

### F1 · Managers page rebuild `L`
**Blocked by:** B2, F2

Currently 14 identical white cards, each a stack of `Label: value` rows in the
same grey — no avatars, no colour, no hierarchy — and the cards don't align,
because "Zaragoza's Zooting Zorro" wraps to two lines and shoves its stats down.

- [x] **F1a** Use the avatars. `userAvatar.ts` exists and matchup cards already show them; the one page that is literally about people doesn't.
- [x] **F1b** Trophy case as the hero, not a footnote row of emoji at the bottom. Championships are the point.
- [x] **F1c** Finishing-position sparkline per card — instant career shape, makes the grid scannable.
- [x] **F1d** Fix alignment — `grid-rows-subgrid` or a fixed-height name block, so the eye can compare across cards.
- [ ] **F1e** Auto-generated one-line story per manager: *"3 titles, but hasn't made the playoffs since 2022."* *(needs E7)*

### F2 · Manager accent colours `S`
**Blocks:** D1, D2, D4, F1, F3, G2 · **Blocked by:** B1

**Revised during B1 — the original brief cannot work, and the difference matters
for every chart in Workstream D.**

The plan asked for an identity colour per manager, used everywhere including as
each manager's line in every chart. There are 17 managers, 12 active. A
categorical palette tops out at **eight** hues; the data-viz validator is
explicit that only the first **three** clear all-pairs separation for scatter and
small-multiple forms. Seventeen distinguishable hues do not exist at accessible
contrast — generating more by rotating hue yields colours that look distinct to
the author and identical to a reader with deuteranopia.

So the two uses are split (`src/domain/managerColors.ts`):

- **Accent** — a stable hue per manager for places where ONE manager is on
  screen: page header, card rule, avatar ring. Collisions are forced (12 active
  into 8 hues, so `thd` and `ryan` share blue) and acceptable, because the
  avatar and name carry identity and the colour is decoration.
- **Series** — `series-1..8`, the validated categorical palette, fixed order,
  for charts with at most eight things in them.

**Hard constraint on D1, D2 and D4:** a chart showing all twelve active managers
must not colour them twelve ways. Use highlight-one-and-dim-the-rest (the bump
chart, the season arc), small multiples, or fold all but the top few into
"Other". This is a correctness requirement, not a stylistic preference.

- [x] F2

### F3 · Manager detail rebuild `M`
**Blocked by:** F2, D5

The stat tiles wrap awkwardly — "Scoring Crowns" is taller than its neighbours
because the label breaks. Replace eight tiles with a season-by-season timeline
carrying trophy markers, plus the weekly heatmap from `D5`.

- [x] F3

### F4 · Hall of Fame `M`
**Blocked by:** E1f

`src/presentation/pages/hallOfFame.tsx` is **entirely placeholder text** — all 15
inductees read "This will be replaced with the actual blurb" — and it links to no
player pages.

- [ ] **F4a** Real blurbs (content task — needs you, not the code) — **still outstanding, and now the only thing holding the Players wing back.** One line each: add `blurb: "..."` to that year's entry in `hofInductees` in `src/presentation/pages/hallOfFame.tsx`. Also wanted: portraits at `public/images/hof/<year>-icon.jpg` — that directory does not exist, so all 26 images the old page asked for were 404ing and every tile rendered a broken-image glyph. The page now degrades to an initials medallion, and dropping the files in will just work.
- [x] **F4b** Link every inductee to their player page
- [x] **F4c** A manager wing — inductees are currently all players
- [x] **F4d** A Ring of Shame, because obviously

---

## Workstream G — Sharing

Two separate problems that share one renderer.

### G1 · SVG card renderer `L`
**Blocks:** G3, G6

Build the cards as **SVG you control**, not a DOM screenshot — `html2canvas` is
heavy, slow, and renders Tailwind inconsistently. Serialise the SVG, draw to a
`<canvas>`, `canvas.toBlob()`. Design at **1200×630** so the same renderer serves
both the clipboard flow and the build-time OG images.

- [x] G1

### G2 · Card templates `M`
**Blocked by:** G1, F2, E7

Final score · manager season · H2H record · draft pick · record broken
("🚨 NEW LEAGUE RECORD"). `E7` supplies the copy.

- [x] G2

### G3 · Copy to clipboard `M`
**Blocked by:** G1

`navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])`. WhatsApp
Web accepts a pasted image.

> **Safari/iOS caveat that trips everyone up:** the `ClipboardItem` must be
> constructed with a *promise* of the blob, synchronously inside the user
> gesture — `new ClipboardItem({ 'image/png': makeBlob() })`. Await the blob
> first and it fails silently.

- [x] G3

### G4 · Native share sheet on mobile `S`
**Blocked by:** G1

`navigator.share({ files: [...] })` opens the native sheet with WhatsApp already
in it — a much better flow on a phone than the clipboard. Feature-detect, fall
back to `G3` on desktop.

- [x] G4

### G5 · Static OG tags `XS`

`index.html` has **no Open Graph or Twitter card tags at all**. Every Chumbo link
anyone has ever pasted into WhatsApp rendered as a bare grey URL. Add title,
description and the league logo. Ten minutes, and it retroactively improves every
link already out there — **do this in M0.**

- [x] G5

### G6 · Per-route prerendered OG images `XL`
**Blocked by:** G1, G5

You're a static SPA, so crawlers see one HTML file. Prerender static HTML per
route — at minimum per manager, per season, per player — with route-specific OG
tags and a matching OG image, generating the image with the `G1` renderer run
through `satori` + `resvg` in a Node build step. All data is static and committed,
so this is pure build-time work needing no server.

A link that previews as a proper scorecard *and* a copy-image button is what turns
"I found a thing" into something the group chat actually sees.

- [ ] G6

---

## Workstream H — Code health

### H1 · Test harness `L`
**Blocks:** A3, A5, C*, H2

There are **no tests and no test script**. For a site whose entire value is the
correctness of derived statistics, this is the gap that makes every other
refactor risky. Add Vitest; snapshot the current output of `getManagerStats`,
`getAllTimeH2HRecord`, `getCumulativeStandings`, `getOptimalLineup` and
`calculateStrengthOfSchedule` across all seasons **before touching anything**, so
the whole plan has a net under it. An afternoon's work that de-risks the rest.

- [x] H1

### H2 · Split the large files `L`
**Blocked by:** H1

`managerStats.ts` (1,203 lines, **one exported function**), `H2HContent.tsx`
(1,159), `Standings.tsx` (1,014), `TopScores.tsx` (986),
`AllTimeScheduleComparison.tsx` (773). The single 1,000-line function body in
`managerStats.ts` is where `A3`'s three redundant full-history passes are hiding,
so this and `A3` are best done together.

- [ ] H2

### H3 · Type the data loader `M`
**Blocked by:** A2

`src/data/index.ts` uses `any` behind an eslint-disable and reimplements "ensure
initialised" three times. A loader typed on file pattern is shorter and safer.

- [ ] H3

### H6 · Stop `getCumulativeStandings` mutating shared data `XS`
**Blocked by:** H1 · **Found by:** `H1` invariant test

`src/utils/standings.ts:35` calls `season.rosters.sort(...)` to find the scoring
crown. `Array.prototype.sort` is in place, so rendering the standings permanently
reorders `seasons[year].rosters` on the shared module-level object — 2025 goes
from `1,2,…,12` to `4,7,2,10,1,9,12,3,8,5,6,11`. Nothing visible depends on it
today because lookups are by id, but it makes results order-dependent on which
page you happened to open first, and it will produce genuinely baffling bugs once
`A3` starts caching.

Fix: `[...season.rosters].sort(...)`. One character of real change.
`src/utils/__tests__/purity.test.ts` already covers it — flip it from `it.fails`
to `it` in the same commit.

**Acceptance:** `purity.test.ts` passes as a normal test.

- [x] H6

### H7 · `calculateStrengthOfSchedule` never reads the schedule `M`
**Blocked by:** H1 · **Found by:** `H1` invariant test

`src/utils/strengthOfSchedule.ts` computes *remaining* strength of schedule by
scanning `seasonData.matchups` for future weeks — but unplayed fixtures don't live
there. They live in `schedule.json`, which it never opens. 2026 has only
`matchups/1.json`, so every team's remaining-opponent average is 0, the sort is
stable on equal values, and the rank collapses to insertion order: roster 1 → rank
1, roster 2 → rank 2, and so on.

**The "strength of schedule remaining" column in Standings is currently
meaningless** — it is displaying roster ids. It is rendered at
`src/presentation/components/Standings/Standings.tsx:796`.

`PlayoffOdds` already solved this (commits `d7f96c4`, `4ff1103`); mirror its
`schedule.json` read. Also returns `{}` for every completed season, which is
defensible but should be explicit rather than incidental.

**Acceptance:** two teams with demonstrably different remaining opponents get
different ranks · the snapshot for 2026 changes from `1,2,3…` to something
justified by the fixtures · the `it.fails` marker is removed.

- [x] H7

### H8 · Reconcile the 2019 season data `M`
**Blocked by:** H1 · **Found by:** `H1` invariant tests · **Needs owner input**

`getManagerStats` has two sources of truth: headline totals come from Sleeper's
`roster.settings.wins`, while `seasonStats[].wins` is recomputed from the matchup
JSON. They agree everywhere except **2019**, where three rosters disagree:

| roster | from matchups | from `roster.settings` | points diff |
|---|---|---|---|
| 1 (thd) | 7-6 | 8-5 | −3.90 |
| 4 (htc) | 6-7 | **4-9** | +11.70 |
| 8 (dix) | 7-6 | 8-5 | −38.79 |

htc is off by two games. **The manager page's season table does not add up to the
record printed above it.** `h2hRecords` is matchup-derived too, so it is wrong in
the same way. Every one of the twelve 2019 rosters also has a points discrepancy,
several of them suspiciously round (−23.00, −25.00, +10.00, +5.00), which looks
like post-hoc stat corrections that landed in the season totals but never in the
committed `matchups/*.json`.

Likely fix is `yarn fetch-season -- --year 2019`, but that **overwrites committed
data**, may not help if Sleeper never backfilled the corrections either, and is
the owner's call. Do not run it unasked.

Separately, and regardless of the data: `getManagerStats` should not have two
sources of truth for the same number. Pick one — matchup-derived is the more
defensible, since it is what every other page computes from — and make the
headline agree with the breakdown.

**DONE** — `scripts/rebuild-2019.js`. Root cause was not stat corrections: the
2019 folder had been replaced with Sleeper data whose `points` was recomputed as
`sum(starters)` from an incomplete lineup, discarding the NFL.com scores. Rebuilt
from `chumbo-api/data/2019-old`, which reconciles to the penny. 119 of 184
team-weeks reconcile exactly; the rest carry an explicit `points_adjustment`.
Both reconciliation invariants now pass as real tests. See
`src/domain/dataQuality.ts` — 2019's per-player data stays approximate, so `C2`
must exclude it from lineup-derived records.

- [x] H8

### H9 · Declared lineup slots are in the wrong order for 2016–2019 `S`
**Found by:** inspecting jay's 2019 week 7 lineup

`league.json.roster_positions` declares `... TE K DEF FLEX` for 2016, 2017, 2018
and 2019, but every `starters` array in those seasons is actually ordered
`... TE FLEX K DEF`. Measured across all team-weeks:

```
index 6:  WR 98, RB 77, TE 5   -> FLEX
index 7:  K 181                -> K
index 8:  DEF 182              -> DEF
```

2020 onwards declares `FLEX K DEF` and matches. 2014 and 2015 match too, so the
bad declaration is specific to 2016–2019.

Only `src/utils/leagueRules.ts:90` reads it, so the damage is limited to the Rules
page listing slots in the wrong order — but anything future that maps
`starters[i]` to `roster_positions[i]` (the natural thing to do, and what `A1c`
proposes for deriving position from the matchup) would silently mis-slot every
lineup in those four seasons.

Fix all four together rather than one; 2019 is currently consistent with its
neighbours. Also check 2012/2013, where the detection was ambiguous.

**Acceptance:** for every season, `roster_positions[i]` agrees with the position
actually played at `starters[i]` across the whole season.

- [x] H9

### H10 · Share the merged-fixture helper `S`
**Found by:** `H7`

`H7` added a `fixturesByWeek()` in `src/utils/strengthOfSchedule.ts` that merges
played weeks from `matchups` with unplayed weeks from `schedule.json`.
`PlayoffOdds.tsx` already builds the same thing in its `matchupsWithSchedule`
memo. They differ only in shape: PlayoffOdds needs full `ExtendedMatchup` shells
with zeroed points for its simulation, SOS needs only the pairings.

Extract `mergeScheduledFixtures(matchups, schedule)` into a new
`src/utils/scheduleUtils.ts` returning pairings, and have PlayoffOdds map the
result into its shells. Two call sites is the right moment — a third would mean
three different merge precedences to keep in sync.

**Acceptance:** one implementation of the merge; both call sites use it; the
playoff-odds output is unchanged.

- [x] H10

### H4 · Bundle budget in CI `S`

Fail the build if gzipped initial JS exceeds a threshold. Without this, Workstream
A silently erodes.

- [x] H4

### H5 · Single source of truth for years `S`

`ValidYear` is declared twice — `src/constants/fantasy.ts` and again in
`src/data/index.ts` as `typeof YEARS[number]` — plus a third hardcoded list in
`scripts/filter-players.js`. Derive all three from `YEARS`, then delete the
"two year lists must stay in sync" gotcha from CLAUDE.md.

- [x] H5

---

## Milestones

### M0 — Quick wins `~1 day`
Ship before anything else. Independent, tiny, immediately felt.

| | Task | Size |
|---|---|---|
| ☑ | `A6` Mobile horizontal scroll fix | XS |
| ☑ | `G5` Static OG tags | XS |
| ☑ | `H5` Single source of truth for years | S |

### M1 — Safety net & the big payload `~3 days`
| | Task | Size |
|---|---|---|
| ☑ | `H1` Test harness + snapshots | L |
| ☑ | `A1a` Rebuild dictionary as base + overlays | L |
| ☑ | `A1b` Thread year through to render sites | M |
| ☑ | `A1c` Prefer matchup slots for position | S |
| ☑ | `H6` Stop standings mutating shared data | XS |
| ☑ | `H7` Fix strength of schedule | M |
| ☑ | `H8` Rebuild 2019 from the NFL.com record | M |
| ☑ | `H9` Fix declared lineup slot order, 2016-2019 | S |
| ☑ | `H10` Share the merged-fixture helper | S |
| ☑ | `H4` Bundle budget, enforced by the build | S |
| ☑ | `A5` Fix usePlayerSearch | S |

**Milestone test:** gzipped initial JS down from ~2.9 MB to well under 1 MB, with
snapshot tests proving no stat changed.

### M2 — Data layer `~4 days`
| | Task | Size |
|---|---|---|
| ☐ | `A2a` Un-eager the heavy files | M |
| ☑ | `A1e` Trim picks.json | S |
| ☐ | `A2b` Move data to `public/`, add loader | L | *(deferred — see risks)*
| ☐ | `A3` + `H2` Memoise and split `managerStats` | L |
| ☐ | `H3` Type the data loader | M |
| ☐ | `A1d` Backfill historical teams from nflverse | M |

**Milestone test:** initial JS under 400 kB gzipped; a 2014 page fetches one file.

### M3 — Design system & linking `~5 days`
The milestone that most changes how the site *feels*.

| | Task | Size |
|---|---|---|
| ☑ | `B1` Tokens | M |
| ☑ | `F2` Manager accent colours | S |
| ☑ | `B2` Card primitive | S |
| ☑ | `B3` DataTable | L |
| ☑ | `B4` Semantic column types | M |
| ☑ | `E1a–f` Link everything | L |
| ☑ | `E4` Breadcrumbs | S |

**Milestone test:** every table sticky-scrolls on a phone; no dead-end components
remain; the Draft Board is fully navigable.

### M4 — Stats engine `~5 days`
| | Task | Size |
|---|---|---|
| ☑ | `C1` Stat registry | L |
| ☑ | `C2` Lineup stats (a–d) | M |
| ☑ | `C3` Matchup stats (a–f) | M |
| ☑ | `C4` Draft stats (a–d) | M |
| ☑ | `C5` Transaction stats (a–c) | L |
| ☑ | `C6` Identity & fun stats (a–c) | M |
| ☑ | `A4` Build-time aggregates | L |

**Milestone test:** ~20 new statistics live; all-time pages render from a
prebuilt file.

**Half met, and the half that is missing is M5's.** 25 statistics are registered
and tested, and all 25 are precomputed into `public/data/all-time.json` — but
nothing renders them yet, so they are not "live" in the sense a league member
would recognise. No page consumes the prebuilt file either; `usePrecomputedStats`
is the reader waiting for one. The all-time pages that exist keep computing their
own numbers deliberately (see A4).

Three data corrections landed here rather than in M0, because building the draft
stats is what surfaced them: `H12` (2019's picks joined to no roster), `H13`
(2019's players held their points under scrape ids the rest of the app does not
use) and `H14` (the Chargers' Mike Williams split across two ids from 2019).

### M5 — Visualisation & pages `~6 days`
| | Task | Size |
|---|---|---|
| ☑ | `D0` Chart approach + budget | S |
| ☑ | `D3` H2H matrix | M |
| ☑ | `D2` All-time power ribbon | L |
| ☑ | `D1` Season arc | M |
| ☑ | `D7` Luck chart | M |
| ☑ | `D5` Weekly heatmap | M |
| ☐ | `D4` Score distribution | M |
| ☑ | `D6` Draft value scatter | M |
| ◐ | `F1a–e` Managers page rebuild | L | *(a–d done; F1e needs E7/M6)*
| ☑ | `F3` Manager detail rebuild | M |
| ◐ | `F4a–d` Hall of Fame | M | *(b–d done; F4a is the commissioner's to write)*

### M6 — Discovery & sharing `~6 days`
The "get lost in it" payoff, once there's something worth getting lost in.

| | Task | Size |
|---|---|---|
| ☑ | `E7` Narrative engine | L |
| ☐ | `E2` See-also rails | M |
| ☑ | `E3` Command palette (⌘K) | L |
| ☑ | `E5` Random matchup button | S |
| ☑ | `E6` On this day | M |
| ☑ | `E8` Table deep links | M |
| ☑ | `G1` SVG card renderer | L |
| ☑ | `G2` Card templates | M |
| ☑ | `G3` Clipboard copy | M |
| ☑ | `G4` Native share sheet | S |
| ☐ | `G6` Prerendered OG images | XL |

---

## Risks

| Risk | Mitigation |
|---|---|
| A stat silently changes during the A/H refactors | `H1` first, always. Snapshots are the whole point. |
| Workstream D undoes Workstream A | `D0` sets a +40 kB budget; `H4` enforces it in CI. |
| `A2b` breaks the in-progress 2026 season mid-flight | Ship `A2a` first as the safe stopping point; do `A2b` in an off-week. |
| Tailwind purge misses dynamically built class names (manager colours, position colours) | `F2`/`B1` must emit static class names or use CSS custom properties, never template-string classes. |
| `G6` prerendering conflicts with client-side routing | Prerender to real static paths and let the SPA hydrate; test a cold WhatsApp open on iOS specifically. |
| `A1a` drops `gsis_id` before `A1d` can use it to join nflverse data | Capture the ID mapping to a side file during `A1a`, even though the app doesn't need it. |
| Scope creep in C4/C5 — retrospective trade scoring is genuinely hard | Timebox `C5b`; ship the simple version (points scored post-trade) and iterate. |

---

## Content tasks that need you, not the code

- `F4a` — 15 Hall of Fame blurbs
- `F4c/d` — who belongs in the manager wing and the Ring of Shame
- `C6a` — sign-off on the archetype labels, which should be funny and slightly mean
- Any league lore that should sit in the wiki
