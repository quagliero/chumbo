import { describe, expect, it } from "vitest";
import {
  AllTimeScheduleComparisonStats,
  buildComparisonRows,
  isEmptyRecord,
  formatWinPercentage,
  getAllTimeScheduleComparison,
} from "../scheduleComparison";

/**
 * Pins the all-time schedule comparison (H2).
 *
 * The computation used to be a `useMemo` body inside the page, where nothing
 * could reach it without rendering. The snapshot was taken from the code as it
 * stood in the component, before the move, so it is the proof the move changed
 * nothing — and from here on it is the net under any change to the logic.
 *
 * Every team's actual record and the whole cross-schedule matrix are in it,
 * one line per team, so a diff names the cell that moved. It covers the live
 * season, so like the other archive snapshots it moves when a week is
 * fetched; re-record it then, and read the diff first.
 */

const record = (r: { wins: number; losses: number; ties: number }) =>
  `${r.wins}-${r.losses}-${r.ties}`;

/** One line per team: actual record, then its record on each schedule. */
const matrix = (stats: AllTimeScheduleComparisonStats[]) =>
  stats.map(
    (team) =>
      `${team.ownerId} ${record(team.actualRecord)} ${formatWinPercentage(
        team.actualRecord.winPercentage
      )} | ` +
      stats
        .map((column) =>
          column.ownerId === team.ownerId
            ? "self"
            : team.crossScheduleRecords[column.ownerId]
            ? record(team.crossScheduleRecords[column.ownerId])
            : "none"
        )
        .join(" ")
  );

describe("getAllTimeScheduleComparison", () => {
  const all = getAllTimeScheduleComparison(false);
  const active = getAllTimeScheduleComparison(true);

  it("matches the matrix the page rendered before the split", () => {
    expect(matrix(all)).toMatchSnapshot();
  });

  it("matches it for active teams only", () => {
    expect(matrix(active)).toMatchSnapshot();
  });

  it("orders teams by actual win percentage, best first", () => {
    const percentages = all.map((team) => team.actualRecord.winPercentage);
    expect([...percentages].sort((a, b) => b - a)).toEqual(percentages);
  });

  it("filters to a subset of the full league", () => {
    const allIds = new Set(all.map((team) => team.ownerId));
    expect(active.length).toBeLessThan(all.length);
    active.forEach((team) => expect(allIds.has(team.ownerId)).toBe(true));
  });
});

describe("buildComparisonRows", () => {
  const all = getAllTimeScheduleComparison(false);

  it("is empty until a team is selected", () => {
    expect(buildComparisonRows(all, undefined, "")).toEqual([]);
  });

  it("resolves every row for the selected team", () => {
    const selected = all[0];
    const rows = buildComparisonRows(all, selected, selected.ownerId);

    expect(
      rows.map(
        (row) =>
          `${row.ownerId} ${row.isSelectedTeam ? "*" : ""}${record(
            row.record
          )} ${row.recordDifference}`
      )
    ).toMatchSnapshot();
    expect(rows.filter((row) => row.isSelectedTeam)).toHaveLength(1);
  });

  it("leaves out teams that never shared a season with the selected one", () => {
    // They used to appear as 0-0-0 rows at .000, which read like a real and
    // dreadful result rather than "no schedule to compare".
    for (const selected of all) {
      const rows = buildComparisonRows(all, selected, selected.ownerId);
      const empty = rows.filter(
        (row) => !row.isSelectedTeam && isEmptyRecord(row.record)
      );
      expect(empty, selected.ownerId).toEqual([]);
    }
    // And the check is not vacuous: somebody DID miss somebody.
    const everyone = all.length;
    expect(
      all.some(
        (s) => buildComparisonRows(all, s, s.ownerId).length < everyone
      )
    ).toBe(true);
  });
});
