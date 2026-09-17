/**
 * The bitmaps a card needs, fetched in Node (G6).
 *
 * G1's `embedImage` is browser-only by construction — it uses `fetch` plus
 * `FileReader` and its own docblock says it degrades to `null` outside a
 * browser. That degradation is *correct* (a card with initials instead of a
 * face is a normal card, see `chrome.ts`), but it would mean every prerendered
 * card has initials, and the faces are most of what makes these cards
 * recognisable at thumbnail size. So this is the Node-side equivalent: read the
 * crest off disk, pull the avatars over HTTP once per build, hand back data
 * URIs in exactly the shape `CardPerson.avatar` wants.
 *
 * ## Sniff the bytes, do not trust the header
 *
 * Sleeper serves avatars as `Content-Type: image/png` and some of them are
 * JPEG. A data URI that claims `image/png` over JPEG bytes is exactly the kind
 * of thing a strict decoder rejects, and resvg is a strict decoder: the image
 * silently does not draw, so the card renders with a blank hole where the face
 * should be — worse than the initials fallback, because the fallback at least
 * looks deliberate. So the type comes from the magic number, and anything the
 * rasteriser cannot decode is returned as `null` so the template takes its
 * initials branch.
 *
 * ## Failure is expected, not exceptional
 *
 * A build runs on Netlify with no guarantee about reaching sleepercdn.com. A
 * timeout, a 404 for a manager who deleted their picture, a WEBP: all of them
 * return `null` and the build carries on with initials. Nothing here throws.
 * What it does do is *say* how many faces it got, because "all 17 cards
 * suddenly have initials" is a thing worth noticing in a build log.
 */

import fs from "node:fs";
import path from "node:path";

/** Magic numbers for the raster formats resvg 0.36 (resvg-js 2.6) can decode. */
const SNIFFERS: { mime: string; test: (bytes: Buffer) => boolean }[] = [
  {
    mime: "image/png",
    test: (b) =>
      b.length > 8 &&
      b[0] === 0x89 &&
      b[1] === 0x50 &&
      b[2] === 0x4e &&
      b[3] === 0x47,
  },
  {
    mime: "image/jpeg",
    test: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/gif",
    test: (b) => b.length > 6 && b.subarray(0, 3).toString("latin1") === "GIF",
  },
];

/** The type these bytes actually are, or null if nothing can draw them. */
export const sniffImageType = (bytes: Buffer): string | null =>
  SNIFFERS.find((s) => s.test(bytes))?.mime ?? null;

/**
 * Bytes to a data URI, base64.
 *
 * Base64 rather than the percent-encoding `cardDataUri` uses for SVG: this is
 * binary, where percent-encoding would be three characters per byte.
 */
export const toDataUri = (bytes: Buffer): string | null => {
  const mime = sniffImageType(bytes);
  return mime ? `data:${mime};base64,${bytes.toString("base64")}` : null;
};

/** Read a bitmap from the repo (the crest). Returns null if it is not there. */
export const embedLocalImage = (file: string): string | null => {
  try {
    return toDataUri(fs.readFileSync(path.resolve(process.cwd(), file)));
  } catch {
    return null;
  }
};

/** How long a single avatar gets before the build gives up on it. */
const TIMEOUT_MS = 6000;

const fetchOne = async (url: string): Promise<string | null> => {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    return toDataUri(Buffer.from(await response.arrayBuffer()));
  } catch {
    return null;
  }
};

/**
 * Every avatar, once.
 *
 * Keyed by URL and deduplicated, because two managers can share a URL (nobody
 * does today, but two legacy entries pointing at the same Sleeper account is
 * one merge away) and because a route table asks for the same manager's face
 * on a dozen cards.
 */
export const fetchAvatars = async (
  urls: Iterable<string | null | undefined>
): Promise<Map<string, string | null>> => {
  const wanted = [...new Set([...urls].filter((u): u is string => Boolean(u)))];
  const results = await Promise.all(wanted.map(fetchOne));
  return new Map(wanted.map((url, i) => [url, results[i]]));
};
