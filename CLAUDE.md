# CLAUDE.md — Chumbo project guide

Fantasy football almanac for a long-running Sleeper home league ("The Chumbo").
A static React site that reads committed JSON season data and renders history,
standings, matchups, drafts, players, managers, H2H, records, etc. Hosted
externally (no longer GitHub Pages) — pushing to `main` is enough; there is no
deploy step.

> The root `README.md` is the stock Vite template and is not useful. This file is
> the real orientation doc. `BUILD_PLAN.md` holds the sequenced backlog of
> performance, design, stats, navigation and sharing work.

## Stack

- React 18 + TypeScript, Vite 6, Tailwind 3
- React Router 7 (`src/App.tsx`), `@tanstack/react-table`, `use-intl`
- Package manager: **yarn** (v1). Node ESM scripts in `scripts/`.

## Common commands

```bash
yarn dev            # local dev server
yarn build          # tsc -b, build-aggregates, vite build, then the bundle budget
yarn lint           # eslint
yarn test           # vitest (watch)
yarn test:run       # vitest (single run)
yarn build-players  # rebuild players.json + per-season overlays
yarn trim-picks     # strip duplicated player metadata from picks.json
yarn fix-player-ids # apply the committed player-id corrections (idempotent)
yarn own-avatars    # save every Sleeper team logo locally, point the data at it
yarn build-aggregates  # regenerate public/data/all-time.json (runs in `yarn build`)
yarn check-aggregates  # fail if that file is stale, without rewriting it
yarn prerender-og   # per-route HTML + OG images into dist/ (runs in `yarn build`)
yarn preview-blurbs [--year 2026 --week 3]  # the week's previews as WhatsApp text (K1)

# Data fetching (Sleeper API) — see scripts/fetch-sleeper-data.js
yarn update-season                             # what the weekly Action runs (J1)
NFLVERSE_DIR=… yarn build-gamedays [--year 2025] [--download]  # box scores (L1)
yarn fetch-data      -- --year 2026            # draft+picks+rosters+users+league + latest week
yarn fetch-latest    -- --year 2026            # latest completed week only
yarn fetch-week      -- --year 2026 --week 3   # specific week(s)
yarn fetch-brackets  -- --year 2026            # winners/losers brackets
yarn fetch-season    -- --year 2026            # end-of-season: everything incl. brackets
```

## Path aliases

`@/` → `src/`, plus `@/utils`, `@/types`, `@/data`, `@/presentation`, `@/domain`,
`@/hooks`, `@/constants`. Defined in `tsconfig.app.json` and `vite.config.ts`.
See `PATH_ALIASES.md`.

## Repo layout

```
src/
  data/                  # ALL league data lives here as committed JSON
    managers.json        # canonical manager identities (see below)
    players.json         # base NFL player dictionary (~670KB, 8 fields, minified)
    index.ts             # loads every season on demand via import.meta.glob (KEY FILE)
    parts.ts             # which file is in which lazily-loaded part
    2012/ ... 2025/      # one folder per season
  domain/constants.ts    # YEARS[] and CURRENT_YEAR  <-- edit to add a season
  constants/fantasy.ts   # ValidYear union type      <-- edit to add a season
  utils/                 # stats, records, weeks, leagueRules, h2h, etc.
  hooks/                 # useSeasonData, player/manager stat hooks
  presentation/          # pages + components (DraftBoard, Standings, Matchups, ...)
scripts/
  fetch-sleeper-data.js  # pulls a season's data from the Sleeper API
  fetch-matchup.js       # single matchup helper
  filter-players.js      # trims players.json to fantasy-relevant positions
```

## Per-season data model (`src/data/<year>/`)

| File | Source (Sleeper endpoint) | Notes |
| ---- | ------------------------- | ----- |
| `league.json` | `/league/{league_id}` | Holds `league_id`, `draft_id`, settings, scoring. **Must exist before the fetch script can run** (see bootstrap). |
| `draft.json` | `/draft/{draft_id}` | Draft metadata, order, slot→roster mapping. |
| `picks.json` | `/draft/{draft_id}/picks` | Every pick, trimmed by `yarn trim-picks` to the six fields the app reads. The raw Sleeper pick carries a 13-field `metadata` block duplicating the player dictionary — 71% of the file — plus `draft_id`, `is_keeper` and `reactions`, which nothing reads. |
| `rosters.json` | `/league/{id}/rosters` | |
| `users.json` | `/league/{id}/users` | |
| `matchups/<week>.json` | `/league/{id}/matchups/{week}` | Weeks 1–18 fetched; index consumes **1–17**. |
| `transactions/<week>.json` | `/league/{id}/transactions/{week}` | **2020+ only.** 2012–2019 used a single legacy `transactions.json` (grouped by `leg`). |
| `winners_bracket.json` / `losers_bracket.json` | `/league/{id}/winners_bracket` etc. | End of season. |
| `schedule.json` | `/league/{id}/matchups/{week}` for every regular season week | `{week: [{matchup_id, roster_id}]}`. Written by any fetch while the season is in progress. Only Playoff Odds reads it, to simulate unplayed weeks (so other pages never see 0-point future games). |
| `weeks/<week>.json` | derived by `yarn build-gamedays` from nflverse play-by-play | Box scores (L1) — every rostered player's stat line and NFL team that week, by Sleeper id — and each team's scoring timeline (L2). Not a part of `seasons`: `src/data/gamedays.ts` loads one week at a time, each its own ~10 kB chunk. |
| `players.delta.json` (optional) | derived by `yarn build-players` | Per-season overlay: `{playerId: {t: team, p: position}}` for players whose team or position that year differed from the base dictionary. ~8KB. A season without one resolves entirely to the base. |

### How data is loaded

`src/data/index.ts` **auto-discovers** every season's JSON with
`import.meta.glob` — there is **no manual import per season**, and a season is
invisible until `YEARS` includes it. Nothing is eager except `managers.json`
(A2): every other file is a dynamic import, grouped by `manualChunks` into one
chunk per season per **part**, and loaded when something asks for it.

| Part | Chunk | Files |
| ---- | ----- | ----- |
| `core` | `core-<year>` | league, rosters, users, both brackets, schedule |
| `draft` | `draft-<year>` | draft, picks |
| `matchups` | `matchups-<year>` | `matchups/*.json` |
| transactions | `transactions-<year>` | `transactions/*.json`, legacy `transactions.json` |
| players | `players` | `players.json` + every `players.delta.json` |

`src/data/parts.ts` is the one list of which file is in which part; the loader
and `vite.config.ts` both read it. A new kind of per-season file has to go in
it — `loader.test.ts` fails on a file no part claims. The files stay where the
fetch scripts write them, so `yarn fetch-latest` needs no extra step: the next
build picks the new week up, and only the 2026 chunks change name.

**Reading data.** `seasons[year]` is a synchronous view whose every field
(except `transactions`, which A2a left unguarded) THROWS `DataNotLoadedError`
until its part has loaded — and so do `getPlayer` / `getPlayers`. It never
answers with an empty array: that would render a plausible, wrong page. The
error is also a thenable, so a read during render suspends to the route's
`<Suspense>`; outside render (a click handler, a script) it fails with the name
of the field. So:

- **In a component**, ask for what the page reads with `useDataLoaded` (or
  `useSeasonData` / `useAllSeasons`) in `src/hooks/useSeasonData.ts`, all in one
  call so it arrives in one round trip. A read you forgot suspends and loads
  that part for every season — correct, one step slower.
- **Outside render**, `await loadSeasons(years)` / `loadSeasonParts` /
  `loadTransactions` / `loadPlayers` first. Node consumers (the test setup,
  `build-aggregates`, `prerender-og`) `await loadAllSeasons()`.
- **Never read season data at module top level.** It throws at import and takes
  the route with it. `importTime.test.ts` imports every module cold to catch it.
- **Never wrap a read in a try/catch** that could swallow the error — that is
  a silently missing season.

`routeLoads.test.ts` server-renders pages from a cold loader and asserts which
parts they load: `/` loads every season's `core` and nothing else,
`/seasons/2014/standings` loads 2014 plus 2012-13's `core` (the champion card
counts earlier titles). Update it deliberately if a page's needs change.

**Caching.** Chunk names are content hashes, and `public/_headers` gives
`/assets/*` a one-year immutable `Cache-Control` at Netlify, so a returning
visitor fetches only what changed. Do not put season data under `public/`:
unhashed files cannot be cached like that.

### managers.json

Canonical identity map (not from Sleeper). Each manager: `id`, `name`, `teamName`,
`userId[]` (Sleeper user ids they've used), `teamId` (string, or `{year: id}` /
`{current: id}` when it changed over time), optional `sleeper`, `active`, and
`weeks` overrides for mid-season replacements. `weeks` changes no attribution:
the league's rule is that whoever built the team owns its record, and the site
credits it that way; `utils/interimManagers.ts` only reads it to put "managed by"
on the stand-in's matchups. Update this if 2026 has a new
owner, a returning owner under a new Sleeper account, or a team-id change.

## Adding a new season (2026 — draft just completed)

The fetch script reads `league_id` and `draft_id` from an existing
`src/data/2026/league.json`, so there is a bootstrap step:

1. **Get the 2026 Sleeper IDs.** The 2026 league chains off 2025 via
   `previous_league_id`. Find the 2026 `league_id` (Sleeper app URL, or the API)
   and its `draft_id`.
2. **Create `src/data/2026/league.json`** as a minimal seed:
   ```json
   { "league_id": "<2026_LEAGUE_ID>", "draft_id": "<2026_DRAFT_ID>" }
   ```
3. **Fetch the data:**
   ```bash
   yarn fetch-data -- --year 2026
   ```
   This overwrites `league.json` with the full object and writes `draft.json`,
   `picks.json`, `rosters.json`, `users.json`, plus the latest matchup/transaction
   week (empty pre-season — harmless). Re-run through the season with
   `fetch-latest` / `fetch-week`, and `fetch-season` at the end for brackets.
4. **Register the year** in `src/domain/constants.ts` → add `2026` to `YEARS`.
   Everything else (`ValidYear`, the fetch scripts) derives from it.
5. **Players dictionary.** Drop a fresh Sleeper `/players/nfl` dump at
   `src/data/2026/players.json`, then run `yarn build-players`. It merges the
   dump into the base `src/data/players.json`, writes a `players.delta.json`
   overlay for any season whose teams/positions differ, and deletes the raw
   dump. Never commit a raw dump — they are ~6MB each.
6. **Optional annotations.** If the 2026 draft order/rules changed notably, add a
   `2026` entry to `getManualChanges()` in `src/utils/leagueRules.ts`.
7. `yarn build` / `yarn lint` to verify, then commit and push to `main`.
8. Re-enable the **Update the season** workflow on GitHub's Actions tab if it
   was switched off over the summer (see "The automatic update" below).

## Behaviour with an in-progress season (relevant right now)

- `history.tsx` defaults to the latest year in `YEARS`, so once 2026 is added it
  becomes the **default landing season**. With only draft data, the Draft tab is
  populated; Standings/Matchups will be empty until games are played.
- `isWeekCompleted` (`utils/weekUtils.ts`) gates by `league.settings.leg` /
  `last_scored_leg`. A pre-season league (no scored weeks) simply shows nothing
  as completed — this is graceful, not broken.
- Several components branch on `year === CURRENT_YEAR` to treat the live season
  differently (see `managerStats.ts`, `Breakdown.tsx`, `AllTimeBreakdown.tsx`,
  `usePlayerStats.ts`).

## The derived layers (added M4-M6)

Four things sit between the committed JSON and the pages. Each exists so the
same fact cannot be computed two different ways in two places.

- **`src/utils/stats/`** — the stat registry (C1). One flattened pass over
  history, thirty-two statistics reading it. `defineStat` registers one;
  `computeStat(id)` runs it. Three lists, and the differences matter: `games` is
  paired matchups only (for anything about winning), `teamWeeks` is EVERY
  team-week that scored (for anything about lineups), because an eliminated
  team still sets a lineup and there are 48 such team-weeks worth 4,287 points.
  `flows` is every decided game as it unfolded through the NFL week (L2), the
  winner always side 0 — and it is empty unless someone has called
  `provideTimelines`, which is why a stat that reads it declares
  `requiresTimelines` and the registry throws rather than reporting a league
  with no comebacks.
- **`public/data/all-time.json`** — those answers, precomputed at build time by
  `yarn build-aggregates` and committed. 37 kB gzip against the ~550 kB of
  matchups and transactions the registry needs, so a page can carry a record
  without downloading the archive. `precomputed.test.ts` fails if it is stale.
- **`src/utils/narrative/`** — turns a ranked entry into a sentence (E7): "The
  biggest margin of victory in Chumbo history." It invents nothing; a note is
  always "this entry you already computed is Nth in that list". Reads the
  precomputed file, so a share card and a page cannot disagree about what was
  notable.
- **`src/presentation/components/ShareCard/`** — hand-rolled SVG to a canvas
  (G1), eight templates (G2) plus the profile cards (I4). Every template is a pure function of flat
  primitives, deliberately: no `managers.json` import and no season loader, so
  the same code can render an OG image in Node. `ShareButton/` is the flow —
  native share sheet on a phone, clipboard on desktop.
- **`src/presentation/shareCards/`** — what goes ON a card, decided once
  (I4). `cardData.ts` turns league data into card inputs and is read by both
  the share buttons (through `factories.ts`, lazily, on click) and the link
  previews in `scripts/og/routes.ts`, so a copied card and the preview of the
  same page cannot disagree. Add a card's data here, never inline in a page.
  Share buttons go at the right-hand end of the heading of the thing they
  share, and name it with `what` ("Copy season card").

Three data-quality rules these all obey:

- **2019's bench scores are incomplete — only its bench** (`src/domain/dataQuality.ts`).
  Its scores, results, starting lineups and starters' points are right: the
  NFL's play-by-play rebuilds 99.5% of its starts to the hundredth, like the
  seasons either side. But 65 bench players (waiver pickups the rebuild lost)
  have no score. So 2019 is in everything built on scores, results or who
  started, and only a stat that reads bench points is affected: one that ranks
  a single bench decision sets `requiresBench` and 2019 is excluded before it
  runs; one that ranks a whole season, bench weeks included (the draft stats),
  sets `allowsIncompleteBench` and its 2019 entries arrive flagged
  `approximate`. Anything that shows a flagged fact must say so — a caveated
  fact presented flat is worse than no fact.
- **The Scumbo is the worst BREAKDOWN, not last place** (`seasonBreakdown.ts`).
  They disagree in five of fourteen completed seasons. `crowns.ts` models it and
  the Triple Crown as three legs each.
- **Finishing position comes from the brackets** (`finalStandings.ts`), not from
  regular-season order. The two brackets use different conventions — pre-2020
  the losers bracket numbers the league, 2020+ it restarts at 1 — so reading
  `p` straight off makes the consolation winner joint champion.

## The records watch (J3)

`utils/recordsWatch.ts` is the one thing on the site that talks about what has
NOT happened: who is on pace for the season points record, whose run is nearly
the longest the league has seen, who is a win or a week from a round number
(every 25th win, every 5,000th point — the same milestones K1's previews count
down to, from the same module, so the two cannot disagree). It is a **registry
stat** (`stats/watchStat.ts`), so the answers are in `all-time.json` and the
weekly update refreshes them with the week's results; the rail on the home
page and under each week of the live season works nothing out. Like
`on-this-day` it is in `NOT_RECORDS`: it ranks what might happen, and "the
3rd-most on-pace season in Chumbo history" is not a fact.

Its restraint is the design. Nothing before a team has played four games (a
pace from two is a coin toss printed as a forecast); nothing outside 3% of the
record, two of the longest run, or the games a milestone actually has left;
and no card at all when there is nothing — which is most of the off-season.
Every line says how many games it is from and how many remain, quotes the
record to the hundredth the records page shows while rounding its own pace to
a tenth, and links to the list it is measured against.

It needed three records the registry did not have, all of them regular season
only and all now on `/records`: **most points in a season** (which prints the
number of games, because the league played thirteen from 2014 to 2020 and
fourteen either side), **most points, ever** and **most wins, ever**. The
career pair come from the registry's own games rather than `getManagerStats`,
which in "regular" mode trusts Sleeper's roster totals — the two differ by a
point or two over fifteen seasons, and a sentence has to quote the list it
links to.

## Records by season, and the Draft explorer

Each `/records/:statId` page ends with **Season by season**: that list's top
three in every season. A season's best is mostly not in the all-time top 25,
so it comes from its own file, `public/data/records-by-season.json`
(`buildSeasonTops` in `utils/stats/seasonTops.ts`, written by
`build-aggregates`, checked by `precomputed.test.ts`), fetched only by the
record pages. Only lists whose entries belong to a season are in it.

The Explorer has two addresses: `/explorer/points` (the filter builder, and
what `/explorer` shows) and `/explorer/draft`. The Draft page is one
computation (`useDraftScatter`, then `utils/draftReport.ts`) behind the chart
and every table, with a team filter kept in the URL (`?teams=rich,thd`).

**How a pick is valued** (`utils/draftValue.ts`, one model for the chart, the
Draft page and the best/worst-pick records): a player's weeks **in somebody's
starting lineup**, against the **last starter at his position** that season
(per start), against what that **pick number** usually returns on the same
scale. Each step fixed a way the raw version lied:

- Raw points made the board a list of quarterbacks — the last starting QB
  scores about twice what the last starting RB does — so a merely adequate
  late QB read as a steal. Against the last starter at his position, a late
  QB's median value is zero.
- The last STARTER, not the first player off the bench, because the data only
  has rostered players, and QB13 in a one-QB league is usually on nobody's
  roster. How many starters a position has includes its measured share of the
  flex (about half RB, half WR). `STARTING_SLOTS` must match every season's
  lineup; a test checks it.
- Weeks STARTED, because a missed or benched week is one the team played
  somebody else — it costs nothing. Otherwise an injured star, and a round-10
  back stashed on a bench scoring 1.2 a week, were the worst picks ever.

Draft rank against finish correlates at 0.40 on this measure (0.29 on raw
points), which is some evidence it measures something real.

**Where samples are small, it says so** — empirical Bayes rather than faith:
a manager's average draft is shrunk toward the league by `drafterSpread`'s k
(within-manager variance over between-manager variance), and when the
managers' averages are spread no wider than luck alone would spread them — as
they are today — the page says nobody's drafting stands out from luck and
shows each average with its 95% range instead of a rating. Strategies'
playoff rates are blended with `PRIOR_DRAFTS` (10) league-average drafts.
Rows and managers with too few drafts are faded, and managers with fewer than
five are not ranked.

## The week: recaps and previews (J2, K1)

A week of matchups has an address, `/seasons/:year/matchups/:week`, and the
page leads with **"Week N in the Chumbo"**: `utils/weekRecap.ts` works out the
week's facts from that season alone (never the archive), and `recapLines` turns
them into the sentences the page, the share card and the link preview all
print. Whether any of it is an all-time record is left to `narrate()`.

The week after the last one scored is offered as **"Week N · preview"**, and
each of its games has a preview at the address its result will have
(`/seasons/:year/matchups/:week/:matchupId`), so a link shared before the game
turns into the result once the update fetches it. `utils/matchupPreview.ts`
reads the archive (a rivalry is fifteen seasons long) and the stakes come from
`calculateWeekStakes` in `playoffOdds.ts`: one seeded run of the playoff-odds
simulation that remembers each team's result that week, so "win and your odds
go to 71%" is the same number on the page and in its preview. Regular season
only — the playoffs' fixtures are the bracket's, not `schedule.json`'s.

**The blurbs.** `yarn preview-blurbs` writes the same previews as text for
the group chat (`utils/previewBlurb.ts`): the series, the real playoff
meetings, the three most notable other facts (`previewTidbits.ts`, which the
cards show too, plus trades, benches and what a big game's player cost), and
the odds. It reads every season's trades, drafts and benches, so it runs in
Node, never in the browser. The weekly update puts them in an issue,
"Preview blurbs: <year> week <n>", rewritten by every run until the week is
played. A "playoff meeting" anywhere in a preview or blurb is an elimination
game or the final (`isMeaningfulPlayoffGame`) — never a consolation game,
where lineups go unset, or the game for third.

The simulation pulls every team towards the league average by `PRIOR_GAMES`
(four games' worth). Without it the week-1 top scorer made the playoffs in 100%
of simulations after one game.

## Box scores (L1)

`yarn build-gamedays` reads nflverse's play-by-play (CC-BY 4.0, credited on
the matchup page), ~18 MB a season, from `NFLVERSE_DIR` (or `.cache/nflverse`
with `--download`; never committed), and writes each week's box scores to
`src/data/<year>/weeks/`, with each team's scoring timeline beside them
(L2, below). It also rebuilds every starter's fantasy points
play by play with that season's scoring and compares them with Sleeper's:
99.8% of 20,996 player-starts across 2012–2025 match to the hundredth. It
writes a season only if its players pass 97%, so a broken join cannot be
published, and it lists every starter it cannot match — which is how two
wrong players from the NFL.com years were found (2018's "M Harris", 2015–17's
Zach Miller) and fixed in `fix-player-ids.js`. The scoring rules the
comparison uncovered are commented where they are applied; the notable ones:
points allowed leaves out defensive touchdowns and safeties; 2012–16 scored
a returner nothing for a return touchdown, whatever the saved settings say
(`SCORING_AS_PLAYED`); 2020–21 scored field goals by the yard and points
allowed by the point.

It also writes `scripts/data/season-teams/<year>.json`, each rostered
player's team that season, which `yarn build-players` turns into that
season's overlay where no raw dump exists — so a 2016 draft pick shows his
2016 team, not today's (the old A1d gap). Run `build-players` after it.

**Timelines (L2).** The same pass keeps every scoring moment — one per player
per play, with its wall-clock time — and writes each team's starters' moments
into the week's file, reconciled to Sleeper: a starter's leftover (a stat
correction) goes in after his last moment, and a team whose official score is
not quite its starters' sum (sixteen NFL.com-era weeks) gets a team correction
at the end, so every line ends exactly on the official score. Key plays — a
touchdown, or anything worth more than 5 to one starter — carry the play's
description. `utils/gameFlow.ts` turns a file into the chart on the matchup
page ("How the week unfolded"): both scores through the week on a clock with
the dead hours squeezed out, slots named in US Eastern time, lead changes, the
moment the winner went ahead for good, and a dot per key play that opens it.

**Three records only this data can see**, in `utils/stats/gamedayStats.ts`:
the **biggest comeback** (the largest deficit a winner ever faced — part
heroics, part scheduling, so every entry names when the low point was), the
**latest decisive play** (ordered by `minutesIntoWeek`, which runs Wednesday
to Tuesday, because 2012 opened on a Wednesday and 2024 played Christmas on
one; the top of the list is the games COVID pushed to a Tuesday night), and
**won it on Monday night** per manager. They read the week files, which are
not season data, so `build-aggregates` and the test setup call
`loadTimelines()` (`utils/stats/loadTimelines.ts`) first; nothing in the app
does, and nothing should — the browser reads the answers out of
`all-time.json`. A moment that is a correction rather than a play can never
hold the last two: it has no player and its time is borrowed.

**"On this day" (E6) reads the timelines too.** Every game is filed under the
calendar day it was over — its last starter's last scoring play in Eastern
time, a game past midnight counted to the night it started (`dayOf`,
`finishedAt` in `utils/gameFlow.ts`) — one per season per day, and the home
page picks the READER's date. The stat is `precomputeAll`: the build runs
three times a week and cannot know the date anyone reads it, so all 409
season-days ship rather than a top 25. On a date nothing was over — most
Tuesdays, all summer — the module is not there.

Hovering the chart anywhere shows the score at that moment, snapped to the
last scoring moment, with a crosshair; the key plays stay buttons that pin.

**The card** is "Copy chart", at the end of the chart's heading
(`gameFlowCard`): the same two lines, the same squeezed clock — `cardData`
positions the moments with the same `squeezedTime`, so a shared card and the
page it came from cannot be different pictures.

The weekly update (J1) runs it for the live season, non-fatally.
`gamedays.test.ts` re-adds every skill player's line into points and checks
them against Sleeper's, so the committed files stay honest without the raw
data. The 2022 week 17 Bills–Bengals game, abandoned after Damar Hamlin's
collapse, has no play-by-play and so no box scores.

## The automatic update (J1)

`.github/workflows/update-season.yml` keeps the live season current with
nobody touching it: 9am UK time on Tuesdays, Wednesdays and Fridays from
September to January (after Monday night, after waivers, after stat
corrections), again at 15:00 UTC on Tuesdays for the play-by-play (L3, below),
and on demand with **Run workflow**. Cron only knows UTC, so the morning is
scheduled at both 08:00 and 09:00 UTC and a small `clock` job keeps the one
that is 9am in London that day, judged by the UK's UTC offset rather than the
start time, because GitHub often starts a scheduled run late. It runs `yarn update-season`
(`scripts/update-season.js`): every week Sleeper has scored
(`fetch-sleeper-data --completed`, which reads `last_scored_leg` and never
commits a half-played week), `trim-picks`, a player-dictionary refresh only
when a rostered or transacted player is missing from it, and `own-avatars` for
any team logo the league has not had before (it commits `public/avatars` too). Then `yarn test:run -u`
and `yarn build`, and only if both pass does `github-actions[bot]` commit and
push, which Netlify deploys. A failure commits nothing and opens (or comments
on) an issue titled "The automatic season update failed"; the next good run
closes it.

What this asks of the tests: **no test may fail because the live season did
something new.** A fact checked by hand is pinned to `PINNED_THROUGH`
(`src/utils/__tests__/helpers.ts`, the last finished season); anything that
takes in the live season is a snapshot, which the run re-records (`-u`) and
commits beside the data, so a record changing hands shows in that commit's
diff. A test that only makes sense while the season is being played is
`it.runIf(...)`. And a season is settled when its final has a winner
(`isSeasonSettled` in `utils/playoffUtils.ts`), never when it merely has
brackets: the update writes those the week the playoffs start.

**The play-by-play has its own report (L3).** The rebuild is not allowed to
hold back the week's results, so it is wrapped in a try/catch — which is
exactly how a thing breaks for a month without anyone noticing. So every run
works out which scored weeks actually have box scores
(`gamedayCoverage`/`describeCoverage` in `scripts/season-weeks.js`), prints it,
writes it into the commit message and the run's summary, and the workflow
opens an issue, **The play-by-play is behind**, when a week that is not the
newest one is still missing or the rebuild fell over. The newest week is
allowed to lag; the next run rebuilds the whole season and closes the issue by
itself. Nothing is built before the first week is scored — there is no
play-by-play file for a season that has not started, and asking for it 404s.

One ordering rule this brought out: `update-season` regenerates
`all-time.json` **again** after the rebuild. The fetch script already
regenerates it, but that happens before the play-by-play runs, so L2's records
(comebacks, Monday nights, latest decisive plays) would be a week behind the
data committed beside them — and `precomputed.test.ts` would fail the whole
update over it, on the first Tuesday a new week's play-by-play landed.

Scheduled workflows are switched off by GitHub after 60 days without a commit,
which the off-season always is. Re-enable it on the Actions tab when the new
season is added.

## Link previews (G6)

`yarn prerender-og`, part of `yarn build`, writes a real `index.html` for every
manager, season, head-to-head pairing, played week (the J2 recap) and game of
the week to come (the K1 preview) — about 500 of them — each with its own OG
tags and a 1200×630 card rendered by the SAME `ShareCard` templates the copy
button uses, so a preview and a shared image cannot disagree. Images land in
`dist/og/`.

Three things to know:

- **Not committed**, unlike `public/data/all-time.json`. That file is fetched by
  the app at runtime; these PNGs are only ever fetched by crawlers, `dist/` is
  gitignored, and every `fetch-latest` would rewrite them — tens of MB of binary
  churn for no reader.
- **`public/_redirects` also 404s a missing `/assets/*` file** (a stale
  tab asking for an old deploy's chunk). Without it the catch-all answered
  with `index.html` and a 200, which `_headers` would cache for a year.
- **It works because `public/_redirects` has no `!`.** The rule is
  `/*  /index.html  200`, and Netlify serves an existing file in preference to a
  non-forced redirect, so `/managers/thd` gets its own prerendered page while
  `/players/4046` still falls through to the SPA. Adding a force flag to that
  rule would silently switch every link preview back to the generic one.
- **resvg draws nothing where it cannot resolve a font**, and the cards use a
  system stack deliberately. The script renders a probe and counts dark pixels
  before committing to 266 cards; if text is not drawing it falls back to a
  crest-only card and says so, and `--strict` fails the build instead. That is
  the one real production risk if the build image ever lacks a humanist sans.

## When a download fails

`src/data/loadFailure.ts` remembers the first failed data download, and every
place that would suspend on a load calls `throwIfLoadFailed()` first — so a
failure becomes a real error for `AppErrorBoundary` (around the routes in
`App.tsx`) instead of re-rendering into another attempt forever. The boundary
offers **Reload**, not an in-page retry: a browser caches a failed dynamic
`import()` for the life of the page, so re-importing the same chunk fails
without a request. Any new code that throws a load for Suspense must call
`throwIfLoadFailed()` before it. The module has no imports on purpose — the
boundary is in the app shell, and importing `@/data` there put the loader on
every page's critical path.

## The bundle budget

`yarn build` fails if the payload grows. `initial` is read out of
`dist/index.html` — the entry script plus every `modulepreload` — because that
IS the critical path by definition. It used to be a regex over chunk names, and
that is how a real regression hid: a `manualChunks` entry for charts became
Rollup's home for a shared module, so every page statically depended on 24 kB of
chart code and it was preloaded on every visit, while the check reported a
critical path that excluded it.

The rest is split three ways (J1): `code` (every chunk that is not season data
or the dictionary — the number that catches a dependency nobody meant to add),
`players` (the dictionary), and `season` (each season's four chunks together).
There is deliberately no grand total: season data grows every week the
automatic update runs, and a total that data counts toward fails the build
over data that was meant to arrive.

Two rules follow. **Do not add a manual chunk per feature** — see the comment in
`vite.config.ts`. And if a number here has to move, move it deliberately and say
why in the commit; a budget that is edited to make a build pass is worse than no
budget, because it is still trusted.

## Gotchas

- **Adding a season is one line**: append to `YEARS` in `src/domain/constants.ts`.
  `ValidYear` derives from it and `scripts/filter-players.js` discovers season
  folders from disk. (Before H5 there were four copies of this list, one of which
  silently resolved to plain `number`.)
- The loader maps matchups/transactions for weeks **1–17** only, even though the
  fetch script pulls up to 18.
- Transactions before 2020 are a single `transactions.json` grouped by `leg`;
  2020+ are per-week files under `transactions/`.
- The player dictionary is **base + overlays**: one `src/data/players.json` with
  8 fields per player, plus a small `players.delta.json` per season recording
  only the teams/positions that differed that year. Built by `yarn build-players`
  from a raw Sleeper dump. It was 17.3MB across three files before A1.
- `scripts/data/player-id-map.json` keeps the external ids (gsis, espn, pfr…)
  that the slim dictionary drops — needed by A1d to join historical roster data.
- **The 2012-2018 avatars are local files, not URLs.** NFL.com's fantasy
  platform shut down and took the team logos with it, and the site had only ever
  built the URL and hotlinked it. 27 of the 32 were recovered out of a Chrome
  disk cache and live in `public/avatars/nfl/`, so those seasons' `users.json`
  carry a root-relative `/avatars/nfl/<hash>.jpg` instead. The five that could
  not be recovered carry `""`, which is deliberate: that is what makes the UI
  take its monogram branch rather than paint a broken image, as the dead URL
  did. `scripts/data/nfl-avatar-sources.json` records the original URL behind
  every one of them. Two consequences — `getUserAvatarUrl` accepts a leading `/`
  as well as `http`, and `scripts/og/assets.ts` reads a root-relative path off
  disk, because the prerender runs in Node with no origin to resolve it against.
  The 240x240 NFL default avatars (`DEF.png`, `PIT_1.png`…) are in there too;
  those URLs still resolved, but they are one shutdown away from not doing.
  `scripts/find-lost-logos.py` is the tool for the five: a standalone,
  stdlib-only scan of a browser cache that a league member can run on their own
  machine, with `--self-test` to prove a null result means the cache is empty
  rather than the script is broken. Take the end of a cached JPEG from the FIRST
  `FF D9` after the start — the last one is somewhere in the cache's own
  trailing metadata, and taking it appends about 5 kB of HTTP response headers
  to every image. That decodes fine, which is exactly why it went unnoticed.
- **We keep our own copy of every team logo.** The lesson of the NFL.com
  shutdown, applied to Sleeper before it is needed: `yarn own-avatars`
  downloads each team logo in every season's `users.json` (a custom upload, or
  the account avatar) and the division logos in `league.json`, once, into
  `public/avatars/sleeper/<Sleeper's content hash>.<ext>`, and points the data
  at the local file — the same root-relative shape as the NFL-era logos, so
  `getUserAvatarUrl` and the link previews needed no change. Logos under 100 kB
  are kept byte for byte; bigger ones (one was a 2 MB photo) are re-drawn at
  256×256 through resvg, which CI already has. Sources are recorded in
  `scripts/data/sleeper-avatar-sources.json`. The weekly update runs it after
  every fetch: the fetch writes Sleeper's URLs back, `own-avatars` puts the
  local paths back, so an unchanged logo is no diff and a new one is saved
  once. A logo that will not download keeps its Sleeper URL (it still works)
  and is retried next run; `avatars.test.ts` fails if any path points at a
  missing file, or if a FINISHED season still points at Sleeper. `/avatars/*`
  is cached for a year (`public/_headers`): every file is named by its content.
  Player headshots still come from Sleeper — they are not team logos.
- **After any `fetch-data` / `fetch-season` run, re-run `yarn trim-picks`** —
  Sleeper returns the fat pick objects every time.
- **Two players can share a name.** Sleeper gives them separate ids and the
  NFL.com-era scrapes did not always pick the right one, which splits one
  career across two ids — his player page, his draft picks and every stat that
  joins on an id then see two people. `scripts/fix-player-ids.js` holds the
  corrections and the evidence for each; add to that table rather than editing
  season data by hand. It is idempotent, and it edits the raw text after
  checking the parse agrees, so it never reflows a file.
- **2019 is a rebuild**, not a fetch: `scripts/rebuild-2019.js` regenerates it
  from the NFL.com archive in `../chumbo-api/data/2019-old`, grafting per-player
  points from the Sleeper import. It rewrites `picks.json` in full, so re-run
  `yarn trim-picks` after it. Its two roster numberings (NFL.com vs Sleeper) are
  a permutation of 1..12, so a missed remap looks like valid data — the
  `picked_by` invariant in `invariants.test.ts` is what catches it.
- **`public/data/all-time.json` is generated and committed.** It holds the stat
  registry's answers, computed at build time, so a records page renders from
  37 kB gzip instead of downloading every matchup and transaction (~550 kB) to
  work them out in the browser. `yarn build` and the fetch scripts regenerate
  it; `precomputed.test.ts` fails if it no longer matches the registry, because
  a stale file is invisible — the page renders fine, with last month's records.
  The generator runs through `vite-node` so it uses the real registry rather
  than a second implementation.
- `dist/` and `node_modules/` are gitignored.
