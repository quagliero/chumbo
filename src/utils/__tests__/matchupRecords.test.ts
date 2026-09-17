import { describe, expect, it } from "vitest";
import { computeStat, getStatContext } from "@/utils/stats";
import type { Game } from "@/utils/stats";

/**
 * The matchup records that walk history rather than filter it (C3c–C3f).
 *
 * These four are the ones that can be subtly, plausibly wrong. A streak
 * computed over an unsorted game list still produces a number, and a rivalry
 * keyed on one manager's view of the pairing still produces a table; neither
 * looks broken until someone who was there reads it. So the checks here are
 * about the walk — chronology, symmetry, and that a "loss" record only ever
 * contains losses — not about which name is at the top.
 */

const chronological = (games: Game[]) =>
  [...games].sort((a, b) => a.year - b.year || a.week - b.week);

const gamesFor = (managerId: string) =>
  chronological(
    getStatContext().games.filter((game) => game.managerId === managerId)
  );

/** "2021 Week 3 – 2022 Week 1" -> the two endpoints. */
const parseSpan = (detail: string) => {
  const match = detail.match(/^(\d{4}) Week (\d+) – (\d{4}) Week (\d+)$/);
  if (!match) throw new Error(`unparseable streak detail: ${detail}`);
  return {
    startYear: Number(match[1]),
    startWeek: Number(match[2]),
    endYear: Number(match[3]),
    endWeek: Number(match[4]),
  };
};

describe("beat almost everyone", () => {
  it("only ever lists losses", () => {
    const entries = computeStat("beat-almost-everyone", 25);
    expect(entries.length).toBeGreaterThan(0);

    const losses = new Set(
      getStatContext()
        .games.filter((game) => game.result === "loss")
        .map((game) => `${game.year}|${game.week}|${game.managerId}`)
    );

    for (const entry of entries) {
      expect(losses.has(`${entry.year}|${entry.week}|${entry.subject}`)).toBe(
        true
      );
    }
  });

  it("counts the teams a losing score really would have beaten", () => {
    const [top] = computeStat("beat-almost-everyone", 1);
    const game = getStatContext().games.find(
      (candidate) =>
        candidate.year === top.year &&
        candidate.week === top.week &&
        candidate.managerId === top.subject
    );
    expect(game).toBeDefined();
    if (!game) return;

    const others = getStatContext().games.filter(
      (candidate) =>
        candidate.year === game.year &&
        candidate.week === game.week &&
        candidate.rosterId !== game.rosterId
    );
    const beaten = others.filter((other) => other.points < game.points).length;

    expect(top.value).toBe(beaten);
    // The whole point of the stat: it beat nearly everyone and still lost.
    expect(game.result).toBe("loss");
    expect(beaten / others.length).toBeGreaterThan(0.75);
  });
});

describe("streaks", () => {
  for (const [id, kind] of [
    ["longest-win-streak", "win"],
    ["longest-loss-streak", "loss"],
  ] as const) {
    it(`${id} is a real, unbroken run of ${kind}s in chronological order`, () => {
      const entries = computeStat(id, 10);
      expect(entries.length).toBeGreaterThan(0);

      for (const entry of entries) {
        const span = parseSpan(entry.detail ?? "");
        const played = gamesFor(entry.subject);

        const startIndex = played.findIndex(
          (game) =>
            game.year === span.startYear && game.week === span.startWeek
        );
        expect(startIndex).toBeGreaterThanOrEqual(0);

        const run = played.slice(startIndex, startIndex + entry.value);
        expect(run).toHaveLength(entry.value);

        // Every game in the claimed span is the right result...
        expect(run.map((game) => game.result)).toEqual(
          run.map(() => kind)
        );
        // ...it ends where the entry says it does...
        const last = run[run.length - 1];
        expect([last.year, last.week]).toEqual([span.endYear, span.endWeek]);
        // ...the run is in chronological order...
        expect(run).toEqual(chronological(run));
        // ...and it really is maximal: the game before it is not the same
        // result, or the streak should have started earlier.
        const before = played[startIndex - 1];
        if (before) expect(before.result).not.toBe(kind);
        const after = played[startIndex + entry.value];
        if (after) expect(after.result).not.toBe(kind);
      }
    });
  }

  it("is not fooled by the order the game list happens to be in", () => {
    // If the stat walked the list as given rather than sorting it, a streak
    // could span games that are years apart with wins in between. Check the
    // top entry's run has no gap in the manager's own sorted history.
    const [top] = computeStat("longest-win-streak", 1);
    const span = parseSpan(top.detail ?? "");
    const played = gamesFor(top.subject);
    const startIndex = played.findIndex(
      (game) => game.year === span.startYear && game.week === span.startWeek
    );
    const run = played.slice(startIndex, startIndex + top.value);

    for (let i = 1; i < run.length; i++) {
      const previous = run[i - 1];
      const game = run[i];
      const forwards =
        game.year > previous.year ||
        (game.year === previous.year && game.week > previous.week);
      expect(forwards).toBe(true);
    }
  });

  it("gives each manager at most one streak", () => {
    for (const id of ["longest-win-streak", "longest-loss-streak"]) {
      const subjects = computeStat(id).map((entry) => entry.subject);
      expect(new Set(subjects).size).toBe(subjects.length);
    }
  });
});

describe("rivalry intensity", () => {
  it("lists each pairing once, in a stable order, and links to that H2H", () => {
    const entries = computeStat("rivalry-intensity");
    expect(entries.length).toBeGreaterThan(0);

    const seen = new Set<string>();
    for (const entry of entries) {
      const [a, b] = entry.subject.split(" vs ");
      expect(a).toBeTruthy();
      expect(b).toBeTruthy();
      // Symmetric: the pairing is keyed on the unordered pair, so a-vs-b and
      // b-vs-a must never both appear.
      const key = [a, b].sort().join("|");
      expect(seen.has(key)).toBe(false);
      seen.add(key);
      expect(entry.href).toBe(`/h2h/${a}/${b}`);
    }
  });

  it("averages the same margin whichever side you compute it from", () => {
    for (const entry of computeStat("rivalry-intensity", 5)) {
      const [a, b] = entry.subject.split(" vs ");
      // Every meeting, from a's point of view — the mirror games are dropped.
      const meetings = getStatContext().games.filter(
        (game) => game.managerId === a && game.opponentManagerId === b
      );
      const mirrored = getStatContext().games.filter(
        (game) => game.managerId === b && game.opponentManagerId === a
      );

      expect(meetings.length).toBe(mirrored.length);
      expect(meetings.length).toBeGreaterThanOrEqual(12);

      const average =
        meetings.reduce((sum, game) => sum + Math.abs(game.margin), 0) /
        meetings.length;
      expect(entry.value).toBeCloseTo(Math.round(average * 100) / 100, 2);
    }
  });
});

describe("revenge games", () => {
  it("counts the next meeting after a blowout, and only that", () => {
    const entries = computeStat("revenge-games");
    expect(entries.length).toBeGreaterThan(0);

    for (const entry of entries) {
      const played = gamesFor(entry.subject);
      const byOpponent = new Map<string, Game[]>();
      for (const game of played) {
        if (!game.opponentManagerId) continue;
        const meetings = byOpponent.get(game.opponentManagerId) ?? [];
        meetings.push(game);
        byOpponent.set(game.opponentManagerId, meetings);
      }

      let wins = 0;
      let total = 0;
      for (const meetings of byOpponent.values()) {
        for (let i = 0; i < meetings.length - 1; i++) {
          if (
            meetings[i].result !== "loss" ||
            Math.abs(meetings[i].margin) < 40
          ) {
            continue;
          }
          total += 1;
          if (meetings[i + 1].result === "win") wins += 1;
        }
      }

      expect(total).toBeGreaterThanOrEqual(5);
      expect(entry.value).toBeCloseTo(
        Math.round(((100 * wins) / total) * 100) / 100,
        2
      );

      // The detail carries the record, and it has to add up to the percentage.
      const record = (entry.detail ?? "").match(/^(\d+)–(\d+)(?:–(\d+))?/);
      expect(record).toBeTruthy();
      if (!record) continue;
      const played_ =
        Number(record[1]) + Number(record[2]) + Number(record[3] ?? 0);
      expect(played_).toBe(total);
      expect(Number(record[1])).toBe(wins);
    }
  });
});
