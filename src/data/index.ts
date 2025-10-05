import { CURRENT_YEAR, YEARS } from "../domain/constants";
import { LosersBracket, WinnersBracket } from "../types/bracket";
import { ExtendedDraft } from "../types/draft";
import { ExtendedLeague } from "../types/league";
import { Manager } from "../types/manager";
import { ExtendedMatchup } from "../types/matchup";
import { ExtendedPick } from "../types/pick";
import { Player } from "../types/player";
import { ExtendedRoster } from "../types/roster";
import { ExtendedUser } from "../types/user";

type ValidYear = (typeof YEARS)[number];
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

type SeasonData = {
  draft: ExtendedDraft;
  picks: ExtendedPick[];
  league: ExtendedLeague;
  rosters: ExtendedRoster[];
  users: ExtendedUser[];
  winners_bracket: WinnersBracket;
  losers_bracket: LosersBracket;
  matchups: Matchups;
  players?: Record<string, Player>; // Year-specific players
};

const validKeys: (keyof SeasonData)[] = [
  "draft",
  "picks",
  "league",
  "rosters",
  "users",
  "winners_bracket",
  "losers_bracket",
];

const allData = (() => {
  const jsonFiles = import.meta.glob("./**/*.json", { eager: true });

  const managers: Manager[] = (
    jsonFiles["./managers.json"] as { default: Manager[] }
  ).default;

  // Load players data
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
    const isYearPlayers = path.match(/\/(\d{4})\/players\.json$/);

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

        // Check if this is a year-specific players.json
        if (isYearPlayers) {
          seasons[year]!.players = data as Record<string, Player>;
        } else if (matchWeek) {
          const week = matchWeek[1];
          if (week && parseInt(week) >= 1 && parseInt(week) <= 17) {
            seasons[year]!.matchups[week as WeekKeys] = data;
          }
        } else {
          const key = path.split("/").pop()?.replace(".json", "");
          if (key && validKeys.includes(key as keyof SeasonData)) {
            seasons[year]![key as keyof SeasonData] = data;
          }
        }
      }
    }
  });

  return {
    managers,
    seasons: seasons as Record<ValidYear, SeasonData>,
    players,
  };
})();

// Export the structured data
export const { managers, seasons, players } = allData;

// Helper function to get player info by ID
// First checks year-specific players.json, then falls back to root players.json
export const getPlayer = (
  playerId: string | number,
  year?: number
): Player | undefined => {
  const playerIdStr = playerId.toString();

  // If a year is provided, try to get the player from that year's data first
  if (year && seasons[year as ValidYear]?.players) {
    const yearPlayer = seasons[year as ValidYear].players![playerIdStr];
    if (yearPlayer) {
      return yearPlayer;
    }
  }

  // Fall back to root players.json
  return players[playerIdStr];
};
