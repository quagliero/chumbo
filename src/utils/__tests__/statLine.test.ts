import { describe, expect, it } from "vitest";
import { formatStatLine } from "@/utils/statLine";

const line = (s: Record<string, number>, t = "KC") => ({ t, s });

describe("a stat line", () => {
  it("leads with what the position is judged by", () => {
    const s = { pAtt: 35, pCmp: 26, pYd: 286, pTd: 3, rAtt: 4, rYd: 28 };
    expect(formatStatLine(line(s), "QB")).toBe("26/35, 286 yds, 3 TD · 4 car, 28 yds");
    const back = { rAtt: 17, rYd: 79, rec: 1, tgt: 2, reYd: 17 };
    expect(formatStatLine(line(back), "RB")).toBe("17 car, 79 yds · 1 rec, 17 yds");
    expect(formatStatLine(line(back), "WR")).toBe("1 rec, 17 yds · 17 car, 79 yds");
  });

  it("names the mistakes", () => {
    expect(formatStatLine(line({ pAtt: 55, pCmp: 37, pYd: 420, pTd: 3, int: 2 }), "QB")).toBe(
      "37/55, 420 yds, 3 TD, 2 INT"
    );
    expect(formatStatLine(line({ rAtt: 12, rYd: 40, fl: 1 }), "RB")).toBe(
      "12 car, 40 yds · 1 fumble lost"
    );
  });

  it("says a receiver was shut out rather than printing zeroes", () => {
    expect(formatStatLine(line({ tgt: 2 }), "TE")).toBe("0 catches on 2 targets");
    expect(formatStatLine(line({ tgt: 1 }), "TE")).toBe("0 catches on 1 target");
  });

  it("gives a kicker his kicks and a defence its plays", () => {
    expect(formatStatLine(line({ fgAtt: 2, fgm: 2, fgLong: 55, xpAtt: 2, xpm: 2 }), "K")).toBe(
      "FG 2/2 (long 55) · XP 2/2"
    );
    expect(formatStatLine(line({ sk: 4, int: 3, fr: 1, td: 1, pa: 6 }), "DEF")).toBe(
      "4 sacks, 3 INT, 1 fumble rec, 1 TD, 6 allowed"
    );
    // A shutout is a stat, not an absence.
    expect(formatStatLine(line({ sk: 1, pa: 0 }), "DEF")).toBe("1 sack, 0 allowed");
  });

  it("is empty for a week with nothing in it", () => {
    expect(formatStatLine(line({}), "WR")).toBe("");
  });
});
