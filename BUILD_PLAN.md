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

- [ ] A1d — **not doing**: the commissioner decided against downloading the nflverse rosters (2026-09-18). Old draft boards keep showing players' current teams.

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

**A2b landed as lazy chunks, not `public/data/` + `fetch()`.** Every season
file stays in `src/data/` and is a dynamic import, grouped into one chunk per
season per part — `core-<year>` (league, rosters, users, brackets, schedule),
`draft-<year>`, and A2a's matchups and transactions — plus one lazy `players`
chunk for the dictionary and overlays. `public/_headers` makes `/assets/*`
immutable for a year. Chosen over `public/data/` because a hashed chunk can be
cached forever and an unhashed file only as long as last week's 2026 standings
are acceptable; and the fetch scripts, tests and build scripts keep reading the
same files. The JSON.parse argument is kept too: `json.namedExports: false`
makes Vite emit one `JSON.parse` per file (dictionary: 6.7 → 3.9 ms to
evaluate, +3.9 kB gzip).

The safety net is the part that matters: every field of `seasons[year]` bar
`transactions`, and `getPlayer`, throws `DataNotLoadedError` until loaded — a
thenable, so a read in render suspends and a read anywhere else fails loudly.
Nothing can silently see an empty season.

Measured (static-import closure of the route plus the data it loads, gzip):

| First visit | Before | After |
| --- | --- | --- |
| `/` | 668 kB — `data` 141, `players` 104, all 15 `matchups` 318 | **228 kB** — 15 × `core` 107, no draft, matchups or players |
| `/seasons/2014/standings` | 412 kB — `data` 141, `players` 104, `matchups-2014` 22 | **180 kB** — `core` 2012-14, `draft-2014`, `matchups-2014` |

`/` never read a matchup; it had been waiting on all of them since A2a. 2014's
standings read 2012-13's core because the champion card counts earlier titles.
`routeLoads.test.ts` pins both down by server-rendering the pages from a cold
loader. After a simulated `fetch-latest`, only 2026's data chunks (14 kB)
change name; 2012-2025 and the dictionary stay cached.

Against the original acceptance: initial JS is 77 kB (it already was) · `/`
fetches every season's core, which the all-time standings genuinely read; the
way below that is precomputing per-season standings rows, which A4 declined ·
a 2014 page fetches 2014, plus 5 kB of earlier cores on the standings tab ·
a second visit makes no request for anything under `/assets/`; it still
revalidates `index.html` and the unhashed `all-time.json`, which it must.

- [x] A2a
- [x] A2b

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

- [x] A3 *(done in `4e24694`: `utils/cache.ts`, with a call-counter test)*

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

- [x] C1

### C2 · Lineup stats `M`
**Blocked by:** C1

`getOptimalLineup` already exists in `src/utils/lineupAnalysis.ts` and only feeds
the All-Star Lineup tile. Surface what it can already tell you:

- [x] **C2a** Points left on the bench — per manager, per season, all-time
- [x] **C2b** Manager efficiency % (actual ÷ optimal) — separates drafting from managing
- [x] **C2c** The single worst start/sit in league history — week, player, manager, margin
- [x] **C2d** The Bench Bandit — most points scored while benched

### C3 · Matchup stats `M`
**Blocked by:** C1

- [x] **C3a** Biggest and closest margins ever (top scores exist; margins don't)
- [x] **C3b** Unluckiest loss (highest-scoring loss) and its twin, the lowest-scoring win
- [x] **C3c** "Beat almost everyone" — scores that would have won against 12 of 13 opponents and still lost
- [x] **C3d** Longest win/loss streaks, all-time and current (`getCurrentStreak` exists; streaks are not shown as records)
- [x] **C3e** Rivalry intensity — average margin per H2H pairing
- [x] **C3f** Revenge games — record in the rematch following a blowout loss

### C4 · Draft stats `M`
**Blocked by:** C1

- [x] **C4a** Best and worst picks ever — points per draft slot vs the slot average
- [x] **C4b** Draft position luck — does pick 1 actually win in this league? Fifteen years is enough to answer
- [x] **C4c** Most-drafted players league-wide, and who kept going back
- [x] **C4d** The one that got away — drafted, dropped, then scored for someone else

### C5 · Transaction stats `L`
**Blocked by:** C1

6.0 MB of transaction data is currently near-unused — the largest untapped
dataset in the repo.

- [x] **C5a** Waiver wire hit rate — points added via waivers per manager
- [x] **C5b** Trade ledger — points received vs given up, scored retrospectively. Who won each trade?
- [x] **C5c** Most churned roster — transactions per manager per season

### C6 · Identity & fun stats `M`
**Blocked by:** C1

- [x] **C6a** Manager archetypes — derived labels ("The Streamer", "The Set-and-Forget", "The Heartbreaker" for most narrow losses)
- [x] **C6b** Championship probability by week, retrospectively — at what point did each title become inevitable?
- [x] **C6c** On this day in Chumbo history — same week, previous seasons (feeds `E6`)

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
- [x] **D4** Score distribution — violin or histogram per manager. Separates the boom/bust managers from the metronomes, which W-L records hide entirely. *(needs F2)*
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

- [x] E2

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
- [x] **F1e** *(done — `ManagerCard/managerStory.ts`; every clause recounted by a test)* Auto-generated one-line story per manager: *"3 titles, but hasn't made the playoffs since 2022."* *(needs E7)*

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

- [x] G6

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

- [x] H2 *(managerStats split in `3f9fb60`; the four components split and verified byte-for-byte against their rendered HTML)*

### H3 · Type the data loader `M`
**Blocked by:** A2

`src/data/index.ts` uses `any` behind an eslint-disable and reimplements "ensure
initialised" three times. A loader typed on file pattern is shorter and safer.

- [x] H3 *(the `any` went in A2a; the loader was rewritten and typed in A2b)*

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
## Workstream I — Round two

Everything in here came out of somebody actually using the site rather than
reading the plan. Ordered by how badly it misleads a reader, not by size.

### I1 · The faces are missing from share cards `S` — ✅ done

Every card that should carry a manager's team logo draws the initials
fallback instead. The fallback is doing its job; the fetch behind it is not.

**The cause is a poisoned HTTP cache entry, not CORS.** Sleeper sends
`access-control-allow-origin: *` on both avatar paths — verified with `curl`
against `/avatars/<id>` and `/uploads/<hash>.jpg`. But the page has already
painted that same URL in an `<img>` with no `crossorigin` attribute, so the
browser holds a **no-CORS** cache entry for it, and `embedImage`'s later
`fetch(url, {mode: "cors"})` reuses that entry and is rejected before it ever
reaches the network. Measured in the browser on `/managers/thd`:

| | |
|---|---|
| `embedImage("/avatars/nfl/b9d4….jpg")` | 2,035 byte data URI — local files are same-origin, never affected |
| `embedImage("https://sleepercdn.com/uploads/ef0f….jpg")` | `null` |
| the same URL with `cache: "reload"` | 37,075 bytes, `image/png` |
| a plain CORS fetch *after* that reload | now succeeds — the entry has been replaced |

So the failure is deterministic and it is worst exactly where it matters: a
manager's own page paints their avatar, then offers a card that cannot have it.

Two halves to the fix, and it wants both:

- **Retry with `cache: "reload"`** when the first CORS fetch fails. Cheap
  (avatars are 20-40 kB), self-healing, and it fixes caches that are already
  poisoned in the league's browsers today — which a markup change cannot.
- ~~**Add `crossOrigin="anonymous"`** to every `<img>` painting a remote
  avatar.~~ Dropped when it came to it: that would make every avatar on the
  site depend on Sleeper's CORS header, when `images.ts` exists so that only
  cards pay if it ever goes. The retry alone fixes it.

Regression test: assert `embedImage` retries once on failure, since the bug is
invisible by construction — a card with initials looks deliberate.

### I2 · Charts need a real popover `L` — ✅ done

Every dot, cell and line node currently hangs its explanation on an SVG
`<title>`, which is the browser's native tooltip: an 800 ms delay, OS styling,
no links, and nothing at all on touch. Clicking instead navigates the page away
to the player or manager, which is a heavy answer to "what is that dot?".

One shared `ChartPopover`, used by all six sites: `DraftScatter`, `LuckChart`,
`SeasonArc`, `ScoreDistribution`, and both of `ScoreHeatmap`'s. Hover previews
it, click pins it, Escape and outside-click dismiss it. It carries the numbers
behind the mark and **the links out** — so navigation becomes a deliberate
second click rather than the accidental first one.

The same interaction model `useSeriesSelection` already uses for series
(hover previews, click pins), applied to marks. Keyboard reachability comes
with it: a pinned popover is focusable in a way a `<title>` never was.

### I3 · A pick traded in week 1 is not a bust `M` — ✅ done

`draftValue.ts` scores a pick by what the **drafting roster** got, so a player
traded before a ball is snapped lands on the floor of the chart at 0.0 with no
explanation. 2018 is full of it, because of the Le'Veon Bell holdout:

| Pick | Player | What happened |
|---|---|---|
| 4 | Alvin Kamara | traded in leg 1 — "Team 12: Alvin Kamara \| Team 1: Le'Veon Bell" |
| 6 | Saquon Barkley | traded in leg 1, then again in leg 11 |

And Bell then held out all season, so the deals returned nothing — but that
is the *trade* failing, not the pick, and the trade ledger already scores it
(chris −256.9 on the Kamara deal). The chart blames the pick instead.

**Score a pick by the player's total season points**, which the module already
computes — `points + pointsElsewhere` — and put the trade in the popover from
I2: when it moved, to whom, and for what. The 2012-2019 transactions carry a
`metadata.notes` string naming both sides of every trade, so the popover can
quote the deal rather than reconstruct it.

One consequence to decide with the same change: `draftStats.ts`'s
`best-draft-picks` makes the same judgement, and its docblock says so
explicitly. Change both together or they drift — a scatter and a records table
disagreeing about the same pick is worse than either answer.

### I4 · Share surfaces: size, placement, and the cards that aren't there `M` — ✅ done

Three separate complaints about the same component.

- **The button is too big and out of line.** It is a 44 px standalone pill with
  its own message row, dropped into flows built for a 20 px icon. It should be
  an icon button sitting in the card header it belongs to, consistently
  right-aligned, with the outcome message as a transient toast rather than a
  layout-shifting sibling.
- **Placement has no rule.** Five surfaces today, chosen by whichever template
  existed. The rule should be: wherever there is a card with a heading, the
  heading gets a share control, and it shares *that card*.
- **The obvious cards are missing.** A manager has one card, for their best
  season. There should be one per season row and one for the career; the same
  for a player, season and career. Both are `managerSeasonCard` with different
  inputs — the template work is mostly done.

Carries the two features cut for bytes before the budget rose: the H2H streak
pill and a badge distinguishing Triple Crown from Scumbo.

### I5 · "Managed by" on interim-manager matchups `S` — ✅ done

Settled: the manager who **built** the team owns its record for the season, so
`managers.json`'s `weeks` field does not change any W/L attribution anywhere.
What it should do is annotate — a "managed by" line on the matchup screen for
the weeks somebody else was holding the reins. sol/phil in 2015 and 2016,
chris for a week of 2020.


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
| ☑ | `A2a` Un-eager the heavy files | M |
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
| ☑ | `D4` Score distribution | M |
| ☑ | `D6` Draft value scatter | M |
| ◐ | `F1a–e` Managers page rebuild | L | *(a–d done; F1e needs E7/M6)*
| ☑ | `F3` Manager detail rebuild | M |
| ◐ | `F4a–d` Hall of Fame | M | *(b–d done; F4a is the commissioner's to write)*

### M6 — Discovery & sharing `~6 days`
The "get lost in it" payoff, once there's something worth getting lost in.

| | Task | Size |
|---|---|---|
| ☑ | `E7` Narrative engine | L |
| ☑ | `E2` See-also rails | M |
| ☑ | `E3` Command palette (⌘K) | L |
| ☑ | `E5` Random matchup button | S |
| ☑ | `E6` On this day | M |
| ☑ | `E8` Table deep links | M |
| ☑ | `G1` SVG card renderer | L |
| ☑ | `G2` Card templates | M |
| ☑ | `G3` Clipboard copy | M |
| ☑ | `G4` Native share sheet | S |
| ☑ | `G6` Prerendered OG images | XL |

---

# Round 3 — the 2026 season (planned 2026-09-18)

Decided in the planning session: all four areas are in; the site updates
itself; **no backend this round** (predictions, reactions and HOF blurb
submissions are parked); **in-season first** — what is useful during weeks
2–17 goes before anything that can wait for the off-season.

Plus one idea from the commissioner, checked before planning rather than
dismissed: **real NFL stats for every game, and when the points were scored**,
so a matchup can be drawn as the weekend it actually was. It is possible — see
Workstream L.

The order, and why:

| When | What | Why then |
|---|---|---|
| Now (week 2) | **J1** automatic weekly updates | Everything live depends on it. The site has been at week 1 because nobody re-ran `fetch-latest`. |
| By ~week 4 | **J2** weekly recap · **K1** matchup previews | The two things worth sharing every single week. |
| Weeks 4–10 | **L0** spike → **L1** box scores → **L2** scoring timelines | The big one; a spike first so a dead end costs a week, not a month. |
| Weeks 8–12 | **J3** records watch | Needs half a season of pace to be interesting. |
| Weeks 10–16 | **N** Chumbo Wrapped | Built mid-season, shipped the week the final is played. |
| Off-season | **M** archive deep-dives | Nothing about them is time-sensitive. |

## Workstream J — Keep the live season alive

### J1 · The site updates itself `M` ✅

> **Done (2026-09-18).** `.github/workflows/update-season.yml` runs
> `yarn update-season` Tue/Wed/Fri 10:00 UTC, Sep–Jan, then `test:run -u` and
> `build`, and commits as `github-actions[bot]` only if both pass. It fetches
> every week Sleeper has scored (`last_scored_leg`, never the half-played
> `leg` that `fetch-latest` takes), refuses a scored week that is short of
> teams or all zeroes, strips the league chat fields that would otherwise
> make every run a commit, and refreshes the player dictionary only when a
> player it mentions is missing. A failure opens an issue; the next success
> closes it. Rehearsing the whole season against simulated data turned up
> three things that would have stopped it partway: 47 tests pinned values the
> live season moves (now pinned to finished seasons, or snapshots the run
> re-records); a season with brackets was treated as finished, so for the
> three playoff weeks the best record was crowned champion with a Triple
> Crown and a "won the 2026 Chumbo" link preview (`isSeasonSettled` now
> needs a played final); and the bundle `total` counted season data, which
> would have failed the build around week 8 (split into `code`, `players`
> and a per-season ceiling). Bot push access needed nothing: `main` is
> unprotected and the repo's Actions token can write.

A scheduled GitHub Action (the repo is public on GitHub, so it is free):
`fetch-latest` → `trim-picks` → `build-aggregates` → **`yarn build` must pass**
→ commit as a bot → push → Netlify deploys. Runs Tuesday morning UK time
(after Monday Night Football) and again Friday (Sleeper's stat corrections
land mid-week). From week 15 it also fetches brackets; after the final,
`fetch-season`. A failed build commits nothing and opens a GitHub issue, so a
bad week of data can never reach the site. Manual `workflow_dispatch` too.

**Acceptance:** week 2 appears on the site with nobody touching it · a
deliberately broken fetch leaves `main` untouched and opens an issue.

### J2 · "Week N in the Chumbo" `L` ✅

> **Done (2026-09-18).** `/seasons/:year/matchups/:week` leads with the recap
> (`utils/weekRecap.ts`): top and low score, closest game, biggest beating,
> luckiest win and unluckiest loss by all-play, worst benching (not for 2019),
> streaks extended past three or ended, and E7's all-time notes for the week.
> "Copy week card" (`weekRecapCard`) and a prerendered link preview for all
> ~240 played weeks, from the same `recapLines`. The week picker now changes
> the address, and the live season opens on its latest scored week.

A recap for every completed week, generated from the stat registry — highest
and lowest score, closest game, biggest beating, the worst benching (points
left on the bench), the luckiest win by all-play, any all-time record entered
(the narrative engine's job already), streaks started or ended. On the
matchups tab for that week, with its own share card and a prerendered link
preview, so the Tuesday-morning message to the group is one paste. Works for
every past week too, which is 225 recaps of back catalogue for free.

### J3 · Records watch `M`

Who is on pace for a season record (points, all-play, win streak) and who is
near a career milestone (100th win, 20,000 points), with the pace honest about
how many weeks are left. On the home page and in the weekly recap.

## Workstream K — The build-up to each week

### K1 · Matchup previews `M` ✅

> **Done (2026-09-18).** The week after the last scored one appears as "Week N
> · preview": each game's series, streak, last meeting (playoffs included),
> form, what one result decides (a series levelled or taken, the league's
> longest winning or losing run equalled or broken, a round number of career
> wins or points), and the stakes — playoff
> odds now, with a win, with a loss — from `calculateWeekStakes`, one seeded
> pass of the odds simulation. Each game has a preview page at the address its
> result will have, a "Copy preview card" (`matchupPreviewCard`) and a link
> preview. The odds model now shrinks each team towards the league average by
> four games (`PRIOR_GAMES`), which also changes the Playoff Odds page: after
> week 1 it had the top scorer at 100% and the bottom at under 1%. Not done:
> single-game records (the biggest margin, the highest score) are not
> previewed, because no result makes them likely; and playoff weeks have no
> previews, because their fixtures come from the bracket, not the schedule.

For next week's games (`schedule.json` already has them): the head-to-head
record and current streak, their last meeting, both managers' form, and
**what is at stake** — the playoff-odds simulation already exists, so "win and
jay's playoff odds go to 71%; lose and they are 38%" is two simulation runs.
Records that could fall this week. A share card per preview.

## Workstream L — Game-day data (the commissioner's idea)

**What exists** (checked, nothing downloaded):

- nflverse publishes **per-player weekly stats** (~1.6 MB a season) and full
  **play-by-play** (~18 MB a season, 1999 onward). The play-by-play carries a
  **wall-clock `time_of_day` for every play**, plus who passed, rushed,
  caught, kicked or scored on it.
- Sleeper serves its own **per-week stat lines keyed by Sleeper player id** —
  the ids this site already uses, so no join at all.
- DynastyProcess publishes the **Sleeper-id ↔ NFL-id table** for the rest.

**What that makes possible:** rebuild every starter's fantasy points play by
play, with a real timestamp, using that season's own `scoring_settings` — and
so each team's score across the weekend, Thursday night to Monday night.

**The honest limits:**

- **Not live.** The data is published the morning after; this is a replay of
  Sunday, not a tracker. Live needs a real-time feed and a backend.
- **Rebuilt, then reconciled.** Stat corrections and scoring quirks mean a
  rebuilt total can differ from Sleeper's by a point or two. The curve is
  scaled to end on the official score, and flagged where the drift is large.
- **Team defences** score partly on points allowed, which is only known at the
  final whistle, so a D/ST's curve steps at the end of its game.
- **2012–2015 name-keyed players** join by name — the same small set the site
  already handles, and checkable.
- **Size.** ~280 MB of raw play-by-play to backfill fifteen seasons, processed
  offline into small per-week files (well under 1 MB a season), lazy-loaded
  like matchups. The raw files are never committed. nflverse data is CC-BY,
  so the site credits it.

### L0 · Spike `S` ✅ — **go**

Rebuild one 2025 matchup and one 2018 matchup play by play; check the totals
land within a point of Sleeper's; draw the curve. Go/no-go on L1–L3.

> **2025 (2026-09-18).** Every starter of every regular-season week, not one
> matchup: **1,828 of 1,834 rebuilt to the hundredth of a point, 1,831 within
> a point**, using the season's own `scoring_settings` and the nflverse
> play-by-play (`scripts/spikes/l0/rebuild.py`). The ids join completely:
> Sleeper → gsis through DynastyProcess, backed by `player-id-map.json`, with
> nothing unmapped. The rules that had to be found, all now in the script:
>
> - **Points allowed is not the final score.** Sleeper subtracts 6 for each
>   defensive touchdown the opponent scored (not the conversion after it) and
>   2 for each safety. Kick and punt return touchdowns, a blocked field goal
>   run back included, still count. This was all six points-allowed misses.
> - **A muffed kick recovered by the kicking team** is a special-teams fumble
>   recovery for that team's D/ST. nflverse records the kicking side as the
>   offence on a punt, so it has to be looked for separately.
> - **The last three are not rules**: nflverse's own weekly stat lines agree
>   with the rebuild and Sleeper differs by a correction (Benson 10 yards,
>   Williams 12.5 passing yards, Hurts one point). Reconciliation absorbs
>   them — each starter's residual goes in at the end of their game, so every
>   curve ends exactly on the official score.
>
> **The curves work** (`scripts/spikes/l0/curve.py`): each play's UTC wall
> clock, dead hours squeezed out, the week labelled in the NFL's own slots
> (Thursday night, Sun early/late, Sunday night, Monday night). What it
> finds in 2025 alone: 13 games not decided until Monday night; week 1's
> htc game with 17 lead changes; week 2's hadkiss–fin with 14, settled by
> Mayfield on Monday night. Size, for L1: about 900 scoring events a week
> for 108 starters — well under 1 MB a season once gzipped.
>
> **2018 (2026-09-18): 1,403 of 1,404 starters exact**, all 13 regular-season
> weeks, on 2018's own scoring (no forced-fumble points, 2 a fumble
> recovery, 3 for a 40–49-yard field goal). Two more rules, and one data fix:
>
> - **About 1% of 2018's plays have no wall-clock time** (2025 has none
>   missing), 64 of them scoring. Dropped, they took whole field goals with
>   them; a timeless play now takes the time of the play before it.
> - **A fumble recovery is the recovering team's**, whoever had the ball: a
>   defender fumbling an interception back to the offence is a recovery for
>   the offence's D/ST, and a team falling on its own muff is none.
> - **"M Harris" in 2018 was the wrong player.** The NFL.com-era import
>   matched him to Marcus Harris (1771), who did not play; the receiver in
>   weeks 10–11 was Maurice Harris (3650). His points rebuild to the
>   hundredth for Maurice and to 0 for Marcus. Corrected in
>   `fix-player-ids.js` — the rebuild doubles as an audit of every lineup
>   the NFL.com years imported, and L1 should report any starter that
>   rebuilds to 0.
> - The one miss left is Agholor (7 yards), unconfirmed without 2018's
>   weekly stat file; 2025's three were Sleeper corrections.
>
> The 2018 curve reads as well as 2025's: week 6, sol 118.68–118.60 dix —
> sol ahead all Sunday, level by Sunday night, three lead changes on Monday
> night, settled by Davante Adams's last catch. The same week chris beat fin
> 55.42–55.34, also on Monday night. Seven 2018 games were decided then.
>
> **Verdict: go on L1–L3.** The numbers match to the hundredth, the ids join,
> the timeline is honest, and the stories are there.

### L1 · Box scores `M` ✅

> **Done (2026-09-18).** Every rostered player's real stat line and NFL team,
> every week of 2012–2025, under his name on the matchup page ("LAC · 37/55,
> 420 yds, 3 TD, 2 INT · 6 car, 31 yds"), from `yarn build-gamedays`. The
> builder rebuilds every starter's points as it goes: **20,960 of 20,996
> player-starts exact** across fourteen seasons. Finding the last of them
> took three more scoring facts (2012–16 never scored a returner's TD;
> 2020–21 scored kicks by the yard, points allowed by the point, and a sack
> as a tackle for loss) and two plays-with-two-fumbles rules, and turned up a
> second wrong player: 2015–17's "Zach Miller" was the retired Seahawk, not
> the Bear (fixed, 36 references). The misses left are Sleeper stat
> corrections and the abandoned 2022 Bills–Bengals game. D/ST totals in
> 2020–21 run a point or two apart on tackles for loss, which the sources
> count differently; their box scores are unaffected. The weekly update
> builds the live season's too. **A1d is closed**: each season's teams now
> come from the play-by-play, so old draft picks and player pages show the
> team a player was on that year — for most retired players they showed no
> team at all.

Every starter's real stat line on the matchup page — "22 car, 104 yds, 1 TD ·
4 rec, 31 yds". As a by-product, each player's **NFL team for that week**:
the old A1d gap (players shown on today's team in old draft boards) closes
without a separate job.

### L2 · How the game unfolded `L` ✅

> **The chart (2026-09-18).** Every matchup page from 2012 on has "How the
> week unfolded": both scores Thursday night to Monday night, one step per
> scoring moment, on a clock with the dead hours squeezed out and the week
> named in the NFL's own slots (Thursday night, Sunday early and late, Sunday
> night, Monday night; TNF/Sun/Late/SNF/MNF on a phone). Above it, one line:
> the lead changes and when, and through whom, the winner went ahead for good
> ("Four lead changes. sol went ahead for good on Monday night, when Davante
> Adams scored."). **Key plays** — a touchdown, or anything worth more than 5
> to one starter — are dots that open the play on hover or tap: the player
> and his points, the slot, the game and clock, the NFL's own description,
> what scored and the score after it. The timelines come from
> `build-gamedays` with the box scores, one file per week (~10 kB gzipped),
> every team ending exactly on Sleeper's score: a starter's stat correction
> goes in after his last play, and sixteen NFL.com-era team scores that are
> not quite their starters' sum get a team correction, never drawn as a play.
>
> **The records (2026-09-21).** Three lists the league has never been able to
> see, on `/records` with all the others:
>
> - **Biggest comeback** — the largest deficit a winner ever faced. rich, 77.4
>   down to jay in 2024 week 8, and ahead only when Chris Boswell kicked on
>   Monday night. It is part heroics and part scheduling (a lineup that plays
>   late spends Sunday behind), so the description says so and every entry
>   names when the low point was.
> - **Latest decisive play** — nick, 2020 week 5, Tuesday 9:22 pm, Cole
>   Beasley: the game COVID moved off Sunday. The top of the list is the
>   Tuesday games of 2020 and 2021, then the Monday nights that ran past
>   midnight in the east. Ordering them needed the NFL week to start on
>   **Wednesday**, not Thursday — 2012 opened on one and 2024 played Christmas
>   on one, and a week that began on Thursday made the first game in Chumbo
>   history the latest-decided game in Chumbo history.
> - **Won it on Monday night** — hadkiss 27, sol 25, ant 20.
>
> The timelines are not season data, so they are handed to the registry
> (`provideTimelines`) by whoever wants them — `build-aggregates` and the test
> setup, never a page — and a stat that reads them declares
> `requiresTimelines`, so the registry throws instead of answering that the
> league has no comebacks. 2019 is excluded: its lineups are a reconstruction,
> which makes its timelines a guess at the shape of a game. A correction can
> never hold the last two records; it has no player and its time is borrowed
> from the last real play.
>
> **The card (2026-09-21).** "Copy chart" at the end of the chart's heading.
> It is the only card in the set that is a picture rather than a list: the two
> lines, the parts of the week under them, a dot per key play, a ring and a
> dotted rule where the winner went ahead for good, and each name and final
> score at the end of its own line — which is also the legend. The sentence
> from the page runs above it. The moments are positioned by the same
> `squeezedTime` the page uses, in `cardData`, so the card cannot draw a
> different shape from the chart the sharer was looking at. The lines keep the
> chart's blue and orange rather than the two managers' accents (F2: one
> accent per card, and it is the winner's — the top rule and the ring).
>
> The geometry took two goes. Clamping each end label into the plot and THEN
> pushing the pair apart put the winner's name above the plot and into the
> sentence on a game decided by 0.68 points; it pushes them apart first and
> moves the pair back inside now, and a test holds it.

On every matchup page: both teams' scores through the weekend, lead changes
marked, the play that decided it named ("won it at 21:42 on Monday, Kelce
2-yd TD"). New records the league has never been able to see: **biggest
comeback**, **won it on Monday night**, **latest decisive play**. A share
card — the most shareable thing on the site, probably.

### L3 · Weekly, automatically ✅

> **Done (2026-09-21).** J1's job already rebuilt the live season's
> play-by-play; what it did not do was say whether that worked. The rebuild
> must not hold back the week's results, so it is wrapped in a try/catch —
> which is how a thing breaks in October and is noticed in January. Now every
> run works out which scored weeks actually came out with box scores, prints
> it, puts it in the commit message and the run's summary, and the workflow
> opens **The play-by-play is behind** when a week that is not the newest one
> is missing, or the rebuild fell over. The newest week is allowed to lag —
> the NFL publishes Monday night a few hours after it ends — and because every
> run rebuilds the whole season, the next one catches up and closes the issue
> by itself. A second Tuesday run at 15:00 UTC means that catching up happens
> the same day rather than on Wednesday; nflverse had Sunday's games the same
> evening when this was checked.
>
> Two bugs found by building it. Nothing may be rebuilt before the first week
> is scored, because a season that has not started has no play-by-play file to
> download and the run would fail every day of September. And the precomputed
> records have to be regenerated **after** the rebuild as well as before it:
> the fetch script refreshes them, then the play-by-play runs, so L2's records
> would have been a week behind the data committed beside them — and
> `precomputed.test.ts` compares the two, so the whole update would have
> failed on the first Tuesday a new week landed.

J1's job also pulls the week's play-by-play, so each week's timelines appear
the morning after with everything else.

## Workstream M — Archive deep-dives (off-season)

- **M1 Trades:** a page per trade with the hindsight verdict (the ledger
  exists), trade of each season, and **trade trees** following one player
  through a chain of deals.
- **M2 Drafts:** a **redraft** of every year (who should have gone first) and
  a draft grade per manager per year, from the D6 values.
- **M3 What-ifs:** your season with the optimal lineup every week; your record
  with someone else's schedule (the schedule comparison, in narrative form).

## Workstream N — Chumbo Wrapped

A personal end-of-season story per manager, a sequence of cards to swipe and
share: the season in numbers, best week, MVP, worst benching, luck, their
rival, best and worst trade, Triple Crown or Scumbo legs. Built from existing
stats and the card system; shipped the week of the final.

## Decisions still needed

- **L's data.** It needs the nflverse downloads above (the commissioner
  declined the smaller nflverse roster download for A1d earlier). L0 can be
  done with two seasons' files (~40 MB) before committing to the backfill.
- **Parked, needs a backend:** predictions/pick'em, reactions, HOF blurb
  submission. The HOF blurbs could instead be a markdown file per year edited
  on GitHub — no backend — if a champion is willing.

---

## Where this stands

**Everything that is going to be built is built.** M0–M6, Workstream I and
the leftovers are done; what remains is the league's to write, not code.

- `F4a` — **the champions'.** Fifteen Hall of Fame citations, each written by
  that year's champion, plus portraits at `public/images/hof/<year>-icon.jpg`
  (the page degrades to an initials medallion until they exist).
- `A1d` — **not doing**, by decision: no nflverse download, so seasons before
  2025 resolve players against today's dictionary (wrong NFL team on old
  draft boards; positions are right, from `unmatched_players`).
- **Dark mode — not wanted.** The site declares `color-scheme: light`.
- **Player link previews** — deferred by decision. `playerCareerCard` exists;
  the blocker is that per-player stats live in a React hook the prerender
  cannot call, and it would be ~4,400 more pages.

**No known bugs or quirks are outstanding** (2026-09-18). Everything the H2
split and A2b turned up has been fixed: the stale "2025 participants" text,
a leftover debug log, round-blind H2H playoff matching, the H2H streak's
owner, never-met 0-0-0 schedule rows, standings sorting their input in
place, win percentage giving NaN before a first game and counting a tie as
nothing (2015's two 7-5-1 teams showed .538, now .577), a strength-of-schedule
scale that assumed twelve teams, H2H grouping and positioning players by name
(David Johnson the RB was slotted at TE in twelve pairings), two comments that
contradicted their code, three copies of the TopScores playoff rule, a
failed data download retrying forever behind a silent spinner, and the last
lint warning.

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
