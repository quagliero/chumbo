/**
 * The tags a crawler reads (G6).
 *
 * These are the assertions that stand in for a preview debugger. A crawler
 * never reports a problem: a relative `og:image`, a missing dimension or a
 * team name with a `"` in it all produce a grey box rather than an error, and
 * the only signal is somebody in the group chat saying the link "looks weird".
 * So the rules that make a preview work are pinned here.
 */

import { describe, expect, it } from "vitest";

import {
  CARD_HEIGHT,
  CARD_WIDTH,
} from "@/presentation/components/ShareCard/card";

import {
  CARD_SIZE,
  SITE_ORIGIN,
  absolute,
  escapeAttr,
  escapeText,
  imageSlug,
  injectOg,
  ogTags,
  ordinal,
  type OgMeta,
} from "../tags";

/** A minimal stand-in for what Vite builds, including G5's existing tags. */
const BUILT = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/png" href="/images/logo.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>The Chumbo</title>
    <link rel="canonical" href="https://chumbo.netlify.app/" />
    <meta name="description" content="The Chumbo almanac." />

    <!-- Open Graph -->
    <meta property="og:site_name" content="The Chumbo" />
    <meta property="og:url" content="https://chumbo.netlify.app/" />
    <meta property="og:image" content="https://chumbo.netlify.app/images/logo.png" />

    <!-- summary, not summary_large_image: the crest is portrait 256x338 and
         letterboxes badly. Flip to summary_large_image when G6 generates 1200x630. -->
    <meta name="twitter:card" content="summary" />
    <script type="module" crossorigin src="/assets/index-abc123.js"></script>
    <link rel="modulepreload" crossorigin href="/assets/vendor-def456.js">
  </head>
  <body>
    <div id="root"></div>
  </body>
</html>
`;

const page: OgMeta = {
  path: "/managers/thd",
  title: "thd's Chumbo career",
  description: "121–98 across 14 seasons.",
  image: "managers-thd",
  imageAlt: "thd's 2021 season",
};

/** Every `key="value"` in the document, as a crawler's parser would see them. */
const attributes = (html: string): [string, string][] => {
  const found: [string, string][] = [];
  const pattern = /([a-zA-Z:-]+)="([^"]*)"/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(html))) found.push([match[1], match[2]]);
  return found;
};

const contentOf = (html: string, key: string): string | undefined => {
  const pattern = new RegExp(
    `<meta (?:property|name)="${key}" content="([^"]*)" />`
  );
  return pattern.exec(html)?.[1];
};

describe("escaping", () => {
  it("escapes the five characters that can end an attribute early", () => {
    expect(escapeAttr(`Salt & Pepper "the" <b> 'x'`)).toBe(
      "Salt &amp; Pepper &quot;the&quot; &lt;b&gt; &#39;x&#39;"
    );
  });

  it("escapes ampersands before anything else, so nothing double-escapes", () => {
    expect(escapeAttr("&lt;")).toBe("&amp;lt;");
    expect(escapeText("a & b < c")).toBe("a &amp; b &lt; c");
  });

  it("keeps a hostile team name inside its attribute", () => {
    const hostile: OgMeta = {
      ...page,
      title: `"><script>alert(1)</script>`,
      description: "Salt & Pepper vs Zaragoza's Zooting Zorro",
    };
    const html = injectOg(BUILT, hostile);

    // The description survives as one value, ampersand and apostrophe intact.
    expect(contentOf(html, "og:description")).toBe(
      "Salt &amp; Pepper vs Zaragoza&#39;s Zooting Zorro"
    );
    // And the injected head contributes no new script tag: the only one is the
    // bundle's. If escaping failed, the title would have opened a second.
    expect(html.match(/<script/g)).toHaveLength(1);
    // Every attribute in the document still parses as a key="value" pair, and
    // no value contains a bare quote.
    for (const [, value] of attributes(html)) {
      expect(value).not.toContain('"');
    }
  });
});

describe("urls", () => {
  it("makes og:image absolute, because no crawler resolves a relative one", () => {
    const html = injectOg(BUILT, page);
    expect(contentOf(html, "og:image")).toBe(
      `${SITE_ORIGIN}/og/managers-thd.png`
    );
    expect(contentOf(html, "twitter:image")).toBe(
      `${SITE_ORIGIN}/og/managers-thd.png`
    );
  });

  it("canonicalises the path without a trailing slash, except the root", () => {
    expect(absolute("/managers/thd")).toBe(`${SITE_ORIGIN}/managers/thd`);
    expect(absolute("/managers/thd/")).toBe(`${SITE_ORIGIN}/managers/thd`);
    expect(absolute("/")).toBe(`${SITE_ORIGIN}/`);
  });

  it("derives a filesystem-safe slug from the path", () => {
    expect(imageSlug("/managers/thd")).toBe("managers-thd");
    expect(imageSlug("/seasons/2019/standings")).toBe("seasons-2019-standings");
    expect(imageSlug("/h2h/thd/jay")).toBe("h2h-thd-jay");
    expect(imageSlug("/")).toBe("home");
    expect(imageSlug("/a/../b")).toBe("a-b");
  });
});

describe("the card contract", () => {
  it("declares the size G1 actually renders", () => {
    expect(CARD_SIZE).toEqual({ width: CARD_WIDTH, height: CARD_HEIGHT });
  });

  it("asks for the large card when there is a 1200x630 card to show", () => {
    const html = injectOg(BUILT, page);
    expect(contentOf(html, "twitter:card")).toBe("summary_large_image");
    expect(contentOf(html, "og:image:width")).toBe("1200");
    expect(contentOf(html, "og:image:height")).toBe("630");
    expect(contentOf(html, "og:image:type")).toBe("image/png");
  });

  it("falls back to the portrait crest, and to `summary` with it", () => {
    const html = injectOg(BUILT, { ...page, image: undefined });
    expect(contentOf(html, "twitter:card")).toBe("summary");
    expect(contentOf(html, "og:image")).toBe(`${SITE_ORIGIN}/images/logo.png`);
    expect(contentOf(html, "og:image:width")).toBe("256");
  });

  it("always has alt text, falling back to the title", () => {
    const tags = ogTags({ ...page, imageAlt: undefined }).join("\n");
    expect(tags).toContain(
      `<meta property="og:image:alt" content="thd&#39;s Chumbo career" />`
    );
  });
});

describe("injection into the built entry document", () => {
  const html = injectOg(BUILT, page);

  it("leaves the bundle alone, which is what keeps the SPA booting", () => {
    expect(html).toContain(
      `<script type="module" crossorigin src="/assets/index-abc123.js"></script>`
    );
    expect(html).toContain(
      `<link rel="modulepreload" crossorigin href="/assets/vendor-def456.js">`
    );
    expect(html).toContain(`<div id="root"></div>`);
    expect(html).toContain(`<link rel="icon" type="image/png" href="/images/logo.png" />`);
    expect(html).toContain(`name="viewport"`);
  });

  it("replaces rather than duplicates every tag it owns", () => {
    for (const key of [
      "og:title",
      "og:url",
      "og:image",
      "og:description",
      "twitter:card",
      "twitter:image",
    ]) {
      const count = [
        ...html.matchAll(new RegExp(`(?:property|name)="${key}"`, "g")),
      ];
      expect(count, key).toHaveLength(1);
    }
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html.match(/rel="canonical"/g)).toHaveLength(1);
    expect(html.match(/name="description"/g)).toHaveLength(1);
  });

  it("leaves no hole where the tags it removed used to be", () => {
    expect(html).not.toMatch(/\n[ \t]*\n[ \t]*\n/);
  });

  it("drops G5's note about `summary`, which the new head contradicts", () => {
    expect(html).not.toContain("letterboxes badly");
    expect(html).not.toContain("<!-- Open Graph -->");
  });

  it("puts the page's own title in, not the site's", () => {
    // An apostrophe is ordinary text content; only the attribute form escapes
    // it, which is why there are two escapers.
    expect(html).toContain("<title>thd's Chumbo career</title>");
    expect(html).toContain(`<meta property="og:title" content="thd&#39;s`);
    expect(html).not.toContain("<title>The Chumbo</title>");
  });

  it("refuses a document with no head rather than writing a page with no tags", () => {
    expect(() => injectOg("<html><body>hi</body></html>", page)).toThrow(
      /no <\/head>/
    );
  });
});

describe("ordinal", () => {
  it("handles the teens, which is the only reason it exists", () => {
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 101, 112].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
      "101st",
      "112th",
    ]);
  });
});
