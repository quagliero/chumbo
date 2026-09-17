import { describe, expect, it } from "vitest";
import { estimateTextWidth, METRIC_HEADROOM } from "../fonts";
import {
  ELLIPSIS,
  cardFileName,
  fitFontSize,
  truncateToWidth,
  wrapToWidth,
} from "../text";

/**
 * G1: text fitting is an estimate, because the real face is not known until the
 * card renders on somebody else's machine and there is no `measureText` in Node
 * for G6. What CAN be pinned down is that the estimate behaves sensibly and that
 * everything built on it errs on the side of fitting. Every string below is one
 * the site can really produce.
 */

const ZORRO = "Zaragoza's Zooting Zorro";

describe("estimateTextWidth", () => {
  it("scales linearly with font size", () => {
    expect(estimateTextWidth(ZORRO, 40)).toBeCloseTo(
      estimateTextWidth(ZORRO, 20) * 2,
      6
    );
  });

  it("grows with the string", () => {
    expect(estimateTextWidth("ZZ", 20)).toBeGreaterThan(
      estimateTextWidth("Z", 20)
    );
  });

  it("makes bold wider than regular", () => {
    expect(estimateTextWidth(ZORRO, 40, 700)).toBeGreaterThan(
      estimateTextWidth(ZORRO, 40, 400)
    );
  });

  it("knows an i is narrower than an M", () => {
    expect(estimateTextWidth("i", 100)).toBeLessThan(
      estimateTextWidth("M", 100)
    );
  });

  it("gives digits a single fixed width, as a lining face does", () => {
    // Scores are right-aligned in columns on several planned cards; if the
    // estimate thought 1 were narrower than 8 the fitting would wobble by
    // score.
    const widths = [..."0123456789"].map((d) => estimateTextWidth(d, 50));
    expect(new Set(widths).size).toBe(1);
  });

  it("counts an emoji once, at full width", () => {
    // A surrogate pair measured as two half-width glyphs is how a headline runs
    // off the edge of the card. G2's record card leads with a siren.
    const siren = estimateTextWidth("\u{1F6A8}", 100);
    expect(siren).toBeGreaterThan(estimateTextWidth("M", 100));
    expect(siren).toBeLessThan(estimateTextWidth("MM", 100));
  });

  it("is zero for nothing, and for a nonsense size", () => {
    expect(estimateTextWidth("", 40)).toBe(0);
    expect(estimateTextWidth("x", 0)).toBe(0);
    expect(estimateTextWidth("x", NaN)).toBe(0);
  });
});

describe("truncateToWidth", () => {
  it("leaves a string that fits completely alone", () => {
    // Most team names are short. A card that ellipsised "Norm" would be absurd.
    expect(truncateToWidth("Norm", 400, 40)).toBe("Norm");
  });

  it("cuts a long name and marks the cut", () => {
    const out = truncateToWidth(ZORRO, 200, 40);
    expect(out.endsWith(ELLIPSIS)).toBe(true);
    expect(out.length).toBeLessThan(ZORRO.length);
    expect(ZORRO.startsWith(out.slice(0, -1))).toBe(true);
  });

  it("produces something that actually fits, ellipsis included", () => {
    for (const width of [60, 120, 200, 340, 500]) {
      const out = truncateToWidth(ZORRO, width, 44, { weight: 700 });
      expect(estimateTextWidth(out, 44, 700)).toBeLessThanOrEqual(width);
    }
  });

  it("does not leave a space dangling before the ellipsis", () => {
    // "Zaragoza …" reads as a pause; "Zaragoza…" reads as a cut.
    const out = truncateToWidth("Zaragoza Zooting", 260, 40);
    expect(out).not.toContain(` ${ELLIPSIS}`);
  });

  it("never splits a surrogate pair", () => {
    // Half an emoji renders as a replacement box.
    const out = truncateToWidth("\u{1F6A8}\u{1F6A8}\u{1F6A8}", 80, 40);
    expect(out).not.toContain("\ud83d");
    expect([...out].every((c) => c === "\u{1F6A8}" || c === ELLIPSIS)).toBe(true);
  });

  it("returns nothing when not even the ellipsis fits", () => {
    expect(truncateToWidth(ZORRO, 2, 40)).toBe("");
    expect(truncateToWidth(ZORRO, 0, 40)).toBe("");
    expect(truncateToWidth(ZORRO, -10, 40)).toBe("");
  });
});

describe("fitFontSize", () => {
  it("leaves a short string at the size the design asked for", () => {
    expect(fitFontSize("Norm", 900, 72)).toBe(72);
  });

  it("shrinks a long one until it fits", () => {
    const size = fitFontSize(ZORRO, 600, 72);
    expect(size).toBeLessThan(72);
    expect(estimateTextWidth(ZORRO, size)).toBeLessThanOrEqual(600);
  });

  it("returns a whole number of pixels by default", () => {
    expect(fitFontSize(ZORRO, 517, 72) % 1).toBe(0);
  });

  it("stops at the legibility floor rather than shrinking to nothing", () => {
    // Below ~28px in the design space nothing survives a WhatsApp thumbnail, so
    // a truly enormous string is truncated at the floor, not rendered at 6px.
    expect(fitFontSize(ZORRO.repeat(20), 400, 72, { min: 28 })).toBe(28);
  });

  it("accounts for weight", () => {
    expect(fitFontSize(ZORRO, 600, 72, { weight: 800 })).toBeLessThanOrEqual(
      fitFontSize(ZORRO, 600, 72, { weight: 400 })
    );
  });
});

describe("wrapToWidth", () => {
  const HEADLINE = "Kevin beat Norm by half a point in the 2019 final";

  it("breaks on spaces and keeps every line inside the box", () => {
    const lines = wrapToWidth(HEADLINE, 500, 40);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(estimateTextWidth(line, 40)).toBeLessThanOrEqual(500);
    }
    expect(lines.join(" ")).toBe(HEADLINE);
  });

  it("does not wrap what already fits", () => {
    expect(wrapToWidth("Kevin wins", 900, 40)).toEqual(["Kevin wins"]);
  });

  it("caps the line count and marks that there was more", () => {
    const lines = wrapToWidth(HEADLINE, 300, 40, { maxLines: 2 });
    expect(lines).toHaveLength(2);
    expect(lines[1].endsWith(ELLIPSIS)).toBe(true);
  });

  it("does not add an ellipsis when everything fitted in the cap", () => {
    const lines = wrapToWidth(HEADLINE, 500, 40, { maxLines: 9 });
    expect(lines.join("")).not.toContain(ELLIPSIS);
  });

  it("truncates a single unbreakable word rather than overflowing", () => {
    // Overflow on a card is invisible until somebody has already shared it.
    const lines = wrapToWidth("Supercalifragilisticexpialidocious", 200, 40);
    expect(lines).toHaveLength(1);
    expect(estimateTextWidth(lines[0], 40)).toBeLessThanOrEqual(200);
  });

  it("collapses whitespace and survives an empty string", () => {
    expect(wrapToWidth("  a   b  ", 900, 20)).toEqual(["a b"]);
    expect(wrapToWidth("", 900, 20)).toEqual([]);
    expect(wrapToWidth("a", 0, 20)).toEqual([]);
  });
});

describe("METRIC_HEADROOM", () => {
  it("leaves slack, because the estimate is measured from the narrowest face", () => {
    expect(METRIC_HEADROOM).toBeGreaterThan(1);
    expect(METRIC_HEADROOM).toBeLessThan(1.1);
  });
});

describe("cardFileName", () => {
  it("slugs a title", () => {
    expect(cardFileName("Kevin beat Norm, 147.6 – 147.1")).toBe(
      "kevin-beat-norm-147-6-147-1.png"
    );
  });

  it("strips accents so one manager gets one filename", () => {
    expect(cardFileName("Zaragozá")).toBe("zaragoza.png");
  });

  it("never ends in a dash and never starts with one", () => {
    expect(cardFileName("  — Kevin — ")).toBe("kevin.png");
  });

  it("always has a name and an extension", () => {
    expect(cardFileName("\u{1F6A8}")).toBe("chumbo-card.png");
    expect(cardFileName("")).toBe("chumbo-card.png");
  });

  it("stays short enough for every filesystem and share sheet", () => {
    expect(cardFileName("word ".repeat(80)).length).toBeLessThanOrEqual(65);
  });
});
