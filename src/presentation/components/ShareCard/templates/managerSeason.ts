/**
 * One manager's season (G2).
 *
 * The card you share off a manager page: who, what year, how it went. This is
 * the only one of the five that is genuinely about a person rather than an
 * event, which is why it is the one that gets the avatar large, the accent
 * ring, and the badge.
 *
 * ## Layout decisions
 *
 * **Three metrics and no more.** A season has a dozen numbers attached to it
 * and the manager page shows all of them; a card that tried would be the dense
 * table this format cannot carry. Record, points and finish are the three the
 * league argues about, and at 78px each they survive the thumbnail. Everything
 * else is a reason to click through, which is what the URL in the footer is
 * for.
 *
 * **Finish is a word where a word is what it means.** "1st" is a fact about
 * sorting; "CHAMPION" is the fact. So the metric shows the position and the
 * badge — passed in from `crowns.ts` / `finalStandings.ts` — says the title,
 * in the manager's own accent, top right where a rosette would go.
 *
 * **The badge is the one accent block.** Large type, ink from `onAccent`, so
 * it holds up on the yellow. The rest of the accent's work is the top rule and
 * the ring, per the F2 note.
 */

import { CARD_PADDING, CARD_WIDTH, type ShareCard } from "../card";
import { text } from "../svg";
import { fitFontSize, truncateToWidth } from "../text";
import { CARD_TOKENS } from "../tokens";
import {
  type CardChrome,
  type CardPerson,
  NEUTRAL_ACCENT,
  avatar,
  divider,
  eyebrow,
  footer,
  formatPoints,
  formatRecord,
  metric,
  noteLine,
  pill,
  topRule,
} from "./chrome";

export interface ManagerSeasonCardProps extends CardChrome {
  year: number;
  /** `name` is the manager, not the team — see `teamName` below. */
  manager: CardPerson;
  /**
   * That season's team name, if it is worth saying. The manager's name is the
   * stable identity (it is what `managers.json` calls them and what the league
   * calls them); the team name is a joke that changes every August, so it goes
   * underneath in smaller type rather than competing for the headline.
   */
  teamName?: string;
  wins: number;
  losses: number;
  ties?: number;
  /** Regular-season points for. */
  pointsFor: number;
  /**
   * Where they finished, as a word: "1st", "7th". From
   * `getFinalPosition` + an ordinal — the template does not compute it,
   * because "champion = 1" is a league rule that lives in
   * `src/utils/finalStandings.ts` and must not be re-decided here.
   */
  finish?: string;
  /** "CHAMPION", "TRIPLE CROWN", "SCUMBO" — from `crowns.ts`. */
  badge?: string;
}

const NAME_X = CARD_PADDING + 144;
const NAME_WIDTH = CARD_WIDTH - CARD_PADDING - NAME_X;
/** Three columns across the content width, with a gutter between them. */
const COLUMN_WIDTH = 320;
const COLUMNS = [CARD_PADDING, CARD_PADDING + 384, CARD_PADDING + 768];

export const managerSeasonCard = ({
  year,
  manager,
  teamName,
  wins,
  losses,
  ties = 0,
  pointsFor,
  finish,
  badge,
  accent = NEUTRAL_ACCENT,
  crest,
  note,
}: ManagerSeasonCardProps): ShareCard => {
  const nameSize = fitFontSize(manager.name, NAME_WIDTH, 80, {
    weight: 800,
    min: 40,
  });
  const record = formatRecord(wins, losses, ties);

  return {
    title: `${manager.name} · ${year} · ${record}${
      finish ? `, finished ${finish}` : ""
    }`,
    content: [
      topRule(accent),
      eyebrow(`${year} season`, { y: 116, width: 520 }),
      badge
        ? pill(badge.toUpperCase(), {
            x: CARD_WIDTH - CARD_PADDING,
            y: 88,
            fill: accent,
            anchor: "end",
          })
        : "",
      avatar({
        id: "manager",
        person: manager,
        cx: CARD_PADDING + 56,
        cy: 228,
        r: 56,
        ring: accent,
      }),
      text(truncateToWidth(manager.name, NAME_WIDTH, nameSize, { weight: 800 }), {
        x: NAME_X,
        y: teamName ? 216 : 228,
        size: nameSize,
        weight: 800,
        fill: CARD_TOKENS.ink,
        baseline: teamName ? undefined : "central",
      }),
      teamName
        ? text(truncateToWidth(teamName, NAME_WIDTH, 34, { weight: 600 }), {
            x: NAME_X,
            y: 264,
            size: 34,
            weight: 600,
            fill: CARD_TOKENS.inkMuted,
          })
        : "",
      divider(330),
      metric("Record", record, {
        x: COLUMNS[0],
        y: 460,
        width: COLUMN_WIDTH,
      }),
      metric("Points", formatPoints(pointsFor), {
        x: COLUMNS[1],
        y: 460,
        width: COLUMN_WIDTH,
      }),
      // Ink, not the accent. It is tempting to colour the finishing position
      // with the manager's hue — but the accent has to work on WHITE there,
      // and the league's yellow is 1.9:1 against white, which fails even the
      // 3:1 large-text floor. `onAccent` cannot help: it picks ink for text
      // ON the accent, and this is the other way round. So the accents stay on
      // the rule, the ring and the badge, where they are a fill and not a
      // foreground.
      metric("Finish", finish ?? "—", {
        x: COLUMNS[2],
        y: 460,
        width: COLUMN_WIDTH,
        fill: finish ? CARD_TOKENS.ink : CARD_TOKENS.inkFaint,
      }),
      note ? noteLine(note, { y: 512 }) : "",
      footer({ meta: `${year}`, crest }),
    ].join(""),
  };
};
