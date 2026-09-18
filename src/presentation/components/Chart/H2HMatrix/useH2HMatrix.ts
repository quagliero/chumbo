import { useMemo } from "react";
import managers from "@/data/managers.json";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { getAllTimeH2HRecord } from "@/utils/h2h";

/**
 * Which way a rivalry leans, and how hard.
 *
 * `margin` is the shading step, 0-3. It is deliberately NOT a straight read of
 * the win rate: a 2-0 is 100% and means almost nothing, and painting it the
 * same as 14-3 would make the matrix lie in the most eye-catching way
 * available. See `marginStep` below.
 */
export type H2HLead = "ahead" | "behind" | "level";

export interface H2HCell {
  opponentId: string;
  opponentName: string;
  /** Wins for the ROW manager against this opponent. Regular season, all-time. */
  wins: number;
  losses: number;
  ties: number;
  meetings: number;
  /** Wins plus half the ties, over meetings. `null` when they have never met. */
  winRate: number | null;
  lead: H2HLead;
  /** Shading step, 0 (flat or unplayed) to 3 (owned). */
  margin: number;
}

export interface H2HMatrixRow {
  managerId: string;
  name: string;
  teamName: string;
  /**
   * One entry per column, in `order`, with `null` at the manager's own index.
   * A manager is not a rivalry with themselves, so the diagonal is a hole in
   * the data rather than a 0-0 record the grid then has to special-case.
   */
  cells: (H2HCell | null)[];
  /** The row summed: this manager's all-time record against the whole field. */
  wins: number;
  losses: number;
  ties: number;
  meetings: number;
  winRate: number;
}

export interface H2HMatrix {
  /** Manager ids, best overall record first. Row order and column order both. */
  order: string[];
  rows: H2HMatrixRow[];
}

/**
 * How dark to paint a cell.
 *
 * Two inputs, because either alone is wrong. The win RATE says how lopsided the
 * series is; the number of MEETINGS says how much that rate is worth. `phil`
 * played 13 games in total across two seasons, so several of his pairings are
 * 2-0 or 0-1 — at face value the most dominant cells in the grid. Capping the
 * step by sample size keeps the darkest shade for rivalries that have actually
 * had time to become one.
 */
const marginStep = (winRate: number, meetings: number): number => {
  const lopsided = Math.abs(winRate - 0.5);
  const byRate = lopsided >= 0.25 ? 3 : lopsided >= 0.125 ? 2 : lopsided > 0 ? 1 : 0;
  // A two-game sample never gets past the faintest tint, and you need six
  // meetings — three seasons of a twice-a-year fixture — before "owned".
  const bySample = meetings >= 6 ? 3 : meetings >= 3 ? 2 : 1;
  return Math.min(byRate, bySample);
};

const emptyCell = (opponentId: string, opponentName: string): H2HCell => ({
  opponentId,
  opponentName,
  wins: 0,
  losses: 0,
  ties: 0,
  meetings: 0,
  winRate: null,
  lead: "level",
  margin: 0,
});

/**
 * Every rivalry in league history, as a square grid (D3).
 *
 * `getAllTimeH2HRecord` is ORDERED — it answers "A against B" — but the two
 * directions are the same series read from opposite ends, so this computes each
 * of the 136 unordered pairs once and mirrors it. That halves the work and,
 * more importantly, keeps the whole grid inside the 320-entry memo in
 * `utils/h2h.ts`; asking for all 272 ordered pairs would fit, but only just,
 * and the margin is not worth spending.
 *
 * Rows and columns share one order — sorted by each manager's all-time record
 * against the field — so the grid reads as a pecking order as well as a lookup
 * table: the green mass collects above the diagonal and the red below it, and
 * the exceptions to that pattern are exactly the "he owns you" stories the page
 * exists to surface.
 */
export const buildH2HMatrix = (): H2HMatrix => {
  // Every manager in managers.json has played: the four legacy accounts
  // (`chumbolegacy_*`) carry real 2012-2019 games. So the grid is the whole
  // roll, not just the active twelve — the point of an almanac is that the
  // people who left are still in it.
  const roster = managers.map((m) => ({
    id: m.id,
    name: m.name,
    teamName: m.teamName,
    sleeperId: m.sleeper.id,
  }));

  // Upper triangle only; `records.get(key(a, b))` is always stored from a's
  // point of view with a earlier in `roster` than b.
  const key = (a: string, b: string) => `${a}|${b}`;
  const records = new Map<string, { wins: number; losses: number; ties: number }>();

  roster.forEach((a, i) => {
    roster.slice(i + 1).forEach((b) => {
      const record = getAllTimeH2HRecord(a.sleeperId, b.sleeperId);
      records.set(key(a.id, b.id), {
        wins: record.team1Wins,
        losses: record.team2Wins,
        ties: record.ties,
      });
    });
  });

  const rows: H2HMatrixRow[] = roster.map((manager, rowIndex) => {
    const cells = roster.map((opponent, columnIndex) => {
      if (rowIndex === columnIndex) return null;

      const stored =
        rowIndex < columnIndex
          ? records.get(key(manager.id, opponent.id))
          : // Mirror: the stored record is the opponent's, so swap it.
            (() => {
              const other = records.get(key(opponent.id, manager.id));
              return other
                ? { wins: other.losses, losses: other.wins, ties: other.ties }
                : undefined;
            })();

      if (!stored) return emptyCell(opponent.id, opponent.name);

      const meetings = stored.wins + stored.losses + stored.ties;
      if (meetings === 0) return emptyCell(opponent.id, opponent.name);

      const winRate = (stored.wins + stored.ties / 2) / meetings;

      return {
        opponentId: opponent.id,
        opponentName: opponent.name,
        wins: stored.wins,
        losses: stored.losses,
        ties: stored.ties,
        meetings,
        winRate,
        lead: winRate > 0.5 ? "ahead" : winRate < 0.5 ? "behind" : "level",
        margin: marginStep(winRate, meetings),
      } satisfies H2HCell;
    });

    const played = cells.filter((cell): cell is H2HCell => cell !== null);
    const wins = played.reduce((total, cell) => total + cell.wins, 0);
    const losses = played.reduce((total, cell) => total + cell.losses, 0);
    const ties = played.reduce((total, cell) => total + cell.ties, 0);
    const meetings = wins + losses + ties;

    return {
      managerId: manager.id,
      name: manager.name,
      teamName: manager.teamName,
      cells,
      wins,
      losses,
      ties,
      meetings,
      winRate: meetings === 0 ? 0 : (wins + ties / 2) / meetings,
    };
  });

  // A manager with no games at all would be an empty row and an empty column.
  const played = rows.filter((row) => row.meetings > 0);
  const order = [...played]
    .sort(
      (a, b) =>
        b.winRate - a.winRate || b.meetings - a.meetings || a.managerId.localeCompare(b.managerId)
    )
    .map((row) => row.managerId);

  // Rows and cells are both re-indexed into `order`, so `row.cells[i]` is
  // always the rivalry with `order[i]` — the component never has to look a
  // manager up by id while rendering 289 cells.
  const byId = new Map(played.map((row) => [row.managerId, row]));
  const columnIndex = new Map(order.map((id, index) => [id, index]));

  return {
    order,
    rows: order.map((id) => {
      const row = byId.get(id)!;
      const cells: (H2HCell | null)[] = order.map(() => null);
      for (const cell of row.cells) {
        if (!cell) continue;
        const index = columnIndex.get(cell.opponentId);
        if (index !== undefined) cells[index] = cell;
      }
      return { ...row, cells };
    }),
  };
};

/**
 * The matrix, suspended until every season's matchups have loaded.
 *
 * `useAllSeasons` throws the in-flight promise to the route's `<Suspense>`
 * boundary (A2a), so by the time this returns the synchronous walk over fifteen
 * seasons inside `getAllTimeH2HRecord` has something to walk.
 */
export const useH2HMatrix = (): H2HMatrix => {
  // Names no players, so it does not wait for the dictionary (A2b).
  useAllSeasons({ players: false });
  return useMemo(() => buildH2HMatrix(), []);
};
