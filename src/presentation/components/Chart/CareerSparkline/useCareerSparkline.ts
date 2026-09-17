import { useMemo } from "react";
import {
  usePowerRibbon,
  type RibbonPoint,
  type RibbonSeries,
} from "../PowerRibbon/usePowerRibbon";
import type { Point } from "../scale";

/**
 * One manager's career shape, for the sparkline on their Managers-page card
 * (F1c).
 *
 * The derivation is `usePowerRibbon` (D2) — deliberately, not a second copy of
 * it. The ribbon already walks every season, resolves every roster to a
 * manager and asks `getFinalStandings` where they actually finished, which is
 * exactly the series a sparkline wants; duplicating that walk would be a
 * second place for the bracket-numbering subtlety in `finalStandings.ts` to be
 * got wrong. This file adds only what a card needs and the ribbon does not
 * carry: the latest finish, the worst one, and a lookup by manager id.
 */

export interface CareerShape {
  managerId: string;
  /** Aligned to `years`, one slot each; `null` for a season they sat out. */
  points: (RibbonPoint | null)[];
  seasonsPlayed: number;
  titles: number;
  /**
   * Best SETTLED finish, 1 = champion. `null` until they have finished a
   * season. Deliberately excludes a season still being played: leading the
   * league in week two is not a career best, and a card reading "no titles
   * yet · best 1st" is the page contradicting itself.
   */
  bestFinish: number | null;
  worstFinish: number | null;
  /** Their most recent season, which is the end of the line on the card. */
  latest: RibbonPoint | null;
}

export interface CareerShapes {
  byManager: Map<string, CareerShape>;
  years: number[];
}

/**
 * Every manager's career shape, in one pass.
 *
 * The Managers page renders fourteen of these at once, so the series are built
 * once here and handed to the cards rather than each card deriving its own —
 * fourteen independent walks over fifteen seasons is the kind of thing that
 * makes a page feel slow for no reason anybody can point at.
 */
export const useCareerSparklines = (): CareerShapes => {
  const { series, years } = usePowerRibbon();

  return useMemo(
    () => ({
      byManager: new Map(
        series.map((manager) => [manager.managerId, toCareerShape(manager)])
      ),
      years,
    }),
    [series, years]
  );
};

/**
 * One ribbon series as a career shape.
 *
 * The one judgement in here is `bestFinish`. The ribbon's own `bestFinish`
 * spans every season including the one being played, which is right for a
 * chart of raw positions and wrong for a claim about a career: in September a
 * manager who has never won anything sits top of the table on two results, and
 * a card then reads "No titles yet · best 1st" — the page contradicting itself
 * in the space of two lines. So best and worst count settled seasons only,
 * and `latest` carries the in-progress one as the "now".
 */
export const toCareerShape = (manager: RibbonSeries): CareerShape => {
  const played = manager.points.filter((p): p is RibbonPoint => p !== null);
  const settled = played.filter((p) => !p.provisional);
  const positions = settled.map((p) => p.position);

  return {
    managerId: manager.managerId,
    points: manager.points,
    seasonsPlayed: manager.seasonsPlayed,
    titles: manager.titles,
    bestFinish: positions.length ? Math.min(...positions) : null,
    worstFinish: positions.length ? Math.max(...positions) : null,
    // `points` is year-ascending, so the last non-null is the newest season
    // they played — not necessarily the newest season there is.
    latest: played.length ? played[played.length - 1] : null,
  };
};

/**
 * A finish as a fraction of the field: 1 = champion, 0 = wooden spoon.
 *
 * The league was ten teams in 2012–13 and twelve since, so raw position is not
 * comparable along a single line — 8th of 10 is a worse season than 8th of 12,
 * and drawn at the same height it reads as the same season. Normalising by
 * that year's field size makes the line mean one thing end to end, which is the
 * only reason the sparkline is worth putting on a card next to thirteen others.
 *
 * A field of one (or none) has no spread to normalise against; treat the only
 * team as the champion rather than dividing by zero.
 */
export const normalisedFinish = (position: number, field: number): number =>
  field <= 1 ? 1 : 1 - (position - 1) / (field - 1);

/**
 * The sparkline's points in chart space, `null` where the manager sat out.
 *
 * `null` survives into the output because `linePath` reads it as a pen lift: a
 * manager who played 2012–2016 and came back in 2021 should show a gap, not a
 * line sloping across five seasons they were not in the league for.
 *
 * Y is inverted — champion at the top — for the same reason the power ribbon
 * inverts it: finishing first is a 1, and a chart where first place sits at the
 * bottom has to be explained every time it is read.
 */
export const sparklinePoints = (
  points: readonly (RibbonPoint | null)[],
  width: number,
  height: number
): (Point | null)[] => {
  const span = points.length > 1 ? width / (points.length - 1) : 0;
  return points.map((point, index) =>
    point
      ? {
          x: points.length > 1 ? index * span : width / 2,
          y: (1 - normalisedFinish(point.position, point.field)) * height,
        }
      : null
  );
};
