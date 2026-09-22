import { useMemo, useRef, useSyncExternalStore } from "react";
import { Chart } from "../Chart";
import { YAxis } from "../Axis";
import { linearScale, niceTicks } from "../scale";
import {
  ChartPopover,
  HIT_RADIUS,
  PopoverLinks,
  PopoverNote,
  PopoverRows,
  PopoverTitle,
  useChartPopover,
  type ChartPopoverHandle,
} from "../Popover";
import {
  clockOf,
  shortSlot,
  slotOf,
  slotStarts,
  squeezedTime,
  type FlowStep,
  type GameFlow,
} from "@/utils/gameFlow";

/**
 * How the week unfolded (L2): both teams' scores from Thursday night to
 * Monday night, one step per scoring moment, with a dot on every key play —
 * a touchdown, or anything worth more than 5 — that opens the play.
 *
 * Two teams, so two series colours in the palette's fixed order: the first
 * team the page lists is blue, the second orange. Not the managers' accents —
 * two accents on one chart is what the F2 note rules out.
 */

/**
 * What the popover is showing: a key play (a dot, hovered or pinned), or just
 * the score at a moment, from moving across the chart anywhere else.
 */
type Hover = { kind: "play"; step: FlowStep } | { kind: "moment"; step: FlowStep };

/** Exported so the section's legend cannot drift from the lines. */
export const COLOURS = ["#2a78d6", "#eb6834"] as const;
const MARGIN = { top: 14, right: 64, bottom: 30, left: 34 };
const HEIGHT = 230;
const DOT = 4.5;

const signed = (pts: number) => `${pts >= 0 ? "+" : "−"}${Math.abs(pts).toFixed(2)}`;

/** The builder's labels for what scored, as a reader would say them. */
const WHAT: Record<string, string> = {
  "pass yds": "passing yards",
  "pass TD": "passing TD",
  "rush yds": "rushing yards",
  "rush TD": "rushing TD",
  "rec yds": "receiving yards",
  "rec TD": "receiving TD",
  "return TD": "return TD",
  "2pt pass": "two-point pass",
  "2pt rec": "two-point catch",
  "2pt rush": "two-point run",
  "defensive TD": "defensive TD",
  "fumble rec": "fumble recovery",
  "blocked kick": "blocked kick",
  "INT": "interception",
};
const whatScored = (w: string) =>
  w
    .split(", ")
    .map((part) =>
      WHAT[part] ??
      part
        .replace(/^FG (\d+)$/, "$1-yard field goal")
        .replace(/^allowed (-?\d+)$/, "$1 points allowed")
    )
    .join(" + ");

/** Rough width of an 11px label, for deciding whether it fits. */
const labelWidth = (text: string) => text.length * 6.2 + 8;

const quarter = (q: string, clock: string) =>
  q === "final" ? "Final" : q === "5" ? `OT ${clock}` : `Q${q} ${clock}`;

export const GameFlowChart = ({
  flow,
  names,
  playerName,
  className,
}: {
  flow: GameFlow;
  names: readonly [string, string];
  playerName: (starterId: string) => string;
  className?: string;
}) => {
  const popover = useChartPopover<Hover>();

  // One object per datum, made once: the popover store ignores a preview of
  // the datum it already shows, so a pointer moving within one moment does
  // not re-render anything.
  const plays = useMemo(
    () => flow.keyPlays.map((step): Hover => ({ kind: "play", step })),
    [flow]
  );
  const moments = useMemo(
    () => flow.steps.map((step): Hover => ({ kind: "moment", step })),
    [flow]
  );
  const lastMoment = useRef<string | null>(null);

  const { position, span } = useMemo(
    () => squeezedTime(flow.steps.map((s) => s.at)),
    [flow]
  );
  const { domain, ticks } = useMemo(() => {
    const scores = flow.steps.flatMap((s) => s.score);
    return niceTicks(Math.min(0, ...scores), Math.max(1, ...scores), 4);
  }, [flow]);

  /** Where each part of the week starts, for the dividers and their labels. */
  const slots = useMemo(
    () => slotStarts(flow.steps.map((step) => step.at)),
    [flow]
  );

  /** Where each moment sits on the squeezed clock, for finding one under the pointer. */
  const offsets = useMemo(() => flow.steps.map((step) => position(step.at)), [flow, position]);

  const describe = (step: FlowStep) =>
    `${playerName(step.starterId)}, ${signed(step.pts)} for ${names[step.side]}, ` +
    `${slotOf(step.at)}: ${step.key?.d ?? ""}`;

  return (
    <Chart
      className={className}
      height={HEIGHT}
      margin={MARGIN}
      label={`${names[0]} ${flow.final[0]} to ${names[1]} ${flow.final[1]}: both scores through the week, with ${flow.keyPlays.length} key plays marked`}
      fallback={
        <ol>
          {flow.keyPlays.map((step, i) => (
            <li key={i}>{describe(step)}</li>
          ))}
        </ol>
      }
      overlay={(frame) => (
        <ChartPopover
          popover={popover}
          frame={frame}
          label="Key play"
          pinnable={(hover) => hover.kind === "play"}
          render={(hover, pinned) =>
            hover.kind === "play" ? (
              <KeyPlayCard
                step={hover.step}
                names={names}
                player={playerName(hover.step.starterId)}
                pinned={pinned}
              />
            ) : (
              <MomentCard step={hover.step} names={names} playerName={playerName} />
            )
          }
        />
      )}
    >
      {(frame) => {
        const x = linearScale({ min: 0, max: span || 1 }, [0, frame.width]);
        const y = linearScale(domain, [frame.height, 0]);
        const X = (at: number) => x(position(at));

        const path = (side: 0 | 1) => {
          let d = `M0,${y(0)}`;
          let last = 0;
          for (const step of flow.steps) {
            if (step.side !== side) continue;
            const px = X(step.at);
            d += `H${px}V${y(step.score[side])}`;
            last = step.score[side];
          }
          return `${d}H${frame.width}V${y(last)}`;
        };

        // End labels, nudged apart when the scores finish close together.
        const ends = [y(flow.final[0]), y(flow.final[1])];
        if (Math.abs(ends[0] - ends[1]) < 14) {
          const mid = (ends[0] + ends[1]) / 2;
          const [hi, lo] = flow.final[0] >= flow.final[1] ? [0, 1] : [1, 0];
          ends[hi] = mid - 7;
          ends[lo] = mid + 7;
        }

        return (
          <>
            <YAxis ticks={ticks} scale={y} length={frame.width} grid />
            {slots.map(({ at, slot }, i) => {
              const px = X(at);
              // Skip a label with no room before the next one.
              const next = slots[i + 1] ? X(slots[i + 1].at) : frame.width;
              return (
                <g key={slot + i} aria-hidden="true">
                  <line
                    x1={px}
                    x2={px}
                    y1={0}
                    y2={frame.height}
                    stroke="currentColor"
                    className="text-line"
                  />
                  {/* The full name if it fits before the next, else the short
                      one, else nothing. */}
                  {(next - px > labelWidth(shortSlot(slot))) && (
                    <text
                      x={px + 3}
                      y={frame.height + 18}
                      fontSize={11}
                      fill="currentColor"
                      className="text-ink-muted"
                    >
                      {next - px > labelWidth(slot) ? slot : shortSlot(slot)}
                    </text>
                  )}
                </g>
              );
            })}
            {([0, 1] as const).map((side) => (
              <path
                key={side}
                d={path(side)}
                fill="none"
                stroke={COLOURS[side]}
                strokeWidth={2.25}
                strokeLinejoin="round"
              />
            ))}
            {([0, 1] as const).map((side) => (
              <text
                key={`end-${side}`}
                x={frame.width + 6}
                y={ends[side] + 4}
                fontSize={12}
                fontWeight={700}
                fill={COLOURS[side]}
              >
                {flow.final[side].toFixed(1)}
              </text>
            ))}
            {/* The whole plot, under the key plays: move across it and the
                score at that moment shows, snapped to the last thing that
                changed it. Pointer events rather than mouse ones so a finger
                dragged sideways scrubs too; `pan-y` leaves vertical swipes to
                the page. Not a mark — no role, no tab stop, and a press on it
                closes a pinned card like a press anywhere else — because the
                same facts are in the fallback list, and the key plays that
                matter are still buttons. */}
            <rect
              x={0}
              y={0}
              width={frame.width}
              height={frame.height}
              fill="transparent"
              pointerEvents="all"
              style={{ touchAction: "pan-y" }}
              onPointerMove={(event) => {
                const box = event.currentTarget.getBoundingClientRect();
                const at = ((event.clientX - box.left) / (box.width || 1)) * (span || 1);
                // The last moment at or before the pointer.
                let lo = 0;
                let hi = offsets.length - 1;
                if (hi < 0 || at < offsets[0]) {
                  if (lastMoment.current) popover.store.leave(lastMoment.current);
                  lastMoment.current = null;
                  return;
                }
                while (lo < hi) {
                  const mid = (lo + hi + 1) >> 1;
                  if (offsets[mid] <= at) lo = mid;
                  else hi = mid - 1;
                }
                const step = flow.steps[lo];
                const key = `m-${lo}`;
                lastMoment.current = key;
                popover.store.preview({
                  key,
                  datum: moments[lo],
                  x: X(step.at),
                  y: y(Math.max(step.score[0], step.score[1])),
                });
              }}
              onPointerLeave={() => {
                if (lastMoment.current) popover.store.leave(lastMoment.current);
                lastMoment.current = null;
              }}
            />
            <Crosshair
              popover={popover}
              x={X}
              y={y}
              height={frame.height}
            />
            {flow.keyPlays.map((step, i) => {
              const cx = X(step.at);
              const cy = y(step.score[step.side]);
              return (
                <circle
                  key={`hit-${i}`}
                  cx={cx}
                  cy={cy}
                  r={HIT_RADIUS}
                  {...popover.hit(`kp-${i}`, plays[i], cx, cy)}
                />
              );
            })}
            {flow.keyPlays.map((step, i) => {
              const cx = X(step.at);
              const cy = y(step.score[step.side]);
              return (
                <circle
                  key={`kp-${i}`}
                  cx={cx}
                  cy={cy}
                  r={DOT}
                  fill={COLOURS[step.side]}
                  stroke="#fff"
                  strokeWidth={1.5}
                  {...popover.mark(`kp-${i}`, plays[i], cx, cy, describe(step))}
                />
              );
            })}
          </>
        );
      }}
    </Chart>
  );
};

const KeyPlayCard = ({
  step,
  names,
  player,
  pinned,
}: {
  step: FlowStep;
  names: readonly [string, string];
  player: string;
  pinned: boolean;
}) => {
  const key = step.key!;
  return (
    <>
      <PopoverTitle
        sub={`${slotOf(step.at)} · ${key.g} · ${quarter(key.q, key.c)}`}
      >
        <span style={{ color: COLOURS[step.side] }}>{player}</span>{" "}
        <span className="tabular-nums">{signed(step.pts)}</span>
      </PopoverTitle>
      <PopoverNote>{key.d}</PopoverNote>
      <div className="mt-1.5">
        <PopoverRows
          rows={[
            ["Scored", whatScored(key.w)],
            [
              "Then",
              `${names[0]} ${step.score[0].toFixed(1)} – ${step.score[1].toFixed(1)} ${names[1]}`,
            ],
          ]}
        />
      </div>
      {pinned && /^\d+$/.test(step.starterId) && (
        <PopoverLinks links={[{ to: `/players/${step.starterId}`, label: player }]} />
      )}
    </>
  );
};

/**
 * The score at one moment — what a reader wants from any point on the lines,
 * not only the dots. Snapped to the last scoring moment, so what it says is a
 * score that existed rather than one interpolated between two.
 */
const MomentCard = ({
  step,
  names,
  playerName,
}: {
  step: FlowStep;
  names: readonly [string, string];
  playerName: (starterId: string) => string;
}) => {
  const [a, b] = step.score;
  const gap = Math.abs(a - b);
  const lead =
    gap < 0.005 ? "Level" : `${names[a > b ? 0 : 1]} by ${gap.toFixed(2)}`;
  const last = step.correction
    ? "A score correction"
    : `${playerName(step.starterId)} ${signed(step.pts)}`;
  return (
    <>
      <PopoverTitle sub={`${clockOf(step.at)} ET`}>
        <span style={{ color: COLOURS[0] }}>{names[0]}</span>{" "}
        <span className="tabular-nums">
          {a.toFixed(2)} – {b.toFixed(2)}
        </span>{" "}
        <span style={{ color: COLOURS[1] }}>{names[1]}</span>
      </PopoverTitle>
      <div className="mt-1.5">
        <PopoverRows
          rows={[
            ["Lead", lead],
            ["Last", `${last} for ${names[step.side]}`],
          ]}
        />
      </div>
    </>
  );
};

/**
 * A line down the chart at the moment being shown, and a dot on each team's
 * line there. Subscribes to the popover store itself, so moving the pointer
 * redraws these few marks and not the chart.
 */
const Crosshair = ({
  popover,
  x,
  y,
  height,
}: {
  popover: ChartPopoverHandle<Hover>;
  x: (at: number) => number;
  y: (score: number) => number;
  height: number;
}) => {
  const { store } = popover;
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const hover = state.item?.datum;
  if (!hover || hover.kind !== "moment") return null;
  const cx = x(hover.step.at);
  return (
    <g pointerEvents="none" aria-hidden="true">
      <line
        x1={cx}
        x2={cx}
        y1={0}
        y2={height}
        stroke="currentColor"
        strokeDasharray="3 3"
        className="text-ink-faint"
      />
      {([0, 1] as const).map((side) => (
        <circle
          key={side}
          cx={cx}
          cy={y(hover.step.score[side])}
          r={3.5}
          fill={COLOURS[side]}
          stroke="#fff"
          strokeWidth={1.5}
        />
      ))}
    </g>
  );
};
