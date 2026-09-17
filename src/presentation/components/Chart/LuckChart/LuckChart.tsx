import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Chart } from "../Chart";
import { XAxis, YAxis } from "../Axis";
import { extent, linearScale, niceTicks } from "../scale";
import { useChartWidth } from "../useChartWidth";
import { useLuckChart, type LuckPoint } from "./useLuckChart";

/**
 * The luck chart (D7).
 *
 * Actual wins up the side, expected wins along the bottom, and a diagonal where
 * the two agree. A manager above the line won more than their scores deserved;
 * below it, the schedule robbed them. The vertical gap is the luck score.
 *
 * `luck.ts` holds the definition of expected wins and the reasoning behind
 * every judgement call in it; the caption below restates it on the page,
 * because a chart people are going to argue about has to show its terms.
 *
 * **Colour encodes the sign of the residual, not identity (F2).** Twelve active
 * managers cannot be twelve hues — only the first three categorical slots clear
 * all-pairs separation for a scatter, which is exactly the form this is. So
 * there are two hues and a neutral: blue above the line, orange below, ink for
 * anyone within half a win of it. Blue against orange is the one divergent pair
 * that survives every kind of colour blindness, and because the colour restates
 * the position rather than adding a second variable, a reader who cannot see it
 * at all loses nothing. Identity is carried by the label on a career point, by
 * the highlight chips on a season point, and by the table underneath.
 */

/** Within half a win of the diagonal is noise, not fortune. */
const LEVEL = 0.5;

const LUCKY = "#2a78d6";
const UNLUCKY = "#eb6834";

const MARGIN = { top: 12, right: 18, bottom: 40, left: 44 };

/** The plot is square so the diagonal sits at 45° and the gap reads honestly. */
const MIN_PLOT = 200;
const MAX_PLOT = 420;

type Mode = "careers" | "seasons";

const colourFor = (luck: number) =>
  luck > LEVEL ? LUCKY : luck < -LEVEL ? UNLUCKY : "currentColor";

const signed = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;

const record = (point: LuckPoint) =>
  `${point.wins}-${point.losses}${point.ties ? `-${point.ties}` : ""}`;

const describe = (point: LuckPoint) =>
  `${point.name}${point.year ? ` in ${point.year}` : ""}: ${record(point)}, ` +
  `${point.actualWins} actual wins against ${point.expectedWins.toFixed(
    1
  )} expected, ${signed(point.luck)}`;

export const LuckChart = ({ className }: { className?: string }) => {
  const { careerRows, seasonRows, years } = useLuckChart();
  const [mode, setMode] = useState<Mode>("careers");
  // Season mode puts ~180 points on the plot, and no amount of colour can say
  // which is whose. A chip picks one manager out and fades the rest, which is
  // the same move D2 makes and the only one that works on a phone.
  const [highlighted, setHighlighted] = useState<string | null>(null);

  const points = mode === "careers" ? careerRows : seasonRows;

  // Measured here as well as inside `Chart` so the height can be derived from
  // the width. Both observe the same element, so they agree.
  const { ref, width } = useChartWidth<HTMLDivElement>();
  const plot =
    width === null
      ? MIN_PLOT
      : Math.min(
          MAX_PLOT,
          Math.max(MIN_PLOT, width - MARGIN.left - MARGIN.right)
        );

  // One domain for both axes, or the diagonal would not be the line where
  // actual equals expected.
  const { domain, ticks } = useMemo(() => {
    const span = extent([
      ...points.map((p) => p.actualWins),
      ...points.map((p) => p.expectedWins),
    ]);
    return niceTicks(Math.min(0, span.min), span.max, mode === "careers" ? 6 : 5);
  }, [points, mode]);

  const managerIds = useMemo(
    () => [...new Set(seasonRows.map((row) => row.managerId))].sort(),
    [seasonRows]
  );

  const label =
    mode === "careers"
      ? `Actual wins against expected wins, one point per manager, ${years[0]} to ${years[years.length - 1]}`
      : `Actual wins against expected wins, one point per manager-season, ${years[0]} to ${years[years.length - 1]}`;

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(["careers", "seasons"] as const).map((option) => (
          <button
            key={option}
            type="button"
            onClick={() => setMode(option)}
            aria-pressed={mode === option}
            className={`rounded-full border px-3 py-1 text-xs capitalize transition-colors ${
              mode === option
                ? "border-line-strong bg-hover font-medium text-ink"
                : "border-line text-ink-muted hover:border-line-strong"
            }`}
          >
            {option}
          </button>
        ))}
        <span className="text-xs text-ink-faint">
          {mode === "careers"
            ? "every season added up"
            : "one point per manager, per season"}
        </span>
      </div>

      {mode === "seasons" && (
        <div className="mb-3 flex flex-wrap gap-1.5">
          {managerIds.map((managerId) => (
            <button
              key={managerId}
              type="button"
              onClick={() =>
                setHighlighted((current) =>
                  current === managerId ? null : managerId
                )
              }
              aria-pressed={highlighted === managerId}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                highlighted === managerId
                  ? "border-line-strong bg-hover text-ink"
                  : "border-line text-ink-muted hover:border-line-strong"
              }`}
            >
              {managerId}
            </button>
          ))}
        </div>
      )}

      <div ref={ref}>
        <Chart
          height={plot}
          margin={MARGIN}
          label={label}
          fallback={<LuckTable points={points} mode={mode} />}
        >
          {(frame) => {
            // The frame's width is the container's; the plot is square, so the
            // marks use `plot` for both and the spare width stays empty rather
            // than stretching the diagonal away from 45°.
            const size = Math.min(frame.width, plot);
            const x = linearScale(domain, [0, size]);
            const y = linearScale(domain, [frame.height, 0]);

            const placed = placeLabels(
              points.map((point) => ({
                point,
                cx: x(point.expectedWins),
                cy: y(point.actualWins),
              })),
              mode,
              highlighted,
              size,
              frame.height
            );

            return (
              <>
                <YAxis ticks={ticks} scale={y} length={size} />
                <XAxis ticks={ticks} scale={x} length={frame.height} />

                {/* Where actual equals expected. Everything the chart says is
                    said relative to this line, so it is drawn before the
                    points and left visible through them. */}
                <line
                  x1={x(domain.min)}
                  y1={y(domain.min)}
                  x2={x(domain.max)}
                  y2={y(domain.max)}
                  className="text-ink-muted"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  aria-hidden="true"
                />
                <text
                  x={x(domain.max) - 6}
                  y={y(domain.max) + 14}
                  textAnchor="end"
                  fontSize={10}
                  fill="currentColor"
                  className="text-ink-faint"
                  aria-hidden="true"
                >
                  what the scores deserved
                </text>

                {points.map((point) => {
                  const dim =
                    mode === "seasons" &&
                    highlighted !== null &&
                    point.managerId !== highlighted;
                  return (
                    <Link
                      key={`${point.managerId}-${point.year ?? "career"}`}
                      to={
                        point.year
                          ? `/seasons/${point.year}/standings`
                          : `/managers/${point.managerId}`
                      }
                      aria-label={describe(point)}
                    >
                      <circle
                        cx={x(point.expectedWins)}
                        cy={y(point.actualWins)}
                        r={mode === "careers" ? 5 : 4}
                        fill={colourFor(point.luck)}
                        fillOpacity={dim ? 0.08 : 0.85}
                        stroke={colourFor(point.luck)}
                        strokeOpacity={dim ? 0.1 : 1}
                        strokeWidth={1}
                        className="text-ink-muted"
                      >
                        <title>{describe(point)}</title>
                      </circle>
                    </Link>
                  );
                })}

                {placed.map(({ point, cx, cy, labelX, labelY, anchor }) => (
                  <g
                    key={`${point.managerId}-${point.year ?? "career"}-label`}
                    aria-hidden="true"
                    className="text-ink-muted"
                  >
                    {/* A label nudged clear of its neighbours would otherwise
                        appear to belong to the wrong dot. */}
                    {Math.abs(labelY - cy) > 1 && (
                      <line
                        x1={cx}
                        y1={cy}
                        x2={labelX}
                        y2={labelY}
                        stroke="currentColor"
                        strokeOpacity={0.35}
                      />
                    )}
                    <text
                      x={labelX}
                      y={labelY}
                      dy="0.32em"
                      textAnchor={anchor}
                      fontSize={10}
                      fill="currentColor"
                    >
                      {mode === "careers" ? point.managerId : point.year}
                    </text>
                  </g>
                ))}

                <text
                  x={size / 2}
                  y={frame.height + 32}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  className="text-ink-muted"
                  aria-hidden="true"
                >
                  Expected wins
                </text>
                <text
                  transform={`translate(${-MARGIN.left + 11},${
                    frame.height / 2
                  }) rotate(-90)`}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  className="text-ink-muted"
                  aria-hidden="true"
                >
                  Actual wins
                </text>
              </>
            );
          }}
        </Chart>
      </div>

      <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: LUCKY }}
          />
          <span className="text-ink-muted">above the line — won more than they scored for</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: UNLUCKY }}
          />
          <span className="text-ink-muted">below it — robbed</span>
        </span>
      </div>

      <p className="mt-2 max-w-prose text-xs text-ink-faint">
        <strong className="font-medium">Expected wins</strong> plays your score
        each week against every other score in the league that week. Beat nine
        of eleven and the week was worth 0.818 of a win; add up the weeks and
        that is what your season deserved. <strong className="font-medium">Actual
        wins</strong> is what the schedule gave you. Regular season only —
        playoff weeks are out, {years[years.length - 1]} counts the weeks that
        have finished, and a tie counts half a win on both sides. Within half a
        win of the line is called level. League-wide the two totals are equal,
        so every win above the line was taken off someone below it.
      </p>
    </div>
  );
};

interface PlacedLabel {
  point: LuckPoint;
  cx: number;
  cy: number;
  labelX: number;
  labelY: number;
  anchor: "start" | "end";
}

/** Line height at 10px, and how close two labels have to be to collide. */
const MIN_GAP = 13;
const NEAR = 58;

/**
 * Where each point's label goes.
 *
 * Career points cluster — five managers sit within four wins of the diagonal at
 * the top right — so a label is pushed down until it clears every label already
 * placed near it, and a leader line is drawn when it has moved. Points are
 * taken top-down, which is what makes the result stable: the same data always
 * produces the same arrangement.
 *
 * A label within `NEAR` of the right-hand edge flips to the other side of its
 * dot rather than running off the plot, and a cluster in the bottom of the plot
 * stacks upward instead — pushing it down would walk it into the x-axis
 * labels, which is where the shortest careers happen to sit.
 *
 * In season mode only the highlighted manager's points are labelled, with the
 * year — 180 labels is not a chart.
 */
const placeLabels = (
  marks: { point: LuckPoint; cx: number; cy: number }[],
  mode: Mode,
  highlighted: string | null,
  size: number,
  height: number
): PlacedLabel[] => {
  const labelled =
    mode === "careers"
      ? marks
      : highlighted === null
      ? []
      : marks.filter((mark) => mark.point.managerId === highlighted);

  const placed: PlacedLabel[] = [];
  const groups: [typeof labelled, number][] = [
    [labelled.filter((mark) => mark.cy <= height * 0.6), 1],
    [labelled.filter((mark) => mark.cy > height * 0.6), -1],
  ];

  for (const [group, direction] of groups) {
    // Outward-in: each label is only ever pushed away from the edge it started
    // nearest, so the arrangement is stable and never oscillates.
    const ordered = [...group].sort((a, b) => (a.cy - b.cy) * direction);

    for (const { point, cx, cy } of ordered) {
      const flip = cx > size - NEAR;
      const labelX = flip ? cx - 9 : cx + 9;

      let labelY = cy;
      // Bounded rather than `while (true)`: each pass moves the label one line
      // further out, and a runaway loop in a render is worse than a collision.
      for (let pass = 0; pass < placed.length; pass++) {
        const clash = placed.find(
          (other) =>
            Math.abs(other.labelX - labelX) < NEAR &&
            Math.abs(other.labelY - labelY) < MIN_GAP
        );
        if (!clash) break;
        labelY = clash.labelY + MIN_GAP * direction;
      }

      placed.push({
        point,
        cx,
        cy,
        labelX,
        labelY,
        anchor: flip ? "end" : "start",
      });
    }
  }

  return placed;
};

/**
 * The same numbers as a table, for a screen reader and for anyone the graphic
 * fails. The chart is a picture of data we already hold; it should never be the
 * only way to read it.
 */
const LuckTable = ({ points, mode }: { points: LuckPoint[]; mode: Mode }) => (
  <table>
    <caption>
      {mode === "careers"
        ? "Career actual wins against expected wins"
        : "Actual wins against expected wins, by season"}
    </caption>
    <thead>
      <tr>
        <th scope="col">Manager</th>
        {mode === "seasons" && <th scope="col">Season</th>}
        <th scope="col">Record</th>
        <th scope="col">Actual wins</th>
        <th scope="col">Expected wins</th>
        <th scope="col">Luck</th>
      </tr>
    </thead>
    <tbody>
      {points.map((point) => (
        <tr key={`${point.managerId}-${point.year ?? "career"}`}>
          <th scope="row">{point.name}</th>
          {mode === "seasons" && <td>{point.year}</td>}
          <td>{record(point)}</td>
          <td>{point.actualWins}</td>
          <td>{point.expectedWins.toFixed(1)}</td>
          <td>{signed(point.luck)}</td>
        </tr>
      ))}
    </tbody>
  </table>
);
