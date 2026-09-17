import { describe, expect, it } from "vitest";
import {
  CARD_HEIGHT,
  CARD_WIDTH,
  buildCardSvg,
  cardDataUri,
  rasterSize,
  resolveScale,
} from "../card";
import { text } from "../svg";

describe("resolveScale", () => {
  it("renders at the display's pixel ratio so a retina card is not soft", () => {
    expect(resolveScale(2)).toBe(2);
    expect(resolveScale(1)).toBe(1);
  });

  it("keeps a fractional ratio rather than rounding it", () => {
    // The source is vector, so 1.5x costs nothing extra in quality and a
    // Windows laptop at 150% really does look better for it.
    expect(resolveScale(1.5)).toBe(1.5);
  });

  it("caps at 2x", () => {
    // A 3x phone would otherwise produce a 6.8 megapixel canvas, which is both
    // pointless at thumbnail size and close to iOS Safari's canvas area limit.
    expect(resolveScale(3)).toBe(2);
    expect(resolveScale(2.625)).toBe(2);
  });

  it("falls back to 1x for the values the platform actually hands you", () => {
    // undefined in Node (G6 runs there), 0 has been seen in a backgrounded tab.
    expect(resolveScale(undefined)).toBe(1);
    expect(resolveScale(0)).toBe(1);
    expect(resolveScale(NaN)).toBe(1);
    expect(resolveScale(-2)).toBe(1);
  });

  it("honours a caller-supplied cap, which is how G6 pins its own size", () => {
    expect(resolveScale(4, 3)).toBe(3);
  });
});

describe("rasterSize", () => {
  it("is the 1200x630 design multiplied by the scale", () => {
    expect(rasterSize(1)).toEqual({ width: 1200, height: 630 });
    expect(rasterSize(2)).toEqual({ width: 2400, height: 1260 });
  });

  it("rounds to whole pixels", () => {
    // A fractional canvas width is silently truncated by the browser, which
    // shaves a sub-pixel column off the right edge of the card.
    expect(rasterSize(1.5)).toEqual({ width: 1800, height: 945 });
    expect(rasterSize(1.33)).toEqual({ width: 1596, height: 838 });
  });

  it("keeps the OG aspect ratio at every scale", () => {
    for (const scale of [1, 1.25, 1.5, 2]) {
      const { width, height } = rasterSize(scale);
      expect(width / height).toBeCloseTo(CARD_WIDTH / CARD_HEIGHT, 2);
    }
  });
});

const card = (content: string, title = "Test card") => ({ title, content });

describe("buildCardSvg", () => {
  it("scales the intrinsic size but never the viewBox", () => {
    // This is the whole trick for a crisp retina card: drawing an SVG <img>
    // into a bigger canvas does not reliably re-rasterise the vector, so the
    // intrinsic size has to already be the target pixel size. The artwork's
    // coordinate space must not move with it.
    const svg = buildCardSvg(card("<rect/>"), { scale: 2 });
    expect(svg).toContain('width="2400"');
    expect(svg).toContain('height="1260"');
    expect(svg).toContain(`viewBox="0 0 ${CARD_WIDTH} ${CARD_HEIGHT}"`);
  });

  it("defaults to 1x", () => {
    expect(buildCardSvg(card("<rect/>"))).toContain('width="1200"');
  });

  it("declares both namespaces it uses", () => {
    // An undeclared xlink prefix makes the WHOLE document malformed, so it is
    // declared always rather than only on cards that carry an avatar.
    const svg = buildCardSvg(card("<rect/>"));
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('xmlns:xlink="http://www.w3.org/1999/xlink"');
  });

  it("paints an opaque background", () => {
    // toBlob writes transparency wherever nothing was drawn, and a transparent
    // PNG pasted into WhatsApp lands on black in dark mode.
    expect(buildCardSvg(card(""))).toContain('fill="#ffffff"');
    expect(buildCardSvg({ ...card(""), background: "#151922" })).toContain(
      'fill="#151922"'
    );
  });

  it("sets the font stack once, for every text element to inherit", () => {
    expect(buildCardSvg(card(""))).toContain("<style");
    expect(buildCardSvg(card(""))).toContain("-apple-system");
  });

  it("references nothing it would have to fetch", () => {
    // An SVG in secure static mode fetches nothing: an @font-face file, a
    // stylesheet or a remote image is silently ignored, leaving a card in the
    // wrong face or with a hole in it. The only URLs in the document should be
    // the two namespace identifiers, which are names, not fetches.
    const svg = buildCardSvg(card("<rect/>"));
    expect(svg).not.toContain("@font-face");
    expect(svg).not.toMatch(/(?:href|src|url\()\s*=?\s*["(]?https?:/);
    expect(svg.match(/https?:\/\/[^"]+/g)).toEqual([
      "http://www.w3.org/2000/svg",
      "http://www.w3.org/1999/xlink",
    ]);
  });

  it("escapes the title", () => {
    const svg = buildCardSvg(card("", "Salt & Pepper vs <b>"));
    expect(svg).toContain("<title>Salt &amp; Pepper vs &lt;b&gt;</title>");
  });
});

/** Every `<` that opens a tag, i.e. one that is not part of an entity. */
const tagCount = (svg: string) => (svg.match(/</g) ?? []).length;

describe("a hostile team name cannot corrupt the document", () => {
  /**
   * The structural version of the escaping tests: whatever a manager calls
   * their team, the card must contain exactly the elements the template asked
   * for and not one more. If an unescaped `<` ever slips through, the injected
   * name adds tags and this count moves.
   */
  const build = (team: string) =>
    buildCardSvg(
      card(text(team, { x: 56, y: 300, size: 60, weight: 700 }), team)
    );

  const baseline = tagCount(build("Norm"));

  it.each([
    ["Zaragoza's Zooting Zorro"],
    ["Salt & Pepper"],
    ["<script>alert(1)</script>"],
    ['" onload="alert(1)'],
    ["</text></svg><rect width='9999' height='9999' fill='red'/>"],
    ["a < b && c > d"],
    ["Team\u0000Null"],
    ["\u{1F6A8} NEW LEAGUE RECORD"],
  ])("survives %j", (team) => {
    expect(tagCount(build(team))).toBe(baseline);
  });
});

describe("cardDataUri", () => {
  it("percent-encodes rather than base64-encodes", () => {
    // btoa throws on anything above U+00FF, and the league's copy is full of
    // em dashes and curly apostrophes — a base64 card would pass every test
    // here and then throw on a real team name.
    const uri = cardDataUri(buildCardSvg(card(text("Kevin — 147.6", { x: 0, y: 0 }))));
    expect(uri.startsWith("data:image/svg+xml;charset=utf-8,")).toBe(true);
    expect(decodeURIComponent(uri.split(",").slice(1).join(","))).toContain(
      "Kevin — 147.6"
    );
  });

  it("encodes the characters that would otherwise terminate the URI", () => {
    const uri = cardDataUri('<svg a="b"># hash</svg>');
    expect(uri).not.toContain("#");
    expect(uri).toContain("%23");
  });
});
