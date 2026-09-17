/**
 * E8 — the round trip.
 *
 * The shareable link is the feature, so the thing worth testing is not that a
 * header click sorts a table (react-table's job) but that state survives being
 * written to a URL, pasted into a chat client and read back on a cold load —
 * and that a mangled one degrades to the table a first-time visitor sees
 * instead of throwing on the way.
 */
import { describe, expect, it } from "vitest";
import type { ColumnDef, SortingState } from "@tanstack/react-table";
import {
  columnIdsOf,
  decodeSort,
  encodeSort,
  filterParam,
  readTableUrlState,
  sortParam,
  writeTableUrlState,
} from "../tableUrlState";

const COLUMNS = ["team", "wins", "pointsFor", "benchPoints", "win.pct"];
const isKnownColumn = (id: string) => COLUMNS.includes(id);

/** Write the state to a URL, then read it back the way a cold load would. */
const roundTrip = (
  sorting: SortingState,
  filter: string,
  options: { key?: string; defaultSorting?: SortingState } = {}
) => {
  const written = writeTableUrlState(
    "",
    { sorting, filter },
    { key: options.key, defaultSorting: options.defaultSorting }
  );
  // Through a real string, as a pasted link would be.
  return readTableUrlState(written.toString(), {
    key: options.key,
    isKnownColumn,
    defaultSorting: options.defaultSorting,
  });
};

describe("sort round trip", () => {
  it("restores a single sort", () => {
    expect(roundTrip([{ id: "benchPoints", desc: true }], "")).toEqual({
      sorting: [{ id: "benchPoints", desc: true }],
      filter: "",
    });
  });

  it("restores an ascending sort", () => {
    expect(roundTrip([{ id: "wins", desc: false }], "")).toEqual({
      sorting: [{ id: "wins", desc: false }],
      filter: "",
    });
  });

  it("restores a multi-column sort in order", () => {
    const sorting = [
      { id: "wins", desc: true },
      { id: "pointsFor", desc: false },
    ];
    expect(roundTrip(sorting, "").sorting).toEqual(sorting);
  });

  it("restores a filter, spaces and case included", () => {
    expect(roundTrip([], "Rob  Gronkowski").filter).toBe("Rob  Gronkowski");
  });

  it("restores sort and filter together", () => {
    expect(roundTrip([{ id: "pointsFor", desc: true }], "gronk")).toEqual({
      sorting: [{ id: "pointsFor", desc: true }],
      filter: "gronk",
    });
  });

  it("survives a column id that contains a dot", () => {
    expect(roundTrip([{ id: "win.pct", desc: true }], "").sorting).toEqual([
      { id: "win.pct", desc: true },
    ]);
  });

  it("round-trips through a namespaced key", () => {
    expect(
      roundTrip([{ id: "wins", desc: true }], "kitch", { key: "owners" })
        .sorting
    ).toEqual([{ id: "wins", desc: true }]);
  });

  it("keeps the two directions distinct", () => {
    expect(encodeSort([{ id: "wins", desc: true }])).not.toBe(
      encodeSort([{ id: "wins", desc: false }])
    );
  });
});

describe("the default state", () => {
  it("a table with no parameters looks exactly as it does today", () => {
    const state = readTableUrlState("", {
      isKnownColumn,
      defaultSorting: [{ id: "wins", desc: true }],
    });
    expect(state).toEqual({
      sorting: [{ id: "wins", desc: true }],
      filter: "",
    });
  });

  it("with no default and no parameters, nothing is sorted", () => {
    expect(readTableUrlState("", { isKnownColumn })).toEqual({
      sorting: [],
      filter: "",
    });
  });

  it("writes nothing to the URL while the table is untouched", () => {
    const params = writeTableUrlState(
      "tab=standings",
      { sorting: [{ id: "wins", desc: true }], filter: "" },
      { defaultSorting: [{ id: "wins", desc: true }] }
    );
    expect(params.has(sortParam())).toBe(false);
    expect(params.has(filterParam())).toBe(false);
    expect(params.get("tab")).toBe("standings");
  });

  it("carries every other parameter through untouched", () => {
    const params = writeTableUrlState(
      "tab=trades&owners.sort=wins.desc",
      { sorting: [{ id: "pointsFor", desc: true }] },
      { key: "players" }
    );
    expect(params.get("tab")).toBe("trades");
    expect(params.get("owners.sort")).toBe("wins.desc");
    expect(params.get("players.sort")).toBe("pointsFor.desc");
  });

  it("clearing a sort that has a default says so, and comes back cleared", () => {
    const options = { defaultSorting: [{ id: "wins", desc: true }] };
    const params = writeTableUrlState("", { sorting: [] }, options);
    expect(params.get(sortParam())).toBe("none");
    expect(
      readTableUrlState(params.toString(), { isKnownColumn, ...options }).sorting
    ).toEqual([]);
  });

  it("clearing the filter removes the parameter rather than leaving it empty", () => {
    const params = writeTableUrlState("q=gronk", { filter: "" });
    expect(params.has("q")).toBe(false);
  });
});

describe("junk in the URL", () => {
  const fallback: SortingState = [{ id: "wins", desc: true }];
  const read = (search: string) =>
    readTableUrlState(search, { isKnownColumn, defaultSorting: fallback });

  it("falls back when the column does not exist", () => {
    expect(read("sort=touchdownsInTheRain.desc").sorting).toEqual(fallback);
  });

  it("falls back when the direction is malformed", () => {
    expect(read("sort=wins.sideways").sorting).toEqual(fallback);
    expect(read("sort=wins.").sorting).toEqual(fallback);
    expect(read("sort=wins").sorting).toEqual(fallback);
    expect(read("sort=.desc").sorting).toEqual(fallback);
  });

  it("falls back on an empty or whitespace parameter", () => {
    expect(read("sort=").sorting).toEqual(fallback);
    expect(read("sort=%20%20").sorting).toEqual(fallback);
  });

  it("keeps the valid half of a partly mangled sort", () => {
    expect(read("sort=nope.desc,pointsFor.asc").sorting).toEqual([
      { id: "pointsFor", desc: false },
    ]);
  });

  it("ignores a repeated column rather than sorting by it twice", () => {
    expect(read("sort=wins.desc,wins.asc").sorting).toEqual([
      { id: "wins", desc: true },
    ]);
  });

  it("caps a hand-written sort at three columns", () => {
    expect(
      read("sort=team.asc,wins.desc,pointsFor.desc,benchPoints.asc").sorting
    ).toHaveLength(3);
  });

  it("accepts the direction in any case", () => {
    expect(read("sort=wins.DESC").sorting).toEqual([
      { id: "wins", desc: true },
    ]);
  });

  it("never throws, whatever is in the parameter", () => {
    for (const junk of [
      "sort=",
      "sort=...",
      "sort=,,,",
      "sort=%E2%98%A0",
      "sort=" + "a.desc,".repeat(500),
      "sort=__proto__.desc",
      "q=" + "x".repeat(5000),
    ]) {
      expect(() => read(junk)).not.toThrow();
    }
  });

  it("does not answer to another table's parameters", () => {
    const state = readTableUrlState("owners.sort=wins.asc", {
      key: "players",
      isKnownColumn,
      defaultSorting: fallback,
    });
    expect(state.sorting).toEqual(fallback);
  });
});

describe("decodeSort", () => {
  it("treats a missing parameter and an absent one alike", () => {
    expect(decodeSort(null, isKnownColumn, [{ id: "wins", desc: true }])).toEqual(
      [{ id: "wins", desc: true }]
    );
    expect(
      decodeSort(undefined, isKnownColumn, [{ id: "wins", desc: true }])
    ).toEqual([{ id: "wins", desc: true }]);
  });

  it("reads `none` as a deliberate absence of sorting", () => {
    expect(decodeSort("none", isKnownColumn, [{ id: "wins", desc: true }])).toEqual(
      []
    );
  });
});

describe("the parameters stay readable in a chat client", () => {
  it("does not percent-encode the separator", () => {
    const params = writeTableUrlState(
      "",
      { sorting: [{ id: "pointsFor", desc: true }] },
      { key: "owners" }
    );
    expect(params.toString()).toBe("owners.sort=pointsFor.desc");
  });
});

describe("columnIdsOf", () => {
  interface Row {
    wins: number;
    team: string;
  }

  it("mirrors how react-table names columns", () => {
    const columns: ColumnDef<Row, unknown>[] = [
      { id: "explicit", header: "Explicit" },
      { accessorKey: "wins", header: "Wins" } as ColumnDef<Row, unknown>,
      // An accessor key with a dot becomes an underscore, as the library does it.
      { accessorKey: "record.wins" } as ColumnDef<Row, unknown>,
      { header: "From The Header" },
      // No id, no accessor key, no string header: unnameable, so absent.
      { header: () => null } as unknown as ColumnDef<Row, unknown>,
    ];
    expect(columnIdsOf(columns)).toEqual([
      "explicit",
      "wins",
      "record_wins",
      "From The Header",
    ]);
  });

  it("prefers an explicit id over the accessor key", () => {
    const columns = [
      { id: "chosen", accessorKey: "wins" },
    ] as ColumnDef<Row, unknown>[];
    expect(columnIdsOf(columns)).toEqual(["chosen"]);
  });
});
