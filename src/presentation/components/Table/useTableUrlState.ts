/**
 * The React half of E8: `tableUrlState` wired to the router.
 *
 * The URL is the single source of truth here — the state is *derived* from
 * `useSearchParams` on every render rather than mirrored into `useState` and
 * synced back with an effect. That is what makes a cold load, a shared link
 * and the back button all take the same path through the code, and it is why
 * there is no effect in this file to loop: React Router hands back a new
 * `URLSearchParams` instance every render, so an effect keyed on the object
 * would fire forever. Everything below keys on the parameter *strings*.
 *
 * ## push vs replace
 *
 * Every write is `replace: true`. Sorting a column is a change of view, not a
 * change of place: pushing would mean five clicks on a header cost five presses
 * of Back to leave the page, and typing in the filter box would bury the
 * previous page under one history entry per keystroke. Replacing still updates
 * the address bar — so the link is there to copy, which is the entire point of
 * E8 — while Back keeps meaning "the page I came from".
 */
import { useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { OnChangeFn, SortingState } from "@tanstack/react-table";
import {
  decodeSort,
  encodeSort,
  filterParam,
  sortParam,
  writeTableUrlState,
} from "./tableUrlState";

interface Options {
  /** Namespace, for a page showing more than one opted-in table. */
  key?: string;
  /** The ids this table's columns actually have. */
  columnIds: string[];
  /** What the table sorts by when the URL says nothing. */
  defaultSorting: SortingState;
}

interface TableUrlStateHandle {
  sorting: SortingState;
  onSortingChange: OnChangeFn<SortingState>;
  filter: string;
  setFilter: (value: string) => void;
}

/** Accepts any id — for re-reading something this module itself encoded. */
const anyColumn = () => true;

export const useTableUrlState = ({
  key,
  columnIds,
  defaultSorting,
}: Options): TableUrlStateHandle => {
  const [searchParams, setSearchParams] = useSearchParams();

  const rawSort = searchParams.get(sortParam(key));
  const filter = searchParams.get(filterParam(key)) ?? "";

  // Both of these are keyed on STRINGS, never on the `columnIds` /
  // `defaultSorting` arrays: those are fresh literals on every render at most
  // call sites, and an unstable `sorting` identity would make
  // `getSortedRowModel` re-sort on every single render.
  const knownIds = columnIds.join(",");
  const encodedDefault = encodeSort(defaultSorting);

  const fallback = useMemo(
    () => decodeSort(encodedDefault, anyColumn),
    [encodedDefault]
  );

  const sorting = useMemo(() => {
    const known = new Set(knownIds ? knownIds.split(",") : []);
    return decodeSort(rawSort, (id) => known.has(id), fallback);
  }, [rawSort, knownIds, fallback]);

  const onSortingChange = useCallback<OnChangeFn<SortingState>>(
    (updater) => {
      setSearchParams(
        (prev) => {
          // The updater wants the state it is updating, and the URL holds it.
          const current = decodeSort(
            prev.get(sortParam(key)),
            anyColumn,
            fallback
          );
          const next =
            typeof updater === "function" ? updater(current) : updater;
          return writeTableUrlState(
            prev,
            { sorting: next },
            { key, defaultSorting: fallback }
          );
        },
        { replace: true }
      );
    },
    [key, fallback, setSearchParams]
  );

  const setFilter = useCallback(
    (value: string) => {
      setSearchParams(
        (prev) => writeTableUrlState(prev, { filter: value }, { key }),
        { replace: true }
      );
    },
    [key, setSearchParams]
  );

  return { sorting, onSortingChange, filter, setFilter };
};
