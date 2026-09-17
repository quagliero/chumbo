import { describe, expect, it } from "vitest";
import {
  attrs,
  el,
  escapeXmlAttr,
  escapeXmlText,
  image,
  text,
  textLines,
} from "../svg";

/**
 * G1: the cards are built as strings, so the escaping is ours to get right.
 *
 * The cases below are not hypothetical. Team names come from Sleeper as free
 * text: the league already contains apostrophes, and an unescaped `&` is one
 * rename away. An SVG that is not well-formed does not degrade — the `<img>`
 * refuses to load it and `toBlob` never runs, so the share button does nothing
 * at all. That makes escaping the highest-value thing in this workstream to
 * test.
 */

describe("escapeXmlText", () => {
  it("escapes the three characters that can end an element", () => {
    expect(escapeXmlText("Tom & Jerry")).toBe("Tom &amp; Jerry");
    expect(escapeXmlText("a < b > c")).toBe("a &lt; b &gt; c");
  });

  it("escapes the ampersand before it escapes anything else", () => {
    // The classic double-escape bug: escape < first and "&lt;" becomes
    // "&amp;lt;". One pass over a character class cannot make that mistake, and
    // this is the test that keeps it that way.
    expect(escapeXmlText("<")).toBe("&lt;");
    expect(escapeXmlText("&lt;")).toBe("&amp;lt;");
  });

  it("neutralises a script tag rather than emitting one", () => {
    expect(escapeXmlText("<script>alert(1)</script>")).not.toContain("<script");
  });

  it("leaves quotes and apostrophes alone in text content", () => {
    // Legal in element content, and escaping them would show as literal
    // "&apos;" in some renderers. "Zaragoza's Zooting Zorro" is a real team.
    expect(escapeXmlText("Zaragoza's Zooting Zorro")).toBe(
      "Zaragoza's Zooting Zorro"
    );
  });

  it("strips control characters, which XML cannot represent at all", () => {
    // Not escapable: "&#x0;" is also illegal, so removal is the only option.
    expect(escapeXmlText("Team\u0000Name\u0008")).toBe("TeamName");
  });

  it("keeps the characters people actually type", () => {
    expect(escapeXmlText("Kevin — 2019 — 147.6 pts \u{1F6A8}")).toBe(
      "Kevin — 2019 — 147.6 pts \u{1F6A8}"
    );
  });
});

describe("escapeXmlAttr", () => {
  it("escapes quotes as well, since attributes are quoted", () => {
    expect(escapeXmlAttr('say "hi"')).toBe("say &quot;hi&quot;");
    expect(escapeXmlAttr("it's")).toBe("it&apos;s");
  });

  it("cannot be broken out of with a crafted value", () => {
    const hostile = '"/><script>alert(1)</script><rect x="';
    const out = el("rect", { fill: hostile });
    expect(out).toBe(
      '<rect fill="&quot;/&gt;&lt;script&gt;alert(1)&lt;/script&gt;&lt;rect x=&quot;"/>'
    );
  });
});

describe("attrs", () => {
  it("drops undefined, null and false so conditionals are ergonomic", () => {
    expect(attrs({ a: 1, b: undefined, c: null, d: false, e: "x" })).toBe(
      'a="1" e="x"'
    );
  });

  it("keeps zero and the empty string, which are meaningful", () => {
    // x=0 is the left edge, not "no x".
    expect(attrs({ x: 0, label: "" })).toBe('x="0" label=""');
  });

  it("rounds numbers to two decimals", () => {
    expect(attrs({ x: 1.23456 })).toBe('x="1.23"');
    expect(attrs({ x: 10 / 3 })).toBe('x="3.33"');
  });

  it("turns a non-finite coordinate into 0 rather than into NaN", () => {
    // `x="NaN"` makes the element vanish with no error anywhere. A mark in the
    // corner is also wrong, but it is wrong *visibly*.
    expect(attrs({ x: NaN, y: Infinity })).toBe('x="0" y="0"');
  });
});

describe("el", () => {
  it("self-closes when there are no children", () => {
    expect(el("rect", { x: 1 })).toBe('<rect x="1"/>');
  });

  it("omits the attribute list entirely when there is nothing to say", () => {
    expect(el("g", {}, "<rect/>")).toBe("<g><rect/></g>");
  });

  it("joins an array of children with no separator", () => {
    expect(el("g", {}, ["<a/>", "<b/>"])).toBe("<g><a/><b/></g>");
  });
});

describe("text", () => {
  it("maps the friendly option names onto SVG attribute names", () => {
    const out = text("147.6", {
      x: 10,
      y: 20,
      size: 48,
      weight: 700,
      anchor: "end",
      fill: "#151922",
      numeric: true,
    });
    expect(out).toContain('font-size="48"');
    expect(out).toContain('font-weight="700"');
    expect(out).toContain('text-anchor="end"');
    expect(out).toContain('font-variant-numeric="tabular-nums"');
    expect(out).toContain(">147.6</text>");
  });

  it("never emits textLength, which would distort a fallback font", () => {
    expect(text("x", { x: 0, y: 0, size: 10 })).not.toContain("textLength");
  });

  it("escapes its content", () => {
    expect(text("Salt & Pepper", { x: 0, y: 0 })).toContain(
      ">Salt &amp; Pepper<"
    );
  });
});

describe("textLines", () => {
  it("puts the first baseline on y and offsets the rest", () => {
    const out = textLines(["one", "two"], {
      x: 40,
      y: 100,
      size: 32,
      lineHeight: 40,
    });
    expect(out).toContain('<tspan x="40" dy="0">one</tspan>');
    expect(out).toContain('<tspan x="40" dy="40">two</tspan>');
    expect(out).toContain('y="100"');
  });

  it("escapes every line", () => {
    expect(textLines(["a & b"], { x: 0, y: 0, lineHeight: 10 })).toContain(
      ">a &amp; b<"
    );
  });
});

describe("image", () => {
  it("emits both href forms, because older WebKit only honours xlink", () => {
    const out = image("data:image/png;base64,AAAA", {
      x: 0,
      y: 0,
      width: 96,
      height: 96,
    });
    expect(out).toContain('href="data:image/png;base64,AAAA"');
    expect(out).toContain('xlink:href="data:image/png;base64,AAAA"');
  });

  it("covers rather than stretches by default", () => {
    const out = image("data:,", { x: 0, y: 0, width: 10, height: 10 });
    expect(out).toContain('preserveAspectRatio="xMidYMid slice"');
  });
});
