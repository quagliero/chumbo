/**
 * `<DataTable>` (B3) — the one table on the site.
 *
 * Before this, six components drove `@tanstack/react-table` and each wrote its
 * own `<thead>`/`<tbody>`, so sorting UI, striping, hover, empty states and
 * padding were reimplemented six times and had visibly drifted apart.
 *
 * What it owns:
 *  - sorting, with a single sort-indicator implementation
 *  - a sticky first column, so a wide table on a phone keeps the team name in
 *    view while the numbers scroll. This is the whole point: links get shared
 *    into WhatsApp and opened at 375 px.
 *  - a sticky header (see the note on `maxHeight` below)
 *  - zebra rows, hover, empty state, density
 *
 * Column appearance is declared once per column through `meta.kind` (B4), not
 * spelled out at each cell — see `ColumnKind`.
 *
 * ## The horizontal scroll contract
 *
 * The scroll container is the only thing that scrolls sideways. Callers must
 * NOT wrap it in another `overflow-x-auto`: `position: sticky` resolves against
 * the nearest scrolling ancestor, so an outer scroller would move the pinned
 * column out from under itself.
 *
 * ## Sticky header caveat
 *
 * `overflow-x: auto` forces `overflow-y` to `auto` as well, so the header
 * sticks to the table's own scroll box rather than to the viewport. It
 * therefore only visibly sticks when the table scrolls vertically, which means
 * when a `maxHeight` is set. `top-0` is harmless otherwise. Long tables
 * (AllTimeTrades' 100-row player list) pass a `maxHeight`; a twelve-row
 * standings table does not need one.
 */
import {
  CSSProperties,
  ReactNode,
  useCallback,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ColumnDef,
  Row,
  RowData,
  SortingState,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import {
  ManagerLink,
  PlayerLink,
  SeasonLink,
} from "@/presentation/components/Links";

/**
 * What a column *is*, which decides how it is aligned and — for the three link
 * kinds — what it navigates to.
 *
 * The link kinds delegate to `components/Links`, which already carries the
 * "does this id actually have a page?" guards. There is no second linking path
 * here: if the guard says no, the Links component renders plain text.
 */
export type ColumnKind =
  | "text"
  /** Any bare number. Right-aligned, tabular figures. */
  | "numeric"
  /** Fantasy points. Same treatment as numeric; named so intent survives. */
  | "points"
  /** A W-L-T string. Centred, tabular figures. */
  | "record"
  /** A team or manager name, linked to the manager page. */
  | "manager"
  /** A player name, linked to the player page. */
  | "player"
  /** A season, linked to that season. */
  | "year";

export type ColumnAlign = "left" | "center" | "right";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyColumnDef<TData> = ColumnDef<TData, any>;

declare module "@tanstack/react-table" {
  // The generics are fixed by the library's own declaration; TValue is unused
  // here but must stay in the signature.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** @see ColumnKind. Defaults to `text`. */
    kind?: ColumnKind;
    /** Overrides the alignment `kind` would have chosen. */
    align?: ColumnAlign;
    /** Extra classes for this column's body cells. */
    cellClassName?: string;
    /**
     * Extra classes for this column's cell in one particular row, where what
     * is being marked is a row-AND-column fact rather than a column one: the
     * diagonal of a comparison matrix, where the row team and the column team
     * are the same team.
     */
    rowCellClassName?: (row: TData) => string | undefined;
    /**
     * As `rowCellClassName`, but an inline style. This exists for one reason:
     * a heat map's colour is computed per cell (Breakdown's schedule luck
     * shades by how lucky the week was), and Tailwind can only emit classes it
     * saw spelled out in the source, so a computed colour cannot be one.
     * Reach for `rowCellClassName` for anything from a fixed set.
     */
    rowCellStyle?: (row: TData) => CSSProperties | undefined;
    /** Extra classes for this column's header cell. */
    headerClassName?: string;
    /** `kind: "manager"` — the Sleeper owner id for this row. */
    ownerId?: (row: TData) => string | null | undefined;
    /** `kind: "manager"` — the internal manager id, when the caller has it. */
    managerId?: (row: TData) => string | null | undefined;
    /** `kind: "player"` — the player id for this row. */
    playerId?: (row: TData) => string | number | null | undefined;
    /** `kind: "year"` — the season tab to land on. Defaults to standings. */
    seasonTab?: string;
    /** `kind: "year"` — the year, when the cell renders something else. */
    year?: (row: TData) => number | string | null | undefined;
    /**
     * Tooltip for the three link kinds, per row — for the case where the cell
     * text and the thing it navigates to are not the same words ("Bang Bang
     * Niang" linking to a manager called Steve). Ignored by the other kinds:
     * `components/Links` deliberately does not put a link's title on the
     * plain-text fallback, and that guard lives there.
     */
    linkTitle?: (row: TData) => string | undefined;
  }
}

const ALIGN_BY_KIND: Record<ColumnKind, ColumnAlign> = {
  text: "left",
  numeric: "right",
  points: "right",
  record: "center",
  manager: "left",
  player: "left",
  year: "left",
};

const ALIGN_CLASS: Record<ColumnAlign, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

/** Kinds whose digits should line up in a column. */
const TABULAR_KINDS = new Set<ColumnKind>(["numeric", "points", "record"]);

const DENSITY = {
  comfortable: { head: "px-3 py-3", cell: "px-3 py-3" },
  compact: { head: "px-2 py-1.5", cell: "px-2 py-1.5" },
} as const;

export type Density = keyof typeof DENSITY;

interface DataTableProps<TData> {
  columns: AnyColumnDef<TData>[];
  data: TData[];
  /** Sorting to start in. Omit for the data's own order. */
  initialSorting?: SortingState;
  density?: Density;
  /**
   * How many leading columns stay pinned while the rest scrolls sideways.
   * 0 disables pinning. More than one matters where the identity of a row is
   * split across columns — Standings puts the rank before the team name, and
   * pinning only the rank would leave you scrolling a wall of numbers with no
   * idea whose they are.
   */
  stickyColumns?: number;
  /**
   * Makes the table scroll vertically at this height, which is what actually
   * makes the sticky header bite. A Tailwind class, e.g. `max-h-[32rem]`.
   */
  maxHeight?: string;
  /** Shown in place of the body when there are no rows. */
  emptyMessage?: ReactNode;
  /** Per-row classes that are NOT a background — borders, weight, italics. */
  getRowClassName?: (row: Row<TData>, index: number) => string;
  /**
   * Replaces the row's zebra background for rows that mean something —
   * a playoff seed, a tier band. Separate from `getRowClassName` for two
   * reasons: two background utilities on one element resolve by stylesheet
   * order rather than by what the caller wanted, and the pinned column
   * inherits this value, so a translucent one would composite twice and show
   * as a darker stripe. Return an OPAQUE background class.
   */
  getRowBackground?: (row: Row<TData>, index: number) => string | undefined;
  onRowClick?: (row: TData) => void;
  /** Zebra striping. Off where rows carry their own meaning-bearing colour. */
  zebra?: boolean;
  className?: string;
}

const DataTable = <TData,>({
  columns,
  data,
  initialSorting,
  density = "comfortable",
  stickyColumns = 1,
  maxHeight,
  emptyMessage = "Nothing to show.",
  getRowClassName,
  getRowBackground,
  onRowClick,
  zebra = true,
  className = "",
}: DataTableProps<TData>) => {
  const [sorting, setSorting] = useState<SortingState>(initialSorting ?? []);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  const pad = DENSITY[density];
  const rows = table.getRowModel().rows;
  const columnCount = table.getAllLeafColumns().length;

  // Pinning more than one column needs each one's `left` to be the sum of the
  // widths before it, and those widths are only known once laid out. Measured
  // from the header row, which is the one row guaranteed to exist.
  const headRef = useRef<HTMLTableRowElement>(null);
  const [offsets, setOffsets] = useState<number[]>([]);

  const measure = useCallback(() => {
    if (stickyColumns < 2 || !headRef.current) return;
    const cells = Array.from(headRef.current.children) as HTMLElement[];
    let running = 0;
    const next: number[] = [];
    for (let i = 0; i < Math.min(stickyColumns, cells.length); i += 1) {
      // Floor, and measure fractionally. `offsetWidth` rounds to an integer, so
      // a 59.85px first column yields left:60 for the second — a 0.15px sliver
      // through which the scrolled-under row shows, which reads as a dotted
      // line down the pinned edge. Flooring makes the pinned cells overlap
      // slightly instead, which is invisible; a gap is not.
      next.push(Math.floor(running));
      running += cells[i].getBoundingClientRect().width;
    }
    setOffsets((prev) =>
      prev.length === next.length && prev.every((v, i) => v === next[i])
        ? prev
        : next
    );
  }, [stickyColumns]);

  useLayoutEffect(() => {
    measure();
    if (stickyColumns < 2 || !headRef.current) return;
    const observer = new ResizeObserver(measure);
    observer.observe(headRef.current);
    return () => observer.disconnect();
  }, [measure, stickyColumns, columns, data]);

  const isPinned = (index: number) => index < stickyColumns;
  /** The last pinned column carries the divider against the scrolling part. */
  const isLastPinned = (index: number) => index === stickyColumns - 1;

  const pinStyle = (index: number) =>
    isPinned(index) ? { left: offsets[index] ?? 0 } : undefined;

  // `bg-inherit` on a pinned cell picks up whatever background the row resolved
  // to — zebra, hover, or a caller's highlight — so the pinned column never
  // shows the scrolling content through it.
  const pinnedCell = (index: number) =>
    isPinned(index)
      ? `sticky z-10 bg-inherit ${isLastPinned(index) ? "border-r border-line" : ""}`
      : "";
  // The header cell already carries an explicit background, so it must not also
  // ask to inherit one — two background utilities on one element is a coin toss.
  const pinnedHeader = (index: number) =>
    isPinned(index)
      ? `sticky z-30 ${isLastPinned(index) ? "border-r border-line" : ""}`
      : "";

  const rowBackground = zebra ? "bg-surface even:bg-surface-sunk" : "bg-surface";

  return (
    <div
      className={`overflow-x-auto ${maxHeight ?? ""} ${className}`}
      // A pinned column is only discoverable if the region is focusable, and a
      // keyboard user needs some way to scroll it.
      tabIndex={0}
      role="region"
    >
      <table className="min-w-full border-collapse text-sm">
        <thead>
          {table.getHeaderGroups().map((headerGroup) => (
            <tr
              key={headerGroup.id}
              ref={headRef}
              className="bg-surface-sunk"
            >
              {headerGroup.headers.map((header, index) => {
                const meta = header.column.columnDef.meta;
                const kind = meta?.kind ?? "text";
                const align = meta?.align ?? ALIGN_BY_KIND[kind];
                const canSort = header.column.getCanSort();
                const sorted = header.column.getIsSorted();

                return (
                  <th
                    key={header.id}
                    scope="col"
                    colSpan={header.colSpan}
                    style={pinStyle(index)}
                    aria-sort={
                      !canSort
                        ? undefined
                        : sorted === "asc"
                        ? "ascending"
                        : sorted === "desc"
                        ? "descending"
                        : "none"
                    }
                    onClick={
                      canSort ? header.column.getToggleSortingHandler() : undefined
                    }
                    className={[
                      pad.head,
                      ALIGN_CLASS[align],
                      "sticky top-0 z-20 whitespace-nowrap border-b border-line",
                      "text-xs font-medium uppercase tracking-wider text-ink-muted",
                      "bg-surface-sunk",
                      canSort ? "cursor-pointer select-none hover:text-ink" : "",
                      sorted ? "text-ink" : "",
                      pinnedHeader(index),
                      meta?.headerClassName ?? "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  >
                    <span
                      className={[
                        "inline-flex items-center gap-1",
                        align === "right" ? "flex-row-reverse" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                      {canSort && <SortIndicator direction={sorted} />}
                    </span>
                  </th>
                );
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr className="bg-surface">
              <td
                colSpan={columnCount}
                className={`${pad.cell} text-center text-ink-muted`}
              >
                {emptyMessage}
              </td>
            </tr>
          ) : (
            rows.map((row, index) => (
              <tr
                key={row.id}
                onClick={onRowClick ? () => onRowClick(row.original) : undefined}
                className={[
                  getRowBackground?.(row, index) || rowBackground,
                  // Not `surface-sunk`: that is the zebra colour, so half the
                  // rows would show no hover at all. There is no third neutral
                  // step in the token set yet.
                  "border-b border-line hover:bg-line/40",
                  onRowClick ? "cursor-pointer" : "",
                  getRowClassName?.(row, index) ?? "",
                ]
                  .filter(Boolean)
                  .join(" ")}
              >
                {row.getVisibleCells().map((cell, cellIndex) => {
                  const meta = cell.column.columnDef.meta;
                  const kind = meta?.kind ?? "text";
                  const align = meta?.align ?? ALIGN_BY_KIND[kind];

                  const pin = pinStyle(cellIndex);
                  const rowStyle = meta?.rowCellStyle?.(row.original);

                  return (
                    <td
                      key={cell.id}
                      style={
                        pin || rowStyle ? { ...pin, ...rowStyle } : undefined
                      }
                      className={[
                        pad.cell,
                        ALIGN_CLASS[align],
                        "text-ink",
                        TABULAR_KINDS.has(kind)
                          ? "font-numeric tabular-nums"
                          : "",
                        // Everything but the pinned column keeps the old
                        // no-wrap behaviour. The pinned column is allowed to
                        // wrap so a long team name cannot eat half of a 375 px
                        // viewport and leave no room for the numbers.
                        // The pinned columns may wrap so a long team name
                        // cannot eat half of a 375 px viewport and leave no
                        // room for the numbers. Everything else keeps the
                        // no-wrap behaviour the old tables had.
                        isLastPinned(cellIndex)
                          ? "max-w-[45vw] sm:max-w-none"
                          : "whitespace-nowrap",
                        pinnedCell(cellIndex),
                        meta?.cellClassName ?? "",
                        meta?.rowCellClassName?.(row.original) ?? "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                    >
                      {renderCell(cell, kind, row.original)}
                    </td>
                  );
                })}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
};

/**
 * Renders a cell, wrapping it in the right link for the three link kinds.
 *
 * `isolate` is always set: several tables make the whole row clickable, and a
 * link inside a clickable row must not fire both.
 */
function renderCell<TData>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  cell: any,
  kind: ColumnKind,
  rowData: TData
): ReactNode {
  const meta = cell.column.columnDef.meta;
  const content = flexRender(cell.column.columnDef.cell, cell.getContext());

  if (kind === "manager") {
    return (
      <ManagerLink
        ownerId={meta?.ownerId?.(rowData)}
        managerId={meta?.managerId?.(rowData)}
        title={meta?.linkTitle?.(rowData)}
        isolate
      >
        {content}
      </ManagerLink>
    );
  }

  if (kind === "player") {
    return (
      <PlayerLink
        playerId={meta?.playerId?.(rowData)}
        title={meta?.linkTitle?.(rowData)}
        isolate
      >
        {content}
      </PlayerLink>
    );
  }

  if (kind === "year") {
    const year = meta?.year?.(rowData) ?? cell.getValue();
    if (year === null || year === undefined) return content;
    return (
      <SeasonLink
        year={year}
        tab={meta?.seasonTab}
        title={meta?.linkTitle?.(rowData)}
        isolate
      >
        {content}
      </SeasonLink>
    );
  }

  return content;
}

/** The site's only sort indicator. */
const SortIndicator = ({
  direction,
}: {
  direction: "asc" | "desc" | false;
}) => (
  <span
    aria-hidden="true"
    className={direction ? "text-ink" : "text-ink-faint"}
  >
    {direction === "asc" ? "↑" : direction === "desc" ? "↓" : "↕"}
  </span>
);

export default DataTable;
