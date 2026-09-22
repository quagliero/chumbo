import { describe, expect, it } from "vitest";
import { playoffMeetings } from "@/utils/previewBlurb";
import { tradesBetween } from "@/utils/stats/transactionStats";
import { getStatContext } from "@/utils/stats/traverse";
import { PINNED_THROUGH } from "./helpers";

/**
 * The group chat's blurbs (K1). Pinned to finished seasons: the live one can
 * add a playoff meeting or a trade without failing the update.
 */

const finished = <T extends { year: number }>(list: T[]) =>
  list.filter((entry) => entry.year <= PINNED_THROUGH);

describe("the playoff meetings a blurb quotes", () => {
  it("are eliminations and finals — never a consolation game or the game for third", () => {
    const jay = { managerId: "jay" };
    const ant = { managerId: "ant" };
    // They also met in 2017 and 2022's consolation brackets (jay scored 0 in
    // one of them) and in 2023's game for third. None of those count.
    const meetings = finished(playoffMeetings(jay, ant)).map((k) => ({
      year: k.year,
      round: k.round,
      winner: k.winner.managerId,
      wonTitle: k.wonTitle,
    }));
    expect(meetings).toEqual([
      { year: 2013, round: "semi", winner: "jay", wonTitle: false },
      { year: 2019, round: "first round", winner: "jay", wonTitle: true },
      { year: 2021, round: "semi", winner: "ant", wonTitle: true },
    ]);
  });

  it("name a final a final", () => {
    const [final] = finished(playoffMeetings({ managerId: "hadkiss" }, { managerId: "fin" }));
    expect(final).toMatchObject({ year: 2016, round: "final", wonTitle: true });
    expect(final.winner.managerId).toBe("fin");
  });
});

describe("the trades between two managers", () => {
  it("names what each side got", () => {
    const [only] = finished(tradesBetween(getStatContext(), "hadkiss", "fin"));
    expect(only.year).toBe(2019);
    expect(only.got.hadkiss).toEqual(["Aaron Rodgers"]);
    expect(only.got.fin).toEqual(["Alshon Jeffery"]);
    expect(finished(tradesBetween(getStatContext(), "brock", "rich"))).toEqual([]);
  });
});
