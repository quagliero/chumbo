import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Chart } from "../Chart";
import { XAxis } from "../Axis";
import {
  ChartPopover,
  PopoverLinks,
  PopoverRows,
  PopoverTitle,
  useChartPopover,
} from "../Popover";
import { linearScale } from "../scale";
import {
  binFloors,
  binScores,
  type Bin,
  type ScoredWeek,
} from "./histogram";
import {
  useScoreDistribution,
  type DistributionRow,
} from "./useScoreDistribution";

/**
 * The score distribution (D4).
 *
 * One histogram per manager of every regular-season week they have scored,
 * which is the comparison the standings table cannot make. Two managers on the
 * same record are the same row in the table; here one of them is a narrow pile
 * around 95 and the other is two humps with nothing in the middle.
 *
 * **Small multiples, and no colour at all — that is the F2 answer, not a
 * workaround.** `domain/managerColors.ts` is explicit: a chart showing twelve
 * active managers must not colour them twelve ways, and only the first THREE
 * categorical slots clear all-pairs separation for a form like this. The other
 * two permitted escapes do not fit. Highlight-one-and-dim-the-rest (D1, D2)
 * needs the series to share one plot, and seventeen overlaid histograms are a
 * smear whichever one is lit. Folding everyone outside the top few into
 * "Other" would throw away the managers the chart is most interesting about.
 * Small multiples is the classic honest form for comparing distributions, and
 * it needs no hue to say whose panel is whose: the name is on it.
 *
 * What the panels share, because that is the only thing that makes a grid of
 * small charts a comparison rather than seventeen unrelated pictures:
 *
 * - **One horizontal axis**, spanning the league's own worst to best week ever
 *   (36.9 to 174.0). The empty space at each end of a panel is information: it
 *   is where somebody else's disaster or explosion sits.
 * - **One vertical scale**, in SHARE of that manager's weeks rather than a
 *   count, because careers here run from thirteen weeks to a hundred and
 *   ninety. A count would draw phil's whole career shorter than one of thd's
 *   bins. The scale is set by the tallest bar in the grid, so a short career's
 *   spikiness shows as spikiness — which is the truth about thirteen weeks —
 *   and the games count in every header says how much shape to trust.
 *
 * Every panel links out: the name to that manager, and the two ends of the
 * range to the actual matchups where their worst and best weeks happened. A
 * bar does not link anywhere, because a bar is up to forty-four different
 * games; it carries a tooltip with the exact count instead.
 */

/**
 * Bin widths on offer, default first.
 *
 * Ten points is the unit this league talks in and the same width as D5's
 * heatmap bands. Five exists because the one real objection to a histogram is
 * that the binning shapes the picture, and the honest answer to that is to let
 * the reader re-bin it — the humps that survive at five points are real.
 */
const BIN_WIDTHS = [10, 5] as const;

type SortKey = "spread" | "average" | "record";

const SORTS: { key: SortKey; label: string; hint: string }[] = [
  { key: "spread", label: "swing", hint: "widest swing first — boom and bust at the top" },
  { key: "average", label: "average", hint: "highest scoring first" },
  { key: "record", label: "record", hint: "best record first — same-record managers end up neighbours" },
];

/** Panel plot height in CSS pixels, excluding the axis strip below it. */
const PANEL = 68;
const MARGIN = { top: 6, right: 6, bottom: 18, left: 6 };

const one = (value: number) => value.toFixed(1);

const record = (row: DistributionRow) =>
  `${row.wins}-${row.losses}${row.ties ? `-${row.ties}` : ""}`;

const matchupPath = (week: ScoredWeek) =>
  `/seasons/${week.year}/matchups/${week.week}/${week.matchupId}`;

const weekLabel = (week: ScoredWeek) =>
  `${one(week.points)} in ${week.year} week ${week.week}`;

/** What a bin covers, for the tooltip and the text fallback. */
const binLabel = (bin: Bin, width: number) =>
  `${bin.floor}–${bin.floor + width}`;

interface BinDatum {
  row: DistributionRow;
  bin: Bin;
  binWidth: number;
}

/**
 * One bar's card (I2): how often this manager scored in this range, and — when
 * the range holds their best or worst week — the way to that game, which is
 * the one specific week a bar can point at.
 */
const BinPopover = ({ row, bin, binWidth, pinned }: BinDatum & { pinned: boolean }) => {
  const holds = (week: ScoredWeek) =>
    week.points >= bin.floor && week.points < bin.floor + binWidth;
  return (
    <>
      <PopoverTitle sub={`${binLabel(bin, binWidth)} points`}>{row.name}</PopoverTitle>
      <PopoverRows
        rows={[
          ["Weeks", bin.count],
          ["Share of their weeks", `${Math.round(bin.share * 100)}%`],
          holds(row.best) && ["Best ever", weekLabel(row.best)],
          holds(row.worst) && ["Worst ever", weekLabel(row.worst)],
        ]}
      />
      {pinned && (
        <PopoverLinks
          links={[
            { to: `/managers/${row.managerId}`, label: row.name },
            holds(row.best) && { to: matchupPath(row.best), label: "Best week" },
            holds(row.worst) && { to: matchupPath(row.worst), label: "Worst week" },
          ]}
        />
      )}
    </>
  );
};

/** The panel's one-line announcement, as the image's own label. */
const announce = (row: DistributionRow) =>
  `${row.name}: ${row.spread.games} weeks averaging ${one(row.spread.mean)}, ` +
  `swing ${one(row.spread.sd)}`;

/**
 * The same numbers as a sentence, for a screen reader and for anyone the
 * graphic fails. Per panel rather than one table for the grid: read in place,
 * each panel is a complete statement about one manager. Kept distinct from the
 * label above so a screen reader announces the short version and offers the
 * detail, rather than reading the same paragraph twice.
 */
const describe = (row: DistributionRow, bins: Bin[], width: number) => {
  const { spread } = row;
  const filled = bins
    .filter((bin) => bin.count > 0)
    .map((bin) => `${binLabel(bin, width)}: ${bin.count}`)
    .join(", ");
  return (
    `${row.name} scored between ${one(spread.min)} and ${one(spread.max)} in ` +
    `${spread.games} regular-season weeks across ${row.seasons} ` +
    `season${row.seasons === 1 ? "" : "s"}, ` +
    `going ${record(row)}. Average ${one(spread.mean)}, median ` +
    `${one(spread.median)}, standard deviation ${one(spread.sd)}, middle half ` +
    `${one(spread.q1)} to ${one(spread.q3)}. Weeks per ${width}-point bin — ${filled}.`
  );
};

interface Panel {
  row: DistributionRow;
  bins: Bin[];
}

export const ScoreDistribution = ({ className }: { className?: string }) => {
  const { rows, league, years, currentSeasonWeeks } = useScoreDistribution();
  const [binWidth, setBinWidth] = useState<number>(BIN_WIDTHS[0]);
  const [sort, setSort] = useState<SortKey>("spread");
  // One store for every panel: pinning a bar in one closes the card in another.
  const popover = useChartPopover<BinDatum>();
  // A new bin width replaces every bar, so a pinned card would point at none.
  useEffect(() => popover.store.dismiss(), [binWidth, popover.store]);

  const { floors, panels, ceiling } = useMemo(() => {
    const floors = binFloors(league.min, league.max, binWidth);
    const panels: Panel[] = rows.map((row) => ({
      row,
      bins: binScores(row.points, floors, binWidth),
    }));
    // One vertical scale for every panel, rounded up to a whole five per cent
    // so the tallest bar does not touch the top of its box.
    const tallest = Math.max(
      0.05,
      ...panels.flatMap((panel) => panel.bins.map((bin) => bin.share))
    );
    return { floors, panels, ceiling: Math.ceil(tallest * 20) / 20 };
  }, [rows, league, binWidth]);

  const ordered = useMemo(() => {
    const by: Record<SortKey, (a: Panel, b: Panel) => number> = {
      spread: (a, b) => b.row.spread.sd - a.row.spread.sd,
      average: (a, b) => b.row.spread.mean - a.row.spread.mean,
      record: (a, b) => b.row.winPct - a.row.winPct,
    };
    return [...panels].sort(by[sort]);
  }, [panels, sort]);

  // The chart's own headline, found in the data rather than written down: two
  // managers whose W-L is identical and whose weeks are not. This is the whole
  // argument for the page existing, so it should not depend on the reader
  // spotting it. Nothing is rendered if no two records match.
  const twins = useMemo(() => findTwins(rows), [rows]);

  const ticks = useMemo(
    () => floors.filter((floor) => floor % 50 === 0 && floor > league.min),
    [floors, league.min]
  );

  return (
    <div className={className}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-faint">sort by</span>
          {SORTS.map((option) => (
            <button
              key={option.key}
              type="button"
              onClick={() => setSort(option.key)}
              aria-pressed={sort === option.key}
              title={option.hint}
              className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                sort === option.key
                  ? "border-line-strong bg-hover font-medium text-ink"
                  : "border-line text-ink-muted hover:border-line-strong"
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs text-ink-faint">bins</span>
          {BIN_WIDTHS.map((width) => (
            <button
              key={width}
              type="button"
              onClick={() => setBinWidth(width)}
              aria-pressed={binWidth === width}
              className={`rounded-full border px-2.5 py-1 text-xs tabular-nums transition-colors ${
                binWidth === width
                  ? "border-line-strong bg-hover font-medium text-ink"
                  : "border-line text-ink-muted hover:border-line-strong"
              }`}
            >
              {width} pts
            </button>
          ))}
        </div>
        <span className="text-xs text-ink-faint">
          {SORTS.find((option) => option.key === sort)?.hint}
        </span>
      </div>

      {twins && (
        <p className="mb-4 max-w-prose text-sm text-ink-muted">
          <strong className="font-medium text-ink">Same record, different weeks.</strong>{" "}
          {twins.a.name} and {twins.b.name} have both gone {record(twins.a)} — but{" "}
          {twins.a.name} averaged {one(twins.a.spread.mean)} a week against{" "}
          {twins.b.name}&rsquo;s {one(twins.b.spread.mean)}, and swung{" "}
          {one(twins.a.spread.sd)} against {one(twins.b.spread.sd)}. The
          standings table has them on the same line.
        </p>
      )}

      {/* One column on a phone, so nothing scrolls sideways; three on a
          desktop, which is as narrow as a panel can get before fifteen bins
          stop being separable. */}
      <div className="grid grid-cols-1 gap-x-6 gap-y-5 sm:grid-cols-2 xl:grid-cols-3">
        {ordered.map(({ row, bins }) => (
          <div key={row.managerId} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2">
              <Link
                to={`/managers/${row.managerId}`}
                className="font-medium underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                {row.managerId}
              </Link>
              <span className="text-xs tabular-nums text-ink-muted">
                {record(row)} · {row.spread.games} wks
              </span>
            </div>
            <div className="text-xs tabular-nums text-ink-muted">
              avg {one(row.spread.mean)} · swing ±{one(row.spread.sd)} ·{" "}
              <Link
                to={matchupPath(row.worst)}
                title={`Worst week: ${weekLabel(row.worst)}`}
                className="underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                {one(row.spread.min)}
              </Link>
              –
              <Link
                to={matchupPath(row.best)}
                title={`Best week: ${weekLabel(row.best)}`}
                className="underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                {one(row.spread.max)}
              </Link>
            </div>

            <Chart
              height={PANEL}
              margin={MARGIN}
              label={announce(row)}
              fallback={<p>{describe(row, bins, binWidth)}</p>}
              overlay={(frame) => (
                <ChartPopover
                  popover={popover}
                  frame={frame}
                  label="Score range"
                  owns={(datum) => datum.row.managerId === row.managerId}
                  render={(datum, pinned) => (
                    <BinPopover {...datum} pinned={pinned} />
                  )}
                />
              )}
            >
              {(frame) => {
                const x = linearScale(
                  {
                    min: floors[0],
                    max: floors[floors.length - 1] + binWidth,
                  },
                  [0, frame.width]
                );
                const y = linearScale({ min: 0, max: ceiling }, [
                  frame.height,
                  0,
                ]);

                return (
                  <>
                    {/* The middle half of their weeks, behind the bars: the
                        narrow band is the metronome, the wide one the gambler,
                        and it reads at a glance across seventeen panels in a
                        way seventeen sets of bar heights do not. */}
                    <rect
                      x={x(row.spread.q1)}
                      y={0}
                      width={Math.max(1, x(row.spread.q3) - x(row.spread.q1))}
                      height={frame.height}
                      className="text-ink"
                      fill="currentColor"
                      fillOpacity={0.06}
                      aria-hidden="true"
                    />

                    {bins.map((bin) => {
                      const left = x(bin.floor);
                      const right = x(bin.floor + binWidth);
                      // A one-pixel gutter between bars, and never a zero or
                      // negative width on a narrow phone panel.
                      const width = Math.max(1, right - left - 1);
                      const key = `${row.managerId}-${bin.floor}`;
                      return (
                        <g key={bin.floor}>
                          <rect
                            x={left}
                            y={y(bin.share)}
                            width={width}
                            height={Math.max(0, frame.height - y(bin.share))}
                            className="text-series-1"
                            fill="currentColor"
                            fillOpacity={0.85}
                            aria-hidden="true"
                          />
                          {/* The target is the whole column, not the bar. A bin
                              holding one week is a pixel tall — and those are
                              the interesting bins, where the best and worst
                              weeks live. An empty bin has nothing to say, and a
                              tab stop on nothing is worse than none. */}
                          {bin.count > 0 && (
                            <rect
                              x={left}
                              y={0}
                              width={width + 1}
                              height={frame.height}
                              fill="transparent"
                              pointerEvents="all"
                              {...popover.mark(
                                key,
                                { row, bin, binWidth },
                                left + width / 2,
                                y(bin.share),
                                `${row.name}, ${binLabel(bin, binWidth)}: ${
                                  bin.count
                                } week${bin.count === 1 ? "" : "s"} (${Math.round(
                                  bin.share * 100
                                )}%)`
                              )}
                            />
                          )}
                        </g>
                      );
                    })}

                    {/* Their median, solid; the league's, dashed. The gap
                        between the two is "do they score more than everyone
                        else", which the bars alone do not answer without the
                        reader remembering where the middle is. */}
                    <line
                      x1={x(row.spread.median)}
                      x2={x(row.spread.median)}
                      y1={0}
                      y2={frame.height}
                      className="text-ink"
                      stroke="currentColor"
                      strokeWidth={1.5}
                      aria-hidden="true"
                    />
                    <line
                      x1={x(league.median)}
                      x2={x(league.median)}
                      y1={0}
                      y2={frame.height}
                      className="text-ink-faint"
                      stroke="currentColor"
                      strokeDasharray="3 3"
                      aria-hidden="true"
                    />

                    <line
                      x1={0}
                      x2={frame.width}
                      y1={frame.height}
                      y2={frame.height}
                      className="text-line-strong"
                      stroke="currentColor"
                      shapeRendering="crispEdges"
                      aria-hidden="true"
                    />
                    <XAxis ticks={ticks} scale={x} length={frame.height} />
                  </>
                );
              }}
            </Chart>
          </div>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-0.5 bg-ink" />
          <span className="text-ink-muted">their median week</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 border-l border-dashed border-ink-faint" />
          <span className="text-ink-muted">
            the league&rsquo;s median week, {one(league.median)}
          </span>
        </span>
        <span className="flex items-center gap-1.5">
          <span className="inline-block h-3 w-4 bg-ink opacity-10" />
          <span className="text-ink-muted">the middle half of their weeks</span>
        </span>
      </div>

      <p className="mt-2 max-w-prose text-xs text-ink-faint">
        A bar is the share of that manager&rsquo;s weeks scoring in a{" "}
        {binWidth}-point range, the low end included and the high end not. All{" "}
        {rows.length} panels share one horizontal axis — {league.min.toFixed(0)}{" "}
        to {league.max.toFixed(0)}, the league&rsquo;s worst and best weeks ever
        — and one vertical scale; heights are shares rather than counts because
        these careers run from one season to fifteen.{" "}
        <strong className="font-medium">Swing</strong> is the standard deviation
        of those weeks, taken over all of them rather than as an estimate from a
        sample. Regular season only, {years[0]} to {years[years.length - 1]}
        {currentSeasonWeeks > 0
          ? `, of which ${years[years.length - 1]} contributes its ${currentSeasonWeeks} finished week${
              currentSeasonWeeks === 1 ? "" : "s"
            }`
          : ""}
        ; playoff weeks are out for the same reason every other all-play number
        here leaves them out, and each record is the record over exactly these
        weeks. 2019 counts like any other season — only its per-player breakdown
        is a reconstruction, and team scores are all this reads. No smoothing
        and no kernel: nothing is drawn between two bins, because nothing was
        scored there.
      </p>
    </div>
  );
};

/**
 * Two managers with the identical record and the least identical weeks.
 *
 * The pair whose average weekly score differs by most, among pairs with the
 * same wins, losses and ties — the flattest possible demonstration that a
 * record hides the distribution. Returns null when no two records match, which
 * is a real possibility once the archive grows.
 */
const findTwins = (rows: readonly DistributionRow[]) => {
  let best: { a: DistributionRow; b: DistributionRow; gap: number } | null =
    null;

  for (let i = 0; i < rows.length; i++) {
    for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i];
      const b = rows[j];
      if (a.wins !== b.wins || a.losses !== b.losses || a.ties !== b.ties) {
        continue;
      }
      const gap = Math.abs(a.spread.mean - b.spread.mean);
      if (!best || gap > best.gap) {
        // Higher average first, so the sentence reads "x averaged more than y".
        best =
          a.spread.mean >= b.spread.mean ? { a, b, gap } : { a: b, b: a, gap };
      }
    }
  }

  return best;
};
