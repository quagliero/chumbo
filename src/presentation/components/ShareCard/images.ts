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
    const controller =
      typeof AbortController === "function" ? new AbortController() : undefined;
    const timer = setTimeout(() => controller?.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        mode: "cors",
        // No credentials: an avatar is public, and sending cookies would make
        // the response uncacheable and the CORS check stricter for no gain.
        credentials: "omit",
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
      // G6 should sniff rather than believe the label.
      return await blobToDataUri(blob);
    } catch {
      return null;
    } finally {
      clearTimeout(timer);
    }
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
