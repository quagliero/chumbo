import { beforeAll, describe, expect, it } from "vitest";
import { loadAllSeasons, seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { getFinalStandings, getFinalPosition } from "@/utils/finalStandings";
import { getCumulativeStandings } from "@/utils/standings";
import { isSeasonSettled } from "@/utils/playoffUtils";

beforeAll(async () => {
  await loadAllSeasons();
});

const played = YEAR_NUMBERS.filter(
  (year) => (seasons[year]?.winners_bracket?.length ?? 0) > 0
);

describe("final standings", () => {
  it("ranks every roster exactly once, 1..N, in every season", () => {
    const broken: string[] = [];

    for (const year of YEAR_NUMBERS) {
      const season = seasons[year];
      if (!season?.rosters?.length) continue;

      const standings = getFinalStandings(year);
      const positions = standings.map((s) => s.position).sort((a, b) => a - b);
      const expected = season.rosters.map((_, i) => i + 1);

      if (positions.length !== season.rosters.length) {
        broken.push(`${year}: ${positions.length} standings for ${season.rosters.length} rosters`);
      } else if (JSON.stringify(positions) !== JSON.stringify(expected)) {
        broken.push(`${year}: positions are ${positions.join(",")}`);
      }

      const rosterIds = new Set(standings.map((s) => s.rosterId));
      if (rosterIds.size !== standings.length) broken.push(`${year}: a roster appears twice`);
    }

    expect(broken).toEqual([]);
  });

  /**
   * The reason this file exists. 2020 onward, the losers bracket numbers its
   * own six teams 1, 3, 5 rather than the league's 7, 9, 11 — so reading `p`
   * straight off crowns the consolation winner joint champion.
   */
  it("does not crown the consolation winner", () => {
    const wrong: string[] = [];

    for (const year of played) {
      const losers = seasons[year]?.losers_bracket ?? [];
      const final = losers.find((m) => m.p === 1);
      if (!final || typeof final.w !== "number") continue;

      const position = getFinalPosition(year, final.w);
      const playoffTeams = new Set(
        (seasons[year]?.winners_bracket ?? []).flatMap((m) =>
          [m.t1, m.t2, m.w, m.l].filter((t): t is number => typeof t === "number")
        )
      ).size;

      // It should land immediately below the playoff field, never at the top.
      if (position !== playoffTeams + 1) {
        wrong.push(`${year}: losers-bracket winner placed ${position}, expected ${playoffTeams + 1}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it("agrees with the champion the standings already report", () => {
    const disagreements: string[] = [];
    const cumulative = getCumulativeStandings([...YEAR_NUMBERS]);

    for (const year of played) {
      const champion = seasons[year]?.winners_bracket?.find((m) => m.p === 1)?.w;
      if (typeof champion !== "number") continue;

      const first = getFinalStandings(year).find((s) => s.position === 1);
      if (first?.rosterId !== champion) {
        disagreements.push(`${year}: bracket champion ${champion}, standings first ${first?.rosterId}`);
      }
    }

    expect(disagreements).toEqual([]);
    // The page's own champion list should name as many champions as there
    // are finals played (brackets arrive three weeks before the final).
    const settled = YEAR_NUMBERS.filter((year) => isSeasonSettled(seasons[year]));
    expect(cumulative.flatMap((t) => t.champion).length).toBeGreaterThanOrEqual(settled.length);
  });

  it("falls back to record when a season has no brackets", () => {
    // 2026 is in progress: no playoffs, so every finish is provisional and
    // comes from the record rather than being absent.
    const inProgress = YEAR_NUMBERS.filter(
      (year) => (seasons[year]?.winners_bracket?.length ?? 0) === 0 && seasons[year]?.rosters?.length
    );

    for (const year of inProgress) {
      const standings = getFinalStandings(year);
      expect(standings.length).toBe(seasons[year]!.rosters.length);
      expect(standings.every((s) => s.source === "record")).toBe(true);
    }
  });

  it("places the ten-team seasons' unbracketed teams last", () => {
    // 2012 and 2013 bracket only eight of ten rosters; the other two finish
    // ninth and tenth on record, not nowhere.
    for (const year of [2012, 2013] as const) {
      const standings = getFinalStandings(year);
      const byRecord = standings.filter((s) => s.source === "record");
      expect(byRecord.length).toBe(2);
      expect(byRecord.map((s) => s.position).sort((a, b) => a - b)).toEqual([9, 10]);
    }
  });
});
