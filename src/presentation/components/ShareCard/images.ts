/**
 * Getting bitmaps onto a card (G1) — avatars, the league crest.
 *
 * **Two separate traps, one answer.**
 *
 *   1. An SVG rendered through `<img>` is in *secure static mode* and will not
 *      fetch any external resource. `<image href="https://sleepercdn.com/…">`
 *      does not load and does not error — and it does not leave a tidy hole
 *      either. **Measured in Chrome:** a card whose only content was a remote
 *      `<image>` produced byte-for-byte identical output for the real avatar
 *      URL, a 404 on the same host, and a host that does not resolve. All three
 *      painted the browser's broken-image placeholder, stretched over the whole
 *      card. The identical bytes are the proof that no request was made; the
 *      placeholder is why this cannot be left to degrade on its own.
 *   2. Even if it did load, drawing a cross-origin image to a canvas **taints**
 *      it, and `toBlob` on a tainted canvas throws `SecurityError`. That is the
 *      failure where the share button works for eleven managers and throws for
 *      the twelfth.
 *
 * The answer to both is the same: **nothing remote is ever referenced by URL.**
 * A bitmap is fetched here, converted to a data URI, and embedded. The fetch is
 * an ordinary CORS request, so it either succeeds (and the bytes are ours, no
 * taint) or fails cleanly.
 *
 * And when it fails, this returns `null` rather than throwing. A missing avatar
 * must never be the reason a card does not get shared — `getUserAvatarUrl`
 * already returns `null` for managers who never set one, so templates need the
 * "no picture" branch regardless. Sleeper's CDN does send
 * `access-control-allow-origin: *` today; this is written so that the day it
 * stops, the cards lose their avatars instead of breaking.
 *
 * **The poisoned cache (I1).** The header being there is not enough. Every
 * page that offers a card has already painted the same avatar in an ordinary
 * `<img>`, which requests it *without* CORS — and the browser keeps that
 * no-CORS response in its HTTP cache. The CORS fetch below then reuses the
 * cached entry and is rejected before reaching the network. So for months every
 * card drew initials, on exactly the pages that had just shown the face:
 * measured on `/managers/thd`, the fetch returned `null`, the same fetch with
 * `cache: "reload"` returned 37 kB, and a plain fetch afterwards worked too,
 * because the reload replaced the entry.
 *
 * Hence one retry that bypasses the cache. The alternative, `crossOrigin` on
 * every page `<img>`, was rejected on purpose: it would couple every avatar on
 * the site to Sleeper's CORS policy, when the point above is that only cards
 * should pay if that policy ever changes. The retry also heals caches that are
 * already poisoned, which markup cannot.
 */

/** Anything bigger than this is not an avatar; refuse rather than embed 4 MB. */
const MAX_BYTES = 512 * 1024;

const DEFAULT_TIMEOUT_MS = 5_000;

/**
 * Cache of in-flight and completed conversions, keyed by URL.
 *
 * Promises, not results, so two cards opened in the same session for the same
 * manager share one request instead of racing. Module-level and unbounded, which
 * is fine at this scale: there are seventeen managers, ever.
 */
const cache = new Map<string, Promise<string | null>>();

const blobToDataUri = (blob: Blob): Promise<string | null> =>
  new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () =>
      resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });

/** One attempt. `null` for every failure; never throws. */
const fetchAsDataUri = async (
  url: string,
  cacheMode: RequestCache,
  timeoutMs: number,
  maxBytes: number
): Promise<string | null> => {
  const controller =
    typeof AbortController === "function" ? new AbortController() : undefined;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      mode: "cors",
      // No credentials: an avatar is public, and sending cookies would make
      // the response uncacheable and the CORS check stricter for no gain.
      credentials: "omit",
      cache: cacheMode,
      signal: controller?.signal,
    });
    if (!response.ok) return null;
    const blob = await response.blob();
    if (blob.size === 0 || blob.size > maxBytes) return null;
    if (!blob.type.startsWith("image/")) return null;
    // The data URI's media type comes from the blob, i.e. from the server's
    // Content-Type. Sleeper is loose about this: avatars come back as
    // `image/png` with JPEG bytes (`/9j/…` once base64'd). Browsers sniff the
    // magic number and render it anyway, so this is harmless here — but a
    // strict server-side rasteriser that trusts the declared type may not, so
    // G6 sniffs rather than believing the label (`scripts/og/assets.ts`).
    return await blobToDataUri(blob);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

export interface EmbedOptions {
  timeoutMs?: number;
  maxBytes?: number;
}

/**
 * Fetch `url` and return it as a `data:` URI, or `null` if that is not possible.
 *
 * Never throws. Every failure — offline, CORS, 404, a timeout, an image too
 * large, a response that is not an image — is the same outcome for a caller:
 * draw the fallback.
 */
export const embedImage = async (
  url: string | null | undefined,
  { timeoutMs = DEFAULT_TIMEOUT_MS, maxBytes = MAX_BYTES }: EmbedOptions = {}
): Promise<string | null> => {
  if (!url) return null;
  // Already embedded: pass through untouched. Saves callers a branch, and means
  // a template can take "a data URI or a URL" without caring which.
  if (url.startsWith("data:")) return url;

  const cached = cache.get(url);
  if (cached) return cached;

  const pending = (async (): Promise<string | null> => {
    if (typeof fetch !== "function" || typeof FileReader !== "function") {
      return null;
    }
    // First from the cache, which is free when the entry is CORS-clean; then,
    // once, straight from the network. See "The poisoned cache" above.
    return (
      (await fetchAsDataUri(url, "default", timeoutMs, maxBytes)) ??
      (await fetchAsDataUri(url, "reload", timeoutMs, maxBytes))
    );
  })();

  cache.set(url, pending);
  return pending;
};

/**
 * Embed several images at once, keeping the shape of the input.
 *
 * Templates want "the avatar for each of these two managers" and should not
 * write the `Promise.all` plus null-handling twice.
 */
export const embedImages = async (
  urls: readonly (string | null | undefined)[],
  options?: EmbedOptions
): Promise<(string | null)[]> =>
  Promise.all(urls.map((url) => embedImage(url, options)));

/** Drop the cache. Only for tests — the app has no reason to. */
export const clearImageCache = (): void => cache.clear();
