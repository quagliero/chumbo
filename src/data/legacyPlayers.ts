import type { ExtendedMatchup } from "@/types/matchup";
import { legacyPlayerPositions } from "./legacyPlayers.generated";

/**
 * The legacy string-named players.
 *
 * The pre-Sleeper seasons stored some players as a literal name rather than an
 * id — "Beanie Wells" instead of "1234" — so the base player dictionary does
 * not contain them and the only record of them is the matchup files themselves.
 * Thirty-nine players, all in 2012-2016, each with exactly one position
 * recorded in `unmatched_players`.
 *
 * They used to be found by sweeping `seasons[].matchups` from the players page.
 * After A2a made matchups lazy that sweep only saw the seasons the visitor had
 * already opened, so half the search corpus depended on browsing history: the
 * same query found Beanie Wells after a visit to /seasons/2012 and not before.
 * The page papered over it by loading every season (305 kB gzip) to find 815
 * bytes of names.
 *
 * So the list is derived at build time instead — `yarn build-aggregates` writes
 * `legacyPlayers.generated.ts` — and the search reads a committed table that
 * cannot vary by navigation. `legacyPlayers.test.ts` fails if it goes stale.
 */
export const legacyPlayers: Record<string, string> = legacyPlayerPositions;

/** A team defence is stored as an abbreviation, not a name. */
const isTeamAbbr = (id: string) => /^[A-Z]{2,3}$/.test(id);

/**
 * Not a Sleeper id and not a team: the same predicate `rebuild-2019.js` uses to
 * decide that a roster entry is a player's name.
 */
const looksLikeName = (id: string) =>
  Number.isNaN(Number(id)) && !isTeamAbbr(id);

/**
 * Derive the table above from matchup data: name to the position
 * `unmatched_players` records for them, or "UNK" if it records none.
 *
 * The generator and the staleness test both call this, so there is one
 * implementation of "what counts as a legacy name" rather than two.
 */
export const deriveLegacyPlayers = (
  weeks: Iterable<readonly ExtendedMatchup[] | undefined>
): Record<string, string> => {
  const found = new Map<string, string>();

  for (const weekMatchups of weeks) {
    for (const matchup of weekMatchups ?? []) {
      for (const playerId of matchup.players ?? []) {
        if (typeof playerId !== "string" || !looksLikeName(playerId)) continue;
        const position = matchup.unmatched_players?.[playerId];
        // A recorded position beats a placeholder from an earlier week.
        if (position) found.set(playerId, position);
        else if (!found.has(playerId)) found.set(playerId, "UNK");
      }
    }
  }

  return Object.fromEntries(
    [...found.entries()].sort(([a], [b]) => a.localeCompare(b))
  );
};
