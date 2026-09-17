/**
 * The B1 design tokens, as literal hex, for the cards (G1).
 *
 * **Why duplicate them.** A card is rendered as a standalone SVG document
 * inside an `<img>`. It gets no stylesheet from the page, so there is no
 * `class="text-ink-muted"` to be had — every colour has to be an inline
 * attribute value. Tailwind's config is a JS module, not a runtime lookup, and
 * importing `tailwind.config.js` into the app bundle to read six colours would
 * pull the whole config (and its `content` globs) onto the critical path.
 *
 * So these are copied — and `__tests__/tokens.test.ts` imports the real config
 * and asserts every value here still matches it. Duplication that a test keeps
 * honest is fine; duplication that drifts is how you end up with the ten
 * different card treatments B1 was written to fix.
 *
 * Only the tokens a card can plausibly use are mirrored. If a card needs a
 * colour that is not here, add it to `tailwind.config.js` first and mirror it
 * second — the site is the source of truth, not the card.
 */

export const CARD_TOKENS = {
  surface: "#ffffff",
  surfaceSunk: "#f5f6f9",
  ink: "#151922",
  inkMuted: "#69738a",
  inkFaint: "#98a0b3",
  line: "#dce0e9",
  lineStrong: "#c6ccda",
  win: "#2a6344",
  loss: "#a8241c",
  tie: "#69738a",
} as const;

/**
 * Relative luminance, per WCAG 2.1. Exported because `onAccent` needs it and it
 * is worth being able to check a colour without importing a library for it.
 */
export const relativeLuminance = (hex: string): number => {
  const channel = (pair: string) => {
    const value = parseInt(pair, 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return (
    0.2126 * channel(hex.slice(1, 3)) +
    0.7152 * channel(hex.slice(3, 5)) +
    0.0722 * channel(hex.slice(5, 7))
  );
};

/** WCAG contrast ratio between two opaque hex colours. */
export const contrastRatio = (a: string, b: string): number => {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort(
    (x, y) => y - x
  );
  return (hi + 0.05) / (lo + 0.05);
};

/**
 * Ink for text sitting ON a manager's accent fill — and a warning about doing
 * that at all.
 *
 * The obvious design is a coloured block with white text in it. **It does not
 * work for this palette.** Measured against the eight accents in
 * `src/domain/managerColors.ts`, white clears 4.5:1 on exactly two of them
 * (violet 8.6, green 5.0) and lands at 2.2:1 on the yellow — white text on
 * `#eda100` is genuinely unreadable, and nothing in the codebase would have
 * told you before it shipped. `ink` is not a universal answer either: it fails
 * on the violet at 2.1:1.
 *
 * So two rules, in order of preference:
 *
 *   1. **Prefer the accent as a rule, a bar or a marker**, not as a ground for
 *      text. That is exactly the use F2 sanctions ("their card's top rule, the
 *      ring on their avatar"), and it sidesteps the problem.
 *   2. If text really must sit on the accent, use this — it picks whichever of
 *      white and `ink` has more contrast — and keep the text **large**. The
 *      worst case across the palette is 4.4:1 (the blue), which clears WCAG's
 *      3:1 threshold for large text comfortably but misses 4.5:1 for body
 *      text. Nothing on a card should be body size anyway (see `card.ts`), so
 *      this is a constraint the format already satisfies.
 */
export const onAccent = (accent: string): string =>
  contrastRatio("#ffffff", accent) >= contrastRatio(CARD_TOKENS.ink, accent)
    ? "#ffffff"
    : CARD_TOKENS.ink;

/**
 * A softened version of `onAccent` for secondary text on an accent block.
 *
 * Expressed as an alpha over the accent rather than as a second fixed colour,
 * because the accent underneath varies by manager and any fixed second hue
 * would clash with at least one of the eight. At 0.78 the worst case (the blue,
 * again) composites to 3.3:1 — still over the 3:1 large-text threshold, which
 * is the floor this is allowed to sit at. Do not push the alpha lower.
 */
export const onAccentMuted = (accent: string): string =>
  onAccent(accent) === "#ffffff"
    ? "rgba(255,255,255,0.78)"
    : "rgba(21,25,34,0.78)";
