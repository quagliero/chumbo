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
    players.json         # root NFL player dictionary (~5.5MB) — fallback lookup
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
| `picks.json` | `/draft/{draft_id}/picks` | Every pick. |
| `rosters.json` | `/league/{id}/rosters` | |
| `users.json` | `/league/{id}/users` | |
| `matchups/<week>.json` | `/league/{id}/matchups/{week}` | Weeks 1–18 fetched; index consumes **1–17**. |
| `transactions/<week>.json` | `/league/{id}/transactions/{week}` | **2020+ only.** 2012–2019 used a single legacy `transactions.json` (grouped by `leg`). |
| `winners_bracket.json` / `losers_bracket.json` | `/league/{id}/winners_bracket` etc. | End of season. |
| `schedule.json` | `/league/{id}/matchups/{week}` for every regular season week | `{week: [{matchup_id, roster_id}]}`. Written by any fetch while the season is in progress. Only Playoff Odds reads it, to simulate unplayed weeks (so other pages never see 0-point future games). |
| `players.json` (optional) | Sleeper `/players/nfl` dump | Year-specific snapshot; **only 2025 has one** currently. Falls back to root `players.json` when absent. |

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
5. **Players dictionary.** 2026 rookies won't be in the current root
   `players.json` (last refreshed for 2025). Either refresh the root
   `players.json` from Sleeper's `/players/nfl` dump, or drop a
   `src/data/2026/players.json` snapshot (then `node scripts/filter-players.js`
   to trim — note: add 2026 to the `YEARS` array inside that script too).
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
- `players.json` files are **not** fetched by the scripts — they come from
  Sleeper's `/players/nfl` dump and are only trimmed by `filter-players.js`.
- `dist/` and `node_modules/` are gitignored.
