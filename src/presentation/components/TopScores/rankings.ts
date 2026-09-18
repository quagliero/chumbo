import { getTeamScores } from "./teamScores";
import { getMatchTotals } from "./matchTotals";
import { getPlayerScores } from "./playerScores";
import {
  MatchTotal,
  PlayerScore,
  ScoreMode,
  SortOrder,
  TopScore,
} from "./types";

/**
 * The ranked list behind whichever sub-tab is open. This was the page's one
 * `useMemo`; it lives here, split by mode, so it can be tested without
 * rendering, and the page memoises a call to it on the same five inputs.
 */
export const getTopScores = ({
  scoreMode,
  sortOrder,
  selectedSeason,
  selectedPosition,
  filterStartedOnly,
}: {
  scoreMode: ScoreMode;
  sortOrder: SortOrder;
  selectedSeason: string;
  selectedPosition: string;
  filterStartedOnly: boolean | null;
}): TopScore[] | MatchTotal[] | PlayerScore[] => {
  if (scoreMode === "team-score") {
    return getTeamScores(selectedSeason, sortOrder);
  }

  if (scoreMode === "match-total") {
    return getMatchTotals(selectedSeason, sortOrder);
  }

  if (scoreMode === "player-score") {
    return getPlayerScores(
      selectedSeason,
      sortOrder,
      selectedPosition,
      filterStartedOnly
    );
  }

  return [];
};

/** Every card links to the game it came from. */
export const getMatchupUrl = (score: TopScore | MatchTotal | PlayerScore) => {
  return `/seasons/${score.year}/matchups/${score.week}/${score.matchup_id}`;
};
