import { CURRENT_YEAR, ValidYear } from "@/domain/constants";
import { LosersBracket, WinnersBracket } from "@/types/bracket";
import { ExtendedDraft } from "@/types/draft";
import { ExtendedLeague } from "@/types/league";
import { Manager } from "@/types/manager";
import { ExtendedMatchup, ScheduledMatchup } from "@/types/matchup";
import { ExtendedPick } from "@/types/pick";
import { Player, PlayerOverlay } from "@/types/player";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedUser } from "@/types/user";
import { Transaction } from "@/types/transaction";

type WeekKeys =
  | "1"
  | "2"
  | "3"
  | "4"
  | "5"
  | "6"
  | "7"
  | "8"
  | "9"
  | "10"
  | "11"
  | "12"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17";

type Matchups = {
  [key in WeekKeys]?: ExtendedMatchup[];
};

type Transactions = {
  [key in WeekKeys]?: Transaction[];
};

type SeasonData = {
  draft: ExtendedDraft;
  picks: ExtendedPick[];
  league: ExtendedLeague;
  rosters: ExtendedRoster[];
  users: ExtendedUser[];
  winners_bracket: WinnersBracket;
  losers_bracket: LosersBracket;
  matchups: Matchups;
  transactions?: Transactions;
  /**
   * This season's corrections to the base player dictionary — team and position
   * as at this season, for the few hundred players they differed for. Absent for
   * seasons with no recorded differences, which then resolve straight to base.
   */
  playerOverlay?: PlayerOverlay;
  schedule?: Record<string, ScheduledMatchup[]>; // In-progress seasons only
};

const validKeys: (keyof SeasonData)[] = [
  "draft",
  "picks",
  "league",
  "rosters",
  "users",
  "winners_bracket",
  "losers_bracket",
  "schedule",
];

const allData = (() => {
  const jsonFiles = import.meta.glob("./**/*.json", { eager: true });

  const managers: Manager[] = (
    jsonFiles["./managers.json"] as { default: Manager[] }
  ).default;

  // The base dictionary: every player we have ever seen, newest attributes.
  const players: Record<string, Player> = (
    jsonFiles["./players.json"] as { default: Record<string, Player> }
  ).default;

  // Use Partial to allow flexibility during construction
  const seasons: Partial<Record<ValidYear, Partial<SeasonData>>> = {};

  Object.entries(jsonFiles).forEach(([path, module]) => {
    // Skip root-level players.json and managers.json as they're handled separately
    if (path === "./players.json" || path === "./managers.json") return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const data = (module as { default: any }).default;
    const matchYear = path.match(/\/(\d{4})\//);
    const matchWeek = path.match(/\/matchups\/(\d+)\.json$/);
    const matchTransaction = path.match(/\/transactions\/(\d+)\.json$/);
    const isPlayerOverlay = path.match(/\/(\d{4})\/players\.delta\.json$/);

    if (matchYear) {
      const year = parseInt(matchYear[1], 10) as ValidYear;

      if (year >= 2012 && year <= CURRENT_YEAR) {
        // Ensure seasons[year] is initialized
        if (!seasons[year]) {
          seasons[year] = {
            draft: {} as ExtendedDraft,
            picks: [],
            league: {} as ExtendedLeague,
            rosters: [],
            users: [],
            winners_bracket: [] as WinnersBracket,
            losers_bracket: [] as LosersBracket,
            matchups: {},
          };
        }

        // Ensure matchups is initialized
        if (!seasons[year]!.matchups) {
          seasons[year]!.matchups = {};
        }

        // Ensure transactions is initialized
        if (!seasons[year]!.transactions) {
          seasons[year]!.transactions = {};
        }

        // Check if this is a year-specific player overlay
        if (isPlayerOverlay) {
          seasons[year]!.playerOverlay = data as PlayerOverlay;
        } else if (matchWeek) {
          const week = matchWeek[1];
          if (week && parseInt(week) >= 1 && parseInt(week) <= 17) {
            seasons[year]!.matchups[week as WeekKeys] = data;
          }
        } else if (matchTransaction) {
          const week = matchTransaction[1];
          if (week && parseInt(week) >= 1 && parseInt(week) <= 17) {
            seasons[year]!.transactions![week as WeekKeys] = data;
          }
        } else {
          const key = path.split("/").pop()?.replace(".json", "");
          // Handle legacy transactions.json file (2012-2019 format)
          if (key === "transactions" && Array.isArray(data)) {
            // Group transactions by week (leg field)
            const transactionsByWeek: Record<string, Transaction[]> = {};
            data.forEach((transaction: Transaction) => {
              const week = transaction.leg?.toString();
              if (week && parseInt(week) >= 1 && parseInt(week) <= 17) {
                if (!transactionsByWeek[week]) {
                  transactionsByWeek[week] = [];
                }
                transactionsByWeek[week].push(transaction);
              }
            });
            // Assign to transactions object
            Object.entries(transactionsByWeek).forEach(
              ([week, weekTransactions]) => {
                seasons[year]!.transactions![week as WeekKeys] =
                  weekTransactions;
              }
            );
          } else if (key && validKeys.includes(key as keyof SeasonData)) {
            seasons[year]![key as keyof SeasonData] = data;
          }
        }
      }
    }
  });

  return {
    managers,
    // Indexed by plain `number`, not ValidYear, so the ~15 existing call sites
    // that index with an unvalidated number keep compiling. H3 replaces this
    // with a getSeason(year) accessor that returns SeasonData | undefined --
    // casting at every call site would add churn without adding safety.
    seasons: seasons as Record<number, SeasonData>,
    players,
  };
})();

// Export the structured data
export const { managers, seasons, players } = allData;

/**
 * Look a player up in the base dictionary, then apply that season's overlay.
 *
 * Without `year` you get the player's most recent team and position, which is the
 * right answer where there is no season context (player search) and the wrong one
 * everywhere else — pass the year whenever you have it.
 */
export const getPlayer = (
  playerId: string | number,
  year?: number
): Player | undefined => {
  const playerIdStr = playerId.toString();
  const player = players[playerIdStr];

  if (player) {
    const overlay = year
      ? seasons[year as ValidYear]?.playerOverlay?.[playerIdStr]
      : undefined;

    if (!overlay) return player;

    // Spread rather than mutate: `players` is a shared module-level object.
    return {
      ...player,
      ...("t" in overlay ? { team: overlay.t } : {}),
      ...("p" in overlay ? { position: overlay.p } : {}),
    };
  }

  // Older seasons store some players as a bare name string ("Danario Alexander",
  // "Mikel Leshoure") rather than a Sleeper id. Synthesise a record so callers get
  // a name; position has to come from context (see getPlayerPosition).
  if (typeof playerId === "string" && playerId.includes(" ")) {
    const [firstName, ...rest] = playerId.split(" ");

    return {
      player_id: playerId,
      first_name: firstName,
      last_name: rest.join(" "),
      full_name: playerId,
      position: "UNK",
      team: null,
      fantasy_positions: ["UNK"],
    };
  }

  return undefined;
};
