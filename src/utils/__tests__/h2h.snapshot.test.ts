import { describe, expect, it } from "vitest";
import managers from "@/data/managers.json";
import { seasons } from "@/data";
import { YEARS } from "@/domain/constants";
import {
  H2HMatchupRecord,
  getAllTimeH2HRecord,
  getH2HRecordForSeason,
} from "@/utils/h2h";
import { rostersFor } from "./helpers";

/** Baseline snapshots for the head-to-head helpers (H1). */
describe("getAllTimeH2HRecord", () => {
  it("covers every manager pairing", () => {
    const records: Record<string, H2HMatchupRecord> = {};

    managers.forEach((a, i) => {
      managers.slice(i + 1).forEach((b) => {
        // The totals only: this snapshot is the refactor net for them, and
        // it predates `games` (added for the I4 streak). Checked below instead.
        const record = getAllTimeH2HRecord(a.sleeper.id, b.sleeper.id);
        records[`${a.id} vs ${b.id}`] = Object.fromEntries(
          Object.entries(record).filter(([key]) => key !== "games")
        ) as unknown as H2HMatchupRecord;
      });
    });

    expect(records).toMatchSnapshot();
  });

  it("returns an empty record for unknown owner ids", () => {
    expect(getAllTimeH2HRecord("nope", managers[0].sleeper.id)).toEqual({
      team1Wins: 0,
      team2Wins: 0,
      ties: 0,
      team1AvgPoints: 0,
      team2AvgPoints: 0,
      games: [],
    });
  });

  it("keeps exactly the games its totals were counted from", () => {
    // The streak on a share card reads these; a game in the list that is not
    // in the record would put a streak on a card that its own score denies.
    managers.forEach((a, i) => {
      managers.slice(i + 1).forEach((b) => {
        const record = getAllTimeH2HRecord(a.sleeper.id, b.sleeper.id);
        const games = record.games ?? [];
        const count = (r: string) => games.filter((g) => g.result === r).length;
        expect([count("W"), count("L"), count("T")], `${a.id} vs ${b.id}`).toEqual([
          record.team1Wins,
          record.team2Wins,
          record.ties,
        ]);
      });
    });
  });
});

describe("getH2HRecordForSeason", () => {
  YEARS.forEach((year) => {
    it(`${year} — every roster pairing`, () => {
      const season = seasons[year];
      const rosters = rostersFor(year);
      const records: Record<string, H2HMatchupRecord> = {};

      rosters.forEach((a, i) => {
        rosters.slice(i + 1).forEach((b) => {
          records[`roster ${a.roster_id} vs roster ${b.roster_id}`] =
            getH2HRecordForSeason(a.roster_id, b.roster_id, season);
        });
      });

      expect(records).toMatchSnapshot();
    });
  });
});
