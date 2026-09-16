import { describe, expect, it } from "vitest";
import managers from "@/data/managers.json";
import { DataMode, getManagerStats } from "@/utils/managerStats";
import { summariseList } from "./helpers";

/**
 * Baseline snapshots for `getManagerStats` (H1).
 *
 * Every manager in `managers.json` is snapshotted in all three data modes.
 * `topPerformances`, `mostCappedPlayers` and `mostDraftedPlayers` are
 * summarised (count + first 10 + digest) rather than dumped in full — see
 * `helpers.ts`.
 */
const MODES: DataMode[] = ["regular", "playoffs", "combined"];

describe("getManagerStats", () => {
  MODES.forEach((mode) => {
    describe(`dataMode: ${mode}`, () => {
      managers.forEach((manager) => {
        it(`${manager.id}`, () => {
          const stats = getManagerStats(manager.id, mode);
          expect(stats).not.toBeNull();

          const {
            topPerformances,
            mostCappedPlayers,
            mostDraftedPlayers,
            ...core
          } = stats!;

          expect({
            ...core,
            topPerformances: summariseList(topPerformances),
            mostCappedPlayers: summariseList(mostCappedPlayers),
            mostDraftedPlayers: summariseList(mostDraftedPlayers),
          }).toMatchSnapshot();
        });
      });
    });
  });

  it("returns null for an unknown manager id", () => {
    expect(getManagerStats("no-such-manager")).toBeNull();
  });

  it("defaults to the regular season data mode", () => {
    expect(getManagerStats("thd")).toEqual(getManagerStats("thd", "regular"));
  });
});
