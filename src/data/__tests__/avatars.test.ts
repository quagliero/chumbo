import { describe, expect, it } from "vitest";
import { PINNED_THROUGH } from "@/utils/__tests__/helpers";

/**
 * The team logos we keep ourselves.
 *
 * NFL.com took 2012-2018's with it when its fantasy platform closed, because
 * the site had only ever linked to them. Since then every season's logos live
 * in `public/avatars/` (`yarn own-avatars` for Sleeper's), and the data points
 * at those files. Two things can go wrong silently, and these are them: a data
 * file pointing at a logo that was never saved (a broken image, which nothing
 * reports), and a finished season still leaning on somebody else's server.
 */

// Keys only — nothing is loaded — so this lists the files without reading them.
const files = new Set(
  Object.keys(import.meta.glob("../../../public/avatars/**/*")).map((key) =>
    key.replace("../../../public", "")
  )
);

const seasonFiles = import.meta.glob<unknown>(["../*/users.json", "../*/league.json"], {
  eager: true,
  import: "default",
});

/** Every team logo a season points at, with where it came from. */
const logos = Object.entries(seasonFiles).flatMap(([file, data]) => {
  const year = Number(/\/(\d{4})\//.exec(file)?.[1]);
  if (file.endsWith("users.json")) {
    return (data as { metadata?: { avatar?: string }; avatar?: string | null }[]).map(
      (user) => ({
        year,
        file,
        url:
          user.metadata?.avatar ||
          (user.avatar ? `https://sleepercdn.com/avatars/${user.avatar}` : ""),
      })
    );
  }
  const metadata = ((data as { metadata?: Record<string, string> }).metadata ?? {});
  return Object.entries(metadata)
    .filter(([key]) => /^division_\d+_avatar$/.test(key))
    .map(([, url]) => ({ year, file, url }));
});

describe("team logos", () => {
  it("never points at a file that is not there", () => {
    const missing = logos
      .filter(({ url }) => url.startsWith("/"))
      .filter(({ url }) => !files.has(url))
      .map(({ file, url }) => `${file}: ${url}`);
    expect(missing).toEqual([]);
  });

  it("is ours for every finished season", () => {
    // The live season can hold a Sleeper URL for a day — a manager changed
    // their logo and the download has not happened yet — which is why this is
    // pinned to the seasons that are over. Those must depend on nobody.
    const remote = logos
      .filter(({ year }) => year <= PINNED_THROUGH)
      .filter(({ url }) => /^https?:/.test(url))
      .map(({ file, url }) => `${file}: ${url}`);
    expect(remote).toEqual([]);
  });
});
