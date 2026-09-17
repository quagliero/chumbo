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
 * so the axes follow the B1 tokens into dark mode without either of them having
 * to know about the other.
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
