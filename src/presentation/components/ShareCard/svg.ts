/**
 * SVG primitives for the share cards (G1).
 *
 * Markup is built as **strings**, not React elements. A card has to be
 * serialisable outside React — G6 generates it in a Node build step with no
 * renderer available, and the browser path needs a string to put in a data URI
 * anyway. `renderToStaticMarkup` would drag `react-dom/server` onto the critical
 * path for the sake of a few dozen elements.
 *
 * Strings mean the escaping is ours to get right, which is the whole reason this
 * file exists rather than template literals at the call sites. **A team name is
 * user input from Sleeper.** The league contains apostrophes ("Zaragoza's
 * Zooting Zorro") and the day somebody names their team `Ampersand & Sons` or
 * `<script>`, an unescaped card stops being well-formed XML — and an SVG that is
 * not well-formed does not render half a card, it fails to load entirely and
 * `toBlob` never gets a chance to run. So every value goes through `el`/`text`,
 * and nothing interpolates raw.
 */

/**
 * Attribute values. `undefined`, `null` and `false` drop the attribute, so a
 * caller can write `{ fill: highlight && color }` without building a
 * conditional object.
 */
export type Attrs = Record<string, string | number | undefined | null | false>;

const TEXT_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
};

const ATTR_ESCAPES: Record<string, string> = {
  ...TEXT_ESCAPES,
  '"': "&quot;",
  "'": "&apos;",
};

/**
 * Characters XML 1.0 forbids outright — most of the C0 controls. They cannot be
 * escaped, only removed: `&#x0;` is *also* illegal, so an escaping pass alone
 * would still produce a document the parser rejects. Sleeper display names are
 * free text, so a stray control character is a real possibility rather than a
 * theoretical one.
 */
// eslint-disable-next-line no-control-regex
const ILLEGAL_XML = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\ufffe\uffff]/g;

/** Escape a string for use as element content. */
export const escapeXmlText = (value: string): string =>
  value.replace(ILLEGAL_XML, "").replace(/[&<>]/g, (c) => TEXT_ESCAPES[c] ?? c);

/** Escape a string for use inside a double- or single-quoted attribute. */
export const escapeXmlAttr = (value: string): string =>
  value
    .replace(ILLEGAL_XML, "")
    .replace(/[&<>"']/g, (c) => ATTR_ESCAPES[c] ?? c);

/**
 * Two decimals. Finer than a device pixel at 2× on a 1200-wide card, and it
 * keeps the serialised document — which travels through a data URI, so its
 * length is not free — meaningfully shorter. Same rule as `Chart/scale.ts`.
 */
const round = (value: number) => Math.round(value * 100) / 100;

/** Serialise an attribute map, dropping anything unset. */
export const attrs = (record: Attrs): string => {
  const parts: string[] = [];
  for (const [name, value] of Object.entries(record)) {
    if (value === undefined || value === null || value === false) continue;
    const serialised =
      typeof value === "number"
        ? Number.isFinite(value)
          ? String(round(value))
          : // A NaN coordinate makes the element vanish silently. Zero is not
            // right either, but a mark in the corner is a visible bug, and a
            // visible bug gets fixed.
            "0"
        : escapeXmlAttr(value);
    parts.push(`${name}="${serialised}"`);
  }
  return parts.join(" ");
};

/**
 * One element. `children` is assumed to be already-serialised markup (the output
 * of these same helpers); pass text through `text()` instead of inlining it.
 */
export const el = (
  name: string,
  attributes: Attrs = {},
  children?: string | readonly string[]
): string => {
  const a = attrs(attributes);
  const open = a ? `${name} ${a}` : name;
  const inner =
    children === undefined
      ? ""
      : typeof children === "string"
        ? children
        : children.join("");
  return inner ? `<${open}>${inner}</${name}>` : `<${open}/>`;
};

/** Group. The `transform` shorthand saves a lot of coordinate arithmetic. */
export const group = (
  attributes: Attrs,
  children: string | readonly string[]
): string => el("g", attributes, children);

export const rect = (attributes: Attrs): string => el("rect", attributes);
export const circle = (attributes: Attrs): string => el("circle", attributes);
export const line = (attributes: Attrs): string => el("line", attributes);
export const path = (attributes: Attrs): string => el("path", attributes);

export type TextAnchor = "start" | "middle" | "end";

export interface TextOptions {
  x: number;
  y: number;
  /** Maps to `font-size`. */
  size?: number;
  /** Maps to `font-weight`. */
  weight?: number;
  fill?: string;
  opacity?: number;
  anchor?: TextAnchor;
  /**
   * Vertical alignment relative to `y`. Omitted, `y` is the baseline — which is
   * what you want for a headline sitting on a grid. `"middle"` centres the glyph
   * box on `y`, for text inside a pill or next to an avatar, without having to
   * know the face's cap height.
   */
  baseline?: "middle" | "hanging" | "central";
  /** Letter-spacing in user units; negative tightens a large headline. */
  tracking?: number;
  /**
   * Lining, fixed-width digits. Worth setting on any score or record so a column
   * of numbers lines up — the same reason the site has a `font-numeric` class.
   * Implemented with `font-variant-numeric`, which SVG-in-`<img>` honours where
   * the face has the feature and ignores harmlessly where it does not.
   */
  numeric?: boolean;
  /** Anything else — `transform`, `class`, a filter reference. */
  extra?: Attrs;
}

const textAttrs = ({
  x,
  y,
  size,
  weight,
  fill,
  opacity,
  anchor,
  baseline,
  tracking,
  numeric,
  extra,
}: TextOptions): Attrs => ({
  ...extra,
  x,
  y,
  fill,
  opacity,
  "font-size": size,
  "font-weight": weight,
  "text-anchor": anchor,
  "dominant-baseline": baseline,
  "letter-spacing": tracking,
  "font-variant-numeric": numeric ? "tabular-nums" : undefined,
});

/**
 * A single line of text.
 *
 * Note what is NOT here: `textLength`. Forcing a string to an exact width makes
 * a fallback font render as stretched or crushed letters, which looks far worse
 * than a line that comes up a few pixels short. Fit with `text.ts` instead.
 */
export const text = (content: string, options: TextOptions): string =>
  el("text", textAttrs(options), escapeXmlText(content));

/**
 * Several lines as one `<text>` with `<tspan>` children.
 *
 * `dy` on the first span is 0 and `lineHeight` on the rest, so the block's
 * anchor is its FIRST baseline — which is what a caller positioning a headline
 * under a fixed label actually wants. Anchoring to the block's centre would move
 * the first line every time the text wrapped differently.
 */
export const textLines = (
  lines: readonly string[],
  options: TextOptions & { lineHeight: number }
): string => {
  const { lineHeight, x, ...rest } = options;
  const spans = lines.map((content, index) =>
    el(
      "tspan",
      { x, dy: index === 0 ? 0 : lineHeight },
      escapeXmlText(content)
    )
  );
  return el("text", textAttrs({ ...rest, x }), spans);
};

/**
 * A bitmap.
 *
 * `href` MUST be a data URI. An SVG rendered through `<img>` is in secure static
 * mode and will not fetch anything — a Sleeper avatar URL here paints the
 * browser's broken-image placeholder over that box, with no error anywhere (see
 * the measurement in `images.ts`). Use `embedImage()`, which turns a URL into a
 * data URI, or into `null`, which means draw the fallback instead.
 *
 * Both `href` and `xlink:href` are emitted: SVG 2 dropped the xlink form, but
 * older WebKit only honours xlink, and cards are shared from phones.
 */
export const image = (
  dataUri: string,
  attributes: Attrs & { x: number; y: number; width: number; height: number }
): string =>
  el("image", {
    ...attributes,
    href: dataUri,
    "xlink:href": dataUri,
    // Cover, not stretch. A non-square avatar squashed to a circle is the sort
    // of thing nobody notices until it is their own face.
    preserveAspectRatio: attributes.preserveAspectRatio ?? "xMidYMid slice",
  });

/** `<defs>` wrapper; put gradients, clip paths and the style block in here. */
export const defs = (children: string | readonly string[]): string =>
  el("defs", {}, children);

/** A circular clip path, for avatars. Returns the markup and its `url(#…)`. */
export const circleClip = (
  id: string,
  cx: number,
  cy: number,
  r: number
): { def: string; ref: string } => ({
  def: el("clipPath", { id }, circle({ cx, cy, r })),
  ref: `url(#${id})`,
});
