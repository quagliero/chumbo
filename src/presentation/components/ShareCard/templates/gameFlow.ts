/**
 * How the week unfolded (L2).
 *
 * The only card that is a picture rather than a list of facts. Every other
 * template answers its question in words and numbers; this one answers "what
 * kind of game was it?" with a shape — two lines climbing all week, crossing
 * or not crossing, one of them jumping at 11pm on Monday. That shape survives
 * WhatsApp's thumbnail, where a row of 30px type does not, which is the whole
 * argument for drawing it.
 *
 * ## Layout decisions
 *
 * **The sentence goes above the chart, not below it.** It is the caption that
 * tells you what you are looking at ("Four lead changes. sol went ahead for
 * good on Monday night"), and a caption underneath is read after the reader
 * has already given up on the picture.
 *
 * **The lines are the series palette, not the managers' accents.** Two
 * manager accents on one picture is exactly what the F2 note rules out, and a
 * chart needs its two colours to be distinguishable from each other rather
 * than meaningful on their own. They are the same blue and orange the chart on
 * the site uses, so the card and the page are the same picture. The card's one
 * accent — the top rule, and the ring on the decisive moment — is the
 * winner's.
 *
 * **The names sit at the ends of their own lines.** That is the legend, and it
 * is free: a reader who follows a line arrives at the name and the final
 * score. A separate key would cost a row and say less.
 *
 * **Positions arrive as 0..1.** The caller squeezes the dead hours out of the
 * week (`squeezedTime`, the same function the page's chart uses), so the card
 * cannot draw a different shape from the page it came from, and this file
 * needs no clock.
 */

import { CARD_PADDING, CARD_WIDTH, type ShareCard } from "../card";
import { circle, group, line, path, text, textLines } from "../svg";
import { fitFontSize, truncateToWidth, wrapToWidth } from "../text";
import { CARD_TOKENS } from "../tokens";
import {
  type CardChrome,
  CONTENT_WIDTH,
  NEUTRAL_ACCENT,
  eyebrow,
  footer,
  formatScore,
  noteLine,
  seasonMeta,
  topRule,
} from "./chrome";

/** One moment in a team's week. */
export interface GameFlowCardPoint {
  /** Where in the week it happened, 0 (first score) to 1 (last). */
  at: number;
  /** That team's total after it. */
  score: number;
  /** A touchdown, or anything worth more than 5 — drawn as a dot. */
  key?: boolean;
}

export interface GameFlowCardSide {
  /** The manager, as the chart names them. */
  name: string;
  /** The final score. Not derived from the points: a card states the official one. */
  score: number;
  points: readonly GameFlowCardPoint[];
}

export interface GameFlowCardProps extends CardChrome {
  year: number;
  week: number;
  /** In drawing order; the first is blue, the second orange. */
  teams: readonly [GameFlowCardSide, GameFlowCardSide];
  /** `describeFlow`'s sentence — the same one the page prints. */
  story: string;
  /** Where the winner went ahead for good, 0..1, and which side they are. */
  decided?: { at: number; side: 0 | 1 };
  /** Parts of the week, for the dividers: { at, label: "SUN" }. */
  slots?: readonly { at: number; label: string }[];
}

/** The site's two-series palette (`Chart/GameFlow`), kept in step by hand. */
export const FLOW_COLOURS = ["#2a78d6", "#eb6834"] as const;

/** Room to the right of the plot for a name and its final score. */
const LABEL_WIDTH = 210;
const PLOT_LEFT = CARD_PADDING;
const PLOT_RIGHT = CARD_WIDTH - CARD_PADDING - LABEL_WIDTH;
const PLOT_TOP = 252;
const PLOT_BOTTOM = 458;
const SLOT_LABEL_Y = 492;

/** Two names one above the other need this much room not to touch. */
const LABEL_GAP = 78;

/**
 * Where a name-and-score label may sit. Not the plot: the label is two lines
 * tall, so its anchor has to stay far enough inside for the name above it to
 * clear the sentence.
 */
const LABEL_BAND = { top: PLOT_TOP + 42, bottom: PLOT_BOTTOM + 6 } as const;

const STORY_SIZE = 38;
const STORY_LINE = 46;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

export const gameFlowCard = ({
  year,
  week,
  teams,
  story,
  decided,
  slots = [],
  accent = NEUTRAL_ACCENT,
  crest,
  note,
}: GameFlowCardProps): ShareCard => {
  // Headroom, so the winning line does not run along the top edge of its own
  // plot — where it reads as clipped rather than as finished.
  const top =
    Math.max(
      1,
      ...teams.flatMap((team) => team.points.map((point) => point.score)),
      ...teams.map((team) => team.score)
    ) * 1.06;
  // Nobody scores below zero over a whole week, but a lineup can dip there for
  // an hour, and a line drawn off the bottom of the plot is a line that lies.
  const floor = Math.min(
    0,
    ...teams.flatMap((team) => team.points.map((point) => point.score))
  );

  const x = (at: number) =>
    PLOT_LEFT + clamp(at, 0, 1) * (PLOT_RIGHT - PLOT_LEFT);
  const y = (score: number) =>
    PLOT_BOTTOM -
    ((score - floor) / (top - floor || 1)) * (PLOT_BOTTOM - PLOT_TOP);

  /** A step line: along to the moment, then up by what was scored. */
  const stepPath = (side: GameFlowCardSide) => {
    let d = `M${PLOT_LEFT},${y(0)}`;
    let last = 0;
    for (const point of side.points) {
      d += `H${x(point.at)}V${y(point.score)}`;
      last = point.score;
    }
    return `${d}H${PLOT_RIGHT}V${y(last)}`;
  };

  // Where each name sits: at the end of its line, pushed apart when the two
  // finish level, and then the PAIR moved back inside the band. Clamping each
  // one first and then pushing them apart is the version that shipped to the
  // harness, and on a game decided by 0.68 it pushed the winner's name up out
  // of the plot and into the sentence.
  const [above, below] =
    teams[0].score >= teams[1].score ? ([0, 1] as const) : ([1, 0] as const);
  let hi = y(teams[above].score);
  let lo = y(teams[below].score);
  if (lo - hi < LABEL_GAP) {
    const middle = (hi + lo) / 2;
    hi = middle - LABEL_GAP / 2;
    lo = middle + LABEL_GAP / 2;
  }
  const shift =
    hi < LABEL_BAND.top
      ? LABEL_BAND.top - hi
      : lo > LABEL_BAND.bottom
        ? LABEL_BAND.bottom - lo
        : 0;
  const ends = [] as unknown as [number, number];
  ends[above] = hi + shift;
  ends[below] = lo + shift;

  const storyLines = wrapToWidth(story, CONTENT_WIDTH, STORY_SIZE, {
    weight: 700,
    maxLines: 2,
  });

  const nameSize = (name: string) =>
    fitFontSize(name, LABEL_WIDTH - 16, 30, { weight: 700, min: 22 });

  const decidedAt = decided ? x(decided.at) : null;
  const decidedPoint = decided
    ? teams[decided.side].points.reduce<GameFlowCardPoint | null>(
        (found, point) => (point.at <= decided.at ? point : found),
        null
      )
    : null;

  return {
    title: `${teams[0].name} ${formatScore(teams[0].score)} – ${formatScore(
      teams[1].score
    )} ${teams[1].name}, ${seasonMeta(year, week)}: ${story}`,
    content: [
      topRule(accent),
      eyebrow("How the week unfolded", { y: 96 }),
      textLines(storyLines, {
        x: CARD_PADDING,
        y: 158,
        size: STORY_SIZE,
        weight: 700,
        fill: CARD_TOKENS.ink,
        lineHeight: STORY_LINE,
      }),

      // The parts of the week, behind everything: Thursday night, Sunday, the
      // late games, Sunday night, Monday night.
      ...slots.map(({ at, label }) =>
        group({}, [
          line({
            x1: x(at),
            x2: x(at),
            y1: PLOT_TOP,
            y2: PLOT_BOTTOM,
            stroke: CARD_TOKENS.line,
            "stroke-width": 2,
          }),
          text(truncateToWidth(label.toUpperCase(), 140, 26, { weight: 700 }), {
            x: x(at) + 8,
            y: SLOT_LABEL_Y,
            size: 26,
            weight: 700,
            tracking: 2,
            fill: CARD_TOKENS.inkFaint,
          }),
        ])
      ),
      line({
        x1: PLOT_LEFT,
        x2: CARD_WIDTH - CARD_PADDING,
        y1: PLOT_BOTTOM,
        y2: PLOT_BOTTOM,
        stroke: CARD_TOKENS.lineStrong,
        "stroke-width": 2,
      }),

      // The moment the winner went ahead for good, marked where the sentence
      // says it happened. Dotted, so it reads as an annotation on the picture
      // rather than as another part of the week.
      decidedAt !== null
        ? line({
            x1: decidedAt,
            x2: decidedAt,
            y1: PLOT_TOP,
            y2: PLOT_BOTTOM,
            stroke: accent,
            "stroke-width": 3,
            "stroke-dasharray": "8 8",
            opacity: 0.6,
          })
        : "",

      ...teams.map((team, side) =>
        path({
          d: stepPath(team),
          fill: "none",
          stroke: FLOW_COLOURS[side],
          // Fat: at thumbnail width this is under a pixel at the site's 2.25.
          "stroke-width": 6,
          "stroke-linejoin": "round",
        })
      ),

      // Key plays. Small enough not to become the subject, present enough that
      // a quiet Thursday and a frantic Sunday look different.
      ...teams.flatMap((team, side) =>
        team.points
          .filter((point) => point.key)
          .map((point) =>
            circle({
              cx: x(point.at),
              cy: y(point.score),
              r: 7,
              fill: FLOW_COLOURS[side],
              stroke: CARD_TOKENS.surface,
              "stroke-width": 3,
            })
          )
      ),
      decidedAt !== null && decidedPoint
        ? circle({
            cx: decidedAt,
            cy: y(decidedPoint.score),
            r: 13,
            fill: "none",
            stroke: accent,
            "stroke-width": 5,
          })
        : "",

      ...teams.map((team, side) =>
        group({}, [
          text(
            truncateToWidth(team.name, LABEL_WIDTH - 16, nameSize(team.name), {
              weight: 700,
            }),
            {
              x: PLOT_RIGHT + 18,
              y: ends[side] - 14,
              size: nameSize(team.name),
              weight: 700,
              fill: CARD_TOKENS.inkMuted,
            }
          ),
          text(formatScore(team.score), {
            x: PLOT_RIGHT + 18,
            y: ends[side] + 30,
            size: 46,
            weight: 800,
            fill: FLOW_COLOURS[side],
            numeric: true,
          }),
        ])
      ),

      note ? noteLine(note, { y: 530, size: 28 }) : "",
      footer({ meta: seasonMeta(year, week), crest }),
    ].join(""),
  };
};

/**
 * The plot, for the test that no line escapes it. A line drawn outside its box
 * does not clip — SVG has no overflow here — it simply runs across the
 * sentence, and nothing but a person looking at the card would notice.
 */
export const GAME_FLOW_PLOT = {
  left: PLOT_LEFT,
  right: PLOT_RIGHT,
  top: PLOT_TOP,
  bottom: PLOT_BOTTOM,
} as const;

/** The box a name is fitted into, for the overflow test. */
export const GAME_FLOW_LABEL_BOX = {
  x: PLOT_RIGHT + 18,
  width: LABEL_WIDTH - 16,
} as const;
