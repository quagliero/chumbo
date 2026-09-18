import { loadPlayers, loadSeasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import type { CardNote } from "@/presentation/components/ShareCard/templates";
import type { ShareCard } from "@/presentation/components/ShareCard";

/**
 * Card factories for the share buttons (I4).
 *
 * Each returns the `() => Promise<ShareCard>` a `ShareButton` takes, so the
 * work happens on click: the templates, the renderer's image embedding and
 * `cardData` (which pulls in the crowns) are all dynamic imports. A page that
 * shows twenty season rows pays for none of it until somebody shares one.
 *
 * `cardData` is the same module the link previews read, so a card copied here
 * and the preview of the page it came from are built from the same numbers.
 */

const load = () =>
  Promise.all([
    import("@/presentation/components/ShareCard/templates"),
    import("@/presentation/components/ShareCard"),
    import("./cardData"),
    // Everything below reads matchups, and the manager stats name players.
    // A no-op on the pages that already loaded them, which is most of the
    // ones that show these buttons. This runs in a click handler, not a
    // render, so there is no Suspense to fall back on: a read of anything not
    // loaded here would throw `DataNotLoadedError` (A2b).
    loadSeasons(YEAR_NUMBERS),
    loadPlayers(),
  ]);

const CREST = "/images/logo.png";

/** One manager's season. `note` is the page's own E7 sentence, if any. */
export const managerSeasonShare =
  (managerId: string, year: number, note?: CardNote) =>
  async (): Promise<ShareCard> => {
    const [templates, { embedImage }, data] = await load();
    const season = data.managerSeasonData(managerId, year);
    if (!season) throw new Error(`No ${year} season for ${managerId}`);
    const [crest, avatar] = await Promise.all([
      embedImage(CREST),
      embedImage(season.avatarUrl),
    ]);
    return templates.managerSeasonCard({
      year,
      manager: { name: season.name, avatar },
      teamName: season.teamName,
      wins: season.wins,
      losses: season.losses,
      ties: season.ties,
      pointsFor: season.pointsFor,
      finish: season.finish,
      badge: season.badge,
      accent: season.accent,
      crest,
      note,
    });
  };

/** One manager's whole career. */
export const managerCareerShare =
  (managerId: string) => async (): Promise<ShareCard> => {
    const [templates, { embedImage }, data] = await load();
    const career = data.managerCareerData(managerId);
    if (!career) throw new Error(`No career for ${managerId}`);
    const [crest, avatar] = await Promise.all([
      embedImage(CREST),
      embedImage(career.avatarUrl),
    ]);
    return templates.managerCareerCard({
      manager: { name: career.name, avatar },
      teamName: career.teamName,
      firstYear: career.firstYear,
      lastYear: career.lastYear,
      wins: career.wins,
      losses: career.losses,
      ties: career.ties,
      titles: career.titles,
      bestFinish: career.bestFinish,
      seasons: career.seasons,
      accent: career.accent,
      crest,
    });
  };

/** A rivalry, from `a`'s side. */
export const h2hShare =
  (aId: string, bId: string, note?: CardNote) =>
  async (): Promise<ShareCard> => {
    const [templates, { embedImage }, data] = await load();
    const pair = data.h2hData(aId, bId);
    if (!pair) throw new Error(`No rivalry ${aId} vs ${bId}`);
    const [crest, avatarA, avatarB] = await Promise.all([
      embedImage(CREST),
      embedImage(pair.a.avatarUrl),
      embedImage(pair.b.avatarUrl),
    ]);
    return templates.h2hRecordCard({
      a: { name: pair.a.name, avatar: avatarA },
      b: { name: pair.b.name, avatar: avatarB },
      wins: pair.wins,
      losses: pair.losses,
      ties: pair.ties,
      span: pair.span,
      streak: pair.streak,
      accent: pair.accent,
      crest,
      note,
    });
  };

/** One week's recap (J2). `note` is the page's own E7 sentence, if any. */
export const weekRecapShare =
  (year: number, week: number, note?: CardNote) =>
  async (): Promise<ShareCard> => {
    const [templates, { embedImage }, data] = await load();
    const recap = data.weekRecapData(year, week);
    if (!recap) throw new Error(`No recap for ${year} week ${week}`);
    return templates.weekRecapCard({
      year,
      week,
      playoffs: recap.playoffs,
      rows: recap.rows,
      crest: await embedImage(CREST),
      note,
    });
  };

/** A game not yet played (K1). */
export const matchupPreviewShare =
  (year: number, week: number, matchupId: number) =>
  async (): Promise<ShareCard> => {
    const [templates, { embedImage }, data] = await load();
    const preview = data.matchupPreviewData(year, week, matchupId);
    if (!preview) throw new Error(`No preview for ${year} week ${week} #${matchupId}`);
    const [crest, avatarA, avatarB] = await Promise.all([
      embedImage(CREST),
      embedImage(preview.a.avatarUrl),
      embedImage(preview.b.avatarUrl),
    ]);
    return templates.matchupPreviewCard({
      year,
      week,
      a: { ...preview.a, avatar: avatarA },
      b: { ...preview.b, avatar: avatarB },
      wins: preview.wins,
      losses: preview.losses,
      ties: preview.ties,
      crest,
      note: preview.note ? { text: preview.note } : undefined,
    });
  };

/* ------------------------------------------------------------------ *
 * Players. The page already holds the numbers (`usePlayerStats`), so these
 * take them rather than walking history a second time.
 * ------------------------------------------------------------------ */

export interface PlayerSeasonShareInput {
  playerId: string;
  name: string;
  position?: string;
  imageUrl?: string;
  year: number;
  managers: string[];
  points: number;
  starts: number;
  games: number;
  best: number;
}

export const playerSeasonShare =
  (input: PlayerSeasonShareInput) => async (): Promise<ShareCard> => {
    const [templates, { embedImage }] = await load();
    const [crest, avatar] = await Promise.all([
      embedImage(CREST),
      embedImage(input.imageUrl),
    ]);
    return templates.playerSeasonCard({
      player: { name: input.name, avatar },
      year: input.year,
      position: input.position,
      managers: input.managers,
      points: input.points,
      starts: input.starts,
      games: input.games,
      best: input.best,
      crest,
    });
  };

export interface PlayerCareerShareInput {
  name: string;
  position?: string;
  imageUrl?: string;
  firstYear: number;
  lastYear: number;
  points: number;
  seasons: number;
  managers: number;
  best: number;
}

export const playerCareerShare =
  (input: PlayerCareerShareInput) => async (): Promise<ShareCard> => {
    const [templates, { embedImage }] = await load();
    const [crest, avatar] = await Promise.all([
      embedImage(CREST),
      embedImage(input.imageUrl),
    ]);
    return templates.playerCareerCard({
      player: { name: input.name, avatar },
      position: input.position,
      firstYear: input.firstYear,
      lastYear: input.lastYear,
      points: input.points,
      seasons: input.seasons,
      managers: input.managers,
      best: input.best,
      crest,
    });
  };
