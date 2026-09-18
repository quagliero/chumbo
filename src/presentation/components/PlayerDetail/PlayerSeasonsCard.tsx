import { useMemo } from "react";
import { useFormatter } from "use-intl";
import { Card, CardHeader } from "@/presentation/components/Card";
import { SeasonLink } from "@/presentation/components/Links";
import { ShareButton } from "@/presentation/components/ShareButton";
import { playerSeasonShare } from "@/presentation/shareCards/factories";
import type { PlayerPerformance } from "./PerformanceTable";
import { playerSeasons } from "./playerSeasons";

/**
 * A player's Chumbo, one line a season (I4).
 *
 * The page had career totals and a week-by-week table and nothing in
 * between, so there was no "season" to share. Each row now is one, with its
 * card at the end of the row — the placement rule every share control on the
 * site follows. The numbers are counted as the totals above are counted; see
 * `playerSeasons.ts`.
 */
export const PlayerSeasonsCard = ({
  playerId,
  name,
  position,
  imageUrl,
  performances,
}: {
  playerId: string;
  name: string;
  position?: string;
  imageUrl?: string;
  performances: readonly PlayerPerformance[];
}) => {
  const { number } = useFormatter();
  const rows = useMemo(() => playerSeasons(performances), [performances]);
  if (rows.length === 0) return null;

  return (
    <Card padding="none">
      <CardHeader
        title="By season"
        subtitle="Points from the weeks he was started, as in the totals above."
      />
      <ol className="divide-y divide-line border-t border-line">
        {rows.map((row) => (
          <li
            key={row.year}
            className="flex items-center gap-3 px-6 py-2.5 text-sm"
          >
            <SeasonLink
              year={row.year}
              className="w-12 flex-none font-numeric font-semibold tabular-nums text-ink hover:underline"
            >
              {row.year}
            </SeasonLink>
            <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-3 gap-y-0.5">
              <span className="font-numeric font-semibold tabular-nums text-ink">
                {number(row.points, { maximumFractionDigits: 1 })} pts
              </span>
              <span className="font-numeric tabular-nums text-ink-muted">
                started {row.starts} of {row.games}
              </span>
              <span className="font-numeric tabular-nums text-ink-faint">
                best {number(row.best, { maximumFractionDigits: 1 })}
              </span>
              <span className="truncate text-ink-muted">
                {row.managers.join(", ")}
              </span>
            </div>
            <ShareButton
              iconOnly
              what={`${row.year} season card`}
              card={playerSeasonShare({
                playerId,
                name,
                position,
                imageUrl,
                year: row.year,
                managers: row.managers,
                points: row.points,
                starts: row.starts,
                games: row.games,
                best: row.best,
              })}
            />
          </li>
        ))}
      </ol>
    </Card>
  );
};

export default PlayerSeasonsCard;
