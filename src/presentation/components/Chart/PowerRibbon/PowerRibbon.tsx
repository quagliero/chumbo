import { useState } from "react";
import { Link } from "react-router-dom";
import { Chart } from "../Chart";
import { bandScale, linePath, linearScale } from "../scale";
import { MAX_SERIES, SERIES_COLORS } from "@/domain/managerColors";
import { usePowerRibbon, type RibbonSeries } from "./usePowerRibbon";

/**
 * The all-time power ribbon (D2).
 *
 * Fifteen seasons of finishing positions, one line per manager, champion at the
 * top. The whole league's story in one image: who has been consistently good,
 * who collapsed, who climbed.
 *
 * **Colour carries no identity here, by design.** Seventeen managers cannot be
 * seventeen distinguishable hues — F2 sets out why, and the constraint is that a
 * chart with twelve managers in it must not colour them twelve ways. So every
 * line is neutral until one is chosen, and the chosen one takes that manager's
 * accent while the rest fade back. You read one career at a time, which is how
 * anyone reads a bump chart anyway, and it stays legible to a reader with
 * deuteranopia because at most one line is ever coloured.
 *
 * Every point links to that season, so the chart is a way into the archive
 * rather than a picture of it.
 */

const ROW = 22;
const LEFT_GUTTER = 44;

export const PowerRibbon = ({ className }: { className?: string }) => {
  const { series, years, field } = usePowerRibbon();
  // Two states, not one. A click PINS a manager and a hover only previews, so
  // that moving the mouse off the legend does not undo the click -- and so that
  // a phone, which never hovers, still has a way to choose.
  //
  // Pinning is a SET: comparing two or three careers is the question this chart
  // is actually asked ("did rich ever finish above me?"), and one-at-a-time made
  // you hold the other line in your head. Hovering still previews a single
  // manager, and only when nothing is pinned -- once you have made a selection,
  // sweeping the mouse over the legend must not keep wiping it.
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const [hovered, setHovered] = useState<string | null>(null);
  const highlighted =
    pinned.size > 0 ? pinned : hovered ? new Set([hovered]) : new Set<string>();
  const anyHighlighted = highlighted.size > 0;

  const toggle = (managerId: string) =>
    setPinned((current) => {
      const next = new Set(current);
      // Deselecting is always allowed; selecting stops at MAX_SERIES.
      if (next.delete(managerId)) return next;
      if (next.size >= MAX_SERIES) return current;
      next.add(managerId);
      return next;
    });

  /**
   * Selected lines take the VALIDATED categorical palette in selection order,
   * not each manager's own accent.
   *
   * The accents collide by design — twelve active managers into eight hues, so
   * thd, karsten and ryan are all blue (see `managerColors.ts`). That is
   * harmless when one manager is on screen and the name carries the identity,
   * but the moment two can be selected at once it would draw two
   * indistinguishable blue lines. Series colours are the palette that is
   * actually checked for all-pairs separation, and the chip takes the same
   * colour as the line so the mapping is never in doubt.
   *
   * Selecting beyond eight is refused rather than wrapped, for the same reason
   * the palette stops at eight: a ninth colour is not distinguishable from one
   * already on screen.
   */
  const colourOf = (managerId: string) => {
    const order = [...highlighted];
    const index = order.indexOf(managerId);
    return index === -1 ? "currentColor" : SERIES_COLORS[index % MAX_SERIES];
  };

  const height = field * ROW;

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {series.map((manager) => (
          <button
            key={manager.managerId}
            type="button"
            onClick={() => toggle(manager.managerId)}
            onMouseEnter={() => setHovered(manager.managerId)}
            onMouseLeave={() => setHovered(null)}
            onFocus={() => setHovered(manager.managerId)}
            onBlur={() => setHovered(null)}
            aria-pressed={pinned.has(manager.managerId)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              highlighted.has(manager.managerId)
                ? "border-transparent text-white"
                : "border-line text-ink-muted hover:border-line-strong disabled:opacity-40 disabled:hover:border-line"
            }`}
            style={
              highlighted.has(manager.managerId)
                ? { backgroundColor: colourOf(manager.managerId) }
                : undefined
            }
            disabled={
              !highlighted.has(manager.managerId) && pinned.size >= MAX_SERIES
            }
          >
            {manager.managerId}
            {manager.titles > 0 && (
              <span aria-label={`${manager.titles} titles`}>
                {" "}
                {"★".repeat(manager.titles)}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* The seasons do not compress below about 30px each before the labels
          collide, so on a phone the chart scrolls sideways rather than becoming
          an unreadable smear. */}
      <div className="overflow-x-auto">
        <div style={{ minWidth: Math.max(320, years.length * 46 + LEFT_GUTTER) }}>
          <Chart
            height={height}
            margin={{ top: 10, right: 16, bottom: 26, left: LEFT_GUTTER }}
            label={`Finishing position by season, ${years[0]} to ${years[years.length - 1]}, for ${series.length} managers`}
            fallback={<RibbonTable series={series} years={years} />}
          >
            {(frame) => {
              const x = bandScale(years.length, [0, frame.width]);
              // Position 1 at the top: the y range is inverted relative to the
              // usual "bigger is higher", because finishing first is a 1.
              const y = linearScale({ min: 1, max: field }, [
                ROW / 2,
                frame.height - ROW / 2,
              ]);

              return (
                <>
                  <g aria-hidden="true" className="text-ink-muted">
                    {Array.from({ length: field }, (_, i) => i + 1).map((place) => (
                      <g key={place} transform={`translate(0,${y(place)})`}>
                        <line
                          x1={0}
                          x2={frame.width}
                          stroke="currentColor"
                          strokeOpacity={place === 1 ? 0.25 : 0.08}
                          shapeRendering="crispEdges"
                        />
                        <text
                          x={-10}
                          dy="0.32em"
                          textAnchor="end"
                          fill="currentColor"
                          fontSize={10}
                        >
                          {place}
                        </text>
                      </g>
                    ))}
                    {years.map((year, i) => (
                      <text
                        key={year}
                        x={x.at(i)}
                        y={frame.height + 16}
                        textAnchor="middle"
                        fill="currentColor"
                        fontSize={10}
                      >
                        {`'${String(year).slice(2)}`}
                      </text>
                    ))}
                  </g>

                  {series.map((manager) => {
                    const isOn = highlighted.has(manager.managerId);
                    const dimmed = anyHighlighted && !isOn;
                    return (
                      <path
                        key={manager.managerId}
                        d={linePath(
                          manager.points.map((point, i) =>
                            point ? { x: x.at(i), y: y(point.position) } : null
                          )
                        )}
                        fill="none"
                        stroke={isOn ? colourOf(manager.managerId) : "currentColor"}
                        strokeOpacity={isOn ? 1 : dimmed ? 0.06 : 0.22}
                        strokeWidth={isOn ? 2.5 : 1.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="text-ink-muted transition-[stroke-opacity]"
                      />
                    );
                  })}

                  {/* Points only for the highlighted manager: seventeen lines'
                      worth of dots is noise, and they are the click targets. */}
                  {series
                    .filter((manager) => highlighted.has(manager.managerId))
                    .map((manager) =>
                      manager.points.map((point, i) =>
                        point ? (
                          <Link
                            key={point.year}
                            to={`/seasons/${point.year}/standings`}
                            aria-label={`${manager.managerId} finished ${point.position} of ${point.field} in ${point.year}`}
                          >
                            <circle
                              cx={x.at(i)}
                              cy={y(point.position)}
                              r={point.position === 1 ? 5 : 3.5}
                              fill={
                                point.provisional
                                  ? "var(--color-surface, #fff)"
                                  : colourOf(manager.managerId)
                              }
                              stroke={colourOf(manager.managerId)}
                              strokeWidth={point.provisional ? 1.5 : 0}
                              strokeDasharray={point.provisional ? "2 2" : undefined}
                            />
                          </Link>
                        ) : null
                      )
                    )}
                </>
              );
            }}
          </Chart>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 text-xs text-ink-faint">
        <p>
          Champion at the top. Pick up to {MAX_SERIES} managers to compare
          careers; a hollow marker is a season still being played.
        </p>
        {pinned.size > 0 && (
          <button
            type="button"
            onClick={() => setPinned(new Set())}
            className="font-medium text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            Clear {pinned.size} selected
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * The same data as a table, for screen readers.
 *
 * A chart is a presentation of numbers we already hold, so it should never be
 * the only way to get at them.
 */
const RibbonTable = ({
  series,
  years,
}: {
  series: RibbonSeries[];
  years: number[];
}) => (
  <table>
    <caption>Finishing position by season</caption>
    <thead>
      <tr>
        <th scope="col">Manager</th>
        {years.map((year) => (
          <th key={year} scope="col">
            {year}
          </th>
        ))}
      </tr>
    </thead>
    <tbody>
      {series.map((manager) => (
        <tr key={manager.managerId}>
          <th scope="row">{manager.managerId}</th>
          {manager.points.map((point, i) => (
            <td key={years[i]}>{point ? point.position : "—"}</td>
          ))}
        </tr>
      ))}
    </tbody>
  </table>
);
