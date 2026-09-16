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
        records[`${a.id} vs ${b.id}`] = getAllTimeH2HRecord(
          a.sleeper.id,
          b.sleeper.id
        );
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
