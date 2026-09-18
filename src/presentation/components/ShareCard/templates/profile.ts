/**
 * A person, a span, and three numbers (I4).
 *
 * `managerSeasonCard`'s layout with the words taken out, because three more
 * cards wanted exactly that shape: a manager's career, a player's season, a
 * player's career. Writing each as its own template would be the "ten
 * different card treatments" the chrome module exists to prevent; writing
 * them as `managerSeasonCard` with its labels bent would put "Record" over a
 * running back's points. So the labels are inputs here, and the three named
 * builders below are the only callers — a page never assembles a profile card
 * by hand, which keeps the metric choices in one reviewable place.
 *
 * Same grid as the season card, deliberately: shared side by side in a
 * thread, a career card and a season card should read as a set.
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
  eyebrow as eyebrowText,
  footer,
  formatPoints,
  formatRecord,
  metric,
  noteLine,
  pill,
  topRule,
} from "./chrome";

export interface ProfileMetric {
  label: string;
  value: string;
}

export interface ProfileCardProps extends CardChrome {
  /** Small caps above the name: "Career · 2012–2025", "2018 season · RB". */
  eyebrow: string;
  person: CardPerson;
  /** The line under the name, in smaller type. */
  subtitle?: string;
  metrics: readonly [ProfileMetric, ProfileMetric, ProfileMetric];
  /** Top right, in the accent: "3× CHAMPION", "TRIPLE CROWN". */
  badge?: string;
  /** The footer's coordinates, e.g. "2012–2025". */
  meta: string;
  /** The card's one-line text equivalent, for alt text and the file name. */
  title: string;
}

const NAME_X = CARD_PADDING + 144;
const NAME_WIDTH = CARD_WIDTH - CARD_PADDING - NAME_X;
const COLUMN_WIDTH = 320;
const COLUMNS = [CARD_PADDING, CARD_PADDING + 384, CARD_PADDING + 768];

export const profileCard = ({
  eyebrow,
  person,
  subtitle,
  metrics,
  badge,
  meta,
  title,
  accent = NEUTRAL_ACCENT,
  crest,
  note,
}: ProfileCardProps): ShareCard => {
  const nameSize = fitFontSize(person.name, NAME_WIDTH, 80, {
    weight: 800,
    min: 40,
  });

  return {
    title,
    content: [
      topRule(accent),
      eyebrowText(eyebrow, { y: 116, width: 620 }),
      badge
        ? pill(badge.toUpperCase(), {
            x: CARD_WIDTH - CARD_PADDING,
            y: 88,
            fill: accent,
            anchor: "end",
          })
        : "",
      avatar({
        id: "profile",
        person,
        cx: CARD_PADDING + 56,
        cy: 228,
        r: 56,
        ring: accent,
      }),
      text(truncateToWidth(person.name, NAME_WIDTH, nameSize, { weight: 800 }), {
        x: NAME_X,
        y: subtitle ? 216 : 228,
        size: nameSize,
        weight: 800,
        fill: CARD_TOKENS.ink,
        baseline: subtitle ? undefined : "central",
      }),
      subtitle
        ? text(truncateToWidth(subtitle, NAME_WIDTH, 34, { weight: 600 }), {
            x: NAME_X,
            y: 264,
            size: 34,
            weight: 600,
            fill: CARD_TOKENS.inkMuted,
          })
        : "",
      divider(330),
      // Ink, never the accent, for the same contrast reason as the season
      // card: the accent is a fill here, not a foreground on white.
      ...metrics.map((m, index) =>
        metric(m.label, m.value, {
          x: COLUMNS[index],
          y: 460,
          width: COLUMN_WIDTH,
        })
      ),
      note ? noteLine(note, { y: 512 }) : "",
      footer({ meta, crest }),
    ].join(""),
  };
};

const span = (from: number, to: number) =>
  from === to ? `${from}` : `${from}–${to}`;

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/* ------------------------------------------------------------------ *
 * The three builders. Flat primitives in, as every template: G6 renders the
 * manager one in Node for the link preview of a manager page.
 * ------------------------------------------------------------------ */

export interface ManagerCareerCardProps extends CardChrome {
  manager: CardPerson;
  /** Their current team name. */
  teamName?: string;
  firstYear: number;
  lastYear: number;
  wins: number;
  losses: number;
  ties?: number;
  titles: number;
  /** Best settled finish, 1 = champion. */
  bestFinish: number | null;
  /** Seasons in the league. */
  seasons: number;
}

/**
 * A manager's whole career. Record, titles, best finish — the three a career
 * is argued over. The badge counts titles, because "3×" is the fact a career
 * card exists to carry and a number in the metric row undersells it.
 */
export const managerCareerCard = ({
  manager,
  teamName,
  firstYear,
  lastYear,
  wins,
  losses,
  ties = 0,
  titles,
  bestFinish,
  seasons,
  ...chrome
}: ManagerCareerCardProps): ShareCard => {
  const years = span(firstYear, lastYear);
  const record = formatRecord(wins, losses, ties);
  return profileCard({
    ...chrome,
    eyebrow: `Career · ${seasons} season${seasons === 1 ? "" : "s"}`,
    person: manager,
    subtitle: teamName,
    metrics: [
      { label: "Record", value: record },
      { label: "Titles", value: String(titles) },
      {
        label: "Best finish",
        value: bestFinish === null ? "—" : ordinal(bestFinish),
      },
    ],
    badge: titles > 1 ? `${titles}× Champion` : titles === 1 ? "Champion" : undefined,
    meta: years,
    title: `${manager.name} · career ${years} · ${record}, ${titles} title${
      titles === 1 ? "" : "s"
    }`,
  });
};

export interface PlayerSeasonCardProps extends CardChrome {
  player: CardPerson;
  year: number;
  position?: string;
  /** Who had him: "for thd", "for thd and sol". */
  managers: string[];
  /** Everything he scored in the Chumbo that season, bench included. */
  points: number;
  starts: number;
  games: number;
  /** His best single week. */
  best: number;
}

/** One player's Chumbo season: what he scored, for whom, and his best week. */
export const playerSeasonCard = ({
  player,
  year,
  position,
  managers,
  points,
  starts,
  games,
  best,
  ...chrome
}: PlayerSeasonCardProps): ShareCard =>
  profileCard({
    ...chrome,
    eyebrow: `${year} season${position ? ` · ${position}` : ""}`,
    person: player,
    subtitle: managers.length ? `For ${managers.join(", ")}` : undefined,
    metrics: [
      { label: "Points", value: formatPoints(points) },
      { label: "Started", value: `${starts} of ${games}` },
      { label: "Best week", value: formatPoints(best) },
    ],
    meta: `${year}`,
    title: `${player.name} · ${year} · ${formatPoints(points)} points`,
  });

export interface PlayerCareerCardProps extends CardChrome {
  player: CardPerson;
  position?: string;
  firstYear: number;
  lastYear: number;
  points: number;
  seasons: number;
  /** Distinct managers who rostered him. */
  managers: number;
  best: number;
}

/** A player's whole Chumbo career — not his NFL one: the points he scored here. */
export const playerCareerCard = ({
  player,
  position,
  firstYear,
  lastYear,
  points,
  seasons,
  managers,
  best,
  ...chrome
}: PlayerCareerCardProps): ShareCard => {
  const years = span(firstYear, lastYear);
  return profileCard({
    ...chrome,
    eyebrow: `Chumbo career${position ? ` · ${position}` : ""}`,
    person: player,
    subtitle: `${seasons} season${seasons === 1 ? "" : "s"}, ${managers} manager${
      managers === 1 ? "" : "s"
    }`,
    metrics: [
      { label: "Points", value: formatPoints(points) },
      { label: "Seasons", value: String(seasons) },
      { label: "Best week", value: formatPoints(best) },
    ],
    meta: years,
    title: `${player.name} · Chumbo career ${years} · ${formatPoints(points)} points`,
  });
};
