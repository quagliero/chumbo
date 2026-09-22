import { describe, expect, it } from "vitest";
import { seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { hasIncompleteBench } from "@/domain/dataQuality";
import {
  RECAP_MIN_STREAK,
  buildWeekRecap,
  completedWeeks,
  recapLines,
} from "@/utils/weekRecap";
import { PINNED_THROUGH } from "./helpers";

/**
 * "Week N in the Chumbo" (J2). One week checked by hand, then the rules every
 * recap of every finished season must keep — finished, so the automatic
 * update can never fail this file by playing a week.
 */

describe("2025 week 7, checked by hand", () => {
  const recap = buildWeekRecap(2025, 7)!;
  const lines = Object.fromEntries(
    recapLines(recap).map((line) => [line.label, line.text])
  );

  it("names the top and bottom scores", () => {
    expect(lines["Top score"]).toBe("hadkiss 130.4");
    expect(lines["Low score"]).toBe("fin 66.9");
  });

  it("finds the closest game and the beating", () => {
    expect(lines["Closest game"]).toBe("kitch 97.6–96.5 ant, by 1.06");
    expect(lines["Biggest beating"]).toBe("htc by 43.8 over fin");
  });

  it("calls a bottom-half win lucky", () => {
    expect(lines["Luckiest win"]).toBe(
      "kitch, with the week's 7th-best score (beat 5 of 11)"
    );
  });

  it("finds the worst benching", () => {
    expect(lines["Worst benching"]).toBe("kitch left 30.0 on the bench");
  });

  it("reports the runs that went on and the ones that ended", () => {
    expect(lines["On a run"]).toBe("rich has lost five straight");
    expect(recap.streaks.filter((s) => s.ended).map((s) => s.team.name)).toEqual(
      expect.arrayContaining(["fin", "thd", "ryan"])
    );
  });
});

const finished = YEAR_NUMBERS.filter((year) => year <= PINNED_THROUGH);
const everyWeek = finished.flatMap((year) =>
  completedWeeks(year).map((week) => ({ year, week }))
);

describe("every recap of every finished season", () => {
  it("covers every played week", () => {
    // 2012 and 2013 were 13-week regular seasons with shorter playoffs.
    expect(everyWeek.length).toBeGreaterThan(finished.length * 15);
  });

  it.each(everyWeek)("$year week $week holds together", ({ year, week }) => {
    const recap = buildWeekRecap(year, week)!;
    expect(recap).not.toBeNull();
    const scores = recap.games.flatMap((g) => [g.winner.points, g.loser.points]);

    expect(recap.top.team.points).toBe(Math.max(...scores));
    expect(recap.bottom.team.points).toBe(Math.min(...scores));
    expect(recap.closest.margin).toBeLessThanOrEqual(recap.blowout.margin);
    for (const game of recap.games) {
      expect(game.margin).toBeGreaterThanOrEqual(0);
      expect(game.href).toBe(
        `/seasons/${year}/matchups/${week}/${game.matchupId}`
      );
    }

    // 2019's lineups are reconstructed; a benching claim would rest on them.
    if (hasIncompleteBench(year)) expect(recap.benching).toBeUndefined();

    if (recap.playoffs) {
      expect(recap.luckiest).toBeUndefined();
      expect(recap.unluckiest).toBeUndefined();
      expect(recap.streaks).toEqual([]);
    }
    if (recap.luckiest) {
      expect(recap.luckiest.game.winner.rosterId).toBe(recap.luckiest.team.rosterId);
      expect(recap.luckiest.rank).toBeGreaterThan(scores.length / 2);
    }
    if (recap.unluckiest) {
      expect(recap.unluckiest.game.loser.rosterId).toBe(recap.unluckiest.team.rosterId);
      expect(recap.unluckiest.rank).toBeLessThanOrEqual(3);
    }
    for (const streak of recap.streaks) {
      expect(streak.count).toBeGreaterThanOrEqual(RECAP_MIN_STREAK);
    }

    const lines = recapLines(recap);
    expect(lines[0].label).toBe("Top score");
    for (const line of lines) expect(line.text.length).toBeGreaterThan(0);
  });
});

describe("a week that is not a recap", () => {
  it("is null before it is played, and for a week that does not exist", () => {
    expect(buildWeekRecap(2025, 30)).toBeNull();
    expect(buildWeekRecap(1999, 1)).toBeNull();
  });

  it("never pairs two teams that had no game", () => {
    // 2014's week 16 has eliminated teams on `matchup_id: null`.
    const recap = buildWeekRecap(2014, 16);
    const nulls = (seasons[2014].matchups["16"] ?? []).filter(
      (side) => side.matchup_id === null
    ).length;
    expect(recap!.games.length * 2).toBe(
      (seasons[2014].matchups["16"] ?? []).length - nulls
    );
  });
});
