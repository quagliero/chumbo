import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { YEARS } from "@/domain/constants";
import { getManagerAccent } from "@/domain/managerColors";
import { buildCareerTimeline } from "@/presentation/components/ManagerDetail/useCareerTimeline";
import { getFinalStandings } from "@/utils/finalStandings";
import { describeH2HStreak, getAllTimeH2HRecord } from "@/utils/h2h";
import { getManagerStats } from "@/utils/managerStats";
import { isSeasonSettled } from "@/utils/playoffUtils";
import { seasonBadge } from "@/utils/seasonBadge";
import { getTeamName } from "@/utils/teamName";
import { getUserAvatarUrl, getUserByOwnerId } from "@/utils/userAvatar";
import {
  buildMatchupPreview,
  stakesText,
  type MatchupPreview,
} from "@/utils/matchupPreview";
import type { WeekStakes } from "@/utils/playoffOdds";
import { buildWeekRecap, recapLines, type RecapLine } from "@/utils/weekRecap";

/**
 * What goes on a card, decided once (I4).
 *
 * The share buttons and the prerendered link previews (`scripts/og/routes.ts`)
 * both draw these cards, and they had drifted: the H2H button said "Every
 * regular season" and took no streak, while the preview of the same page said
 * "All time" and took its streak from a different walk of history with a
 * different threshold. Nobody would notice until two people shared the same
 * rivalry two ways and the cards disagreed.
 *
 * So both callers ask here, and differ only in how they get pixels: the page
 * embeds images with `embedImage`, the prerender with its own fetched map.
 * That is why these return avatar URLs rather than images — and why nothing
 * here touches the DOM: G6 runs it in Node.
 *
 * Every function here needs the matchups loaded. The pages call these from a
 * share button's card factory, after `loadSeasons`, so no page pays for them
 * until somebody shares; the prerender loads everything up front.
 */

type Manager = (typeof managers)[number];

const managerById = (id: string): Manager | undefined =>
  managers.find((m) => m.id === id);

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/** That season's picture — their team logo that year. */
export const avatarUrlFor = (year: number, ownerId: string): string | null =>
  getUserAvatarUrl(getUserByOwnerId(ownerId, seasons[year]?.users));

/** Their most recent picture, for a card that is not about one season. */
export const latestAvatarUrl = (ownerId: string): string | null => {
  for (const year of [...YEARS].sort((a, b) => b - a)) {
    const url = avatarUrlFor(year, ownerId);
    if (url) return url;
  }
  return null;
};

/** A season is settled once its final is played — the timeline's test. */
const isSettled = (year: number) => isSeasonSettled(seasons[year]);

/* ------------------------------------------------------------------ *
 * A manager's season
 * ------------------------------------------------------------------ */

export interface ManagerSeasonData {
  name: string;
  /** That season's logo, not today's: the card is about that year. */
  avatarUrl: string | null;
  teamName?: string;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  finish?: string;
  badge?: string;
  accent: string;
}

/**
 * One manager, one season, regular season only — whatever the page's data
 * mode is set to, because the card says "season" and the league's standings
 * are regular-season standings. Finish and badge only once the brackets have
 * settled it: nothing provisional earns a finishing position on a card.
 */
export const managerSeasonData = (
  managerId: string,
  year: number
): ManagerSeasonData | null => {
  const manager = managerById(managerId);
  const season = getManagerStats(managerId, "regular")?.seasonStats.find(
    (s) => s.year === year
  );
  if (!manager || !season) return null;

  const rosterId = seasons[year]?.rosters?.find(
    (r) => r.owner_id === manager.sleeper.id
  )?.roster_id;
  const settled = isSettled(year);
  const position =
    settled && rosterId !== undefined
      ? getFinalStandings(year).find((s) => s.rosterId === rosterId)?.position
      : undefined;

  return {
    name: manager.name,
    avatarUrl: avatarUrlFor(year, manager.sleeper.id),
    teamName: getTeamName(manager.sleeper.id, seasons[year]?.users),
    wins: season.wins,
    losses: season.losses,
    ties: season.ties,
    pointsFor: season.pointsFor,
    finish: position ? ordinal(position) : undefined,
    badge: settled ? seasonBadge(year, managerId) : undefined,
    accent: getManagerAccent(managerId),
  };
};

/* ------------------------------------------------------------------ *
 * A manager's career
 * ------------------------------------------------------------------ */

export interface ManagerCareerData {
  name: string;
  avatarUrl: string | null;
  teamName?: string;
  firstYear: number;
  lastYear: number;
  wins: number;
  losses: number;
  ties: number;
  titles: number;
  bestFinish: number | null;
  seasons: number;
  accent: string;
}

/**
 * The career, counted the way the manager page's trophy shelf counts it —
 * titles and best finish from the brackets via the same timeline — so the
 * card and the page it was copied from cannot disagree about a trophy.
 */
export const managerCareerData = (
  managerId: string
): ManagerCareerData | null => {
  const manager = managerById(managerId);
  const career = getManagerStats(managerId, "regular");
  if (!manager || !career || career.seasonStats.length === 0) return null;

  const timeline = buildCareerTimeline(managerId, career.seasonStats);
  const years = career.seasonStats.map((s) => s.year);
  const latest = Math.max(...years);

  return {
    name: manager.name,
    avatarUrl: latestAvatarUrl(manager.sleeper.id),
    teamName: getTeamName(manager.sleeper.id, seasons[latest]?.users),
    firstYear: Math.min(...years),
    lastYear: latest,
    wins: career.totalWins,
    losses: career.totalLosses,
    ties: career.totalTies,
    titles: timeline.titles,
    bestFinish: timeline.bestFinish,
    seasons: timeline.seasons.length,
    accent: getManagerAccent(managerId),
  };
};

/* ------------------------------------------------------------------ *
 * A rivalry
 * ------------------------------------------------------------------ */

export interface H2HData {
  a: { id: string; name: string; avatarUrl: string | null };
  b: { id: string; name: string; avatarUrl: string | null };
  wins: number;
  losses: number;
  ties: number;
  /** The record excludes playoffs, and the footer must say so. */
  span: string;
  streak?: string;
  /** Whoever leads; a level series gets none (the F2 rule). */
  accent?: string;
  meetings: number;
  avgA: number;
  avgB: number;
}

/** A pairing from `a`'s side. `null` if either is unknown. */
export const h2hData = (aId: string, bId: string): H2HData | null => {
  const a = managerById(aId);
  const b = managerById(bId);
  if (!a || !b) return null;

  const record = getAllTimeH2HRecord(a.sleeper.id, b.sleeper.id);
  const wins = record.team1Wins;
  const losses = record.team2Wins;

  return {
    a: { id: a.id, name: a.name, avatarUrl: latestAvatarUrl(a.sleeper.id) },
    b: { id: b.id, name: b.name, avatarUrl: latestAvatarUrl(b.sleeper.id) },
    wins,
    losses,
    ties: record.ties,
    // "All time · regular season" measures 436 and ellipsises in the footer's
    // 404px; this says both halves and fits.
    span: "Every regular season",
    streak: describeH2HStreak(record.games ?? [], a.name, b.name),
    accent:
      wins > losses
        ? getManagerAccent(a.id)
        : losses > wins
          ? getManagerAccent(b.id)
          : undefined,
    meetings: wins + losses + record.ties,
    avgA: record.team1AvgPoints,
    avgB: record.team2AvgPoints,
  };
};

/* ------------------------------------------------------------------ *
 * A week (J2)
 * ------------------------------------------------------------------ */

export interface WeekRecapData {
  year: number;
  week: number;
  playoffs: boolean;
  /** Every line, in order. The card draws the first four. */
  rows: RecapLine[];
}

export const weekRecapData = (year: number, week: number): WeekRecapData | null => {
  const recap = buildWeekRecap(year, week);
  if (!recap) return null;
  return { year, week, playoffs: recap.playoffs, rows: recapLines(recap) };
};

/* ------------------------------------------------------------------ *
 * A game not yet played (K1)
 * ------------------------------------------------------------------ */

export interface PreviewCardSideData {
  name: string;
  avatarUrl: string | null;
  record: string;
  stakes?: string;
}

export interface MatchupPreviewData {
  year: number;
  week: number;
  a: PreviewCardSideData;
  b: PreviewCardSideData;
  wins: number;
  losses: number;
  ties: number;
  /** The one sentence the card has room for: the streak, else what is on the line. */
  note?: string;
  preview: MatchupPreview;
}

const recordText = (w: number, l: number, t: number) =>
  t ? `${w}–${l}–${t}` : `${w}–${l}`;

export const matchupPreviewData = (
  year: number,
  week: number,
  matchupId: number,
  stakes?: Map<number, WeekStakes>
): MatchupPreviewData | null => {
  const preview = buildMatchupPreview(year, week, matchupId, stakes);
  if (!preview) return null;
  const [a, b] = preview.sides;
  const side = (s: typeof a): PreviewCardSideData => ({
    name: s.name,
    avatarUrl: avatarUrlFor(year, s.ownerId),
    record: recordText(s.wins, s.losses, s.ties),
    stakes: stakesText(s.stakes),
  });
  return {
    year,
    week,
    a: side(a),
    b: side(b),
    wins: preview.h2h.wins,
    losses: preview.h2h.losses,
    ties: preview.h2h.ties,
    note: preview.h2h.streak ?? preview.onTheLine[0],
    preview,
  };
};
