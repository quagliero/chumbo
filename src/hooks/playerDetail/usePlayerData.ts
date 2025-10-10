import { useMemo } from "react";
import { getPlayer, seasons } from "@/data";
import managers from "@/data/managers.json";
import { getPlayerPositionFromMatchups } from "@/utils/playerDataUtils";

export interface PlayerNickname {
  nickname: string;
  managerName: string;
  year: number;
}

export const usePlayerData = (playerId: string | undefined) => {
  const player = useMemo(() => {
    if (!playerId) return null;
    const playerData = getPlayer(playerId);

    // If player has unknown position, try to get it from matchup data
    if (playerData && playerData.position === "UNK") {
      const positionFromMatchups = getPlayerPositionFromMatchups(playerId);
      if (positionFromMatchups !== "UNK") {
        return {
          ...playerData,
          position: positionFromMatchups,
          fantasy_positions: [positionFromMatchups],
        };
      }
    }

    return playerData;
  }, [playerId]);

  const allNicknames = useMemo(() => {
    if (!playerId) return [];

    const nicknames: PlayerNickname[] = [];

    Object.entries(seasons).forEach(([yearStr, seasonData]) => {
      const year = parseInt(yearStr);
      seasonData.rosters?.forEach((roster) => {
        if (roster.metadata) {
          const nicknameKey = `p_nick_${playerId}`;
          const nickname = roster.metadata[nicknameKey];
          if (nickname && nickname.trim() !== "") {
            const manager = managers.find(
              (m) => m.sleeper.id === roster.owner_id
            );
            if (manager) {
              nicknames.push({
                nickname: nickname.trim(),
                managerName: manager.name,
                year,
              });
            }
          }
        }
      });
    });

    // Get all unique nicknames with their manager and year info for the header
    return nicknames.reduce((acc, item) => {
      const existing = acc.find((n) => n.nickname === item.nickname);
      if (!existing) {
        acc.push({
          nickname: item.nickname,
          managerName: item.managerName,
          year: item.year,
        });
      }
      return acc;
    }, [] as PlayerNickname[]);
  }, [playerId]);

  return {
    player,
    allNicknames,
  };
};
