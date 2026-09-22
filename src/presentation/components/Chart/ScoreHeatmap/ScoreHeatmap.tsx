import { type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Chart } from "../Chart";
import { bandScale } from "../scale";
import {
  ChartPopover,
  PopoverLinks,
  PopoverRows,
  PopoverTitle,
  useChartPopover,
} from "../Popover";
import { useChartWidth } from "../useChartWidth";
import {
  BAND_COUNT,
  SCORE_RAMP,
  bandLabel,
  colourFor,
} from "./scoreScale";
import {
  useScoreHeatmap,
  type HeatmapCell,
  type HeatmapRow,
  type ScoreHeatmap as Grid,
} from "./useScoreHeatmap";

/**
 * The weekly score heatmap (D5).
 *
 * One row per season, one column per week, one square per game, shaded by what
 * they scored. A whole career in one image: the hot Octobers, the year it all
 * fell apart in November, and the manager who has never once broken 130.
 *
 * Three things are load-bearing:
 *
 * **Colour is the score and nothing else.** Not the result — a 128-point loss
 * and a 128-point win are the same square, because the chart is about scoring
 * and the result is an accident of the schedule (which is D7's subject). The
 * result is in every cell's tooltip and in the table underneath. See
 * `scoreScale.ts` for why the ramp is one hue and why it is not red-to-green.
 *
 * **The scale is the league's, not the manager's.** The bands come from every
 * regular-season week ever played, so the same shade means the same number of
 * points on everybody's page. A per-manager scale would make every career look
 * identical — each one has its own good weeks and bad ones — and would make the
 * chart worthless for the comparison it exists to support.
 *
 * **Squares, not text.** At 375px there are fourteen columns and no room for
 * "107.8" in any of them, and the point of the form is the pattern rather than
 * the readings. The numbers are one tap (or one screen reader) away: every cell
 * is a link to the matchup with the score in its label, and `fallback` is the
 * whole grid as a table.
 */

/** Room for the year labels on the left and the week numbers along the top. */
const MARGIN = { top: 18, right: 4, bottom: 4, left: 38 };

/**
 * A cell small enough that fourteen fit a phone, and large enough to be a
 * tap target and to read as a block of colour rather than a pixel. 40 is the
 * cap because a career of squares the size of postage stamps stops being one
 * image and starts being a table with no numbers in it.
 */
const MIN_CELL = 16;
const MAX_CELL = 40;

/** The white gutter between squares. Enough to separate, not enough to grid. */
const GAP = 1.5;

export const ScoreHeatmap = ({
  managerId,
  managerName,
  className,
}: {
  managerId: string;
  managerName: string;
  className?: string;
}) => {
  const grid = useScoreHeatmap(managerId);
  const popover = useChartPopover<HeatmapDatum>();

  // Measured here as well as inside `Chart` so the cell size — and from it the
  // chart's height — can be derived from the width. Both observe the same
  // element, so they agree.
  const { ref, width } = useChartWidth<HTMLDivElement>();

  if (grid.rows.length === 0) {
    return (
      <p className={`text-sm text-ink-muted ${className ?? ""}`}>
        No completed regular-season weeks yet.
      </p>
    );
  }

  const available =
    width === null ? null : width - MARGIN.left - MARGIN.right;
  const cell =
    available === null
      ? MIN_CELL
      : Math.max(MIN_CELL, Math.min(MAX_CELL, available / grid.weeks.length));

  const years = grid.rows.map((row) => row.year);
  const span =
    years.length === 1
      ? `${years[0]}`
      : `${years[0]} to ${years[years.length - 1]}`;

  return (
    <div className={className}>
      {/* Two boxes, deliberately. The outer one is what gets measured — how
          much room the card has — and the inner one is shrunk to exactly the
          grid's width, which is what `Chart` then measures for the SVG. Without
          it, a capped cell size on a wide screen leaves six hundred pixels of
          empty SVG hanging off the right of the squares. The two measurements
          cannot oscillate because the inner width is stated, not observed. */}
      <div ref={ref}>
        <div
          style={
            available === null
              ? undefined
              : {
                  width:
                    MARGIN.left + cell * grid.weeks.length + MARGIN.right,
                  maxWidth: "100%",
                }
          }
        >
          <Chart
            height={grid.rows.length * cell}
            margin={MARGIN}
            label={`${managerName}'s weekly regular-season scores, ${span}, one square per game shaded by points scored`}
            fallback={<HeatmapTable grid={grid} managerName={managerName} />}
            overlay={(frame) => (
              <ChartPopover
                popover={popover}
                frame={frame}
                label={managerName}
                render={(datum, pinned) => (
                  <HeatmapPopover datum={datum} pinned={pinned} />
                )}
              />
            )}
          >
            {(frame) => {
              const x = bandScale(grid.weeks.length, [
                0,
                cell * grid.weeks.length,
              ]);
              const y = bandScale(grid.rows.length, [0, frame.height]);
              const size = Math.max(1, Math.min(x.bandWidth, y.bandWidth) - GAP);

              return (
                <>
                  {grid.weeks.map((week, column) => (
                    <text
                      key={week}
                      x={x.at(column)}
                      y={-6}
                      textAnchor="middle"
                      fontSize={9}
                      fill="currentColor"
                      className="text-ink-faint"
                      aria-hidden="true"
                    >
                      {week}
                    </text>
                  ))}

                  {grid.rows.map((row, rowIndex) => (
                    <g key={row.year}>
                      <text
                        x={-8}
                        y={y.at(rowIndex)}
                        dy="0.32em"
                        textAnchor="end"
                        fontSize={10}
                        fill="currentColor"
                        className="text-ink-muted hover:text-ink"
                        {...popover.mark(
                          `year-${row.year}`,
                          { kind: "year", row },
                          -20,
                          y.at(rowIndex),
                          `${row.year}: ${row.played} weeks, ${row.average.toFixed(
                            1
                          )} points a week`
                        )}
                      >
                        {row.year}
                      </text>

                      {row.cells.map((cellData, column) => {
                        const cx = x.at(column) - size / 2;
                        const cy = y.at(rowIndex) - size / 2;

                        // No game that week — the season was shorter, or it has
                        // not been played yet. A faint plate rather than nothing,
                        // so the grid keeps its shape and a ragged right edge
                        // reads as "the season was thirteen weeks long".
                        if (!cellData) {
                          return (
                            <rect
                              key={grid.weeks[column]}
                              x={cx}
                              y={cy}
                              width={size}
                              height={size}
                              rx={1.5}
                              fill="#f5f6f9"
                              aria-hidden="true"
                            />
                          );
                        }

                        return (
                          <rect
                            key={grid.weeks[column]}
                            x={cx}
                            y={cy}
                            width={size}
                            height={size}
                            rx={1.5}
                            fill={colourFor(cellData.points, grid.floors)}
                            className="text-ink hover:stroke-current"
                            strokeWidth={1.5}
                            {...popover.mark(
                              `${cellData.year}-${cellData.week}`,
                              { kind: "game", cell: cellData },
                              x.at(column),
                              cy,
                              describe(cellData)
                            )}
                          />
                        );
                      })}
                    </g>
                  ))}
                </>
              );
            }}
          </Chart>
        </div>
      </div>

      <Legend floors={grid.floors} />

      <p className="mt-2 max-w-prose text-xs text-ink-faint">
        One square per regular-season game, shaded by what they scored — not by
        whether they won, which is a different chart. Weeks run left to right.
        Playoff weeks are left out: half the league is playing consolation games
        by then, a bye has no matchup to link to, and every other all-play number
        on this site draws the same line.{" "}
        {grid.rows.some((row) => row.approximateLineups) && (
          <>
            2019 was rebuilt from the NFL.com archive; only its bench scores are
            incomplete, and the team scores shaded here are exact.{" "}
          </>
        )}
        Tap a square for the game, or a year for that season.
      </p>

      {grid.best && grid.worst && (
        <p className="mt-1 text-xs text-ink-muted">
          Best week{" "}
          <MatchupLink cell={grid.best}>
            {grid.best.points.toFixed(2)}
          </MatchupLink>{" "}
          ({grid.best.year} week {grid.best.week}) · worst{" "}
          <MatchupLink cell={grid.worst}>
            {grid.worst.points.toFixed(2)}
          </MatchupLink>{" "}
          ({grid.worst.year} week {grid.worst.week})
        </p>
      )}
    </div>
  );
};

const MatchupLink = ({
  cell,
  children,
}: {
  cell: HeatmapCell;
  children: ReactNode;
}) => (
  <Link
    to={`/seasons/${cell.year}/matchups/${cell.week}/${cell.matchupId}`}
    className="font-numeric tabular-nums text-blue-600 hover:text-blue-800 hover:underline"
  >
    {children}
  </Link>
);

/**
 * The legend, which is what turns a shade back into a number.
 *
 * It states the two things the squares cannot: that the ramp is points rather
 * than a verdict, and that the outer bands are open-ended because the extremes
 * clamp into them.
 */
const Legend = ({ floors }: { floors: number[] }) => (
  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-muted">
    <span className="text-ink-faint">Points scored</span>
    <span className="flex items-center gap-1">
      {SCORE_RAMP.map((colour, index) => (
        <span key={colour} className="flex flex-col items-center gap-0.5">
          <span
            aria-hidden="true"
            className="block h-3 w-6 rounded-sm border border-line"
            style={{ backgroundColor: colour }}
          />
          <span className="font-numeric tabular-nums text-[10px] text-ink-faint">
            {index === 0 || index === BAND_COUNT - 1
              ? bandLabel(index, floors)
              : floors[index]}
          </span>
        </span>
      ))}
    </span>
  </div>
);

type HeatmapDatum =
  | { kind: "game"; cell: HeatmapCell }
  | { kind: "year"; row: HeatmapRow };

const RESULT = { W: "Won", L: "Lost", T: "Tied" } as const;

const matchupHref = (cell: HeatmapCell) =>
  `/seasons/${cell.year}/matchups/${cell.week}/${cell.matchupId}`;

/**
 * A square's card, or a year label's (I2). The square is one game; the year is
 * that season in a line, with the way to its best and worst weeks — which on
 * the grid are just two squares among thirteen.
 */
const HeatmapPopover = ({
  datum,
  pinned,
}: {
  datum: HeatmapDatum;
  pinned: boolean;
}) => {
  if (datum.kind === "game") {
    const { cell } = datum;
    return (
      <>
        <PopoverTitle sub={`vs ${cell.opponentName}`}>
          {cell.year} · Week {cell.week}
        </PopoverTitle>
        <PopoverRows
          rows={[
            [
              RESULT[cell.result],
              `${cell.points.toFixed(2)}–${cell.opponentPoints.toFixed(2)}`,
            ],
            ["That week", `${ordinal(cell.rank)} of ${cell.field}`],
          ]}
        />
        {pinned && (
          <PopoverLinks
            links={[
              { to: matchupHref(cell), label: "Matchup" },
              {
                to: `/seasons/${cell.year}/matchups?week=${cell.week}`,
                label: `Week ${cell.week}`,
              },
            ]}
          />
        )}
      </>
    );
  }

  const { row } = datum;
  return (
    <>
      <PopoverTitle sub="Regular season">{row.year}</PopoverTitle>
      <PopoverRows
        rows={[
          ["Weeks", row.played],
          ["Average", row.average.toFixed(1)],
          ["Best", `${row.best.points.toFixed(2)} · week ${row.best.week}`],
          ["Worst", `${row.worst.points.toFixed(2)} · week ${row.worst.week}`],
        ]}
      />
      {pinned && (
        <PopoverLinks
          links={[
            { to: `/seasons/${row.year}/matchups`, label: `${row.year} season` },
            { to: matchupHref(row.best), label: "Best week" },
            { to: matchupHref(row.worst), label: "Worst week" },
          ]}
        />
      )}
    </>
  );
};

const describe = (cell: HeatmapCell): string =>
  `${cell.year} week ${cell.week}: ${cell.points.toFixed(2)} against ${
    cell.opponentName
  }'s ${cell.opponentPoints.toFixed(2)} — ${
    cell.result === "W" ? "won" : cell.result === "L" ? "lost" : "tied"
  }, ${ordinal(cell.rank)} highest score of ${cell.field} that week`;

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/**
 * The same grid as a table, for a screen reader and for anyone the graphic
 * fails. A chart is a presentation of data we already hold, so it should never
 * be the only way to read it.
 */
const HeatmapTable = ({
  grid,
  managerName,
}: {
  grid: Grid;
  managerName: string;
}) => (
  <table>
    <caption>{`${managerName}'s regular-season score, by season and week`}</caption>
    <thead>
      <tr>
        <th scope="col">Season</th>
        {grid.weeks.map((week) => (
          <th key={week} scope="col">{`Week ${week}`}</th>
        ))}
        <th scope="col">Average</th>
      </tr>
    </thead>
    <tbody>
      {grid.rows.map((row) => (
        <tr key={row.year}>
          <th scope="row">{row.year}</th>
          {row.cells.map((cell, index) => (
            <td key={grid.weeks[index]}>
              {cell ? `${cell.points.toFixed(2)} ${cell.result}` : "—"}
            </td>
          ))}
          <td>{row.average.toFixed(1)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
