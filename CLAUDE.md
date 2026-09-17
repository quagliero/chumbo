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
yarn build          # tsc -b && vite build
yarn lint           # eslint
yarn test           # vitest (watch)
yarn test:run       # vitest (single run)
yarn build-players  # rebuild players.json + per-season overlays
yarn trim-picks     # strip duplicated player metadata from picks.json
yarn fix-player-ids # apply the committed player-id corrections (idempotent)
yarn build-aggregates  # regenerate public/data/all-time.json (runs in `yarn build`)
yarn check-aggregates  # fail if that file is stale, without rewriting it

# Data fetching (Sleeper API) — see scripts/fetch-sleeper-data.js
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
    index.ts             # aggregates every season via import.meta.glob (KEY FILE)
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
| `players.delta.json` (optional) | derived by `yarn build-players` | Per-season overlay: `{playerId: {t: team, p: position}}` for players whose team or position that year differed from the base dictionary. ~8KB. A season without one resolves entirely to the base. |

### How data is loaded

`src/data/index.ts` uses `import.meta.glob("./**/*.json", { eager: true })` to
**auto-discover** every season JSON — there is **no manual import per season**.
It only accepts years where `year >= 2012 && year <= CURRENT_YEAR`, so a season
is invisible until `CURRENT_YEAR`/`YEARS` include it.

`leagueRules.ts` similarly globs `../data/*/league.json` and `../data/*/draft.json`.

### managers.json

Canonical identity map (not from Sleeper). Each manager: `id`, `name`, `teamName`,
`userId[]` (Sleeper user ids they've used), `teamId` (string, or `{year: id}` /
`{current: id}` when it changed over time), optional `sleeper`, `active`, and
`weeks` overrides for mid-season replacements. Update this if 2026 has a new
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
  19 kB gzip instead of downloading every matchup and transaction (~550 kB) to
  work them out in the browser. `yarn build` and the fetch scripts regenerate
  it; `precomputed.test.ts` fails if it no longer matches the registry, because
  a stale file is invisible — the page renders fine, with last month's records.
  The generator runs through `vite-node` so it uses the real registry rather
  than a second implementation.
- `dist/` and `node_modules/` are gitignored.
