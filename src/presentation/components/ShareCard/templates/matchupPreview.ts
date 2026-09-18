/**
 * A matchup preview (K1): the card for a game not yet played.
 *
 * Built on the head-to-head card's silhouette on purpose — two avatars facing
 * each other across a record — because the preview IS a head-to-head card with
 * a date on it, and the league already reads that shape as "these two".
 *
 * **What goes in the middle is the all-time record, not "VS".** "VS" is
 * decoration; the record is the argument the game is about to add to.
 *
 * **The stakes are per side, under each name**, as "win 71% · lose 38%". A
 * single centred sentence cannot hold both managers' odds at thumbnail size,
 * and splitting them puts each number under the person it belongs to.
 *
 * **No accent.** Nobody has won yet; colouring one side would pick a winner.
 */

import { CARD_WIDTH, type ShareCard } from "../card";
import { group, text } from "../svg";
import { fitFontSize, truncateToWidth } from "../text";
import { CARD_TOKENS } from "../tokens";
import {
  type CardChrome,
  type CardPerson,
  NEUTRAL_ACCENT,
  avatar,
  eyebrow,
  footer,
  formatRecord,
  noteLine,
  seasonMeta,
  topRule,
} from "./chrome";

export interface PreviewCardSide extends CardPerson {
  /** This season's record so far: "3–1". */
  record: string;
  /** "win 71% · lose 38%", or undefined when there are no stakes to show. */
  stakes?: string;
}

export interface MatchupPreviewCardProps extends CardChrome {
  year: number;
  week: number;
  a: PreviewCardSide;
  b: PreviewCardSide;
  /** All time, regular season, from A's side. Zero games means a first meeting. */
  wins: number;
  losses: number;
  ties?: number;
}

const CENTRE = CARD_WIDTH / 2;
const COLUMN = 216;
const AVATAR_R = 64;
const NAME_WIDTH = 360;
const AVATAR_CY = 216;
const NAME_BASELINE = 332;
const RECORD_BASELINE = 376;
const STAKES_BASELINE = 430;
const CENTRE_WIDTH = CARD_WIDTH - 2 * (COLUMN + NAME_WIDTH / 2) - 24;

export const matchupPreviewCard = ({
  year,
  week,
  a,
  b,
  wins,
  losses,
  ties = 0,
  accent = NEUTRAL_ACCENT,
  crest,
  note,
}: MatchupPreviewCardProps): ShareCard => {
  const met = wins + losses + ties > 0;
  const series = met ? formatRecord(wins, losses, ties) : "First";
  const seriesSize = fitFontSize(series, CENTRE_WIDTH, 96, {
    weight: 800,
    min: 48,
  });

  const side = (person: PreviewCardSide, cx: number, id: string) => {
    const nameSize = fitFontSize(person.name, NAME_WIDTH, 40, {
      weight: 700,
      min: 26,
    });
    return group({}, [
      avatar({ id, person, cx, cy: AVATAR_CY, r: AVATAR_R }),
      text(truncateToWidth(person.name, NAME_WIDTH, nameSize, { weight: 700 }), {
        x: cx,
        y: NAME_BASELINE,
        size: nameSize,
        weight: 700,
        fill: CARD_TOKENS.ink,
        anchor: "middle",
      }),
      text(truncateToWidth(`${person.record} this season`, NAME_WIDTH, 28, { weight: 600 }), {
        x: cx,
        y: RECORD_BASELINE,
        size: 28,
        weight: 600,
        fill: CARD_TOKENS.inkMuted,
        anchor: "middle",
        numeric: true,
      }),
      person.stakes
        ? text(truncateToWidth(person.stakes, NAME_WIDTH, 28, { weight: 700 }), {
            x: cx,
            y: STAKES_BASELINE,
            size: 28,
            weight: 700,
            fill: CARD_TOKENS.ink,
            anchor: "middle",
            numeric: true,
          })
        : "",
    ]);
  };

  return {
    title: `${a.name} vs ${b.name} · ${seasonMeta(year, week)} preview${
      met ? ` · ${formatRecord(wins, losses, ties)} all time` : " · first meeting"
    }`,
    content: [
      topRule(accent),
      eyebrow(`Week ${week} preview`, { x: CENTRE, y: 96, anchor: "middle" }),
      side(a, COLUMN, "a"),
      side(b, CARD_WIDTH - COLUMN, "b"),
      eyebrow(met ? "All time" : "Meeting", {
        x: CENTRE,
        y: 176,
        anchor: "middle",
        size: 26,
        width: CENTRE_WIDTH,
      }),
      text(series, {
        x: CENTRE,
        y: 262,
        size: seriesSize,
        weight: 800,
        fill: CARD_TOKENS.ink,
        anchor: "middle",
        numeric: true,
        tracking: -2,
      }),
      a.stakes || b.stakes
        ? eyebrow("Playoff odds", {
            x: CENTRE,
            y: STAKES_BASELINE,
            anchor: "middle",
            size: 22,
            width: CENTRE_WIDTH,
          })
        : "",
      note ? noteLine(note, { x: CENTRE, y: 506, anchor: "middle", size: 28 }) : "",
      footer({ meta: seasonMeta(year, week), crest }),
    ].join(""),
  };
};
