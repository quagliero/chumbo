import { beforeAll, describe, expect, it } from "vitest";
import raw from "../../../../../public/data/all-time.json?raw";
import { loadAllSeasons, managers, seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import type { PrecomputedStats } from "@/utils/stats/precomputed";
import {
  bestWeekItem,
  buildPlayerRail,
  draftItem,
  topOwnerItem,
  type PlayerRailInput,
  type RailPick,
} from "../playerRail";

/**
 * "Drafted 7 times by 4 managers" is a claim about real people, so the counting
 * is tested two ways: against the picks re-derived here, and against the
 * build-time `most-drafted-players` answers that already ship in
 * `all-time.json`. If the rail and the records page ever disagree about how
 * many times the league took Aaron Rodgers, one of them is lying and this fails.
 */
const file: PrecomputedStats = JSON.parse(raw);

beforeAll(async () => {
  await loadAllSeasons();
});

/** The picks for one player, exactly as `useDraftPicks` collects them. */
const picksFor = (playerId: string): RailPick[] => {
  const picks: RailPick[] = [];
  for (const year of YEAR_NUMBERS) {
    const season = seasons[year];
    for (const pick of season?.picks ?? []) {
      if (String(pick.player_id) !== playerId) continue;
      const roster = season.rosters?.find((r) => r.roster_id === pick.roster_id);
      if (!roster) continue;
      const manager = managers.find((m) => m.sleeper.id === roster.owner_id);
      if (!manager) continue;
      picks.push({
        year,
        round: pick.round,
        ownerId: roster.owner_id,
        managerName: manager.name,
      });
    }
  }
  return picks;
};

const input = (overrides: Partial<PlayerRailInput> = {}): PlayerRailInput => ({
  picks: [],
  bestWeek: null,
  owners: [],
  managerIdOf: () => "thd",
  isRealPairing: () => true,
  ...overrides,
});

describe("draftItem", () => {
  it("says once, and who, for a player taken once", () => {
    const item = draftItem([
      { year: 2019, round: 4, ownerId: "a", managerName: "thd" },
    ]);
    expect(item?.detail).toBe("Drafted once — thd, round 4 of 2019");
    expect(item?.to).toBe("/seasons/2019/draft");
  });

  it("counts picks and distinct managers, and spans the years", () => {
    const item = draftItem([
      { year: 2014, round: 2, ownerId: "a", managerName: "thd" },
      { year: 2016, round: 3, ownerId: "b", managerName: "jay" },
      { year: 2021, round: 5, ownerId: "a", managerName: "thd" },
    ]);
    expect(item?.detail).toBe("Drafted 3 times by 2 managers, 2014–2021");
    // The board it last went in, not the first.
    expect(item?.to).toBe("/seasons/2021/draft");
  });

  it("has nothing to say about an undrafted player", () => {
    expect(draftItem([])).toBeNull();
  });

  it("agrees with the shipped most-drafted-players answers", () => {
    const stat = file.stats.find((s) => s.id === "most-drafted-players");
    expect(stat).toBeDefined();
    expect(stat!.entries.length).toBeGreaterThan(0);

    for (const entry of stat!.entries) {
      const playerId = entry.href?.replace("/players/", "");
      expect(playerId, `no href on ${entry.subject}`).toBeTruthy();

      // "13 times, 2012-2025, by 11 different managers — brock took him 2x"
      const expected = entry.detail!.match(
        /^(\d+) times, (\d{4})-(\d{4}), by (\d+) different managers/
      );
      expect(expected, `unexpected detail: ${entry.detail}`).toBeTruthy();

      const item = draftItem(picksFor(playerId!));
      expect(item, `no rail item for ${entry.subject}`).not.toBeNull();
      expect(item!.detail, entry.subject).toBe(
        `Drafted ${expected![1]} times by ${expected![4]} managers, ` +
          `${expected![2]}–${expected![3]}`
      );
      expect(item!.to).toBe(`/seasons/${expected![3]}/draft`);
    }
  });
});

describe("bestWeekItem", () => {
  const best = {
    year: 2018,
    week: 8,
    matchupId: 3,
    points: 41.23,
    teamName: "Team thd",
    wasStarted: true,
  };

  it("points at the game, with the score as the site writes it", () => {
    const item = bestWeekItem(input({ bestWeek: best }));
    expect(item?.label).toBe("The week he scored 41.23");
    expect(item?.detail).toBe("Team thd, 2018 Week 8");
    expect(item?.to).toBe("/seasons/2018/matchups/8/3");
    expect(item?.approximate).toBe(false);
  });

  it("says so when the best week was spent on the bench", () => {
    const item = bestWeekItem(
      input({ bestWeek: { ...best, wasStarted: false } })
    );
    expect(item?.detail).toContain("on the bench");
  });

  it("marks 2019, whose per-player scores are reconstructed", () => {
    const item = bestWeekItem(input({ bestWeek: { ...best, year: 2019 } }));
    expect(item?.approximate).toBe(true);
  });

  it("drops a week with no game behind it", () => {
    expect(
      bestWeekItem(input({ bestWeek: best, isRealPairing: () => false }))
    ).toBeNull();
    expect(
      bestWeekItem(input({ bestWeek: { ...best, points: 0 } }))
    ).toBeNull();
    expect(bestWeekItem(input())).toBeNull();
  });
});

describe("topOwnerItem", () => {
  it("names the manager who started him most", () => {
    const item = topOwnerItem(
      input({
        owners: [
          { ownerId: "a", teamName: "Team thd", starts: 34 },
          { ownerId: "b", teamName: "Team jay", starts: 12 },
        ],
      })
    );
    expect(item?.detail).toBe("Started him 34 times, more than anyone");
    expect(item?.to).toBe("/managers/thd/players/capped");
  });

  it("does not claim a superlative that is shared", () => {
    expect(
      topOwnerItem(
        input({
          owners: [
            { ownerId: "a", teamName: "Team thd", starts: 4 },
            { ownerId: "b", teamName: "Team jay", starts: 4 },
          ],
        })
      )
    ).toBeNull();
  });

  it("says only when there has only ever been one", () => {
    const item = topOwnerItem(
      input({ owners: [{ ownerId: "a", teamName: "Team thd", starts: 1 }] })
    );
    expect(item?.detail).toBe("The only manager who ever started him — 1 time");
  });

  it("puts a name into a sentence without the data's stray spaces", () => {
    // Several team names carry a trailing space — "Zaragozas Zooting Zorro " —
    // which reads as "Zorro 's most-capped players" if it is not trimmed.
    const item = topOwnerItem(
      input({
        owners: [
          { ownerId: "a", teamName: "Zaragozas Zooting Zorro ", starts: 15 },
        ],
      })
    );
    expect(item?.label).toBe("Who else Zaragozas Zooting Zorro keeps starting");
  });

  it("drops a player nobody ever started", () => {
    expect(
      topOwnerItem(
        input({ owners: [{ ownerId: "a", teamName: "Team thd", starts: 0 }] })
      )
    ).toBeNull();
  });

  it("drops an owner with no manager entry, rather than link to nothing", () => {
    expect(
      topOwnerItem(
        input({
          owners: [{ ownerId: "a", teamName: "Team thd", starts: 9 }],
          managerIdOf: () => null,
        })
      )
    ).toBeNull();
  });
});

describe("buildPlayerRail", () => {
  it("is empty for a player with no history at all", () => {
    expect(buildPlayerRail(input())).toEqual([]);
  });

  it("is one section when there is anything to say", () => {
    const sections = buildPlayerRail(
      input({
        picks: [{ year: 2019, round: 4, ownerId: "a", managerName: "thd" }],
      })
    );
    expect(sections).toHaveLength(1);
    expect(sections[0].items.map((i) => i.id)).toEqual(["draft"]);
  });
});
