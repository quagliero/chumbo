/**
 * The card document: geometry, scaling, and the SVG wrapper (G1).
 *
 * This is the contract the rest of workstream G sits on. A card template (G2) is
 * a pure function returning a `ShareCard`; the clipboard (G3), the share sheet
 * (G4) and the build-time OG images (G6) all consume one.
 */

import { CARD_FONT_STACK } from "./fonts";
import { CARD_TOKENS } from "./tokens";
import { defs, el, escapeXmlText, rect } from "./svg";

/**
 * 1200×630.
 *
 * Not a preference — it is the size Open Graph, Twitter/X, Slack, LinkedIn and
 * WhatsApp's link preview all crop to (1.91:1). Designing at anything else means
 * either letterboxing or having the interesting half cropped off. G6 needs
 * exactly this, and the clipboard flow shares the renderer, so there is one size
 * and it is this one.
 *
 * The practical consequence, and the one that governs every template: at
 * WhatsApp thumbnail size this is about **200px wide**. A 24px label on the card
 * is 4px in the thread. Nothing below ~28px in the design space is legible, and
 * the one thing the card is *about* wants to be 60px or more.
 */
export const CARD_WIDTH = 1200;
export const CARD_HEIGHT = 630;

/**
 * A comfortable margin. 56px is ~4.7% of the width, which survives the ~5% crop
 * that some previews apply to the edges of an OG image.
 */
export const CARD_PADDING = 56;

/**
 * Upper bound on the raster scale.
 *
 * Capped at 2 for three reasons. Nothing visible improves past 2× — the artwork
 * is vector and the destination is a chat thumbnail that gets recompressed by
 * WhatsApp anyway. A 3× card is 3600×1890, which is 6.8 megapixels, and iOS
 * Safari enforces a hard canvas area limit (16.7 Mpx) that a second card in the
 * same session can walk into. And the blob goes on the clipboard, where a 4 MB
 * PNG is a slow paste.
 */
export const MAX_SCALE = 2;

/**
 * Pick a raster scale for the current display.
 *
 * Renders at the device's pixel ratio so the card is not soft on a retina
 * screen, clamped to `[1, MAX_SCALE]`. A non-integer ratio (1.5 on a Windows
 * laptop at 150%, 2.625 on a Pixel) is kept rather than rounded: the source is
 * vector, so there is no resampling penalty for a fractional scale, and 1.5×
 * genuinely looks better than 1×.
 *
 * Defensive about its input because `devicePixelRatio` is `undefined` in Node
 * (G6) and has been seen as 0 in a backgrounded tab.
 */
export const resolveScale = (
  devicePixelRatio: number | undefined,
  max: number = MAX_SCALE
): number => {
  if (!Number.isFinite(devicePixelRatio) || (devicePixelRatio ?? 0) < 1) {
    return 1;
  }
  return Math.min(devicePixelRatio as number, max);
};

/** The pixel dimensions of the output file at a given scale. */
export const rasterSize = (
  scale: number
): { width: number; height: number } => ({
  // Rounded, not floored: a fractional canvas width is silently truncated by the
  // browser, which would shave a sub-pixel column off the right edge.
  width: Math.round(CARD_WIDTH * scale),
  height: Math.round(CARD_HEIGHT * scale),
});

/**
 * A card, ready to serialise.
 *
 * `content` is SVG markup in the 1200×630 **design space** — templates never
 * think about the raster scale, which is applied by the root element's
 * width/height against a fixed viewBox.
 */
export interface ShareCard {
  /**
   * What the card says, in one line. Becomes the SVG `<title>` (so it is the
   * accessible name and the alt text), the share-sheet subject in G4, and the
   * filename via `cardFileName`.
   */
  title: string;
  /** Serialised SVG markup, positioned in the 1200×630 design space. */
  content: string;
  /**
   * Opaque background. Defaults to the site's surface white.
   *
   * Must be opaque: a PNG with an alpha channel pasted into WhatsApp renders on
   * black in dark mode, and a card designed on white becomes unreadable.
   */
  background?: string;
}

export interface BuildOptions {
  /**
   * Multiplier on the root element's width/height. The viewBox does not change,
   * so the artwork is identical — only its rasterised resolution differs.
   */
  scale?: number;
}

/**
 * Serialise a card to a standalone SVG document.
 *
 * Exported separately from the raster path because G6 wants exactly this: a
 * string to hand to `resvg` in Node, with no DOM involved.
 *
 * **Why the root carries explicit pixel width/height.** Drawing an SVG `<img>`
 * into a larger canvas does not reliably re-rasterise the vector — several
 * engines rasterise at the image's intrinsic size and then scale the bitmap,
 * which is precisely the soft-on-retina failure this is meant to avoid. Setting
 * the intrinsic size to the target pixel size makes it unambiguous.
 */
export const buildCardSvg = (
  card: ShareCard,
  { scale = 1 }: BuildOptions = {}
): string => {
  const { width, height } = rasterSize(scale);
  const background = card.background ?? CARD_TOKENS.surface;

  return el(
    "svg",
    {
      xmlns: "http://www.w3.org/2000/svg",
      // Declared even though only `image` uses it — an undeclared prefix makes
      // the whole document malformed, and a card with no avatar must not be the
      // only one that renders.
      "xmlns:xlink": "http://www.w3.org/1999/xlink",
      width,
      height,
      viewBox: `0 0 ${CARD_WIDTH} ${CARD_HEIGHT}`,
      // The card is a picture of a fact, not a document to explore.
      role: "img",
    },
    [
      el("title", {}, escapeXmlText(card.title)),
      defs(
        // One style block, inherited by every `<text>`, rather than a
        // font-family attribute on each. See fonts.ts for the stack, and for why
        // there is no @font-face here.
        el(
          "style",
          { type: "text/css" },
          `text{font-family:${CARD_FONT_STACK};}`
        )
      ),
      // Painted rather than left to the background attribute of whatever shows
      // the PNG: `toBlob` writes transparency where nothing was drawn.
      rect({ x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT, fill: background }),
      card.content,
    ]
  );
};

/**
 * A card as a data URI, ready for `<img src>`.
 *
 * Percent-encoded, not base64. `btoa` throws on any character above U+00FF, and
 * the league's own copy is full of em dashes and curly apostrophes — a base64
 * card would work in testing and then throw on the first team name with a "'"
 * in it. Percent-encoding is also ~30% smaller for text-heavy markup.
 */
export const cardDataUri = (svg: string): string =>
  `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
