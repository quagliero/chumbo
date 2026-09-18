import { Chart } from "../Chart";
import {
  ChartPopover,
  HIT_RADIUS,
  PopoverLinks,
  PopoverNote,
  PopoverRows,
  PopoverTitle,
  useChartPopover,
} from "../Popover";
import { bandScale, linePath, linearScale } from "../scale";
import { useSeriesSelection } from "../useSeriesSelection";
import {
  usePowerRibbon,
  type RibbonPoint,
  type RibbonSeries,
} from "./usePowerRibbon";

interface RibbonDatum {
  manager: RibbonSeries;
  point: RibbonPoint;
}

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/**
 * A finish's card (I2). The dot used to be a bare link to the standings with
 * no word of what it was; the card says the finish, and puts it against the
 * manager's career so a 4th reads as a good year or a bad one.
 */
const RibbonPopover = ({
  manager,
  point,
  pinned,
}: RibbonDatum & { pinned: boolean }) => (
  <>
    <PopoverTitle sub={point.year}>{manager.name}</PopoverTitle>
    <PopoverRows
      rows={[
        [
          point.provisional ? "Standing" : "Finished",
          point.position === 1 && !point.provisional
            ? "Champion"
            : `${ordinal(point.position)} of ${point.field}`,
        ],
        ["Career titles", manager.titles],
        manager.bestFinish !== null && ["Best finish", ordinal(manager.bestFinish)],
      ]}
    />
    {point.provisional && (
      <PopoverNote>Season in progress — where they stand today.</PopoverNote>
    )}
    {pinned && (
      <PopoverLinks
        links={[
          { to: `/seasons/${point.year}/standings`, label: `${point.year} standings` },
          { to: `/managers/${manager.managerId}`, label: manager.name },
        ]}
      />
    )}
  </>
);

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
  const selection = useSeriesSelection();
  const popover = useChartPopover<RibbonDatum>();

  const height = field * ROW;

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        {series.map((manager) => (
          <button
            key={manager.managerId}
            type="button"
            onClick={() => selection.toggle(manager.managerId)}
            onMouseEnter={() => selection.setHovered(manager.managerId)}
            onMouseLeave={() => selection.setHovered(null)}
            onFocus={() => selection.setHovered(manager.managerId)}
            onBlur={() => selection.setHovered(null)}
            aria-pressed={selection.pinned.has(manager.managerId)}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              selection.isOn(manager.managerId)
                ? "border-transparent text-white"
                : "border-line text-ink-muted hover:border-line-strong disabled:opacity-40 disabled:hover:border-line"
            }`}
            style={
              selection.isOn(manager.managerId)
                ? { backgroundColor: selection.colourOf(manager.managerId) }
                : undefined
            }
            disabled={selection.isFull(manager.managerId)}
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
            overlay={(frame) => (
              <ChartPopover
                popover={popover}
                frame={frame}
                label="Finish"
                // Its line can be deselected from the keyboard, which is no
                // outside press; the card must not outlive its dot.
                owns={(datum) => selection.isOn(datum.manager.managerId)}
                render={(datum, pinned) => (
                  <RibbonPopover {...datum} pinned={pinned} />
                )}
              />
            )}
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
                    const isOn = selection.isOn(manager.managerId);
                    const dimmed = selection.anyHighlighted && !isOn;
                    return (
                      <path
                        key={manager.managerId}
                        d={linePath(
                          manager.points.map((point, i) =>
                            point ? { x: x.at(i), y: y(point.position) } : null
                          )
                        )}
                        fill="none"
                        stroke={
                          isOn ? selection.colourOf(manager.managerId) : "currentColor"
                        }
                        strokeOpacity={isOn ? 1 : dimmed ? 0.06 : 0.22}
                        strokeWidth={isOn ? 2.5 : 1.5}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        className="text-ink-muted transition-[stroke-opacity]"
                      />
                    );
                  })}

                  {/* Near-miss targets, under every dot. See `HitProps`. */}
                  {series
                    .filter((manager) => selection.isOn(manager.managerId))
                    .flatMap((manager) =>
                      manager.points.map((point, i) => {
                        if (!point) return null;
                        const key = `${manager.managerId}-${point.year}`;
                        const cx = x.at(i);
                        const cy = y(point.position);
                        return (
                          <circle
                            key={`${key}-hit`}
                            cx={cx}
                            cy={cy}
                            r={HIT_RADIUS}
                            {...popover.hit(key, { manager, point }, cx, cy)}
                          />
                        );
                      })
                    )}

                  {/* Points only for the highlighted manager: seventeen lines'
                      worth of dots is noise, and they are the click targets. */}
                  {series
                    .filter((manager) => selection.isOn(manager.managerId))
                    .map((manager) =>
                      manager.points.map((point, i) => {
                        if (!point) return null;
                        const key = `${manager.managerId}-${point.year}`;
                        const cx = x.at(i);
                        const cy = y(point.position);
                        return (
                          <circle
                            key={key}
                            cx={cx}
                            cy={cy}
                            r={point.position === 1 ? 5 : 3.5}
                            fill={
                              point.provisional
                                ? "var(--color-surface, #fff)"
                                : selection.colourOf(manager.managerId)
                            }
                            stroke={selection.colourOf(manager.managerId)}
                            strokeWidth={point.provisional ? 1.5 : 0}
                            strokeDasharray={point.provisional ? "2 2" : undefined}
                            {...popover.mark(
                              key,
                              { manager, point },
                              cx,
                              cy,
                              `${manager.name} finished ${ordinal(point.position)} of ${point.field} in ${point.year}`
                            )}
                          />
                        );
                      })
                    )}
                </>
              );
            }}
          </Chart>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-baseline gap-x-3 text-xs text-ink-faint">
        <p>
          Champion at the top. Pick up to {selection.max} managers to compare
          careers; a hollow marker is a season still being played.
        </p>
        {selection.pinned.size > 0 && (
          <button
            type="button"
            onClick={selection.clear}
            className="font-medium text-ink-muted underline decoration-dotted underline-offset-2 hover:text-ink"
          >
            Clear {selection.pinned.size} selected
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
