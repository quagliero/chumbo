import { type ReactNode } from "react";
import { useChartWidth } from "./useChartWidth";

export interface ChartMargin {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

const DEFAULT_MARGIN: ChartMargin = { top: 8, right: 8, bottom: 24, left: 32 };

export interface ChartFrame {
  /** Drawable area, margins already removed. Scales should target these. */
  width: number;
  height: number;
  margin: ChartMargin;
}

interface ChartProps {
  /** Drawing height in CSS pixels, excluding margins. */
  height: number;
  margin?: Partial<ChartMargin>;
  /**
   * What the chart says, for a screen reader and for anyone whose browser
   * fails to paint it. Not the chart's heading — the heading is a real `<h*>`
   * outside; this is the description of the marks.
   */
  label: string;
  /**
   * The same information as text, for readers who cannot use the graphic at
   * all. Charts are a presentation of data we already hold, so there is no
   * excuse for it being the only presentation — the plan's own rule is that a
   * chart is never a dead end.
   */
  fallback?: ReactNode;
  className?: string;
  children: (frame: ChartFrame) => ReactNode;
}

/**
 * The shared chart frame (D0).
 *
 * Owns the three things every chart in workstream D needs and none of them
 * should re-solve: measuring the container, reserving the margins, and being
 * announced properly. Everything above it is marks — a path, some rects, some
 * circles — which is why this stayed hand-rolled rather than becoming a
 * dependency.
 *
 * `children` is a function so a chart receives the measured frame and can build
 * its scales from it, rather than guessing at a width before layout.
 */
export const Chart = ({
  height,
  margin: overrides,
  label,
  fallback,
  className,
  children,
}: ChartProps) => {
  const margin = { ...DEFAULT_MARGIN, ...overrides };
  const { ref, width } = useChartWidth<HTMLDivElement>();

  const inner = width === null ? 0 : Math.max(0, width - margin.left - margin.right);

  return (
    <div ref={ref} className={className}>
      {width !== null && inner > 0 && (
        <svg
          width={width}
          height={height + margin.top + margin.bottom}
          role="img"
          aria-label={label}
          // The marks are decorative to a screen reader; `aria-label` above
          // carries the summary and `fallback` carries the detail.
          focusable="false"
        >
          <g transform={`translate(${margin.left},${margin.top})`}>
            {children({ width: inner, height, margin })}
          </g>
        </svg>
      )}
      {fallback && <div className="sr-only">{fallback}</div>}
    </div>
  );
};
