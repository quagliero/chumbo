import { Link } from "react-router-dom";
import { useH2HMatrix, type H2HCell, type H2HMatrixRow } from "./useH2HMatrix";

/**
 * The head-to-head matrix (D3).
 *
 * The page used to be two scrolling lists of names: pick one on the left, one
 * on the right, get sent to a detail page. To learn that `dix` owns `fin` you
 * first had to suspect it. Every one of the 136 rivalries in league history was
 * one click away and none of them was visible.
 *
 * So: the whole grid at once. Read a row as "this manager against the field".
 * A green cell is a winning record, a red one a losing record, and the depth of
 * the tint is how lopsided it is.
 *
 * **This is a table, not a chart, and deliberately so.** It sits in
 * `components/Chart/` with the rest of workstream D and builds into the same
 * chunk, but it draws no SVG and uses none of D0's scales. A heatmap of
 * categorical rows against categorical columns, where every cell carries a
 * legible value and a link, IS a table — and rendering it as one means the
 * semantics (`<th scope="row">`, `<th scope="col">`, a caption) come for free
 * and are real rather than announced through ARIA. `PowerRibbon` needs an
 * `sr-only` fallback table because an SVG path cannot be read; this needs no
 * fallback because it already is the fallback.
 *
 * **Colour encodes the RESULT, never the manager** (F2). It is drawn from the
 * reserved `result-*` tokens, not the `series-*` palette, because a green cell
 * has to mean the same thing in every row. And it is never the only channel:
 * every cell also prints the record with wins first, so `4-11` is unambiguous
 * to a reader who cannot separate the two hues at all. Verify that by reading
 * the grid in greyscale — it still works, which is the test.
 */

/**
 * Opaque tints of `result-win` / `result-loss`, mixed with white at 12 / 28 /
 * 48 percent for shading steps 1-3.
 *
 * Opaque, not `bg-result-win/20`: the row headers are `position: sticky` and
 * scroll over these cells, and a translucent fill composites against whatever
 * passes beneath it. B1 hit the same thing with the standings bands.
 *
 * The top step stops at 48% so that `text-ink` on it still clears 7:1 — the
 * record has to stay readable in the very cells the eye is drawn to.
 */
const TINTS: Record<"ahead" | "behind", readonly string[]> = {
  ahead: ["", "#e5ece8", "#c3d3cb", "#99b4a5"],
  behind: ["", "#f5e5e4", "#e7c2bf", "#d59692"],
};

/** An even series, or a rivalry that never happened. */
const LEVEL_TINT = "#f5f6f9";
const UNPLAYED_TINT = "#ffffff";
/**
 * The diagonal, a step darker than a level series so the two do not read as the
 * same cell — "these two are dead even" and "these two are the same person" are
 * different facts and a 17x17 grid has no room to be ambiguous about either.
 */
const DIAGONAL_TINT = "#e4e7ee";

const tintFor = (cell: H2HCell): string => {
  if (cell.meetings === 0) return UNPLAYED_TINT;
  if (cell.lead === "level" || cell.margin === 0) return LEVEL_TINT;
  return TINTS[cell.lead][cell.margin];
};

/** `12-7`, or `12-7-1` when the series has a tie in it. Wins always first. */
const recordText = (cell: H2HCell): string =>
  cell.ties > 0
    ? `${cell.wins}-${cell.losses}-${cell.ties}`
    : `${cell.wins}-${cell.losses}`;

const plural = (count: number, noun: string) =>
  `${count} ${noun}${count === 1 ? "" : "s"}`;

/**
 * What a screen reader gets, and what the tooltip says. Spelled out in words
 * rather than as "8-0", because a record read aloud as "eight dash zero" is
 * ambiguous about which way round it goes — which is the one thing the cell
 * must not be.
 */
const cellLabel = (row: H2HMatrixRow, cell: H2HCell): string => {
  if (cell.meetings === 0) {
    return `${row.name} has never played ${cell.opponentName}`;
  }
  const verb =
    cell.lead === "ahead" ? "leads" : cell.lead === "behind" ? "trails" : "is level with";
  const ties = cell.ties > 0 ? ` with ${plural(cell.ties, "tie")}` : "";
  return `${row.name} ${verb} ${cell.opponentName} ${plural(cell.wins, "win")} to ${
    cell.losses
  }${ties}`;
};

export const H2HMatrix = ({ className }: { className?: string }) => {
  const { order, rows } = useH2HMatrix();

  return (
    <div className={className}>
      <Legend />

      {/* The grid is ~960px at its narrowest legible size, so on a phone it
          scrolls sideways inside this box. The box, not the page: a page that
          scrolls horizontally as a whole loses the header and the nav with it.
          `role="region"` plus `tabIndex` because a pinned column is only
          discoverable if a keyboard user can scroll the thing at all — same
          reasoning as DataTable. */}
      <div
        className="overflow-x-auto rounded-card border border-line"
        tabIndex={0}
        role="region"
        aria-label="Head-to-head matrix, scrollable"
      >
        {/* `min-w-full`, so on a wide screen the columns share out the spare
            width instead of leaving a bald strip down the right of the box,
            while the per-column minimums still force a scroll on a phone. */}
        <table className="min-w-full border-collapse text-xs">
          <caption className="sr-only">
            All-time regular-season head-to-head records. Each row is one
            manager; each column is an opponent; each cell is the row manager's
            record against that opponent, wins first.
          </caption>
          <thead>
            <tr>
              {/* The corner sits above both sticky axes, so it outranks both. */}
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 w-[68px] min-w-[68px] border-b border-r border-line bg-surface-sunk px-2 py-2 text-left text-[10px] font-medium uppercase tracking-wider text-ink-muted sm:w-[96px] sm:min-w-[96px]"
              >
                vs
              </th>
              {order.map((opponentId) => (
                <th
                  key={opponentId}
                  scope="col"
                  className="sticky top-0 z-20 min-w-[46px] border-b border-line bg-surface-sunk px-1 py-2 text-[10px] font-medium text-ink-muted sm:min-w-[56px]"
                >
                  {opponentId}
                </th>
              ))}
              <th
                scope="col"
                className="sticky top-0 z-20 min-w-[72px] whitespace-nowrap border-b border-l border-line bg-surface-sunk px-2 py-2 text-[10px] font-medium uppercase tracking-wider text-ink-muted"
              >
                Field
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, rowIndex) => (
              <tr key={row.managerId}>
                {/* No zebra striping. The cells carry meaning in colour, and a
                    stripe under them is a second signal in the same channel. */}
                <th
                  scope="row"
                  className="sticky left-0 z-10 border-r border-line bg-surface px-2 py-1 text-left font-medium"
                >
                  <Link
                    to={`/managers/${row.managerId}`}
                    className="text-ink hover:text-series-1 hover:underline"
                  >
                    {row.managerId}
                  </Link>
                </th>

                {row.cells.map((cell, columnIndex) =>
                  cell === null ? (
                    // The diagonal. A manager is not their own rivalry, so this
                    // is a hole in the grid rather than a 0-0 record: no link,
                    // no colour, and nothing for a screen reader to read out.
                    <td
                      key={order[columnIndex]}
                      aria-hidden="true"
                      className="border border-surface"
                      style={{ backgroundColor: DIAGONAL_TINT }}
                    >
                      <span className="block text-center text-ink-faint">·</span>
                    </td>
                  ) : (
                    <td
                      key={cell.opponentId}
                      className="border border-surface p-0 text-center"
                      style={{ backgroundColor: tintFor(cell) }}
                    >
                      {cell.meetings === 0 ? (
                        <span
                          className="block px-1 py-2 text-ink-faint"
                          title={cellLabel(row, cell)}
                        >
                          —
                        </span>
                      ) : (
                        <Link
                          to={`/h2h/${row.managerId}/${cell.opponentId}`}
                          aria-label={cellLabel(row, cell)}
                          title={cellLabel(row, cell)}
                          className="block px-1 py-2 font-numeric tabular-nums text-ink ring-inset hover:ring-2 hover:ring-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink"
                        >
                          {recordText(cell)}
                        </Link>
                      )}
                    </td>
                  )
                )}

                {/* Why this row is where it is: the record that sorted it. */}
                <td
                  className={`whitespace-nowrap border-l border-line px-2 py-1 text-center font-numeric tabular-nums font-medium ${
                    rowIndex === 0 ? "text-result-win" : "text-ink-muted"
                  }`}
                >
                  {row.ties > 0
                    ? `${row.wins}-${row.losses}-${row.ties}`
                    : `${row.wins}-${row.losses}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-2 text-xs text-ink-faint">
        Regular season only, all seasons, wins first. Best all-time record
        against the field at the top, so the green tends to gather above the
        diagonal — the cells that break that pattern are the ones worth
        arguing about. Tap any cell for the full series.
      </p>
    </div>
  );
};

/**
 * The legend, which also states the thing the colours cannot: that the tint
 * says how lopsided a series is, and that two games is not lopsided however it
 * ended.
 */
const Legend = () => (
  <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-ink-muted">
    <span className="flex items-center gap-1.5">
      <Swatch color={TINTS.behind[3]} />
      <Swatch color={TINTS.behind[2]} />
      <Swatch color={TINTS.behind[1]} />
      <Swatch color={LEVEL_TINT} />
      <Swatch color={TINTS.ahead[1]} />
      <Swatch color={TINTS.ahead[2]} />
      <Swatch color={TINTS.ahead[3]} />
    </span>
    <span>
      <span className="text-result-loss">losing record</span>
      {" · level · "}
      <span className="text-result-win">winning record</span>
    </span>
    <span className="text-ink-faint">
      Depth of colour is how lopsided, tempered by how many meetings.
    </span>
  </div>
);

const Swatch = ({ color }: { color: string }) => (
  <span
    aria-hidden="true"
    className="inline-block h-3 w-3 rounded-sm border border-line"
    style={{ backgroundColor: color }}
  />
);
