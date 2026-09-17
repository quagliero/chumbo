import { describe, expect, it } from "vitest";
import tailwindSource from "../../../../../tailwind.config.js?raw";
import {
  CARD_TOKENS,
  contrastRatio,
  onAccent,
  onAccentMuted,
  relativeLuminance,
} from "../tokens";
import { SERIES_COLORS } from "@/domain/managerColors";

/**
 * G1: a card gets no stylesheet, so the B1 tokens have to be copied into it as
 * literal hex. This is the test that stops the copy drifting from
 * `tailwind.config.js` — the finding that prompted B1 was an audit turning up
 * ten different card treatments, and a share card is the one surface people see
 * outside the site.
 *
 * The config is read as text rather than imported: it is a plain `.js` module
 * outside `src`, so importing it would need `allowJs` and would drag Tailwind's
 * own types into the app's typecheck for the sake of six colours.
 */

/**
 * Pull `group: { key: "#hex" }` out of the config source.
 *
 * Scoped to the group because three of them (`surface`, `ink`, `line`) have a
 * `DEFAULT`, and a config-wide search for `DEFAULT` finds whichever comes first.
 * No group in the config nests braces, so `[^}]*` is enough of a parser.
 */
const configColor = (group: string, key: string): string => {
  const block = tailwindSource.match(new RegExp(`\\b${group}:\\s*\\{([^}]*)\\}`));
  if (!block) throw new Error(`No colour group "${group}" in tailwind.config.js`);
  const match = block[1].match(new RegExp(`\\b${key}:\\s*"(#[0-9a-fA-F]{6})"`));
  if (!match) {
    throw new Error(`No colour "${group}.${key}" in tailwind.config.js`);
  }
  return match[1];
};

describe("CARD_TOKENS mirrors tailwind.config.js", () => {
  it.each([
    ["surface", "DEFAULT", CARD_TOKENS.surface],
    ["surface", "sunk", CARD_TOKENS.surfaceSunk],
    ["ink", "DEFAULT", CARD_TOKENS.ink],
    ["ink", "muted", CARD_TOKENS.inkMuted],
    ["ink", "faint", CARD_TOKENS.inkFaint],
    ["line", "DEFAULT", CARD_TOKENS.line],
    ["line", "strong", CARD_TOKENS.lineStrong],
    ["result", "win", CARD_TOKENS.win],
    ["result", "loss", CARD_TOKENS.loss],
    ["result", "tie", CARD_TOKENS.tie],
  ])("%s.%s", (group, key, value) => {
    expect(value).toBe(configColor(group, key));
  });
});

describe("relativeLuminance", () => {
  it("runs from 0 at black to 1 at white", () => {
    expect(relativeLuminance("#000000")).toBe(0);
    expect(relativeLuminance("#ffffff")).toBeCloseTo(1, 6);
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white, and symmetric", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 3);
    expect(contrastRatio("#ffffff", "#000000")).toBeCloseTo(21, 3);
  });

  it("is 1 for a colour against itself", () => {
    expect(contrastRatio("#2a78d6", "#2a78d6")).toBeCloseTo(1, 6);
  });
});

/**
 * The claim `onAccent` makes is that text on ANY manager accent is legible at
 * card sizes. That is checkable, so it is checked — F2 assigns accents by
 * position in `managers.json`, so a new palette entry would otherwise silently
 * ship an unreadable card to whichever manager landed on it.
 */
describe("onAccent", () => {
  it.each(SERIES_COLORS.map((accent) => [accent]))(
    "clears the large-text threshold on %s",
    (accent) => {
      expect(contrastRatio(onAccent(accent), accent)).toBeGreaterThanOrEqual(3);
    }
  );

  it("does not pretend a single fixed ink would have done", () => {
    // The point of the helper. White fails badly on the yellow (2.2:1) and ink
    // fails on the violet (2.1:1) — there is no one answer for this palette,
    // which is why G2 should prefer the accent as a rule rather than a ground.
    const whiteWorst = Math.min(
      ...SERIES_COLORS.map((a) => contrastRatio("#ffffff", a))
    );
    const inkWorst = Math.min(
      ...SERIES_COLORS.map((a) => contrastRatio(CARD_TOKENS.ink, a))
    );
    expect(whiteWorst).toBeLessThan(3);
    expect(inkWorst).toBeLessThan(3);
  });

  it("picks white on the violet and ink on the yellow", () => {
    expect(onAccent("#4a3aa7")).toBe("#ffffff");
    expect(onAccent("#eda100")).toBe(CARD_TOKENS.ink);
  });
});

describe("onAccentMuted", () => {
  /** Composite an rgba over an opaque background and measure the result. */
  const composited = (rgba: string, background: string) => {
    const [r, g, b, alpha] = (rgba.match(/[\d.]+/g) ?? []).map(Number);
    const bg = [1, 3, 5].map((i) => parseInt(background.slice(i, i + 2), 16));
    const mix = [r, g, b].map((c, i) =>
      Math.round(alpha * c + (1 - alpha) * bg[i])
    );
    return `#${mix.map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  };

  it.each(SERIES_COLORS.map((accent) => [accent]))(
    "still clears 3:1 once composited over %s",
    (accent) => {
      const effective = composited(onAccentMuted(accent), accent);
      expect(contrastRatio(effective, accent)).toBeGreaterThanOrEqual(3);
    }
  );

  it("matches the direction onAccent chose", () => {
    expect(onAccentMuted("#eda100").startsWith("rgba(21")).toBe(true);
    expect(onAccentMuted("#4a3aa7").startsWith("rgba(255")).toBe(true);
  });
});
