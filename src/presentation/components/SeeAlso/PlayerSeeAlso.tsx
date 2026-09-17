/**
 * The player page's rail, wired up (E2).
 *
 * Takes the hooks' output as-is rather than recomputing anything: the page has
 * already walked every season for its tables, and a rail is a garnish on that,
 * not a second pass over it.
 */
import { getManagerIdBySleeperOwnerId } from "@/utils/managerUtils";
import type {
  DraftPick,
  PlayerPerformance,
  OwnerStats,
} from "@/presentation/components/PlayerDetail";
import { SeeAlso } from "./SeeAlso";
import { buildPlayerRail } from "./playerRail";
import { isRealPairing } from "./pairing";

export const PlayerSeeAlso = ({
  draftPicks,
  bestWeek,
  ownerStats,
}: {
  draftPicks: DraftPick[];
  bestWeek: PlayerPerformance | null;
  ownerStats: OwnerStats[];
}) => (
  <SeeAlso
    sections={buildPlayerRail({
      picks: draftPicks,
      bestWeek: bestWeek && {
        year: bestWeek.year,
        week: bestWeek.week,
        matchupId: bestWeek.matchupId,
        points: bestWeek.points,
        teamName: bestWeek.teamName,
        wasStarted: bestWeek.wasStarted,
      },
      owners: ownerStats,
      managerIdOf: (ownerId) => getManagerIdBySleeperOwnerId(ownerId) ?? null,
      isRealPairing,
    })}
  />
);
