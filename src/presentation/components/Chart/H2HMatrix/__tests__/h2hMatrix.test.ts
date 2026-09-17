import { describe, expect, it } from "vitest";
import managers from "@/data/managers.json";
import { getAllTimeH2HRecord } from "@/utils/h2h";
import { buildH2HMatrix } from "../useH2HMatrix";

/**
 * The matrix is a derived view, and the two ways it can be silently wrong are
 * both structural: a cell read from the wrong side (so a 12-7 shows as 7-12 for
 * one of the two managers), and a row or column index that has drifted out of
 * step with `order`. Both look like perfectly plausible data on screen, which
 * is exactly the failure mode H1 exists for.
 */
const matrix = buildH2HMatrix();

describe("buildH2HMatrix", () => {
  it("is square, and every row lines up with the column order", () => {
    expect(matrix.rows).toHaveLength(matrix.order.length);
    matrix.rows.forEach((row, index) => {
      expect(row.managerId).toBe(matrix.order[index]);
      expect(row.cells).toHaveLength(matrix.order.length);
      row.cells.forEach((cell, columnIndex) => {
        if (cell) expect(cell.opponentId).toBe(matrix.order[columnIndex]);
      });
    });
  });

  it("leaves the diagonal empty — nobody is their own rivalry", () => {
    matrix.rows.forEach((row, index) => {
      expect(row.cells[index]).toBeNull();
      // And nowhere else: exactly one hole per row.
      expect(row.cells.filter((cell) => cell === null)).toHaveLength(1);
    });
  });

  it("mirrors: A's record against B is B's record against A, reversed", () => {
    matrix.rows.forEach((row, rowIndex) => {
      row.cells.forEach((cell, columnIndex) => {
        if (!cell) return;
        const mirror = matrix.rows[columnIndex].cells[rowIndex];
        expect(mirror).not.toBeNull();
        expect(mirror!.wins).toBe(cell.losses);
        expect(mirror!.losses).toBe(cell.wins);
        expect(mirror!.ties).toBe(cell.ties);
      });
    });
  });

  it("agrees with getAllTimeH2HRecord, which is the source of truth", () => {
    const sleeperId = new Map(managers.map((m) => [m.id, m.sleeper.id]));

    matrix.rows.forEach((row) => {
      row.cells.forEach((cell) => {
        if (!cell) return;
        const record = getAllTimeH2HRecord(
          sleeperId.get(row.managerId)!,
          sleeperId.get(cell.opponentId)!
        );
        expect(cell.wins).toBe(record.team1Wins);
        expect(cell.losses).toBe(record.team2Wins);
        expect(cell.ties).toBe(record.ties);
      });
    });
  });

  it("sums each row into that manager's record against the field", () => {
    matrix.rows.forEach((row) => {
      const played = row.cells.filter((cell) => cell !== null);
      expect(row.wins).toBe(played.reduce((total, cell) => total + cell!.wins, 0));
      expect(row.losses).toBe(played.reduce((total, cell) => total + cell!.losses, 0));
      expect(row.meetings).toBe(row.wins + row.losses + row.ties);
    });
  });

  it("is a closed ledger: every win in the grid is somebody's loss", () => {
    const wins = matrix.rows.reduce((total, row) => total + row.wins, 0);
    const losses = matrix.rows.reduce((total, row) => total + row.losses, 0);
    expect(wins).toBe(losses);
  });

  it("orders rows by all-time record against the field", () => {
    const rates = matrix.rows.map((row) => row.winRate);
    expect(rates).toEqual([...rates].sort((a, b) => b - a));
  });

  it("marks the lead from the record, with a level series counted as level", () => {
    matrix.rows.forEach((row) => {
      row.cells.forEach((cell) => {
        if (!cell) return;
        if (cell.meetings === 0) {
          expect(cell.winRate).toBeNull();
          expect(cell.lead).toBe("level");
          expect(cell.margin).toBe(0);
          return;
        }
        expect(cell.winRate).toBeCloseTo(
          (cell.wins + cell.ties / 2) / cell.meetings
        );
        expect(cell.lead).toBe(
          cell.wins > cell.losses
            ? "ahead"
            : cell.wins < cell.losses
            ? "behind"
            : "level"
        );
      });
    });
  });

  it("will not paint a two-game sample as domination", () => {
    matrix.rows.forEach((row) => {
      row.cells.forEach((cell) => {
        if (!cell) return;
        expect(cell.margin).toBeLessThanOrEqual(3);
        if (cell.meetings < 3) expect(cell.margin).toBeLessThanOrEqual(1);
        else if (cell.meetings < 6) expect(cell.margin).toBeLessThanOrEqual(2);
        // A level series is never tinted, however many times it was played.
        if (cell.lead === "level") expect(cell.margin).toBe(0);
      });
    });
  });

  it("includes the managers who have left, not just the active twelve", () => {
    // The four `chumbolegacy_*` accounts carry real 2012-2019 games; an almanac
    // that quietly drops them is missing a third of its own history.
    expect(matrix.order).toEqual(
      expect.arrayContaining(["jimmie", "karsten", "chris", "phil"])
    );
    expect(matrix.order).toHaveLength(managers.length);
  });
});
