import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { Link } from "react-router-dom";
import type { ChartFrame } from "../Chart";
import type { ChartPopoverHandle } from "./useChartPopover";

/**
 * The chart popover (I2).
 *
 * Every mark on every chart used to explain itself with an SVG `<title>` — the
 * browser's own tooltip: most of a second's delay, the operating system's
 * styling, no links, and nothing at all on a phone. And clicking a mark
 * navigated away, which is a heavy answer to "what is that dot?".
 *
 * Now hovering (or focusing) a mark previews a card of the facts behind it,
 * and clicking (or tapping, or Enter) pins it, with links out. See
 * `popoverStore.ts` for why the state lives outside React.
 *
 * Usage, in three parts:
 *
 *     const popover = useChartPopover<Point>();
 *     <Chart overlay={(frame) => (
 *       <ChartPopover popover={popover} frame={frame} render={(p) => …} />
 *     )}>
 *       {(frame) => points.map((p) =>
 *         <circle … {...popover.mark(key, p, x, y, label)} />)}
 *     </Chart>
 */

/** Gap between the anchor and the card, and between the card and the edge. */
const GAP = 10;
const EDGE = 4;

interface ChartPopoverProps<T> {
  popover: ChartPopoverHandle<T>;
  frame: ChartFrame;
  /** The card's contents for one datum. Links belong here. */
  render: (datum: T, pinned: boolean) => ReactNode;
  /** Accessible name for the pinned dialog, e.g. "Draft pick details". */
  label: string;
}

export const ChartPopover = <T,>({
  popover,
  frame,
  render,
  label,
}: ChartPopoverProps<T>) => {
  const { store } = popover;
  const state = useSyncExternalStore(store.subscribe, store.get, store.get);
  const { item, pinned, opener } = state;

  const card = useRef<HTMLDivElement>(null);
  const [place, setPlace] = useState<{ left: number; top: number } | null>(
    null
  );

  const fullWidth = frame.width + frame.margin.left + frame.margin.right;
  const anchorX = item ? item.x + frame.margin.left : 0;
  const anchorY = item ? item.y + frame.margin.top : 0;

  // Measure, then place: above the mark by default, below when there is no
  // room above, and slid sideways to stay inside the chart. Hidden for the one
  // frame before it is measured rather than drawn in the wrong place.
  useLayoutEffect(() => {
    const element = card.current;
    if (!item || !element) {
      setPlace(null);
      return;
    }
    const { width, height } = element.getBoundingClientRect();
    const above = anchorY - GAP - height;
    const top = above >= EDGE ? above : anchorY + GAP;
    const left = Math.min(
      Math.max(EDGE, anchorX - width / 2),
      Math.max(EDGE, fullWidth - width - EDGE)
    );
    setPlace({ left, top });
  }, [item, pinned, anchorX, anchorY, fullWidth]);

  // A pinned card is dismissed by Escape (focus goes back to its mark) or by a
  // press anywhere that is neither the card nor another mark — a mark handles
  // its own click, which moves the pin rather than closing it.
  useEffect(() => {
    if (!pinned) return;

    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== "Escape") return;
      store.dismiss();
      if (opener instanceof HTMLElement || opener instanceof SVGElement) {
        opener.focus();
      }
    };
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (card.current?.contains(target)) return;
      if (target?.closest?.("[data-chart-mark]")) return;
      store.dismiss();
    };

    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onPointer);
    };
  }, [pinned, opener, store]);

  if (!item) return null;

  return (
    <>
      {/* The anchor ring, drawn here rather than on the mark so that
          highlighting a dot does not re-render the other 2,459. */}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute rounded-full border-2 border-ink"
        style={{
          left: anchorX - 7,
          top: anchorY - 7,
          width: 14,
          height: 14,
        }}
      />
      <div
        ref={card}
        role={pinned ? "dialog" : "tooltip"}
        aria-label={label}
        className={
          "absolute z-20 w-max max-w-[min(20rem,calc(100%-0.5rem))] rounded-card " +
          "border border-line bg-surface px-3 py-2.5 text-left text-xs text-ink " +
          "shadow-card " +
          (pinned ? "pointer-events-auto" : "pointer-events-none")
        }
        style={
          place
            ? { left: place.left, top: place.top }
            : { left: 0, top: 0, visibility: "hidden" }
        }
      >
        {render(item.datum, pinned)}
        {pinned ? (
          <button
            type="button"
            onClick={() => store.dismiss()}
            aria-label="Close"
            className="absolute right-1.5 top-1 rounded px-1 text-sm leading-none text-ink-faint hover:text-ink"
          >
            ×
          </button>
        ) : (
          <p className="mt-1.5 text-[0.65rem] text-ink-faint">
            Click to keep this open
          </p>
        )}
      </div>
    </>
  );
};

/* ------------------------------------------------------------------ *
 * Building blocks, so six charts' cards look like one design.
 * ------------------------------------------------------------------ */

export const PopoverTitle = ({
  children,
  sub,
}: {
  children: ReactNode;
  sub?: ReactNode;
}) => (
  <div className="mb-1.5 pr-4">
    <p className="text-sm font-semibold leading-tight text-ink">{children}</p>
    {sub && <p className="mt-0.5 text-ink-muted">{sub}</p>}
  </div>
);

/** Label / value rows. Values are tabular so columns of numbers line up. */
export const PopoverRows = ({
  rows,
}: {
  rows: Array<[ReactNode, ReactNode] | false | null | undefined>;
}) => (
  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
    {rows.filter(Boolean).map((row, index) => {
      const [term, value] = row as [ReactNode, ReactNode];
      return (
        <div key={index} className="contents">
          <dt className="text-ink-muted">{term}</dt>
          <dd className="text-right tabular-nums">{value}</dd>
        </div>
      );
    })}
  </dl>
);

export const PopoverNote = ({ children }: { children: ReactNode }) => (
  <p className="mt-1.5 max-w-[18rem] leading-snug text-ink-muted">{children}</p>
);

/** The way out. Only rendered on a pinned card, where it can be clicked. */
export const PopoverLinks = ({
  links,
}: {
  links: Array<{ to: string; label: string } | false | null | undefined>;
}) => {
  const shown = links.filter(Boolean) as Array<{ to: string; label: string }>;
  if (!shown.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 border-t border-line pt-1.5">
      {shown.map((link) => (
        <Link
          key={link.to}
          to={link.to}
          className="font-medium text-series-1 hover:underline"
        >
          {link.label} →
        </Link>
      ))}
    </div>
  );
};
