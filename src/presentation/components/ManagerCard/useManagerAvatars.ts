import { useMemo } from "react";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { resolveManagerAvatars } from "./managerAvatars";

/**
 * Every manager's avatar URL, keyed by manager id.
 *
 * Kept separate from the card the way `usePowerRibbon` is kept separate from
 * the ribbon: the derivation walks every season's `users`, so it runs once for
 * the whole page rather than fourteen times, and the pure part underneath is
 * testable without a DOM.
 *
 * `seasons[year].users` is eagerly bundled (only matchups and transactions are
 * lazy), so this does not need to suspend — the Managers page already suspends
 * on `useAllSeasons` for the stats.
 */
export const useManagerAvatars = (): Record<string, string | null> =>
  useMemo(
    () =>
      resolveManagerAvatars(
        YEAR_NUMBERS,
        (year) => seasons[year as keyof typeof seasons]?.users
      ),
    []
  );
