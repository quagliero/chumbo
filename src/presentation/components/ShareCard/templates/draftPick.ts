/**
 * A draft pick (G2).
 *
 * "Round 1, pick 3" is a coordinate, and the league's draft arguments are all
 * about coordinates: who was available, who took whom, what it was worth. So
 * the pick number is the hero, not the player — the player is the punchline.
 *
 * ## Layout decisions
 *
 * **The pick number goes in an accent block.** `1.03` in 92px on a filled
 * rounded rect, ink from `onAccent`. This is the sanctioned accent-as-block
 * use, it makes the card recognisable as a draft card from across the thread,
 * and it gives the whole layout an anchor that does not move when a player's
 * name is one word or four.
 *
 * **"1.03", not "Round 1, Pick 3".** It is how every draft board in the world
 * writes it, including this one, and it is four characters instead of sixteen
 * — which is the difference between 92px and unreadable. The long form is in
 * the block underneath at 26px for anyone who needs it.
 *
 * **Who drafted him is the bottom third, not the headline.** A pick belongs to
 * a manager, but the reason the card is being shared is the player. So the
 * manager sits under a rule with a small avatar: present, attributable, not
 * competing.
 */

import { CARD_PADDING, CARD_WIDTH, type ShareCard } from "../card";
import { group, rect, text } from "../svg";
import { fitFontSize, truncateToWidth } from "../text";
import { CARD_TOKENS, onAccent, onAccentMuted } from "../tokens";
import {
  type CardChrome,
  type CardPerson,
  NEUTRAL_ACCENT,
  avatar,
  divider,
  eyebrow,
  footer,
  fitValue,
  noteLine,
  topRule,
} from "./chrome";

export interface DraftPickCardProps extends CardChrome {
  year: number;
  round: number;
  /** The pick within the round — 3 in "1.03". */
  pickInRound: number;
  /** Overall pick number, if known. Shown small, inside the block. */
  overall?: number;
  player: {
    name: string;
    /** "RB", "QB". */
    position?: string;
    /** NFL team abbreviation at the time of the pick. */
    team?: string;
  };
  /** Who made the pick. `name` is the manager or their team. */
  manager: CardPerson;
}

const BLOCK = { x: CARD_PADDING, y: 168, width: 270, height: 206 } as const;
const PLAYER_X = BLOCK.x + BLOCK.width + 40;
const PLAYER_WIDTH = CARD_WIDTH - CARD_PADDING - PLAYER_X;

/** "1.03" — zero-padded, because a draft board is a column of them. */
export const formatPickLabel = (round: number, pickInRound: number): string =>
  `${round}.${String(pickInRound).padStart(2, "0")}`;

export const draftPickCard = ({
  year,
  round,
  pickInRound,
  overall,
  player,
  manager,
  accent = NEUTRAL_ACCENT,
  crest,
  note,
}: DraftPickCardProps): ShareCard => {
  const pick = formatPickLabel(round, pickInRound);
  const pickSize = fitValue(pick, BLOCK.width - 40, 92, 52);
  const nameSize = fitFontSize(player.name, PLAYER_WIDTH, 86, {
    weight: 800,
    min: 40,
  });
  const line = [player.position, player.team].filter(Boolean).join(" · ");

  return {
    title: `${pick} ${player.name} — ${manager.name}, ${year} draft`,
    content: [
      topRule(accent),
      eyebrow(`${year} draft`, { y: 116 }),
      group({}, [
        rect({ ...BLOCK, rx: 28, fill: accent }),
        text(truncateToWidth(pick, BLOCK.width - 40, pickSize, { weight: 800 }), {
          x: BLOCK.x + BLOCK.width / 2,
          y: BLOCK.y + 104,
          size: pickSize,
          weight: 800,
          fill: onAccent(accent),
          anchor: "middle",
          baseline: "central",
          numeric: true,
          tracking: -2,
        }),
        text(
          overall === undefined
            ? `ROUND ${round}, PICK ${pickInRound}`
            : `OVERALL ${overall}`,
          {
            x: BLOCK.x + BLOCK.width / 2,
            y: BLOCK.y + 168,
            size: 26,
            weight: 700,
            tracking: 1,
            fill: onAccentMuted(accent),
            anchor: "middle",
          }
        ),
      ]),
      text(truncateToWidth(player.name, PLAYER_WIDTH, nameSize, { weight: 800 }), {
        x: PLAYER_X,
        y: 250,
        size: nameSize,
        weight: 800,
        fill: CARD_TOKENS.ink,
      }),
      line
        ? eyebrow(line, {
            x: PLAYER_X,
            y: 300,
            width: PLAYER_WIDTH,
            size: 32,
            fill: CARD_TOKENS.inkMuted,
          })
        : "",
      note ? noteLine(note, { x: PLAYER_X, y: 358, width: PLAYER_WIDTH }) : "",
      divider(414),
      avatar({
        id: "drafter",
        person: manager,
        cx: CARD_PADDING + 36,
        cy: 470,
        r: 36,
        ring: accent,
      }),
      eyebrow("Drafted by", { x: CARD_PADDING + 96, y: 456, width: 400, size: 24 }),
      text(
        truncateToWidth(manager.name, CARD_WIDTH - CARD_PADDING * 2 - 96, 42, {
          weight: 700,
        }),
        {
          x: CARD_PADDING + 96,
          y: 500,
          size: 42,
          weight: 700,
          fill: CARD_TOKENS.ink,
        }
      ),
      footer({ meta: `${year} draft`, crest }),
    ].join(""),
  };
};
