/**
 * A head-to-head record (G2).
 *
 * The one card that exists to end an argument. Two faces, one number between
 * them, and the number is from the LEFT manager's point of view — which is the
 * only thing about this card that can be misread, so it is fixed by geometry:
 * the wins sit on the left, above the left manager, and the losses on the
 * right.
 *
 * ## Layout decisions
 *
 * **Symmetrical, unlike the other four.** Every other card is a left-aligned
 * stack, because they are about one thing. This one is about a pair, and a
 * mirrored layout says "these two" before a single word is read. It is the one
 * silhouette in the set that is instantly distinguishable at thumbnail size,
 * which is worth more than consistency here.
 *
 * **The record is the hero, at up to 132px.** Not the names — the league knows
 * the faces, and a WhatsApp thumbnail will not carry two 40px names anyway. The
 * names are there for the reader who does not know them, at full size.
 *
 * **Green and red, not two manager accents.** Colouring each side with its
 * manager's hue is what the F2 note forbids, and it would also put two
 * arbitrary hues next to each other at 132px. The win/loss tokens are the
 * site's own semantics and they point the same way as the geometry.
 */

import { CARD_WIDTH, type ShareCard } from "../card";
import { estimateTextWidth } from "../fonts";
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
  pill,
  topRule,
} from "./chrome";

export interface H2HRecordCardProps extends CardChrome {
  /** The left-hand manager. The record is from their point of view. */
  a: CardPerson;
  /** The right-hand manager. */
  b: CardPerson;
  wins: number;
  losses: number;
  ties?: number;
  /**
   * What the record covers: "All time", "2025", "Playoffs". Goes in the
   * footer, because a record with no span is a claim with no scope.
   */
  span?: string;
  /** "Sol has won the last four" — a streak, in words, as a centred pill. */
  streak?: string;
}

const CENTRE = CARD_WIDTH / 2;
const COLUMN = 216;
const AVATAR_R = 72;
const NAME_WIDTH = 380;
const RECORD_MAX = 132;
/** The gap between the avatars, which is all the room the record has. */
const RECORD_WIDTH = CARD_WIDTH - 2 * (COLUMN + AVATAR_R) - 48;
/**
 * An en dash between the numbers, greyed. A hyphen at 132px reads as a minus
 * sign, and the same glyph in ink reads as part of one six-character number
 * rather than as the gap between two facts.
 */
const SEPARATOR = "–";

/** The one vertical grid this card uses, so the pieces cannot collide. */
const AVATAR_CY = 250;
const RECORD_BASELINE = 290;
const NAME_BASELINE = 372;
const TIES_BASELINE = 340;
const STREAK_TOP = 406;
const NOTE_BASELINE = 506;

export const h2hRecordCard = ({
  a,
  b,
  wins,
  losses,
  ties = 0,
  span = "All time",
  streak,
  accent = NEUTRAL_ACCENT,
  crest,
  note,
}: H2HRecordCardProps): ShareCard => {
  // Fitted as one string even though it is drawn as three, so the three pieces
  // shrink together and stay on one baseline at one size. Ties are excluded
  // from the fit because they are drawn separately, below.
  const size = fitFontSize(
    `${wins}${SEPARATOR}${losses}`,
    RECORD_WIDTH,
    RECORD_MAX,
    { weight: 800, min: 64 }
  );
  const sepWidth = estimateTextWidth(SEPARATOR, size, 800);
  const gap = size * 0.06;

  const side = (
    person: CardPerson,
    cx: number,
    id: string,
    leading: boolean
  ) => {
    const nameSize = fitFontSize(person.name, NAME_WIDTH, 40, {
      weight: 700,
      min: 26,
    });
    return group({}, [
      avatar({
        id,
        person,
        cx,
        cy: AVATAR_CY,
        r: AVATAR_R,
        // The accent belongs to whoever is ahead: one accent per card, and on
        // this card being ahead is the whole subject.
        ring: leading ? accent : undefined,
      }),
      text(truncateToWidth(person.name, NAME_WIDTH, nameSize, { weight: 700 }), {
        x: cx,
        y: NAME_BASELINE,
        size: nameSize,
        weight: 700,
        fill: leading ? CARD_TOKENS.ink : CARD_TOKENS.inkMuted,
        anchor: "middle",
      }),
    ]);
  };

  const number = (value: number, x: number, anchor: "start" | "end", fill: string) =>
    text(String(value), {
      x,
      y: RECORD_BASELINE,
      size,
      weight: 800,
      fill,
      anchor,
      tracking: -2,
      numeric: true,
    });

  return {
    title: `${a.name} ${formatRecord(wins, losses, ties)} ${
      b.name
    } · ${span} head-to-head`,
    content: [
      topRule(accent),
      eyebrow("Head to head", { x: CENTRE, y: 116, anchor: "middle" }),
      side(a, COLUMN, "a", wins > losses),
      side(b, CARD_WIDTH - COLUMN, "b", losses > wins),
      number(wins, CENTRE - sepWidth / 2 - gap, "end", CARD_TOKENS.win),
      text(SEPARATOR, {
        x: CENTRE,
        y: RECORD_BASELINE,
        size,
        weight: 800,
        fill: CARD_TOKENS.lineStrong,
        anchor: "middle",
      }),
      number(losses, CENTRE + sepWidth / 2 + gap, "start", CARD_TOKENS.loss),
      // Ties are rare enough that they do not get a third column; they are
      // appended small under the record rather than turned into "14–10–1" at
      // 132px, which would shrink the two numbers that matter to fit a 1.
      ties
        ? text(`${ties} tie${ties === 1 ? "" : "s"}`, {
            x: CENTRE,
            y: TIES_BASELINE,
            size: 28,
            weight: 700,
            fill: CARD_TOKENS.tie,
            anchor: "middle",
          })
        : "",
      streak
        ? pill(streak.toUpperCase(), {
            x: CENTRE,
            y: STREAK_TOP,
            fill: CARD_TOKENS.surfaceSunk,
            ink: CARD_TOKENS.ink,
            size: 26,
            height: 46,
            anchor: "middle",
          })
        : "",
      note
        ? noteLine(note, {
            x: CENTRE,
            y: NOTE_BASELINE,
            anchor: "middle",
            size: 28,
          })
        : "",
      footer({ meta: span, crest }),
    ].join(""),
  };
};
