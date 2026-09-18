import { useMemo } from "react";
import { GameFlowChart } from "@/presentation/components/Chart/GameFlow/GameFlowChart";
import { useTimeline } from "@/hooks/useGameday";
import { buildGameFlow, describeFlow } from "@/utils/gameFlow";
import { getPlayerName } from "@/utils/playerDataUtils";

/**
 * "How the week unfolded" (L2), on a matchup page: a sentence, then the chart.
 * Renders nothing until the week's timelines arrive, and nothing for a week
 * that has none.
 */

export const GameFlowSection = ({
  year,
  week,
  rosterIds,
  names,
}: {
  year: number;
  week: number;
  rosterIds: readonly [number, number];
  names: readonly [string, string];
}) => {
  const timeline = useTimeline(year, week);
  const flow = useMemo(
    () => (timeline ? buildGameFlow(timeline, rosterIds) : null),
    [timeline, rosterIds]
  );
  if (!flow || flow.steps.length === 0) return null;

  const playerName = (id: string) => getPlayerName(id, year);

  return (
    <section aria-labelledby="game-flow" className="rounded-lg bg-white p-4 shadow">
      <div className="mb-2 flex flex-wrap items-baseline gap-x-3">
        <h3 id="game-flow" className="font-bold">
          How the week unfolded
        </h3>
        <p className="text-sm text-ink-muted">{describeFlow(flow, names, playerName)}</p>
      </div>
      <div className="mb-1 flex flex-wrap gap-x-4 text-xs text-ink-muted">
        {names.map((name, side) => (
          <span key={name} className="inline-flex items-center gap-1.5">
            <span
              aria-hidden="true"
              className="inline-block h-0.5 w-4"
              style={{ background: side === 0 ? "#2a78d6" : "#eb6834" }}
            />
            {name}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span aria-hidden="true" className="inline-block h-2 w-2 rounded-full bg-ink-muted" />
          key play — a touchdown, or more than 5 points; hover or tap
        </span>
      </div>
      <GameFlowChart flow={flow} names={names} playerName={playerName} />
    </section>
  );
};

export default GameFlowSection;
