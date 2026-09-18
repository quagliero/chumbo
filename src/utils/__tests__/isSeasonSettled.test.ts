import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { BracketMatch } from "@/types/bracket";
import { isSeasonSettled } from "@/utils/playoffUtils";

/**
 * The automatic update writes the brackets the week the playoffs start, so
 * for three weeks a season has brackets and no champion. "Has brackets" was
 * the settled test in six places, and in that window it crowned the best
 * regular-season record.
 */
const match = (m: Partial<BracketMatch>) =>
  ({ r: 1, m: 1, t1: 1, t2: 2, w: null, l: null, ...m }) as BracketMatch;

describe("isSeasonSettled", () => {
  it("is not settled before the brackets exist", () => {
    expect(isSeasonSettled({ winners_bracket: [] })).toBe(false);
    expect(isSeasonSettled(undefined)).toBe(false);
  });

  it("is not settled while the final is unplayed", () => {
    const bracket = [
      match({ m: 1, w: 1, l: 2 }),
      match({ m: 6, r: 3, p: 1 }),
    ];
    expect(isSeasonSettled({ winners_bracket: bracket })).toBe(false);
  });

  it("is settled once the final has a winner", () => {
    const bracket = [match({ m: 6, r: 3, p: 1, w: 4, l: 2 })];
    expect(isSeasonSettled({ winners_bracket: bracket })).toBe(true);
  });

  it("calls every season with brackets settled but the live one", () => {
    // Every finished season's final has a winner, 2012's four-match bracket
    // included, so nothing in the archive changes status under the new test.
    for (const year of YEAR_NUMBERS) {
      const hasBrackets = (seasons[year]?.winners_bracket?.length ?? 0) > 0;
      if (hasBrackets && seasons[year].league.status === "complete") {
        expect(isSeasonSettled(seasons[year]), String(year)).toBe(true);
      }
    }
  });
});
