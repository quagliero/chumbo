import { getPlayerImageUrl } from "@/utils/playerImage";

/** A player photo, or his initial where there is no photo to show. */
const PlayerAvatar = ({
  playerId,
  playerName,
  square = false,
}: {
  playerId: string;
  playerName: string;
  /** Team defences are crests, not headshots, and should not be circled. */
  square?: boolean;
}) => {
  const imageUrl = getPlayerImageUrl(playerId);

  return imageUrl ? (
    <img
      src={imageUrl}
      alt={`${playerName} photo`}
      className={`w-6 h-6 flex-none object-cover ${square ? "" : "rounded-full"}`}
      onError={(e) => {
        (e.target as HTMLImageElement).style.display = "none";
      }}
    />
  ) : (
    <div className="w-6 h-6 rounded-full bg-line flex items-center justify-center text-xs font-bold text-ink-muted">
      {(playerName || "?").charAt(0).toUpperCase()}
    </div>
  );
};

export default PlayerAvatar;
