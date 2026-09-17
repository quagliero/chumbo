/**
 * Fonts for the share cards (G1) — and why the cards do not use the site's.
 *
 * **The trap.** A card is built as SVG, serialised, handed to an `<img>` as a
 * data URI and drawn to a canvas. An SVG loaded through `<img>` renders in
 * *secure static mode*: it is its own document, it gets no CSS from the page,
 * and it is forbidden from fetching ANY external resource — no stylesheet, no
 * `@font-face` file, no remote image. So `font-family: Inter` in a card resolves
 * against whatever is installed on the reader's machine and silently falls back
 * somewhere else. Text does not error; it just comes out in a different face, at
 * a different width, and the careful right-aligned score column no longer lines
 * up. This is the single most common way a hand-rolled OG card ships broken.
 *
 * **The two ways out, and which one this takes.**
 *
 *   1. Embed a font. Base64 a woff2 into an `@font-face` inside the SVG. Pixel
 *      identical everywhere, including in Node for G6. It costs 15–40 kB of
 *      base64 *in the JS bundle* — against a total budget of 1006 kB that is
 *      real — plus a font file to license, commit and keep in sync.
 *   2. A system stack, and never depend on exact metrics.
 *
 * This takes (2). The deciding fact is that **the site is already a system-font
 * site**: `src/index.css` asks for `Inter, system-ui, …`, `index.html` loads no
 * webfont and there is no `@font-face` anywhere in the repo, so Inter only ever
 * appears for the handful of readers who happen to have it installed. A card in
 * SF Pro on a Mac and Segoe UI on Windows is therefore *more* faithful to what
 * the page next to it looks like, not less. Option (1) stays available and is
 * cheap to switch to later — one constant here plus a `<style>` block — and G6
 * is where it would earn its keep, because a build-time image is the same file
 * for everybody.
 *
 * **What "never depend on exact metrics" means in practice.** Every fitted
 * string goes through `estimateTextWidth` below, which is an approximation, so
 * layout must be tolerant of it being a few percent out:
 *
 *   - Nothing is positioned by *measuring* text. Text is anchored (`start`,
 *     `middle`, `end`) and the anchor points are fixed coordinates.
 *   - Long strings are truncated or shrunk to a **box**, with headroom
 *     (`METRIC_HEADROOM`), so an under-estimate spills into slack rather than
 *     over the edge of the card.
 *   - `textLength`, which would force a string to an exact width, is
 *     deliberately never emitted: it makes a fallback font render as visibly
 *     stretched or crushed letters, which looks worse than a slightly short line.
 */

/**
 * The card font stack.
 *
 * Ordered so every entry is a humanist sans with comparable proportions:
 * SF Pro (Apple), Segoe UI (Windows), Roboto (Android), then the Helvetica/Arial
 * floor that the width table below is measured from. `system-ui` sits in the
 * middle as the generic catch-all for anything else — notably headless Chrome in
 * CI, where it resolves to whatever the container has.
 *
 * Quoted names are escaped when this lands in an attribute; it is normally
 * emitted once into a `<style>` block and inherited by every `<text>`.
 */
export const CARD_FONT_STACK =
  '-apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, Roboto, ' +
  '"Helvetica Neue", Helvetica, Arial, sans-serif';

/**
 * Weights the cards may use.
 *
 * Restricted to four because a system stack has no variable axis to interpolate
 * along: ask for 500 and most of these families give you 400, so a "medium"
 * label is indistinguishable from body text. 400/700 are guaranteed everywhere;
 * 600 and 800 degrade gracefully to their nearest neighbour.
 */
export type FontWeight = 400 | 600 | 700 | 800;

/**
 * Advance widths in em, measured from Arial/Helvetica at weight 400 — the last
 * entry in the stack, and the narrowest of the candidates, which is the safe
 * side to be wrong on when the job is "will this fit".
 *
 * Only the characters a Chumbo card can actually contain are listed: manager
 * and team names, scores, records, dates, and the punctuation people put in
 * team names. Anything missing falls back to `DEFAULT_ADVANCE`.
 */
const ADVANCE: Record<string, number> = {
  " ": 0.278,
  "!": 0.278,
  '"': 0.355,
  "#": 0.556,
  $: 0.556,
  "%": 0.889,
  "&": 0.667,
  "'": 0.191,
  "(": 0.333,
  ")": 0.333,
  "*": 0.389,
  "+": 0.584,
  ",": 0.278,
  "-": 0.333,
  ".": 0.278,
  "/": 0.278,
  "0": 0.556,
  "1": 0.556,
  "2": 0.556,
  "3": 0.556,
  "4": 0.556,
  "5": 0.556,
  "6": 0.556,
  "7": 0.556,
  "8": 0.556,
  "9": 0.556,
  ":": 0.278,
  ";": 0.278,
  "<": 0.584,
  "=": 0.584,
  ">": 0.584,
  "?": 0.556,
  "@": 1.015,
  A: 0.667,
  B: 0.667,
  C: 0.722,
  D: 0.722,
  E: 0.667,
  F: 0.611,
  G: 0.778,
  H: 0.722,
  I: 0.278,
  J: 0.5,
  K: 0.667,
  L: 0.556,
  M: 0.833,
  N: 0.722,
  O: 0.778,
  P: 0.667,
  Q: 0.778,
  R: 0.722,
  S: 0.667,
  T: 0.611,
  U: 0.722,
  V: 0.667,
  W: 0.944,
  X: 0.667,
  Y: 0.667,
  Z: 0.611,
  "[": 0.278,
  "]": 0.278,
  _: 0.556,
  a: 0.556,
  b: 0.556,
  c: 0.5,
  d: 0.556,
  e: 0.556,
  f: 0.278,
  g: 0.556,
  h: 0.556,
  i: 0.222,
  j: 0.222,
  k: 0.5,
  l: 0.222,
  m: 0.833,
  n: 0.556,
  o: 0.556,
  p: 0.556,
  q: 0.556,
  r: 0.333,
  s: 0.5,
  t: 0.278,
  u: 0.556,
  v: 0.5,
  w: 0.722,
  x: 0.5,
  y: 0.5,
  z: 0.5,
  // Punctuation the league's own copy uses: en/em dashes in headlines, curly
  // quotes from anyone who typed a team name on a phone.
  "–": 0.556,
  "—": 1.0,
  "‘": 0.222,
  "’": 0.222,
  "“": 0.333,
  "”": 0.333,
  "…": 1.0,
};

/** Lowercase-ish average; the safest guess for an unlisted Latin glyph. */
const DEFAULT_ADVANCE = 0.55;

/**
 * Emoji and CJK are full-width or wider. G2's "record broken" card leads with
 * 🚨, so this is not hypothetical — and an emoji measured as 0.55 em would let a
 * headline run off the card.
 */
const WIDE_ADVANCE = 1.15;

/** Codepoint above which we assume a full-width glyph. Covers CJK and emoji. */
const WIDE_FROM = 0x2e80;

/**
 * Bold is wider, and the stack has no one answer for how much. These are the
 * ratios of Arial Bold to Arial Regular over the characters above, rounded up.
 */
const WEIGHT_FACTOR: Record<FontWeight, number> = {
  400: 1,
  600: 1.03,
  700: 1.05,
  800: 1.07,
};

/**
 * Approximate rendered width of `text`, in the same units as `fontSize`.
 *
 * An *estimate*, on purpose: the real face is not known until the card renders
 * on someone else's machine, and there is no `measureText` in Node for G6. It is
 * a pure function of the string, which is the other reason to own it — this is
 * the kind of arithmetic that is easy to get quietly wrong, so it is tested.
 *
 * Iterates by code point (`for…of`), not by UTF-16 unit, so an emoji counts once
 * rather than as two half-width surrogates.
 */
export const estimateTextWidth = (
  text: string,
  fontSize: number,
  weight: FontWeight = 400
): number => {
  if (!text || !Number.isFinite(fontSize) || fontSize <= 0) return 0;
  let em = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    em +=
      ADVANCE[char] ?? (code >= WIDE_FROM ? WIDE_ADVANCE : DEFAULT_ADVANCE);
  }
  return em * fontSize * WEIGHT_FACTOR[weight];
};

/**
 * The slack every fitting function leaves itself.
 *
 * 4%. The estimate is measured from the narrowest font in the stack, so the
 * usual error is "the real text is wider than we thought" — exactly the
 * direction that overflows a card. Four percent covers the spread between Arial
 * and SF Pro/Segoe over a name-length string without truncating strings that
 * would comfortably have fitted.
 */
export const METRIC_HEADROOM = 1.04;
