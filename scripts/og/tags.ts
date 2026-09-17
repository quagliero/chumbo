/**
 * The head of a prerendered page (G6): titles, descriptions, OG and Twitter
 * tags, and the surgery that puts them into an already-built `index.html`.
 *
 * Everything in this file is a pure string function over plain data, which is
 * the point: the parts of G6 that can be *wrong in a way nobody notices* are
 * all here. A crawler never reports an error — a bad `og:image` URL, an
 * unescaped ampersand in a team name, a missing dimension — it just renders a
 * grey box, and the first you hear of it is that links "look broken in
 * WhatsApp". So the rules are encoded here and tested, and the driver
 * (`scripts/prerender-og.ts`) only decides *which* pages exist.
 *
 * ## The rules a crawler enforces silently
 *
 * - **`og:image` must be an absolute URL.** Facebook, WhatsApp, Slack and
 *   X/Twitter do not resolve a relative path; `/og/managers-thd.png` is simply
 *   dropped. Every URL this file emits goes through `absolute()`.
 * - **1200×630, declared.** The size is G1's (`CARD_WIDTH`/`CARD_HEIGHT`), and
 *   `og:image:width`/`og:image:height` are what let a preview reserve the right
 *   box before the bytes arrive. Without them some clients fall back to a
 *   square thumbnail even when the image is landscape.
 * - **`twitter:card` must be `summary_large_image`.** The default `summary`
 *   crops to a small square, which is what `index.html` deliberately asks for
 *   with the portrait crest (see the comment there). A 1200×630 card in a
 *   `summary` slot is the worst of both.
 * - **Escaping is not optional.** "Salt & Pepper" and a team name with a quote
 *   in it are real; an unescaped `"` ends the attribute and everything after it
 *   becomes garbage markup. `escapeAttr` is the only way a value reaches an
 *   attribute here, exactly as `svg.ts` does it for the cards.
 *
 * ## Why surgery on the built HTML rather than a second template
 *
 * `dist/index.html` is Vite's output: it carries the hashed entry script and the
 * modulepreloads, and those change every build. A hand-written second template
 * would have to be kept in step with it, and the day it drifts the prerendered
 * pages boot an old bundle or none at all. So the prerenderer takes the real
 * built file, removes the tags it owns, and writes its own back — the script
 * tags it never touches. `scripts/check-bundle-size.js` keeps reading the
 * untouched `dist/index.html`, which stays the SPA fallback.
 */

/** The deployed origin. Hard-coded for the same reason `chrome.ts` hard-codes it. */
export const SITE_ORIGIN = "https://chumbo.netlify.app";

/** Where the generated cards are served from, under `dist/`. */
export const IMAGE_DIR = "og";

/**
 * What a prerendered page says about itself.
 *
 * `image` is a *slug*, not a URL: the route table names the card and this file
 * owns the fact that it lives at `/og/<slug>.png`. A route with no image (a
 * season nobody has played yet) omits it and falls back to the league crest,
 * which is what `index.html` has shipped since G5.
 */
export interface OgMeta {
  /** Route path, always with a leading slash and never with a trailing one. */
  path: string;
  /** The `<title>`, and `og:title`. Already includes the site name. */
  title: string;
  /** One sentence. Long enough to say something, short enough to survive. */
  description: string;
  /** The card's slug under `/og/`, or undefined to fall back to the crest. */
  image?: string;
  /** Alt text for the card. Required whenever `image` is set. */
  imageAlt?: string;
}

/** The crest fallback, matching what `index.html` ships for the site root. */
const CREST = {
  url: `${SITE_ORIGIN}/images/logo.png`,
  width: 256,
  height: 338,
  alt: "The Chumbo league crest",
};

/** The card size. Not imported from G1: this file must stay dependency-free
 * so the tests over it are trivially fast, and 1200×630 is not going to move
 * (see `card.ts` for why it cannot). A test asserts the two agree. */
export const CARD_SIZE = { width: 1200, height: 630 };

/**
 * Escape a string for use inside a double-quoted HTML attribute.
 *
 * All five, not just the three that "matter": `&` first so it cannot
 * double-escape the others, `<`/`>` because a description that contains them
 * would otherwise open a tag from inside an attribute in a sloppy parser, and
 * both quote characters because the league has team names with apostrophes in
 * them ("Zaragoza's Zooting Zorro") and somebody will eventually use a `"`.
 */
export const escapeAttr = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

/** Escape a string for use as element text (`<title>`). */
export const escapeText = (value: string): string =>
  value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/**
 * Turn a route path into an absolute URL.
 *
 * Trailing slash dropped except for the root: `/managers/thd` and
 * `/managers/thd/` are the same page, and a canonical URL that disagrees with
 * the one people actually paste splits the preview cache for no reason.
 */
export const absolute = (path: string): string => {
  const clean = path.replace(/\/+$/, "");
  return clean === "" ? `${SITE_ORIGIN}/` : `${SITE_ORIGIN}${clean}`;
};

/**
 * The slug a route's card is written under.
 *
 * Derived from the path rather than chosen, so a new route group cannot
 * accidentally collide with an existing name — and the driver asserts the whole
 * set is unique anyway, because "derived" is not "proved".
 */
export const imageSlug = (path: string): string =>
  path
    .replace(/^\/+|\/+$/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "home";

/** An ordinal: 1 -> "1st", 22 -> "22nd". The teens are the whole reason. */
export const ordinal = (n: number): string => {
  const abs = Math.abs(Math.trunc(n));
  const suffix =
    abs % 100 >= 11 && abs % 100 <= 13
      ? "th"
      : abs % 10 === 1
      ? "st"
      : abs % 10 === 2
      ? "nd"
      : abs % 10 === 3
      ? "rd"
      : "th";
  return `${Math.trunc(n)}${suffix}`;
};

const meta = (kind: "property" | "name", key: string, value: string) =>
  `    <meta ${kind}="${key}" content="${escapeAttr(value)}" />`;

/**
 * The block of tags for one page.
 *
 * Emitted as a list of lines so the output is diffable by eye — these files are
 * read by a human exactly once, when something looks wrong in a preview, and
 * that is the moment to be able to see the whole head at a glance.
 */
export const ogTags = (page: OgMeta): string[] => {
  const url = absolute(page.path);
  const image = page.image
    ? {
        url: `${SITE_ORIGIN}/${IMAGE_DIR}/${page.image}.png`,
        width: CARD_SIZE.width,
        height: CARD_SIZE.height,
        alt: page.imageAlt ?? page.title,
      }
    : CREST;
  // A 1200x630 card earns the big card; the portrait crest does not, and
  // saying so per page is the whole reason this is generated rather than static.
  const twitterCard = page.image ? "summary_large_image" : "summary";

  return [
    `    <title>${escapeText(page.title)}</title>`,
    `    <link rel="canonical" href="${escapeAttr(url)}" />`,
    meta("name", "description", page.description),
    "",
    "    <!-- Open Graph (G6: generated per route by scripts/prerender-og.ts) -->",
    meta("property", "og:site_name", "The Chumbo"),
    meta("property", "og:type", "website"),
    meta("property", "og:url", url),
    meta("property", "og:title", page.title),
    meta("property", "og:description", page.description),
    meta("property", "og:image", image.url),
    meta("property", "og:image:type", "image/png"),
    meta("property", "og:image:width", String(image.width)),
    meta("property", "og:image:height", String(image.height)),
    meta("property", "og:image:alt", image.alt),
    "",
    "    <!-- Twitter -->",
    meta("name", "twitter:card", twitterCard),
    meta("name", "twitter:title", page.title),
    meta("name", "twitter:description", page.description),
    meta("name", "twitter:image", image.url),
    meta("name", "twitter:image:alt", image.alt),
  ];
};

/**
 * Tags this file owns and therefore removes before writing its own.
 *
 * Deliberately narrow: the charset, the viewport, the favicon and every
 * `<script>`/`<link rel=modulepreload>` Vite emitted are left exactly as they
 * are. Anything matched here is something `ogTags` re-emits, so a page can
 * never end up with two `og:title`s — which is the failure that makes a
 * preview non-deterministic, because which one wins is up to the crawler.
 */
const OWNED = [
  /[ \t]*<title>[\s\S]*?<\/title>\r?\n?/g,
  /[ \t]*<link[^>]*rel="canonical"[^>]*>\r?\n?/g,
  /[ \t]*<meta[^>]*name="description"[^>]*>\r?\n?/g,
  /[ \t]*<meta[^>]*property="og:[^"]*"[^>]*>\r?\n?/g,
  /[ \t]*<meta[^>]*name="twitter:[^"]*"[^>]*>\r?\n?/g,
];

/**
 * One HTML comment, and never two.
 *
 * The `(?!-->)` guard is what keeps it to one: a plain `[\s\S]*?` between
 * `<!--` and `-->` will happily start at the "Open Graph" comment and end at
 * the "Twitter" one, swallowing everything between them. Here it cannot.
 */
const COMMENT = /[ \t]*<!--(?:(?!-->)[\s\S])*?-->\r?\n?/g;

/**
 * Comments that are about the tags above, and would contradict the generated
 * head if they survived it — G5's note explaining why `index.html` asks for
 * `summary` rather than `summary_large_image` most of all, since a generated
 * page says `summary_large_image` two lines later.
 */
const OWNED_COMMENT = /open graph|twitter|summary_large_image/i;

/**
 * Put `page`'s head into a built `index.html`.
 *
 * Throws rather than degrading if there is no `</head>`: a prerendered page
 * whose tags silently went missing is indistinguishable from one that was never
 * generated, and the whole task is the tags.
 */
export const injectOg = (html: string, page: OgMeta): string => {
  const head = html.search(/<\/head>/i);
  if (head === -1) {
    throw new Error("no </head> in the built index.html — cannot prerender");
  }
  let stripped = html;
  for (const pattern of OWNED) stripped = stripped.replace(pattern, "");
  stripped = stripped.replace(COMMENT, (match) =>
    OWNED_COMMENT.test(match) ? "" : match
  );
  const at = stripped.search(/<\/head>/i);
  // The indentation in front of `</head>` belongs to `</head>`, and is put
  // back below; without the trim the first generated tag lands after it.
  // Removing tags leaves the blank lines that surrounded them, and these files
  // get read by a human exactly once — when a preview looks wrong — so the head
  // should not arrive with a hole in it.
  const before = stripped
    .slice(0, at)
    .replace(/[ \t]*$/, "")
    .replace(/\n{3,}/g, "\n\n");
  return `${before}${ogTags(page).join("\n")}\n  ${stripped.slice(at)}`;
};
