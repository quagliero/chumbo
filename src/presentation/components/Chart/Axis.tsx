import { type Scale } from "./scale";

interface AxisProps {
  ticks: number[];
  scale: Scale;
  /** Drawable extent along the other dimension, for gridlines and placement. */
  length: number;
  format?: (value: number) => string;
  /** Draw a faint rule across the plot at each tick. */
  grid?: boolean;
}

/**
 * Axes (D0).
 *
 * Tick text is `currentColor` at reduced opacity rather than a hard-coded grey,
 * so the axes take their colour from the surrounding type instead of each
 * needing to know about the other.
 *
 * An earlier version of this comment said that made the axes follow the tokens
 * "into dark mode". There is no dark mode: the B1 palette is literal hex with
 * no dark variants, and `index.css` now declares `color-scheme: light` because
 * leaving it unset rendered dark text on the browser's dark ground. Raised by
 * D4.
 */

export const YAxis = ({
  ticks,
  scale,
  length,
  format = String,
  grid = true,
}: AxisProps) => (
  <g aria-hidden="true" className="text-ink-muted">
    {ticks.map((tick) => {
      const y = scale(tick);
      return (
        <g key={tick} transform={`translate(0,${y})`}>
          {grid && (
            <line
              x1={0}
              x2={length}
              stroke="currentColor"
              strokeOpacity={0.12}
              shapeRendering="crispEdges"
            />
          )}
          <text
            x={-6}
            dy="0.32em"
            textAnchor="end"
            fill="currentColor"
            fontSize={11}
          >
            {format(tick)}
          </text>
        </g>
      );
    })}
  </g>
);

export const XAxis = ({
  ticks,
  scale,
  length,
  format = String,
  grid = false,
}: AxisProps) => (
  <g aria-hidden="true" className="text-ink-muted">
    {ticks.map((tick) => {
      const x = scale(tick);
      return (
        <g key={tick} transform={`translate(${x},0)`}>
          {grid && (
            <line
              y1={0}
              y2={length}
              stroke="currentColor"
              strokeOpacity={0.12}
              shapeRendering="crispEdges"
            />
          )}
          <text
            y={length + 14}
            textAnchor="middle"
            fill="currentColor"
            fontSize={11}
          >
            {format(tick)}
          </text>
        </g>
      );
    })}
  </g>
);
