import { useMemo, useState } from "react";
import { Chart } from "../Chart";
import { XAxis, YAxis } from "../Axis";
import { linearScale, linePath, niceTicks } from "../scale";
import { useChartWidth } from "../useChartWidth";
import { ChartPopover, useChartPopover } from "../Popover";
import { DraftPickPopover } from "./DraftPickPopover";
import { useDraftScatter, type DraftScatterPoint } from "./useDraftScatter";

/**
 * The draft value scatter (D6).
 *
 * Overall pick number along the bottom, points that player went on to score
 * that season, for whoever had him, up the side — every pick of every draft the
 * league has finished, in one box. The dashed curve is what a pick at that
 * number has actually returned across fourteen drafts, so the chart answers
 * "was that a good pick" against this league's own history rather than
 * somebody else's ADP. `draftValue.ts` holds the derivation and the two
 * judgements it inherits from `utils/stats/draftStats.ts`.
 *
 * **Overplotting is the design problem, not the scales.** 2,460 marks in one
 * box, ~600 of them stacked on zero — the players who were cut in September.
 * Four things make it readable, and all four matter:
 *
 *   - small radius and low fill opacity, so density reads as density: the
 *     black bar along the floor is the honest shape of a fantasy draft, and a
 *     lone dot at 350 points is visibly lone;
 *   - the baseline curve drawn ON TOP of the marks rather than under them
 *     (which is where D7 puts its diagonal) — under 2,460 translucent dots the
 *     one line the chart is read against would disappear;
 *   - a position filter, which is the cut that actually separates the cloud —
 *     quarterbacks are a different chart from kickers;
 *   - the extremes labelled, because "every steal and every bust" is a promise
 *     about specific people, and a cloud names nobody.
 *
 * **Colour encodes the residual, not identity (F2).** Seventeen managers
 * cannot be seventeen hues — only the first three categorical slots clear
 * all-pairs separation for a scatter, which is exactly this form — and
 * position would need six. So there are two hues and a neutral: blue above the
 * slot's going rate, orange below, ink for the par band. Blue against orange
 * is the divergent pair that survives every kind of colour blindness, and
 * because the colour only restates the mark's position relative to a line that
 * is drawn, a reader who cannot see it at all loses nothing.
 */

/**
 * Inside this many points of the going rate is par, not a steal.
 *
 * About a point a week across a season — inside the noise of what any slot
 * returns, and colouring it would claim a verdict the data has not got.
 */
const PAR = 15;

const STEAL = "#2a78d6";
const BUST = "#eb6834";

const MARGIN = { top: 12, right: 14, bottom: 42, left: 46 };

const MIN_HEIGHT = 220;
const MAX_HEIGHT = 380;

/** How many of each end get named. Six labels is a story; sixty is a mess. */
const NAMED = 3;

const colourFor = (value: number) =>
  value > PAR ? STEAL : value < -PAR ? BUST : "currentColor";

const signed = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;

const describe = (point: DraftScatterPoint) =>
  `${point.name}, ${point.year} pick ${point.pickNo} (round ${point.round}) ` +
  `by ${point.managerId}: ${point.total.toFixed(1)} points against ` +
  `${point.baseline.toFixed(1)} for that slot, ${signed(point.value)}` +
  (point.pointsElsewhere > 0
    ? `, ${point.pointsElsewhere.toFixed(1)} of them for other teams`
    : "") +
  (point.approximate ? " (2019 — reconstructed lineup data)" : "");

/** "Justin Jefferson" in a 10px label is too wide; "Jefferson ’20" is not. */
const shortLabel = (point: DraftScatterPoint) => {
  const parts = point.name.split(" ");
  return `${parts[parts.length - 1]} ’${String(point.year).slice(2)}`;
};

export const DraftScatter = ({ className }: { className?: string }) => {
  const { points, positions, years } = useDraftScatter();
  const popover = useChartPopover<DraftScatterPoint>();
  const [position, setPosition] = useState<string | null>(null);

  const { ref, width } = useChartWidth<HTMLDivElement>();
  const height =
    width === null
      ? MIN_HEIGHT
      : Math.round(
          Math.min(MAX_HEIGHT, Math.max(MIN_HEIGHT, (width - MARGIN.left) * 0.6))
        );

  // Both axes span every pick, filtered or not: switching to kickers must move
  // the dots, not the ruler, or two positions cannot be compared by eye.
  const { x, y } = useMemo(() => {
    const maxPick = points.reduce((max, p) => Math.max(max, p.pickNo), 0);
    const maxPoints = points.reduce((max, p) => Math.max(max, p.total), 0);
    return {
      x: niceTicks(0, maxPick, 4),
      y: niceTicks(0, maxPoints, 5),
    };
  }, [points]);

  // The going rate for each slot, league-wide. Deliberately NOT recomputed per
  // position: a pick spends the same draft capital whoever it is spent on, so
  // "what that slot returns" is the same line on every view of the chart.
  const curve = useMemo(() => {
    const byPick = new Map<number, number>();
    for (const point of points) byPick.set(point.pickNo, point.baseline);
    return [...byPick.entries()].sort(([a], [b]) => a - b);
  }, [points]);

  const shown = useMemo(
    () =>
      position === null
        ? points
        : points.filter((point) => point.position === position),
    [points, position]
  );

  // Named from the visible set, so filtering to tight ends names the tight
  // ends rather than leaving six labels pointing at faded dots.
  const named = useMemo(() => {
    const byValue = [...shown].sort((a, b) => b.value - a.value);
    return [...byValue.slice(0, NAMED), ...byValue.slice(-NAMED)];
  }, [shown]);

  const radius = width !== null && width < 480 ? 2 : 2.6;
  const span = `${years[0]} to ${years[years.length - 1]}`;

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setPosition(null)}
          aria-pressed={position === null}
          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
            position === null
              ? "border-line-strong bg-hover font-medium text-ink"
              : "border-line text-ink-muted hover:border-line-strong"
          }`}
        >
          Every pick
        </button>
        {positions.map((option) => (
          <button
            key={option}
            type="button"
            onClick={() =>
              setPosition((current) => (current === option ? null : option))
            }
            aria-pressed={position === option}
            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
              position === option
                ? "border-line-strong bg-hover font-medium text-ink"
                : "border-line text-ink-muted hover:border-line-strong"
            }`}
          >
            {option}
          </button>
        ))}
        <span className="self-center text-xs text-ink-faint">
          {shown.length.toLocaleString()} picks, {span}
        </span>
      </div>

      <div ref={ref}>
        <Chart
          height={height}
          margin={MARGIN}
          label={
            `Every draft pick from ${span}: overall pick number against the ` +
            `the points that player scored that season`
          }
          fallback={<DraftTable points={shown} />}
          overlay={(frame) => (
            <ChartPopover
              popover={popover}
              frame={frame}
              label="Draft pick"
              render={(point, pinned) => (
                <DraftPickPopover point={point} pinned={pinned} />
              )}
            />
          )}
        >
          {(frame) => {
            const scaleX = linearScale(x.domain, [0, frame.width]);
            const scaleY = linearScale(y.domain, [frame.height, 0]);

            return (
              <>
                <YAxis ticks={y.ticks} scale={scaleY} length={frame.width} />
                <XAxis ticks={x.ticks} scale={scaleX} length={frame.height} />

                {points.map((point) => {
                  const dim = position !== null && point.position !== position;
                  const cx = scaleX(point.pickNo);
                  const cy = scaleY(point.total);
                  const colour = colourFor(point.value);

                  // A dimmed mark is context, not a target: rendering it as a
                  // link would put two thousand invisible tab stops between
                  // the reader and the twenty picks they asked for.
                  if (dim) {
                    return (
                      <circle
                        key={`${point.year}-${point.pickNo}`}
                        cx={cx}
                        cy={cy}
                        r={radius}
                        fill={colour}
                        fillOpacity={0.06}
                        className="text-ink-muted"
                        aria-hidden="true"
                      />
                    );
                  }

                  const key = `${point.year}-${point.pickNo}`;
                  return (
                    // 2019's per-player scoring is a reconstruction, good
                    // enough to plot but not to pass off as recorded — so its
                    // picks are drawn hollow and the legend says why, rather
                    // than being mixed in or dropped.
                    <circle
                      key={key}
                      cx={cx}
                      cy={cy}
                      r={radius}
                      fill={point.approximate ? "none" : colour}
                      fillOpacity={0.45}
                      stroke={colour}
                      strokeOpacity={point.approximate ? 0.85 : 0.35}
                      strokeWidth={point.approximate ? 1.1 : 0.6}
                      className="text-ink-muted"
                      // Without this the 2019 marks are only hoverable on
                      // their one-pixel ring: an unfilled shape takes no
                      // pointer events inside it, so the hollow treatment
                      // would quietly cost 180 picks their popover.
                      pointerEvents="all"
                      {...popover.mark(key, point, cx, cy, describe(point))}
                    />
                  );
                })}

                {/* On top of the marks, not under them: see the note above. */}
                <path
                  d={linePath(
                    curve.map(([pickNo, baseline]) => ({
                      x: scaleX(pickNo),
                      y: scaleY(baseline),
                    }))
                  )}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={1.5}
                  strokeDasharray="5 4"
                  className="text-ink"
                  aria-hidden="true"
                  pointerEvents="none"
                />

                {placeLabels(
                  named.map((point) => ({
                    point,
                    cx: scaleX(point.pickNo),
                    cy: scaleY(point.total),
                  })),
                  frame.width
                ).map(({ point, cx, cy, labelX, labelY, anchor }) => (
                  <g
                    key={`${point.year}-${point.pickNo}-label`}
                    aria-hidden="true"
                    className="text-ink-muted"
                    pointerEvents="none"
                  >
                    <circle
                      cx={cx}
                      cy={cy}
                      r={radius + 1.5}
                      fill="none"
                      stroke={colourFor(point.value)}
                      strokeWidth={1}
                    />
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
                    {/* Drawn with the page's own background as a stroke under
                        the glyphs (`paint-order`), because the busts are
                        labelled inside the densest part of the cloud and
                        10px type over two hundred dots is not readable. */}
                    <text
                      x={labelX}
                      y={labelY}
                      dy="0.32em"
                      textAnchor={anchor}
                      fontSize={10}
                      fill="currentColor"
                      className="stroke-surface"
                      strokeWidth={3}
                      paintOrder="stroke"
                    >
                      {shortLabel(point)}
                    </text>
                  </g>
                ))}

                <text
                  x={frame.width / 2}
                  y={frame.height + 34}
                  textAnchor="middle"
                  fontSize={11}
                  fill="currentColor"
                  className="text-ink-muted"
                  aria-hidden="true"
                >
                  Overall pick number
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
                  Points that season
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
            style={{ backgroundColor: STEAL }}
          />
          <span className="text-ink-muted">
            beat the going rate for that slot
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: BUST }}
          />
          <span className="text-ink-muted">missed it</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-2.5 w-2.5 rounded-full border border-current text-ink-muted" />
          <span className="text-ink-muted">hollow: 2019, reconstructed</span>
        </span>
      </div>

      <p className="mt-2 max-w-prose text-xs text-ink-faint">
        The dashed line is{" "}
        <strong className="font-medium">what that pick usually returns</strong>{" "}
        — the average of every pick within six of it, across every draft. A pick
        is scored on everything the player did that season, bench included and
        whoever had him: a player traded in week 1 was still a good or bad pick,
        and what the trade did is a separate question, answered when you click
        the dot. Drafts are only counted once their
        season has been played, so {years[years.length - 1]} is the last one
        here. 2019&rsquo;s per-player scores are a reconstruction rather than a
        record — good enough to plot, so they are drawn hollow rather than
        quietly mixed in. Hover a dot for the pick; click it to keep it open,
        with the trade if there was one and links to the player, the manager
        and that draft.
      </p>
    </div>
  );
};

interface PlacedLabel {
  point: DraftScatterPoint;
  cx: number;
  cy: number;
  labelX: number;
  labelY: number;
  anchor: "start" | "end";
}

/** Line height at 10px, and how close two labels have to be to collide. */
const MIN_GAP = 12;
const NEAR = 76;

/**
 * Where the six names go.
 *
 * The busts are the collision: a pick that returned nothing returned nothing,
 * so all three sit on the floor of the plot within a few picks of each other
 * and their labels land on top of one another and on the x-axis. So a label is
 * pushed AWAY from the edge its point sits nearest — busts stack upward into
 * the cloud, steals downward — and a leader line is drawn once it has moved.
 * Points are taken top-down, which makes the arrangement stable: the same data
 * always produces the same picture.
 */
const placeLabels = (
  marks: { point: DraftScatterPoint; cx: number; cy: number }[],
  width: number
): PlacedLabel[] => {
  const placed: PlacedLabel[] = [];

  for (const { point, cx, cy } of [...marks].sort((a, b) => a.cy - b.cy)) {
    const flip = cx > width - NEAR;
    const labelX = flip ? cx - 8 : cx + 8;
    const direction = point.value >= 0 ? 1 : -1;

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

    placed.push({ point, cx, cy, labelX, labelY, anchor: flip ? "end" : "start" });
  }

  return placed;
};

/** How many of each end the text alternative lists. */
const TABLE_ROWS = 25;

/**
 * The same story as a table, for a screen reader and for anyone the graphic
 * fails. Both ends of the list rather than all 2,460 rows: the chart's claim
 * is about the steals and the busts, and two and a half thousand rows in the
 * DOM to restate a cloud helps nobody.
 */
const DraftTable = ({ points }: { points: DraftScatterPoint[] }) => {
  const byValue = [...points].sort((a, b) => b.value - a.value);
  const rows = [
    ...byValue.slice(0, TABLE_ROWS),
    ...byValue.slice(-TABLE_ROWS).reverse(),
  ];

  return (
    <table>
      <caption>
        The {TABLE_ROWS} picks that most beat the going rate for their slot, and
        the {TABLE_ROWS} that most missed it, of {points.length} scored picks
      </caption>
      <thead>
        <tr>
          <th scope="col">Player</th>
          <th scope="col">Season</th>
          <th scope="col">Pick</th>
          <th scope="col">Drafted by</th>
          <th scope="col">Points for him</th>
          <th scope="col">Going rate</th>
          <th scope="col">Difference</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((point) => (
          <tr key={`${point.year}-${point.pickNo}`}>
            <th scope="row">
              {point.name}
              {point.approximate ? " (reconstructed)" : ""}
            </th>
            <td>{point.year}</td>
            <td>{point.pickNo}</td>
            <td>{point.managerId}</td>
            <td>{point.total.toFixed(1)}</td>
            <td>{point.baseline.toFixed(1)}</td>
            <td>{signed(point.value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
