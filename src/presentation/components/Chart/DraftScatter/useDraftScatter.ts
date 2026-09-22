import { useMemo } from "react";
import { getPlayer, seasons } from "@/data";
import { YEAR_NUMBERS } from "@/domain/constants";
import { hasIncompleteBench } from "@/domain/dataQuality";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import { getStatContext } from "@/utils/stats/traverse";
import {
  scoreDraftPicks,
  withBaseline,
  type DraftPick,
  type ValuedPick,
} from "./draftValue";

/** One mark on the scatter: a pick, what it returned, and who it was. */
export interface DraftScatterPoint extends ValuedPick {
  /** Display name, or the raw id for a defence with no `full_name`. */
  name: string;
  position: string;
  /** Internal manager id (`thd`) of whoever made the pick. */
  managerId: string;
  /**
   * True where the per-player scoring behind this point is a reconstruction
   * rather than a record — 2019 only (`domain/dataQuality.ts`). Marked on the
   * chart rather than dropped: see the component.
   */
  approximate: boolean;
}

/** Defences carry no `full_name`, so fall back to the two halves. */
const playerName = (playerId: string, year: number): string => {
  const player = getPlayer(playerId, year);
  if (!player) return playerId;
  const joined = `${player.first_name ?? ""} ${player.last_name ?? ""}`.trim();
  return player.full_name?.trim() || joined || playerId;
};

/**
 * Positions, in the order a fantasy manager reads them rather than
 * alphabetically. Anything outside this list — there is exactly one, a 2012
 * pick the dictionary calls a DB — is appended after them, so a stray
 * classification is still reachable from the filter instead of disappearing.
 */
const POSITION_ORDER = ["QB", "RB", "WR", "TE", "K", "DEF"];

/**
 * Every scored pick in league history, ready to plot (D6).
 *
 * The heavy lifting is in `draftValue.ts`, which is pure and tested; this
 * hook is only the join to the data layer — the flattened game list, the
 * drafts, the player dictionary and the manager identities.
 */
export const useDraftScatter = () => {
  // The matchups are a lazy chunk (A2a); suspend until every season is in.
  useAllSeasons();

  // No dependencies: by the time the hook returns, every season is loaded and
  // nothing below reads a prop or state.
  return useMemo(() => {
    const { games } = getStatContext();

    const drafts = new Map<number, DraftPick[]>();
    // The two fields the scoring does not need but the marks do, kept beside
    // the picks so neither costs a second walk of the raw drafts.
    const extras = new Map<string, { managerId: string; position: string }>();

    for (const year of YEAR_NUMBERS) {
      const picks = seasons[year]?.picks;
      if (!picks?.length) continue;

      drafts.set(
        year,
        picks.map((pick) => {
          const playerId = String(pick.player_id);
          extras.set(`${year}-${pick.pick_no}`, {
            managerId:
              getManagerIdBySleeperOwnerId(pick.picked_by) ??
              String(pick.roster_id),
            // 2012-2018 picks carry the position the player was drafted at;
            // from 2019 they do not, so the dictionary — with that season's
            // overlay, since Sleeper reclassifies people — answers instead.
            position:
              pick.position || getPlayer(playerId, year)?.position || "UNK",
          });
          return {
            year,
            round: pick.round,
            pickNo: pick.pick_no,
            playerId,
            rosterId: pick.roster_id,
          };
        })
      );
    }

    const points: DraftScatterPoint[] = withBaseline(
      scoreDraftPicks(games, drafts)
    ).map((pick) => {
      const extra = extras.get(`${pick.year}-${pick.pickNo}`);
      return {
        ...pick,
        name: playerName(pick.playerId, pick.year),
        position: extra?.position ?? "UNK",
        managerId: extra?.managerId ?? "",
        approximate: hasIncompleteBench(pick.year),
      };
    });

    const present = new Set(points.map((point) => point.position));
    const positions = [
      ...POSITION_ORDER.filter((position) => present.has(position)),
      ...[...present].filter((p) => !POSITION_ORDER.includes(p)).sort(),
    ];

    const years = [...new Set(points.map((point) => point.year))].sort(
      (a, b) => a - b
    );

    return { points, positions, years };
  }, []);
};
