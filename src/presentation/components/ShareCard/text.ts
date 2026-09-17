/**
 * Fitting strings into boxes (G1).
 *
 * Every one of these is a pure function over a string and a width, for the same
 * reason `Chart/scale.ts` is: it has to work identically in the browser (the
 * clipboard flow) and in Node (G6's build-time images), where there is no
 * `measureText` to fall back on, and it is arithmetic that is easy to get subtly
 * wrong and easy to test.
 *
 * All three take `METRIC_HEADROOM` off the available width before deciding —
 * see `fonts.ts` for why the estimate is deliberately pessimistic.
 *
 * The league has real strings that need these: "Zaragoza's Zooting Zorro" is a
 * live team name, and the manager pages routinely hold "Kevin's Krispy Kreme
 * Kroissants" next to a three-digit score.
 */

import {
  estimateTextWidth,
  METRIC_HEADROOM,
  type FontWeight,
} from "./fonts";

/** Single-character ellipsis. Narrower than three dots and reads as deliberate. */
export const ELLIPSIS = "…";

export interface FitOptions {
  weight?: FontWeight;
  /** Override the ellipsis, e.g. "" to hard-cut with no marker. */
  ellipsis?: string;
}

/** Usable width once the metric safety margin is taken off. */
const usable = (maxWidth: number) =>
  Number.isFinite(maxWidth) ? maxWidth / METRIC_HEADROOM : 0;

/**
 * Trim `text` until it fits `maxWidth`, marking the cut with an ellipsis.
 *
 * Returns the string untouched when it already fits, which is the common case —
 * most team names are short, and a card that ellipsised "Norm" would be absurd.
 *
 * Trims by code point so a truncated string never ends mid-surrogate, which
 * renders as a replacement glyph.
 */
export const truncateToWidth = (
  text: string,
  maxWidth: number,
  fontSize: number,
  { weight = 400, ellipsis = ELLIPSIS }: FitOptions = {}
): string => {
  const limit = usable(maxWidth);
  if (limit <= 0) return "";
  if (estimateTextWidth(text, fontSize, weight) <= limit) return text;

  const chars = [...text];
  const markWidth = estimateTextWidth(ellipsis, fontSize, weight);
  // If even the ellipsis does not fit, there is nothing honest to show.
  if (markWidth > limit) return "";

  let width = 0;
  let kept = 0;
  for (const char of chars) {
    const next = width + estimateTextWidth(char, fontSize, weight);
    if (next + markWidth > limit) break;
    width = next;
    kept += 1;
  }
  // Do not leave a dangling space before the ellipsis — "Zaragoza …" reads as a
  // pause, "Zaragoza…" reads as a cut.
  return chars.slice(0, kept).join("").trimEnd() + ellipsis;
};

export interface ShrinkOptions extends Pick<FitOptions, "weight"> {
  /** Smallest size worth rendering. Below this, truncate instead. */
  min?: number;
  /** Quantisation of the returned size. Whole pixels by default. */
  step?: number;
}

/**
 * The largest font size at or below `maxSize` at which `text` fits `maxWidth`.
 *
 * Shrink-to-fit is the right move for the ONE hero string on a card — a team
 * name in the headline — because a name rendered at 52px instead of 60px still
 * reads as a WhatsApp thumbnail, whereas a truncated one loses information.
 * Everything secondary should truncate instead; a card with six different type
 * sizes on it has no hierarchy left.
 *
 * Returns `min` when even that is too big: the caller is expected to truncate at
 * the returned size, and `min` is the floor on legibility, not on width.
 */
export const fitFontSize = (
  text: string,
  maxWidth: number,
  maxSize: number,
  { weight = 400, min = 16, step = 1 }: ShrinkOptions = {}
): number => {
  const limit = usable(maxWidth);
  if (!text || limit <= 0) return maxSize;
  const natural = estimateTextWidth(text, maxSize, weight);
  if (natural <= limit) return maxSize;
  // Width is linear in font size, so the ideal size is one division away; only
  // the quantisation needs a loop, and flooring to the step is that loop.
  const ideal = (maxSize * limit) / natural;
  const quantised = Math.floor(ideal / step) * step;
  return Math.max(min, Math.min(maxSize, quantised));
};

export interface WrapOptions extends FitOptions {
  /** Hard cap on lines; the last one is ellipsised if text remains. */
  maxLines?: number;
}

/**
 * Greedy word wrap to `maxWidth`, at most `maxLines` lines.
 *
 * Greedy rather than balanced (Knuth-style) on purpose: a card headline is two
 * or three lines and a balanced break mostly differs on long paragraphs, which
 * a card must never contain anyway.
 *
 * A single word longer than the line — a URL, a joke team name with no spaces —
 * is truncated rather than allowed to overflow, because overflow on a card is
 * invisible until someone has already shared it.
 */
export const wrapToWidth = (
  text: string,
  maxWidth: number,
  fontSize: number,
  { weight = 400, maxLines = Infinity, ellipsis = ELLIPSIS }: WrapOptions = {}
): string[] => {
  const limit = usable(maxWidth);
  const words = text.split(/\s+/).filter(Boolean);
  if (limit <= 0 || words.length === 0 || maxLines < 1) return [];

  const lines: string[] = [];
  let line = "";

  const flush = () => {
    if (line) lines.push(line);
    line = "";
  };

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (estimateTextWidth(candidate, fontSize, weight) <= limit) {
      line = candidate;
      continue;
    }
    flush();
    // Wrap the whole string even once past `maxLines`, rather than breaking
    // early: the cap is applied below, and it needs to know whether anything was
    // actually left over so it can mark the cut.
    line =
      estimateTextWidth(word, fontSize, weight) <= limit
        ? word
        : truncateToWidth(word, maxWidth, fontSize, { weight, ellipsis });
  }
  flush();

  if (lines.length <= maxLines) return lines;

  // Over the cap: keep the first `maxLines`, and mark the last one as cut so the
  // reader knows there was more rather than silently getting half a sentence.
  const kept = lines.slice(0, maxLines);
  const lastIndex = kept.length - 1;
  const last = kept[lastIndex];
  kept[lastIndex] = last.endsWith(ellipsis)
    ? last
    : truncateToWidth(`${last} ${ellipsis}`, maxWidth, fontSize, {
        weight,
        ellipsis,
      });
  return kept;
};

/**
 * A filename for a card, derived from its title.
 *
 * G4 needs one for `navigator.share({ files })` (the sheet shows it, and some
 * targets reject a file with no extension) and G6 needs one for the file it
 * writes to disk. Same rule in both places, so it lives here.
 */
export const cardFileName = (title: string, extension = "png"): string => {
  const slug = title
    .normalize("NFKD")
    // Drop combining marks so "Zaragoza" and "Zaragozá" do not produce two
    // different filenames for what is one manager.
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60)
    .replace(/-+$/g, "");
  return `${slug || "chumbo-card"}.${extension}`;
};
