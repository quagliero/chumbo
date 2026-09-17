import { Chart } from "../Chart";
import { linePath } from "../scale";
import { getManagerAccent } from "@/domain/managerColors";
import {
  sparklinePoints,
  type CareerShape,
} from "./useCareerSparkline";

/**
 * A manager's career as one line, 200px wide (F1c).
 *
 * The Managers page is a grid of fourteen careers, and until now you had to
 * read fourteen stacks of numbers to tell a dynasty from a doormat. This is the
 * shape instead: champion at the top, wooden spoon at the bottom, one season
 * per step, gaps where they were not in the league.
 *
 * **Colour carries identity here, and that is allowed.** F2's rule is about
 * charts with many managers in them — the power ribbon must not colour twelve
 * lines twelve ways, because seventeen distinguishable hues do not exist at
 * accessible contrast. A card has exactly ONE manager on it, so the accent is
 * unambiguous decoration next to their avatar and name, and two managers
 * sharing a hue costs nothing because they are never side by side in the same
 * frame.
 *
 * Nothing here is a link. The card itself is the link, and an anchor inside an
 * anchor is invalid HTML that browsers resolve by guessing.
 */

const HEIGHT = 30;
const MARGIN = { top: 5, right: 5, bottom: 5, left: 5 };

export const CareerSparkline = ({
  shape,
  years,
  className,
}: {
  shape: CareerShape;
  years: readonly number[];
  className?: string;
}) => {
  const accent = getManagerAccent(shape.managerId);

  return (
    <Chart
      height={HEIGHT}
      margin={MARGIN}
      label={summarise(shape, years)}
      fallback={<FinishList shape={shape} />}
      // `Chart` renders nothing until it has measured its container, which on
      // this page is fourteen boxes appearing a frame late and pushing every
      // card taller as they arrive. The box is the drawing height plus its
      // margins, reserved up front, so nothing moves.
      className={["min-h-10", className].filter(Boolean).join(" ")}
    >
      {(frame) => {
        const points = sparklinePoints(shape.points, frame.width, frame.height);

        return (
          <>
            {/* Mid-table. Without it the line is a shape with no scale on it —
                you can see that it goes up, not that it went from bad to good. */}
            <line
              x1={0}
              x2={frame.width}
              y1={frame.height / 2}
              y2={frame.height / 2}
              stroke="currentColor"
              strokeOpacity={0.12}
              strokeDasharray="2 3"
              shapeRendering="crispEdges"
              className="text-ink-muted"
            />

            <path
              d={linePath(points)}
              fill="none"
              stroke={accent}
              strokeWidth={1.75}
              strokeLinejoin="round"
              strokeLinecap="round"
            />

            {/* Every season they played, faintly. A manager with a single
                season has no line at all — a path with one point draws
                nothing — so these are also what stops that card being blank. */}
            {points.map((point, index) =>
              point ? (
                <circle
                  key={years[index]}
                  cx={point.x}
                  cy={point.y}
                  r={1.6}
                  fill={accent}
                  fillOpacity={0.35}
                />
              ) : null
            )}

            {/* Titles, marked. Championships are the point of the page, so they
                are the one thing on the line drawn at full weight. */}
            {points.map((point, index) => {
              const finish = shape.points[index];
              if (!point || !finish || finish.position !== 1 || finish.provisional) {
                return null;
              }
              return (
                <circle
                  key={`title-${years[index]}`}
                  cx={point.x}
                  cy={point.y}
                  r={3}
                  fill={accent}
                  stroke="var(--color-surface, #fff)"
                  strokeWidth={1.25}
                />
              );
            })}

            {/* Where they are now. Hollow while the season is still being
                played, matching the power ribbon's convention for a finish
                that is real but provisional. */}
            {(() => {
              const lastIndex = lastPlayedIndex(shape);
              const point = lastIndex === null ? null : points[lastIndex];
              if (!point || !shape.latest || shape.latest.position === 1) return null;
              return (
                <circle
                  cx={point.x}
                  cy={point.y}
                  r={2.75}
                  fill={
                    shape.latest.provisional ? "var(--color-surface, #fff)" : accent
                  }
                  stroke={accent}
                  strokeWidth={1.25}
                />
              );
            })()}
          </>
        );
      }}
    </Chart>
  );
};

/** Index of the newest season this manager actually played. */
const lastPlayedIndex = (shape: CareerShape): number | null => {
  for (let i = shape.points.length - 1; i >= 0; i--) {
    if (shape.points[i]) return i;
  }
  return null;
};

/**
 * "2nd", "3rd", "11th". `identityStats.ts` has a private copy of this; it is
 * four lines and not worth a shared module until a third caller wants it.
 */
const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

/** What the line says, for a screen reader and for anyone it fails to paint for. */
const summarise = (shape: CareerShape, years: readonly number[]): string => {
  if (!shape.latest) return "No seasons played";
  const first = shape.points.findIndex((p) => p !== null);
  return (
    `Finishing position, ${years[first]} to ${shape.latest.year}: ` +
    `${shape.seasonsPlayed} seasons, ` +
    `${shape.titles} ${shape.titles === 1 ? "title" : "titles"}, ` +
    // A manager whose only season is the one being played has no settled
    // finish to be best at yet.
    (shape.bestFinish === null ? "" : `best ${ordinal(shape.bestFinish)}, `) +
    `most recently ${ordinal(shape.latest.position)} of ${shape.latest.field}` +
    (shape.latest.provisional ? " with the season in progress" : "")
  );
};

/**
 * The same series as text.
 *
 * A chart is a presentation of numbers the page already holds, so it is never
 * the only way to get at them — the rule D0 set for the power ribbon, which
 * applies at 200px just as much as at full width.
 */
const FinishList = ({ shape }: { shape: CareerShape }) => (
  <ul>
    {shape.points.map((point) =>
      point ? (
        <li key={point.year}>
          {point.year}: {ordinal(point.position)} of {point.field}
          {point.provisional ? " (season in progress)" : ""}
        </li>
      ) : null
    )}
  </ul>
);
