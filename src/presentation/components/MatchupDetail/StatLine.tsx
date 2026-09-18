import type { GamedayFile } from "@/data/gamedays";
import { formatStatLine } from "@/utils/statLine";

/**
 * What a player actually did that week (L1), under his name on the score
 * sheet: his NFL team that week and his box score. Renders nothing while the
 * week's box scores load, and nothing for a player with no stats — on a bye,
 * inactive, or in the one game the NFL abandoned (2022 week 17, Bills–
 * Bengals), which the play-by-play does not have.
 */
export const StatLine = ({
  gameday,
  playerId,
  position,
}: {
  gameday: GamedayFile | null | undefined;
  playerId: string | number;
  position: string;
}) => {
  const line = gameday?.players[String(playerId)];
  if (!line) return null;
  const text = formatStatLine(line, position);
  return (
    <div className="text-xs leading-snug text-ink-muted">
      {line.t && position !== "DEF" && (
        <span className="font-medium text-ink-faint">{line.t}</span>
      )}
      {line.t && position !== "DEF" && text && " · "}
      {text}
    </div>
  );
};
