/**
 * The share-card renderer (G1).
 *
 * Turns a fact on a page into a 1200×630 PNG that can be pasted into WhatsApp.
 * This module is the *renderer*: geometry, SVG primitives, text fitting, image
 * embedding and rasterisation. The cards themselves are G2.
 *
 * ## For G2 (card templates)
 *
 * A template is a pure function returning a `ShareCard`:
 *
 * ```ts
 * import {
 *   CARD_HEIGHT, CARD_PADDING, CARD_TOKENS, CARD_WIDTH,
 *   fitFontSize, group, rect, text, truncateToWidth,
 *   type ShareCard,
 * } from "@/presentation/components/ShareCard";
 *
 * export const finalScoreCard = (props: Props): ShareCard => ({
 *   title: `${props.home.team} ${props.homeScore} – ${props.away.team} ${props.awayScore}`,
 *   content: [
 *     rect({ x: 0, y: 0, width: CARD_WIDTH, height: 8, fill: props.accent }),
 *     text(truncateToWidth(props.home.team, 700, 54, { weight: 700 }),
 *          { x: CARD_PADDING, y: 220, size: 54, weight: 700, fill: CARD_TOKENS.ink }),
 *   ].join(""),
 * });
 * ```
 *
 * Rules that are not negotiable, and the reasons are in the files:
 * - Coordinates are in the 1200×630 design space. Never think about scale.
 * - Every user-supplied string goes through `text()`/`textLines()`, which
 *   escape. Never interpolate a team name into markup by hand (`svg.ts`).
 * - Every bitmap is a data URI from `embedImage()`. Never a remote URL
 *   (`images.ts`).
 * - Fit long strings with `truncateToWidth` / `fitFontSize` / `wrapToWidth`;
 *   never with `textLength` (`fonts.ts`).
 * - One manager on a card may use their accent from `getManagerAccent`; several
 *   may not — see the F2 note in `src/domain/managerColors.ts`.
 * - Nothing below ~28px is legible at WhatsApp thumbnail size (`card.ts`).
 *
 * ## For G3 (clipboard)
 *
 * `renderCardBlob` returns `Promise<Blob>` and is designed to be passed
 * **un-awaited** into `ClipboardItem`, which is what Safari requires:
 *
 * ```ts
 * await navigator.clipboard.write([
 *   new ClipboardItem({ "image/png": renderCardBlob(card) }),
 * ]);
 * ```
 *
 * Failures arrive as `ShareCardError` with a `code`; surface something, because
 * a share button that silently does nothing is the worst outcome.
 *
 * ## For G4 (native share)
 *
 * ```ts
 * const { blob } = await renderCard(card);
 * const file = new File([blob], cardFileName(card.title), { type: blob.type });
 * if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file] });
 * ```
 *
 * ## For G6 (build-time OG images)
 *
 * `buildCardSvg(card, { scale })` is pure and DOM-free — call it under
 * `vite-node` and hand the string to a server-side rasteriser. Everything the
 * templates use (text fitting, tokens, primitives) is pure too; only
 * `raster.ts` and `images.ts` touch browser APIs, and `images.ts` degrades to
 * `null` rather than throwing when `fetch` is absent.
 */

export {
  CARD_WIDTH,
  CARD_HEIGHT,
  CARD_PADDING,
  MAX_SCALE,
  buildCardSvg,
  cardDataUri,
  rasterSize,
  resolveScale,
  type BuildOptions,
  type ShareCard,
} from "./card";

export {
  CARD_TOKENS,
  contrastRatio,
  onAccent,
  onAccentMuted,
  relativeLuminance,
} from "./tokens";

export {
  CARD_FONT_STACK,
  METRIC_HEADROOM,
  estimateTextWidth,
  type FontWeight,
} from "./fonts";

export {
  ELLIPSIS,
  cardFileName,
  fitFontSize,
  truncateToWidth,
  wrapToWidth,
  type FitOptions,
  type ShrinkOptions,
  type WrapOptions,
} from "./text";

export {
  attrs,
  circle,
  circleClip,
  defs,
  el,
  escapeXmlAttr,
  escapeXmlText,
  group,
  image,
  line,
  path,
  rect,
  text,
  textLines,
  type Attrs,
  type TextAnchor,
  type TextOptions,
} from "./svg";

export {
  clearImageCache,
  embedImage,
  embedImages,
  type EmbedOptions,
} from "./images";

export {
  ShareCardError,
  renderCard,
  renderCardBlob,
  type RasterOptions,
  type RenderedCard,
  type ShareCardErrorCode,
} from "./raster";
