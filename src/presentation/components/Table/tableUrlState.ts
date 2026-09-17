/**
 * Table view state as query-string parameters (E8).
 *
 * The point of the site is that someone finds a nugget and pastes it into the
 * group chat. Tab state already survives that trip; sort and filter state did
 * not, so "look who has the most bench points" arrived as a link to an
 * unsorted table and the nugget died with the sender.
 *
 * This file is the whole contract, and it is deliberately pure: no React, no
 * router, no DOM. `useTableUrlState` wires it to `useSearchParams`, and the
 * round trip — state → URL → state — is testable in the node-environment
 * vitest setup the rest of the repo uses.
 *
 * ## The wire format
 *
 *   ?sort=pointsFor.desc            one table on the page
 *   ?owners.sort=avgPoints.asc      namespaced, for a page with several
 *   ?sort=wins.desc,pointsFor.desc  multi-sort (shift-click), capped at three
 *   ?sort=none                      explicitly unsorted, where the table's
 *                                   default is a sort
 *   ?q=gronk                        the free-text filter, when one is enabled
 *
 * `.` separates the column from the direction because `URLSearchParams`
 * leaves it unescaped, where the more obvious `:` comes back as `%3A` and
 * makes the shared link look like a tracking URL. Column ids are split on the
 * LAST dot, so an id containing one still resolves.
 *
 * ## Junk in the URL
 *
 * Links get retyped, truncated by chat clients and edited by hand, and a
 * column that existed last month may not exist today. Nothing here throws:
 * an unparseable or unknown descriptor is dropped, and if that leaves nothing
 * the table falls back to the sort it would have had with no parameters at
 * all. The only way to get "no sort" is to ask for it by name (`none`).
 */
import type { ColumnDef, RowData, SortingState } from "@tanstack/react-table";

/** Asking, in as many words, for no sort at all. */
export const SORT_NONE = "none";

/**
 * How many sort descriptors survive a round trip. Shift-clicking can stack
 * more than this; three is already past what anyone reads off a URL, and the
 * cap keeps a hand-edited link from turning into a sorting benchmark.
 */
export const MAX_SORT_COLUMNS = 3;

/** The parameter a table's sort lives in. */
export const sortParam = (key?: string): string =>
  key ? `${key}.sort` : "sort";

/** The parameter a table's free-text filter lives in. */
export const filterParam = (key?: string): string => (key ? `${key}.q` : "q");

export interface TableUrlState {
  sorting: SortingState;
  filter: string;
}

interface ReadOptions {
  /** Namespace, for a page showing more than one opted-in table. */
  key?: string;
  /** Which column ids this table actually has. Anything else is dropped. */
  isKnownColumn: (id: string) => boolean;
  /** What the table sorts by with no parameters. */
  defaultSorting?: SortingState;
}

interface WriteOptions {
  key?: string;
  /**
   * The same default the read used. State equal to it is written as *absent*
   * rather than spelled out, so the common case stays a clean URL and
   * "default" keeps meaning whatever the table's default currently is.
   */
  defaultSorting?: SortingState;
}

const asParams = (search: string | URLSearchParams): URLSearchParams =>
  typeof search === "string" ? new URLSearchParams(search) : search;

/** Two sorts are the same sort. */
export const sameSorting = (a: SortingState, b: SortingState): boolean =>
  a.length === b.length &&
  a.every((s, i) => s.id === b[i].id && s.desc === b[i].desc);

/** `[{id: "wins", desc: true}]` → `"wins.desc"`. */
export const encodeSort = (sorting: SortingState): string =>
  sorting.length === 0
    ? SORT_NONE
    : sorting
        .slice(0, MAX_SORT_COLUMNS)
        .map((s) => `${s.id}.${s.desc ? "desc" : "asc"}`)
        .join(",");

/**
 * `"wins.desc"` → `[{id: "wins", desc: true}]`, or `fallback` for anything
 * this table cannot honour. Never throws.
 */
export const decodeSort = (
  raw: string | null | undefined,
  isKnownColumn: (id: string) => boolean,
  fallback: SortingState = []
): SortingState => {
  if (raw === null || raw === undefined) return fallback;

  const trimmed = raw.trim();
  // `?sort=` is a truncated link, not an instruction. `?sort=none` is one.
  if (trimmed === "") return fallback;
  if (trimmed.toLowerCase() === SORT_NONE) return [];

  const seen = new Set<string>();
  const parsed: SortingState = [];

  for (const piece of trimmed.split(",")) {
    const token = piece.trim();
    // Split on the last dot: the direction is one word, the id may not be.
    const split = token.lastIndexOf(".");
    if (split <= 0 || split === token.length - 1) continue;

    const id = token.slice(0, split);
    const direction = token.slice(split + 1).toLowerCase();
    if (direction !== "asc" && direction !== "desc") continue;
    if (!isKnownColumn(id) || seen.has(id)) continue;

    seen.add(id);
    parsed.push({ id, desc: direction === "desc" });
    if (parsed.length === MAX_SORT_COLUMNS) break;
  }

  // Every descriptor was junk — a renamed column, a mangled link. The table
  // that a first-time visitor sees is the right thing to fall back to.
  return parsed.length ? parsed : fallback;
};

/** The state a URL asks for, as this table can actually honour it. */
export const readTableUrlState = (
  search: string | URLSearchParams,
  { key, isKnownColumn, defaultSorting = [] }: ReadOptions
): TableUrlState => {
  const params = asParams(search);
  return {
    sorting: decodeSort(
      params.get(sortParam(key)),
      isKnownColumn,
      defaultSorting
    ),
    filter: params.get(filterParam(key)) ?? "",
  };
};

/**
 * The parameters after a change, as a NEW `URLSearchParams` — every other
 * parameter (the tab, another table's sort) is carried through untouched.
 *
 * State that matches the default is removed rather than written, so a table
 * nobody has touched contributes nothing to the URL.
 */
export const writeTableUrlState = (
  search: string | URLSearchParams,
  state: Partial<TableUrlState>,
  { key, defaultSorting = [] }: WriteOptions = {}
): URLSearchParams => {
  const next = new URLSearchParams(asParams(search));

  if (state.sorting !== undefined) {
    const name = sortParam(key);
    if (sameSorting(state.sorting, defaultSorting)) next.delete(name);
    else next.set(name, encodeSort(state.sorting));
  }

  if (state.filter !== undefined) {
    const name = filterParam(key);
    if (state.filter === "") next.delete(name);
    else next.set(name, state.filter);
  }

  return next;
};

/**
 * The ids `@tanstack/react-table` will give these columns.
 *
 * Needed before the table exists, because the sort read out of the URL is part
 * of the table's initial state. It mirrors the library's own derivation
 * (`table-core`'s `createColumn`): an explicit `id`, else the accessor key with
 * dots swapped for underscores, else a string `header`. A column that yields
 * none of those cannot be named in a URL either, so it is simply absent.
 */
export const columnIdsOf = <TData extends RowData>(
  // The library's own ColumnDef is invariant in its value type; this list is
  // only ever read for ids.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  columns: ColumnDef<TData, any>[]
): string[] => {
  const ids: string[] = [];
  for (const column of columns) {
    const explicit = column.id;
    const accessorKey = (column as { accessorKey?: string | number })
      .accessorKey;
    const fromHeader =
      typeof column.header === "string" ? column.header : undefined;

    const id =
      explicit ??
      (accessorKey !== undefined
        ? String(accessorKey).replace(/\./g, "_")
        : fromHeader);

    if (id) ids.push(id);
  }
  return ids;
};
