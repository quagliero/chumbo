import { beforeAll, describe, expect, it } from "vitest";
import raw from "../../../../../public/data/all-time.json?raw";
import { loadAllSeasons, managers, seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { getFinalStandings } from "@/utils/finalStandings";
import { getAllTimeH2HRecord } from "@/utils/h2h";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { isWeekCompleted } from "@/utils/weekUtils";
import type { PrecomputedStats } from "@/utils/stats/precomputed";
import type { StatEntry } from "@/utils/stats/types";
import {
  buildMatchupRail,
  findRivalry,
  otherGamesItems,
  pairingsInWeek,
  rematchItems,
  rivalryItem,
  type MatchupRailInput,
  type RailTeam,
} from "../matchupRail";
import { isRealPairing } from "../pairing";

/**
 * The one way a rail fails that matters: a link that goes nowhere. So the bulk
 * of this file is the sweep at the bottom — build the rail for every game of
 * several seasons, including the playoff weeks where eliminated teams have no
 * opponent, and assert that every single href it produces is a page.
 */
const file: PrecomputedStats = JSON.parse(raw);

beforeAll(async () => {
  await loadAllSeasons();
});

const MANAGER_IDS = new Set(managers.map((m) => m.id));

/** "hadkiss 117.96 – 114.6 ant" — two decimals at most, no trailing zeros. */
const SCORELINE = /^\S+ \d+(\.\d{1,2})? – \d+(\.\d{1,2})? \S+$/;

const weekOf = (year: number, week: number) =>
  seasons[year]?.matchups[
    String(week) as keyof (typeof seasons)[number]["matchups"]
  ];

const railFor = (
  year: number,
  week: number,
  matchupId: number
): MatchupRailInput => {
  const season = seasons[year];
  const standings = getFinalStandings(year);
  const pairing = pairingsInWeek(weekOf(year, week)).find(
    (p) => p.matchupId === matchupId
  )!;

  const teamFor = (rosterId: number): RailTeam => {
    const roster = season.rosters.find((r) => r.roster_id === rosterId)!;
    const placing = standings.find((s) => s.rosterId === rosterId);
    return {
      rosterId,
      managerId: getManagerIdBySleeperOwnerId(roster.owner_id) ?? null,
      name: getManagerIdBySleeperOwnerId(roster.owner_id) ?? `roster ${rosterId}`,
      finish: placing?.source === "bracket" ? placing.position : null,
    };
  };

  return {
    year,
    week,
    matchupId,
    teams: [
      teamFor(pairing.winner.roster_id),
      teamFor(pairing.loser.roster_id),
    ],
    matchups: season.matchups as Record<
      string,
      NonNullable<ReturnType<typeof weekOf>>
    >,
    nameOf: (rosterId) => {
      const roster = season.rosters.find((r) => r.roster_id === rosterId);
      return getManagerIdBySleeperOwnerId(roster?.owner_id ?? "") ?? "unknown";
    },
    isPlayed: (candidate) => isWeekCompleted(candidate, season.league),
    teamCount: season.rosters.length,
  };
};

describe("pairingsInWeek", () => {
  it("finds the six games of a regular season week", () => {
    const pairings = pairingsInWeek(weekOf(2018, 1));
    expect(pairings).toHaveLength(6);
  });

  it("puts the higher score first, so the label reads as a result", () => {
    for (const pairing of pairingsInWeek(weekOf(2018, 1))) {
      expect(pairing.winner.points).toBeGreaterThanOrEqual(pairing.loser.points);
    }
  });

  it("ignores a team-week with no opponent", () => {
    // 2024 Week 15: twelve rosters still score, but four are eliminated and
    // carry no matchup id. Four games, not six.
    const sides = weekOf(2024, 15)!;
    expect(sides).toHaveLength(12);
    expect(pairingsInWeek(sides)).toHaveLength(4);
  });

  it("has nothing for a week that was never loaded", () => {
    expect(pairingsInWeek(undefined)).toEqual([]);
    expect(pairingsInWeek([])).toEqual([]);
  });
});

describe("findRivalry", () => {
  const entries: StatEntry[] = [
    { value: 17.7, subject: "rich vs thd", href: "/h2h/rich/thd", detail: "24 meetings" },
  ];

  it("matches either way round, because the stat keys one row per pairing", () => {
    expect(findRivalry(entries, "thd", "rich")?.detail).toBe("24 meetings");
    expect(findRivalry(entries, "rich", "thd")?.detail).toBe("24 meetings");
  });

  it("does not invent a row", () => {
    expect(findRivalry(entries, "thd", "jay")).toBeUndefined();
    expect(findRivalry(undefined, "thd", "rich")).toBeUndefined();
    expect(findRivalry(entries, null, "rich")).toBeUndefined();
  });
});

describe("rivalryItem", () => {
  const teams: [RailTeam, RailTeam] = [
    { rosterId: 1, managerId: "thd", name: "Team thd", finish: 3 },
    { rosterId: 2, managerId: "rich", name: "Team rich", finish: 7 },
  ];

  it("uses the precomputed sentence, and says what it counts", () => {
    const item = rivalryItem(teams, {
      value: 17.7,
      subject: "rich vs thd",
      detail: "24 meetings since 2012, thd leads 16–8",
    });
    // The stat counts playoff meetings; the H2H page it links to does not. Say
    // so, or the rail reads as a lie about the page one click later.
    expect(item?.detail).toBe(
      "24 meetings since 2012, thd leads 16–8 — playoffs included"
    );
    expect(item?.to).toBe("/h2h/thd/rich");
  });

  it("links without a count rather than guessing one", () => {
    const item = rivalryItem(teams, null);
    expect(item?.to).toBe("/h2h/thd/rich");
    expect(item?.detail).not.toMatch(/\d/);
  });

  it("is dropped when either side has no manager page", () => {
    expect(rivalryItem([teams[0], { ...teams[1], managerId: null }])).toBeNull();
  });

  /**
   * The qualifier above is a claim about someone else's stat, so pin it. If
   * `rivalry-intensity` is ever changed to count the regular season only, its
   * totals will match `getAllTimeH2HRecord` exactly and this fails — at which
   * point "playoffs included" has to come back off the rail.
   */
  it("really is counting more than the regular season", () => {
    const stat = file.stats.find((s) => s.id === "rivalry-intensity");
    expect(stat).toBeDefined();

    let withPlayoffMeetings = 0;

    for (const entry of stat!.entries) {
      const [idA, idB] = entry.subject.split(" vs ");
      const sleeperId = (id: string) =>
        managers.find((m) => m.id === id)?.sleeper.id ?? "";
      const regular = getAllTimeH2HRecord(sleeperId(idA), sleeperId(idB));
      const regularMeetings =
        regular.team1Wins + regular.team2Wins + regular.ties;

      const counted = Number(entry.detail?.match(/^(\d+) meetings/)?.[1]);
      expect(counted, entry.subject).toBeGreaterThanOrEqual(regularMeetings);
      if (counted > regularMeetings) withPlayoffMeetings += 1;
    }

    expect(withPlayoffMeetings).toBeGreaterThan(0);
  });
});

describe("rematchItems", () => {
  it("finds the second meeting of a pairing that played twice", () => {
    // 2018: rosters 3 and 6 met in Week 1 (matchup 3) and again in Week 11
    // (matchup 2) — the schedule doubles some pairings up.
    const items = rematchItems(railFor(2018, 1, 3));
    expect(items).toEqual([
      {
        id: "rematch-11",
        to: "/seasons/2018/matchups/11/2",
        label: "They met again in Week 11",
        detail: expect.stringMatching(SCORELINE),
      },
    ]);
  });

  it("looks backwards from the later meeting", () => {
    const items = rematchItems(railFor(2018, 11, 2));
    expect(items).toHaveLength(1);
    expect(items[0].label).toBe("They also met in Week 1");
    expect(items[0].to).toBe("/seasons/2018/matchups/1/3");
  });

  it("counts a playoff meeting too — it is still the same two teams", () => {
    // Rosters 7 and 10 met in Week 1 and again in the Week 15 playoffs.
    const items = rematchItems(railFor(2018, 1, 2));
    expect(items.map((item) => item.to)).toContain(
      "/seasons/2018/matchups/15/4"
    );
  });

  it("never points back at the game being viewed", () => {
    for (const item of rematchItems(railFor(2018, 1, 3))) {
      expect(item.to).not.toBe("/seasons/2018/matchups/1/3");
    }
  });

  it("has nothing to say about a pairing that met once", () => {
    const railWithNoRematch = [1, 2, 3, 4, 5, 6]
      .map((matchupId) => rematchItems(railFor(2018, 12, matchupId)))
      .filter((items) => items.length === 0);
    expect(railWithNoRematch.length).toBeGreaterThan(0);
  });
});

describe("otherGamesItems", () => {
  it("lists the rest of the week and a way back to all of it", () => {
    const items = otherGamesItems(railFor(2018, 1, 1));
    // Six games in the week, so five others plus the week itself.
    expect(items).toHaveLength(6);
    expect(items[items.length - 1]).toMatchObject({
      to: "/seasons/2018/matchups?week=1",
      label: "All of Week 1, 2018",
    });
    for (const item of items.slice(0, -1)) {
      expect(item.label).toMatch(SCORELINE);
    }
  });

  it("does not include the game being viewed", () => {
    const items = otherGamesItems(railFor(2018, 1, 3));
    expect(items.map((i) => i.to)).not.toContain("/seasons/2018/matchups/1/3");
  });

  it("quotes the score the week list quotes", () => {
    // 2018 Week 1, matchup 1: 117.96 to 114.6. To one decimal that reads
    // "118.0", which is a different number from the one on every other page.
    const items = otherGamesItems(railFor(2018, 1, 3));
    const game = items.find((i) => i.to === "/seasons/2018/matchups/1/1");
    expect(game?.label).toBe("nick 117.96 – 114.6 thd");
  });

  it("offers only the other three games of a playoff week", () => {
    const items = otherGamesItems(railFor(2024, 15, 1));
    expect(items).toHaveLength(4); // three games plus the week
  });
});

describe("managerSeasonItems, via buildMatchupRail", () => {
  it("claims a finish only for a season the brackets decided", () => {
    const rail = buildMatchupRail(railFor(2018, 1, 1));
    const seasonsItems = rail[0].items.filter((i) => i.id.startsWith("season-"));
    expect(seasonsItems).toHaveLength(2);
    for (const item of seasonsItems) {
      expect(item.detail).toMatch(
        /^Finished \d+(st|nd|rd|th) of 12 in 2018 — after the playoffs$/
      );
    }
  });

  it("says nothing about a finish that has not happened", () => {
    const input = railFor(2018, 1, 1);
    const undecided = {
      ...input,
      teams: [
        { ...input.teams[0], finish: null },
        { ...input.teams[1], finish: null },
      ] as [RailTeam, RailTeam],
    };
    const items = buildMatchupRail(undecided)[0].items.filter((i) =>
      i.id.startsWith("season-")
    );
    expect(items).toHaveLength(2);
    for (const item of items) expect(item.detail).toBeUndefined();
  });
});

describe("every link the rail can produce is a page", () => {
  /** The route table, as far as the rail is concerned. */
  const assertReal = (to: string) => {
    const [path, query] = to.split("?");
    const parts = path.split("/").filter(Boolean);

    if (parts[0] === "h2h") {
      expect(MANAGER_IDS.has(parts[1]), `${to}: no manager ${parts[1]}`).toBe(true);
      expect(MANAGER_IDS.has(parts[2]), `${to}: no manager ${parts[2]}`).toBe(true);
      expect(parts[1], `${to}: a pairing with itself`).not.toBe(parts[2]);
      return;
    }

    if (parts[0] === "managers") {
      expect(MANAGER_IDS.has(parts[1]), `${to}: no manager ${parts[1]}`).toBe(true);
      expect(parts[2], `${to}: unknown manager tab`).toBe("seasons");
      return;
    }

    if (parts[0] === "seasons") {
      const year = Number(parts[1]);
      expect(YEAR_NUMBERS, `${to}: no season`).toContain(year);
      expect(parts[2]).toBe("matchups");

      if (parts.length === 3) {
        // The week list, which needs its week in the query to land on it.
        const week = Number(new URLSearchParams(query).get("week"));
        expect(pairingsInWeek(weekOf(year, week)).length, to).toBeGreaterThan(0);
        return;
      }

      expect(
        isRealPairing(year, Number(parts[3]), Number(parts[4])),
        `${to}: not a two-sided game`
      ).toBe(true);
      return;
    }

    throw new Error(`${to}: the rail produced a route nothing serves`);
  };

  // Every game of four seasons spread across the league's history, playoff
  // weeks included — 2012's ten-team seasons, a twelve-team one, the
  // reconstructed 2019, and the most recent finished season.
  it.each([2012, 2018, 2019, 2024])("across all of %i", (year) => {
    let checked = 0;

    for (let week = 1; week <= 17; week++) {
      const sides = weekOf(year, week);
      if (!sides || !isWeekCompleted(week, seasons[year].league)) continue;

      for (const pairing of pairingsInWeek(sides)) {
        const rail = buildMatchupRail(railFor(year, week, pairing.matchupId));
        for (const section of rail) {
          expect(section.items.length, "an empty section was kept").toBeGreaterThan(0);
          for (const item of section.items) {
            assertReal(item.to);
            expect(item.label.trim()).not.toBe("");
            checked += 1;
          }
        }
      }
    }

    expect(checked, `no games found in ${year}`).toBeGreaterThan(100);
  });
});
