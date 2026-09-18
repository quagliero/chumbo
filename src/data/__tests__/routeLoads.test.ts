import type { ComponentType } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import allTime from "../../../public/data/all-time.json";
import { liveSeasonInProgress } from "@/utils/__tests__/helpers";

/**
 * What a first visit to a page actually loads (A2b).
 *
 * The goals of loading data on demand are about the network — the landing
 * page does not fetch the draft, a page about 2014 fetches 2014 — and the
 * network is exactly what a unit test of the loader cannot see: which parts
 * get loaded is decided by what the page's components READ, deep in a tree
 * nobody has read end to end. So this renders the real page, server-side,
 * against a loader that has loaded nothing, lets every Suspense boundary
 * resolve, and then asks the loader what the render made it fetch.
 *
 * Each part is one chunk per season in the build (see src/data/parts.ts), so
 * these lists are the data chunks a browser downloads for the page.
 *
 * It is also the check that these pages render at all from a cold loader:
 * a read of season data outside render — at import time, say — throws
 * rather than suspends, and lands in `errors`.
 */

type Loaded = {
  core: number[];
  draft: number[];
  matchups: number[];
  transactions: number[];
  players: boolean;
};

beforeEach(() => {
  // The global setup loaded everything; start these from nothing instead.
  vi.resetModules();
  // `usePrecomputedStats` fetches the committed file; serve it from disk.
  vi.stubGlobal("fetch", async (url: string) => {
    if (url !== "/data/all-time.json") throw new Error(`unexpected ${url}`);
    return new Response(JSON.stringify(allTime), { status: 200 });
  });
  // React warns that `useLayoutEffect` does nothing on the server, once per
  // router link. True, and nothing to do with loading.
  const error = console.error;
  vi.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
    if (String(args[0]).includes("useLayoutEffect does nothing")) return;
    error(...args);
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/**
 * Render `url` through `route` to `page`, wait for every Suspense boundary to
 * settle, and report which parts of which seasons the render loaded.
 */
const visit = async (
  route: string,
  url: string,
  page: () => Promise<{ default: ComponentType }>
): Promise<{ loaded: Loaded; html: string; errors: unknown[] }> => {
  // Imported here, after `resetModules`, so they share the fresh loader.
  const { createElement: h, Suspense } = await import("react");
  // The web-streams build, because the Node build's pipeable stream needs Node
  // stream types, which this project does not carry. Same API.
  const server: typeof import("react-dom/server") = await import(
    // @ts-expect-error -- no separate declaration file for this entry point.
    "react-dom/server.browser"
  );
  const { MemoryRouter, Routes, Route } = await import("react-router-dom");
  const { IntlProvider } = await import("use-intl");
  const data = await import("@/data");
  const { YEAR_NUMBERS } = await import("@/domain/constants");
  const Page = (await page()).default;

  const tree = h(IntlProvider, {
    locale: "en",
    children: h(
      MemoryRouter,
      { initialEntries: [url] },
      h(
        Suspense,
        { fallback: "loading" },
        h(Routes, null, h(Route, { path: route, element: h(Page) }))
      )
    ),
  });

  const errors: unknown[] = [];
  const stream = await server.renderToReadableStream(tree, {
    onError: (error: unknown) => void errors.push(error),
  });
  await stream.allReady;
  const html = await new Response(stream).text();

  const which = (test: (year: number) => boolean) => YEAR_NUMBERS.filter(test);
  return {
    html,
    errors,
    loaded: {
      core: which((y) => data.areSeasonPartsLoaded([y], ["core"])),
      draft: which((y) => data.areSeasonPartsLoaded([y], ["draft"])),
      matchups: which((y) => data.areSeasonPartsLoaded([y], ["matchups"])),
      transactions: which((y) => data.areTransactionsLoaded([y])),
      players: data.arePlayersLoaded(),
    },
  };
};

const ALL = [
  2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,
  2025, 2026,
];

describe("what a first visit loads", () => {
  it("/ — every season's core, and nothing else", async () => {
    const { loaded, errors, html } = await visit("/", "/", () =>
      import("@/presentation/pages/home")
    );

    expect(errors).toEqual([]);
    expect(html).toContain("All Time League Stats");
    // Cumulative standings are rosters, users, brackets and league status for
    // every season, so all fifteen cores — but no draft, no matchup, no
    // transaction and no player dictionary.
    expect(loaded).toEqual({
      core: ALL,
      draft: [],
      matchups: [],
      transactions: [],
      players: false,
    });
  });

  it("/seasons/2014/standings — 2014, plus the core of the seasons before it", async () => {
    const { loaded, errors, html } = await visit(
      "/seasons/:year/:tab",
      "/seasons/2014/standings",
      () => import("@/presentation/pages/history")
    );

    expect(errors).toEqual([]);
    expect(html).toContain("League History");
    // 2012 and 2013's core are the champion card's list of earlier titles.
    expect(loaded).toEqual({
      core: [2012, 2013, 2014],
      draft: [2014],
      matchups: [2014],
      transactions: [],
      players: false,
    });
  });

  // After the final the newest season loads like any finished one, as 2014
  // does below.
  it.runIf(liveSeasonInProgress())("/seasons/2026/standings — the live season, and only it", async () => {
    const { loaded, errors } = await visit(
      "/seasons/:year/:tab",
      "/seasons/2026/standings",
      () => import("@/presentation/pages/history")
    );

    expect(errors).toEqual([]);
    expect(loaded).toEqual({
      core: [2026],
      draft: [2026],
      matchups: [2026],
      transactions: [],
      players: false,
    });
  });

  it("/seasons/2014/matchups — 2014 with its transactions, and the players", async () => {
    const { loaded, errors } = await visit(
      "/seasons/:year/:tab",
      "/seasons/2014/matchups",
      () => import("@/presentation/pages/history")
    );

    expect(errors).toEqual([]);
    expect(loaded).toEqual({
      core: [2014],
      draft: [2014],
      matchups: [2014],
      transactions: [2014],
      players: true,
    });
  });

  it("/seasons/2014/draft — 2014 and the player dictionary", async () => {
    const { loaded, errors } = await visit(
      "/seasons/:year/:tab",
      "/seasons/2014/draft",
      () => import("@/presentation/pages/history")
    );

    expect(errors).toEqual([]);
    expect(loaded).toEqual({
      core: [2014],
      draft: [2014],
      matchups: [2014],
      transactions: [],
      players: true,
    });
  });
});

/**
 * Every other route, from cold. Not what they load — the all-time pages load
 * everything, by definition — but that they render at all: no read outside
 * render, no read swallowed by a try/catch, nothing thrown that is not a
 * suspension. A page that fails here would be a blank page in production.
 */
describe("every route renders from a cold loader", () => {
  const home = () => import("@/presentation/pages/home");
  const history = () => import("@/presentation/pages/history");

  const routes: [
    string,
    string,
    () => Promise<{ default: ComponentType }>,
    string,
  ][] = [
    ["/:tab", "/careers", home, "Every career"],
    ["/:tab", "/luck", home, "Who the schedule flattered"],
    ["/:tab", "/spread", home, "Metronomes and gamblers"],
    ["/:tab", "/breakdown", home, "All Time League Stats"],
    ["/:tab", "/top-scores", home, "All Time League Stats"],
    ["/:tab", "/trades", home, "All Time League Stats"],
    ["/schedule-comparison/:view", "/schedule-comparison/league", home, "All Time"],
    ["/seasons/:year/:tab", "/seasons/2019/playoffs", history, "League History"],
    ["/seasons/:year/:tab", "/seasons/2014/trades", history, "League History"],
    ["/seasons/:year/:tab", "/seasons/2021/breakdown", history, "League History"],
    ["/seasons/:year/:tab", "/seasons/2023/schedule-comparison", history, "League History"],
    ["/seasons/:year/:tab", "/seasons/2026/playoff-odds", history, "League History"],
    [
      "/seasons/:year/:tab/:week/:matchupId",
      "/seasons/2014/matchups/3/1",
      history,
      "League History",
    ],
    ["/managers", "/managers", () => import("@/presentation/pages/managers"), "thd"],
    [
      "/managers/:managerId/:tab",
      "/managers/thd/summary",
      () => import("@/presentation/pages/managerDetail"),
      "thd",
    ],
    [
      "/managers/:managerId/:tab/:section",
      "/managers/thd/players/allstars",
      () => import("@/presentation/pages/managerDetail"),
      "thd",
    ],
    ["/players", "/players", () => import("@/presentation/pages/players"), "Players"],
    [
      "/players/:playerId",
      "/players/4046",
      () => import("@/presentation/pages/playerDetail"),
      "Mahomes",
    ],
    ["/h2h", "/h2h", () => import("@/presentation/pages/h2h"), "Head"],
    [
      "/h2h/:managerA/:managerB",
      "/h2h/thd/jay",
      () => import("@/presentation/pages/h2hDetail"),
      "jay",
    ],
    ["/explorer", "/explorer", () => import("@/presentation/pages/stats"), "Explorer"],
    ["/hof", "/hof", () => import("@/presentation/pages/hallOfFame"), "Hall of Fame"],
    [
      "/wiki/settings",
      "/wiki/settings",
      () => import("@/presentation/pages/settings"),
      "Scoring",
    ],
  ];

  it.each(routes)("%s → %s", async (route, url, page, text) => {
    const { errors, html } = await visit(route, url, page);

    expect(errors).toEqual([]);
    expect(html).toContain(text);
  });
});
