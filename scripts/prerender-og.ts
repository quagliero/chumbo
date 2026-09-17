/**
 * Prerender static HTML and an OG card per route (G6).
 *
 * The problem: the site is one `index.html` with a client-side router, so every
 * link anyone pastes anywhere previews as the *same* card — the league crest
 * and "fifteen seasons of fantasy football" — no matter whether it points at a
 * manager, a season or a fifteen-year head-to-head. G5 made that one preview
 * good. This makes it specific.
 *
 * It runs after `vite build` and, for each route in `scripts/og/routes.ts`:
 *
 *   1. builds the fact's card with the **G1 renderer and the G2 templates** —
 *      the same code the clipboard button uses, called in Node because
 *      `buildCardSvg` is documented as pure and DOM-free for exactly this;
 *   2. rasterises it to a 1200×630 PNG at `dist/og/<slug>.png` (see
 *      `og/raster.ts` for why resvg and not satori);
 *   3. copies the **built** `dist/index.html` to `dist/<route>/index.html` with
 *      that page's title, description and OG tags swapped in (`og/tags.ts`).
 *
 *   yarn prerender-og [--group seasons|managers|h2h|matchups]…
 *                     [--since 2024] [--limit N] [--out dist]
 *                     [--no-cards] [--no-avatars] [--strict]
 *
 * ## Why this cannot break client-side routing
 *
 * Every generated page **is** the built entry document: same hashed script tag,
 * same modulepreloads, same `<div id="root">`. Only the head's metadata
 * differs. So a cold load of `/managers/thd` serves real HTML that boots the
 * SPA, and React Router reads `location.pathname` and renders the manager page
 * exactly as it would have after a client-side navigation. Nothing is
 * hydrated, nothing is duplicated, and there is no second template to keep in
 * step with Vite's output.
 *
 * A path that is *not* prerendered is unaffected: `public/_redirects` has
 * `/*  /index.html  200`, and Netlify applies a redirect rule only when no
 * static file matches the request — shadowing an existing file requires the
 * forced form (`/*  /index.html  200!`), which this site does not use. So
 * prerendered paths serve their own file, everything else falls through to the
 * SPA fallback, and `dist/index.html` itself is never touched (which is also
 * what keeps `scripts/check-bundle-size.js` measuring the real critical path).
 *
 * ## Built on deploy, not committed
 *
 * The cards live in `dist/`, which is gitignored, and `yarn build` runs on
 * Netlify. Committing them was the alternative and it is the wrong trade: the
 * default set is 266 PNGs and 25 MB, they are only ever fetched by crawlers,
 * and every `fetch-latest` during a season would rewrite the lot — tens of
 * megabytes of binary churn in the repo's history, permanently, for files no
 * browser ever downloads. Compare
 * `public/data/all-time.json`, which *is* committed: that one is fetched by the
 * app at runtime, so it has to exist in the repo. These do not.
 *
 * The cost of that choice is that the cards are rendered by whatever fonts the
 * build machine has, and resvg draws nothing at all where it cannot resolve a
 * font (see `og/raster.ts`). So the run probes fonts first and, if text is not
 * rendering, refuses to publish wordless cards: every page keeps its generated
 * title and description and falls back to the crest image, and the build log
 * says so in as many words. `--strict` turns that into a failed build instead.
 *
 * ## Idempotent
 *
 * A file is only written when its bytes differ from what is already there, so a
 * re-run over unchanged data reports "0 written" and touches nothing — the same
 * contract `build-aggregates` has, and the same reason: a generated artefact
 * whose staleness is invisible is worse than no artefact.
 */

import fs from "node:fs";
import path from "node:path";

import { loadAllSeasons } from "@/data";
import { CURRENT_YEAR } from "@/domain/constants";
import { buildCardSvg } from "@/presentation/components/ShareCard/card";
import { CARD_FONT_STACK } from "@/presentation/components/ShareCard/fonts";

import { embedLocalImage, fetchAvatars } from "./og/assets";
import { probeFonts, rasterise } from "./og/raster";
import {
  IMAGE_DIR,
  imageSlug,
  injectOg,
  type OgMeta,
} from "./og/tags";
import {
  DEFAULT_GROUPS,
  ROUTE_GROUPS,
  ogRoutes,
  type CardAssets,
  type RouteGroup,
} from "./og/routes";

/* --------------------------------------------------------------- arguments */

const argv = process.argv.slice(2);
const flag = (name: string) => argv.includes(`--${name}`);
const value = (name: string): string | undefined => {
  const i = argv.indexOf(`--${name}`);
  return i === -1 ? undefined : argv[i + 1];
};
const values = (name: string): string[] =>
  argv.flatMap((arg, i) => (arg === `--${name}` ? [argv[i + 1] ?? ""] : []));

const OUT = path.resolve(process.cwd(), value("out") ?? "dist");
const STRICT = flag("strict");
const WITH_AVATARS = !flag("no-avatars");
/**
 * Tags only, no images: seconds instead of half a minute when the thing being
 * iterated on is the copy. It is also the exact path a build takes when the
 * font probe fails, so running it is how that fallback gets exercised.
 */
const WITH_CARDS = !flag("no-cards");
const LIMIT = Number(value("limit") ?? 0) || Infinity;
const SINCE = Number(value("since") ?? CURRENT_YEAR);

const asked = values("group").filter(Boolean);
for (const group of asked) {
  if (!(ROUTE_GROUPS as readonly string[]).includes(group)) {
    console.error(
      `Unknown --group ${group}. One of: ${ROUTE_GROUPS.join(", ")}`
    );
    process.exit(1);
  }
}
const groups = (asked.length ? asked : DEFAULT_GROUPS) as RouteGroup[];

/* ------------------------------------------------------------------- output */

const template = (() => {
  const file = path.join(OUT, "index.html");
  if (!fs.existsSync(file)) {
    console.error(
      `No ${path.relative(process.cwd(), file)} — run \`vite build\` first.\n` +
        "The prerenderer copies the BUILT entry document so the prerendered\n" +
        "pages boot the same bundle; it cannot invent one."
    );
    process.exit(1);
  }
  return fs.readFileSync(file, "utf8");
})();

let written = 0;
let unchanged = 0;

/** Write only when the bytes differ, so a re-run is a no-op. */
const put = (file: string, contents: Buffer | string) => {
  const bytes = Buffer.isBuffer(contents) ? contents : Buffer.from(contents);
  if (fs.existsSync(file) && fs.readFileSync(file).equals(bytes)) {
    unchanged += 1;
    return;
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, bytes);
  written += 1;
};

/* --------------------------------------------------------------------- run */

const started = Date.now();
await loadAllSeasons();

const routes = ogRoutes({ groups, since: SINCE }).slice(0, LIMIT);
if (routes.length === 0) {
  console.error("No routes to prerender — that cannot be right.");
  process.exit(1);
}

// Derived names are not proved names. A collision here would mean one page
// silently overwriting another's card, which is invisible in a build log.
const seen = new Map<string, string>();
for (const route of routes) {
  const slug = imageSlug(route.path);
  const clash = seen.get(slug);
  if (clash) {
    console.error(`Two routes share the card slug "${slug}": ${clash}, ${route.path}`);
    process.exit(1);
  }
  seen.set(slug, route.path);
}

// Can this machine draw text at all? Asked once, before 266 cards are made.
const probe = WITH_CARDS ? probeFonts(CARD_FONT_STACK) : { ok: false, inked: 0 };
if (WITH_CARDS && !probe.ok) {
  const message =
    "resvg resolved no usable font: cards would render with no text on them.\n" +
    `  The font stack is ${CARD_FONT_STACK}\n` +
    "  Install a humanist sans on the build machine (fonts-liberation or\n" +
    "  fonts-dejavu-core is enough), or embed a font in the card SVG -- see\n" +
    "  the two options in src/presentation/components/ShareCard/fonts.ts.";
  if (STRICT) {
    console.error(`\nG6: ${message}\n`);
    process.exit(1);
  }
  console.warn(
    `\n${"!".repeat(72)}\nG6: ${message}\n  Continuing WITHOUT card images: every prerendered page keeps its own\n  title and description and falls back to the league crest.\n${"!".repeat(
      72
    )}\n`
  );
}

const assets: CardAssets = {
  crest: WITH_CARDS ? embedLocalImage("public/images/logo.png") : null,
  avatars:
    WITH_CARDS && WITH_AVATARS
      ? await fetchAvatars(routes.flatMap((route) => route.avatarUrls))
      : new Map(),
};
const faces = [...assets.avatars.values()].filter(Boolean).length;

let cards = 0;
let failed = 0;

for (const route of routes) {
  const slug = imageSlug(route.path);
  let image: string | undefined;

  if (route.card && probe.ok) {
    try {
      const card = route.card(assets);
      put(path.join(OUT, IMAGE_DIR, `${slug}.png`), rasterise(buildCardSvg(card)));
      image = slug;
      cards += 1;
    } catch (error) {
      // One card failing is not a reason to ship no pages; the page still gets
      // its tags and the crest. It IS a reason to say which one, loudly.
      failed += 1;
      console.warn(`  ! ${route.path}: card failed — ${String(error)}`);
    }
  }

  const meta: OgMeta = {
    path: route.path,
    title: route.title,
    description: route.description,
    image,
    imageAlt: route.imageAlt,
  };
  put(
    path.join(OUT, route.path.replace(/^\//, ""), "index.html"),
    injectOg(template, meta)
  );
}

const seconds = ((Date.now() - started) / 1000).toFixed(1);
/** Relative when that is shorter to read, absolute when it is not. */
const show = (file: string) => {
  const rel = path.relative(process.cwd(), file);
  return rel.startsWith("..") ? file : rel;
};
console.log(
  `\nPrerendered ${routes.length} routes (${groups.join(", ")}) in ${seconds}s` +
    (WITH_CARDS ? "" : "\n  --no-cards: tags only, every page on the crest fallback") +
    `\n  ${cards} cards, ${faces}/${assets.avatars.size} avatars embedded` +
    (failed ? `, ${failed} cards FAILED` : "") +
    `\n  ${written} files written, ${unchanged} already up to date` +
    `\n  images under ${show(path.join(OUT, IMAGE_DIR))}/, pages alongside ${show(
      path.join(OUT, "index.html")
    )}\n`
);

if (failed && STRICT) process.exit(1);
