/**
 * SVG to PNG, in Node (G6).
 *
 * ## Why resvg and not satori
 *
 * `BUILD_PLAN.md` suggests "`satori` + `resvg`", which was the right guess
 * before G1 existed. Satori's job is JSX -> SVG, and G1 already does that half:
 * `buildCardSvg(card, { scale })` is documented as pure and DOM-free
 * *specifically* so this step can call it, and the five G2 templates are pure
 * functions of flat primitives for the same reason. Adding satori would mean a
 * second, JSX-shaped description of the same five cards, rendered by a
 * different layout engine, drifting away from the ones the site puts on the
 * clipboard. The whole point of G1's contract is that there is one renderer.
 *
 * So the only missing piece is a rasteriser, and `@resvg/resvg-js` is it: a
 * prebuilt napi binary (no compile step, a platform entry for every target in
 * `yarn.lock`, including the `linux-x64-gnu` one Netlify installs), and a
 * devDependency that never enters the browser bundle. `sharp` would also work
 * — it rasterises SVG through librsvg — but it is a much larger dependency
 * whose SVG support is incidental, and librsvg's text layout differs from
 * resvg's in ways nobody here would be able to debug.
 *
 * ## The failure mode this file exists to catch
 *
 * resvg does not synthesise fonts. Hand it `font-family: -apple-system, …,
 * Arial, sans-serif` on a machine with none of those installed and it draws
 * **nothing at all** where the text was — no error, no warning that stops a
 * build, just a card with an accent rule, a footer strip and no words on it.
 * That is a real risk here, because the cards deliberately use a system stack
 * (see `fonts.ts`: the site is a system-font site, so the card matches the
 * page) and a Linux build container is not guaranteed to carry a humanist sans.
 *
 * A build cannot look at its own output, so `probeFonts` does it: render one
 * string and count the dark pixels. If text is not drawing, the driver says so
 * loudly and falls back to the league crest for every page rather than
 * publishing 150 wordless cards. `fonts.ts` already names the permanent fix
 * ("Embed a font … G6 is where it would earn its keep") and it is one
 * `@font-face` block away, but it needs a font file committed to the repo,
 * which is the owner's call and not this task's.
 */

import { Resvg, type ResvgRenderOptions } from "@resvg/resvg-js";

/**
 * Font resolution for every card in the run.
 *
 * `loadSystemFonts` costs about a second, once, and then ~60 ms per card on
 * this machine — the font database is rebuilt per `Resvg` instance, so the
 * cost is per card, which is why 150 routes is 10 seconds and 1,300 would be
 * 90. `defaultFontFamily` is the last resort *after* the stack in the SVG
 * fails: naming Helvetica means a machine that has it uses it rather than
 * whichever font the system happened to enumerate first.
 */
const FONTS: ResvgRenderOptions["font"] = {
  loadSystemFonts: true,
  defaultFontFamily: "Helvetica",
  sansSerifFamily: "Helvetica",
};

const OPTIONS: ResvgRenderOptions = {
  // The card's own width/height, which buildCardSvg sets to the pixel size it
  // wants. Anything else here would silently disagree with og:image:width.
  fitTo: { mode: "original" },
  font: FONTS,
  // Text is the whole card; precision over speed at 60 ms a page.
  textRendering: 2,
  shapeRendering: 2,
};

/** Rasterise one card. */
export const rasterise = (svg: string): Buffer =>
  new Resvg(svg, OPTIONS).render().asPng();

/** What the rasteriser is and is not able to draw, measured rather than assumed. */
export interface FontProbe {
  ok: boolean;
  /** Dark pixels found where the probe drew text. Zero means no font resolved. */
  inked: number;
}

/**
 * Does text actually render?
 *
 * Draws one word in the card's own font stack on white and counts the pixels
 * that came out dark. A machine with a usable font inks thousands; one with
 * none inks exactly zero. The threshold is deliberately far from both.
 */
export const probeFonts = (fontStack: string): FontProbe => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="120" viewBox="0 0 400 120">` +
    `<style type="text/css">text{font-family:${fontStack.replace(
      /&/g,
      "&amp;"
    )};}</style>` +
    `<rect width="400" height="120" fill="#ffffff"/>` +
    `<text x="10" y="90" font-size="80" font-weight="800" fill="#000000">Chumbo</text>` +
    `</svg>`;
  const pixels = new Resvg(svg, OPTIONS).render().pixels;
  let inked = 0;
  // RGBA, so every fourth byte is the start of a pixel. Red alone is enough to
  // separate black glyphs from a white ground.
  for (let i = 0; i < pixels.length; i += 4) {
    if (pixels[i] < 128) inked += 1;
  }
  return { ok: inked > 200, inked };
};
