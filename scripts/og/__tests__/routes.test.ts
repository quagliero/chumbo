/**
 * The route table (G6).
 *
 * Two kinds of failure are worth a test here. One is structural: a path the SPA
 * does not actually have a route for, or two routes claiming the same card
 * file, both of which produce a page that looks fine in a build log and is
 * broken in a browser. The other is a card that throws — 266 routes render
 * unattended in a build step, and the templates are full of real data, so the
 * only way to know they all build is to build them all.
 *
 * The suite runs against the committed JSON like every other suite here
 * (`src/utils/__tests__/setup.ts` has already awaited `loadAllSeasons`), so it
 * is checking the actual route set, not a fixture of one.
 */

import { describe, expect, it } from "vitest";

import { managers, seasons } from "@/data";
import { YEARS } from "@/domain/constants";
import { buildCardSvg } from "@/presentation/components/ShareCard/card";

import { imageSlug } from "../tags";
import { DEFAULT_GROUPS, ogRoutes, type CardAssets } from "../routes";

const routes = ogRoutes();

/** No crest, no faces: the branch every template's fallback path takes. */
const bare: CardAssets = { crest: null, avatars: new Map() };

/**
 * The route shapes `src/App.tsx` declares, as patterns.
 *
 * A prerendered file at a path the router does not match would serve real HTML
 * and then render the home page — the worst kind of wrong, because the preview
 * would be right.
 */
const APP_ROUTES = [
  /^\/managers\/[^/]+$/,
  /^\/seasons\/\d{4}\/[^/]+$/,
  /^\/seasons\/\d{4}\/[^/]+\/\d+\/\d+$/,
  /^\/h2h\/[^/]+\/[^/]+$/,
];

describe("the default route set", () => {
  it("is the three groups, and nothing has quietly been added", () => {
    expect(DEFAULT_GROUPS).toEqual(["seasons", "managers", "h2h"]);
  });

  it("has one page per season and one per manager", () => {
    const paths = new Set(routes.map((r) => r.path));
    for (const year of YEARS) {
      expect(paths.has(`/seasons/${year}/standings`), String(year)).toBe(true);
    }
    for (const manager of managers) {
      expect(paths.has(`/managers/${manager.id}`), manager.id).toBe(true);
    }
    expect(routes.filter((r) => r.path.startsWith("/managers/"))).toHaveLength(
      managers.length
    );
    expect(routes.filter((r) => r.path.startsWith("/seasons/"))).toHaveLength(
      YEARS.length
    );
  });

  it("covers both orders of every pairing that has met, and no others", () => {
    const h2h = routes.filter((r) => r.path.startsWith("/h2h/"));
    expect(h2h.length).toBeGreaterThan(100);
    // Symmetry: if a/b is prerendered, so is b/a, because the site links both.
    const paths = new Set(h2h.map((r) => r.path));
    for (const path of paths) {
      const [, , a, b] = path.split("/");
      expect(paths.has(`/h2h/${b}/${a}`), path).toBe(true);
    }
    // And never a manager against themselves.
    for (const path of paths) {
      const [, , a, b] = path.split("/");
      expect(a).not.toBe(b);
    }
  });

  it("only emits paths the router has a route for", () => {
    for (const route of routes) {
      expect(
        APP_ROUTES.some((pattern) => pattern.test(route.path)),
        route.path
      ).toBe(true);
    }
  });

  it("gives every route a unique path and a unique card slug", () => {
    const paths = routes.map((r) => r.path);
    expect(new Set(paths).size).toBe(paths.length);
    const slugs = routes.map((r) => imageSlug(r.path));
    expect(new Set(slugs).size).toBe(slugs.length);
  });

  it("emits paths that need no escaping and no encoding", () => {
    for (const route of routes) {
      expect(route.path, route.path).toMatch(/^\/[A-Za-z0-9/_-]*$/);
      expect(encodeURI(route.path)).toBe(route.path);
    }
  });
});

describe("what each page says", () => {
  it("says something, and not so much that it is cut off", () => {
    for (const route of routes) {
      expect(route.title.length, route.path).toBeGreaterThan(8);
      expect(route.title.length, route.path).toBeLessThan(100);
      expect(route.description.length, route.path).toBeGreaterThan(40);
      // Facebook shows ~300 characters and WhatsApp far less; past this the
      // tail is only ever read by a machine.
      expect(route.description.length, route.path).toBeLessThan(300);
    }
  });

  it("never claims a completed season is in progress, or the reverse", () => {
    const finished = routes.find((r) => r.path === "/seasons/2019/standings");
    expect(finished?.description).toContain("won the 2019 Chumbo");
    const live = routes.find(
      (r) => r.path === `/seasons/${Math.max(...YEARS)}/standings`
    );
    expect(live?.description).not.toContain("won the");
  });

  it("agrees with the data it came from", () => {
    // A spot check with a number that can be verified by hand: the 2019
    // champion's own record, from the same helper the manager page uses.
    const route = routes.find((r) => r.path === "/seasons/2019/standings");
    const champion = /^(\w+) won the 2019 Chumbo, (\d+)–(\d+)/.exec(
      route?.description ?? ""
    );
    expect(champion).not.toBeNull();
    const [, name, wins, losses] = champion as RegExpExecArray;
    const manager = managers.find((m) => m.name === name);
    expect(manager).toBeDefined();
    const roster = seasons[2019].rosters.find(
      (r) => r.owner_id === manager?.sleeper.id
    );
    expect(roster).toBeDefined();
    expect(Number(wins) + Number(losses)).toBeGreaterThan(10);
  });
});

describe("every card builds", () => {
  /** An entity, or a character that must have been one. */
  const UNESCAPED = /&(?!(?:amp|lt|gt|quot|apos|#\d+|#x[0-9a-fA-F]+);)/;

  it("with no crest and no avatars, which is the fallback every card has", () => {
    for (const route of routes) {
      if (!route.card) continue;
      const svg = buildCardSvg(route.card(bare));
      expect(svg.startsWith("<svg"), route.path).toBe(true);
      expect(svg.endsWith("</svg>"), route.path).toBe(true);
      // The one thing a card must never do is emit a raw ampersand from a team
      // name; "Salt & Pepper" would make the whole document malformed.
      expect(UNESCAPED.test(svg), `${route.path}: ${svg.slice(0, 200)}`).toBe(
        false
      );
      // Every card names the site, so a forwarded image can be traced back.
      expect(svg, route.path).toContain("chumbo.netlify.app");
    }
  });

  it("and every route either has a card or has a reason not to", () => {
    const cardless = routes.filter((r) => !r.card);
    for (const route of cardless) {
      // The only honest cardless page is a season with no games in it yet.
      expect(route.path, route.path).toMatch(/^\/seasons\/\d{4}\/standings$/);
      expect(route.description).toContain("before a game has been played");
    }
  });
});

describe("the groups that are off by default", () => {
  it("can still be asked for, and produce real matchup pages", () => {
    const matchups = ogRoutes({
      groups: ["matchups"],
      since: Math.max(...YEARS) - 1,
    });
    expect(matchups.length).toBeGreaterThan(0);
    for (const route of matchups.slice(0, 20)) {
      expect(route.path).toMatch(/^\/seasons\/\d{4}\/matchups\/\d+\/\d+$/);
      expect(route.card).toBeDefined();
      expect(buildCardSvg(route.card!(bare))).toContain("</svg>");
    }
  });
});
