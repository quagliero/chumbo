import { describe, expect, it } from "vitest";
import { summariseList } from "@/utils/__tests__/helpers";
import { getTopScores } from "../rankings";
import { MatchTotal, PlayerScore, SortOrder, TopScore } from "../types";

/**
 * Pins the Top Scores rankings (H2).
 *
 * All three used to be one `useMemo` inside the page. The snapshots were
 * recorded from the code moved out of it, verbatim, before the page was
 * switched over to call it — and the page rendered identically before and
 * after. From here on they are the net under any change to the rankings.
 *
 * They are pinned on completed seasons rather than all-time, deliberately: an
 * all-time list gains entries every week of the live season, and a snapshot
 * that has to be re-recorded every Tuesday stops being read. Each is a count,
 * the head of the list and a digest of all of it (see `summariseList`), so a
 * change anywhere in the list still fails.
 */

const topScores = (
  scoreMode: "team-score" | "match-total" | "player-score",
  selectedSeason: string,
  sortOrder: SortOrder = "high-to-low",
  selectedPosition = "all",
  filterStartedOnly: boolean | null = null
): Array<TopScore | MatchTotal | PlayerScore> =>
  getTopScores({
    scoreMode,
    sortOrder,
    selectedSeason,
    selectedPosition,
    filterStartedOnly,
  });

describe("team scores", () => {
  it.each(["2012", "2019", "2024"])("%s, highest first", (season) => {
    expect(
      summariseList(topScores("team-score", season), 5)
    ).toMatchSnapshot();
  });

  it("2016, lowest first", () => {
    expect(
      summariseList(topScores("team-score", "2016", "low-to-high"), 5)
    ).toMatchSnapshot();
  });

  it("is sorted all-time", () => {
    const scores = (topScores("team-score", "all-time") as TopScore[]).map(
      (s) => s.score
    );
    expect([...scores].sort((a, b) => b - a)).toEqual(scores);
  });
});

describe("match totals", () => {
  it.each(["2013", "2020", "2025"])("%s, highest first", (season) => {
    expect(
      summariseList(topScores("match-total", season), 5)
    ).toMatchSnapshot();
  });

  it("2018, lowest first", () => {
    expect(
      summariseList(topScores("match-total", "2018", "low-to-high"), 5)
    ).toMatchSnapshot();
  });

  it("totals the two teams", () => {
    (topScores("match-total", "all-time") as MatchTotal[]).forEach((m) =>
      expect(m.total_score).toBe(m.team1_score + m.team2_score)
    );
  });
});

describe("player scores", () => {
  it.each(["2014", "2019", "2023"])("%s, highest first", (season) => {
    expect(
      summariseList(topScores("player-score", season), 5)
    ).toMatchSnapshot();
  });

  it("2022 quarterbacks who started, lowest first", () => {
    expect(
      summariseList(
        topScores("player-score", "2022", "low-to-high", "QB", true),
        5
      )
    ).toMatchSnapshot();
  });

  it("2021 kickers on the bench", () => {
    // `filterStartedOnly` is only ever null or true from the page, but the
    // filter compares, so false means the bench.
    const bench = topScores(
      "player-score",
      "2021",
      "high-to-low",
      "K",
      false
    ) as PlayerScore[];
    expect(summariseList(bench, 5)).toMatchSnapshot();
    bench.forEach((s) => {
      expect(s.position).toBe("K");
      expect(s.was_started).toBe(false);
    });
  });
});
