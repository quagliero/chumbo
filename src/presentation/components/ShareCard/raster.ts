/**
 * SVG → PNG, in the browser (G1).
 *
 * The pipeline is: serialise the card, hand it to an `<img>` as a data URI, draw
 * that to a `<canvas>`, `canvas.toBlob()`. No `html2canvas` — it is ~200 kB, it
 * re-implements a CSS layout engine in JavaScript, and it renders Tailwind's
 * utility output inconsistently enough that the card would not match the page it
 * was screenshotted from. Owning the SVG means the card is deterministic.
 *
 * **Every step here can fail quietly, and each one is handled explicitly.** A
 * share button that does nothing is worse than one that says it could not; the
 * caller gets a `ShareCardError` with a `code` it can turn into a message.
 */

import {
  buildCardSvg,
  cardDataUri,
  rasterSize,
  resolveScale,
  type BuildOptions,
  type ShareCard,
} from "./card";

export type ShareCardErrorCode =
  /** No `document` — this is the browser path; Node should call `buildCardSvg`. */
  | "no-dom"
  /** The SVG did not load. Almost always malformed markup or a bad data URI. */
  | "svg-load"
  /** The image took too long. A huge embedded avatar, or a stalled decode. */
  | "timeout"
  /** `getContext("2d")` returned null — out of memory, or a canvas-blocking extension. */
  | "no-context"
  /** The canvas was tainted, so the pixels cannot be read back. */
  | "tainted"
  /** `toBlob` produced null, or threw for a reason that is not taint. */
  | "encode-failed";

/**
 * A failure with a machine-readable cause.
 *
 * The codes exist so G3/G4 can distinguish "your browser blocked this" from
 * "the card is broken" — the first is worth a message to the user, the second is
 * worth a console error and a bug.
 */
export class ShareCardError extends Error {
  readonly code: ShareCardErrorCode;
  /**
   * Declared rather than passed to `super`: the project targets ES2020, whose
   * `Error` constructor has no `cause` option, and the underlying DOM event or
   * exception is worth keeping for the console.
   */
  readonly cause?: unknown;

  constructor(code: ShareCardErrorCode, message: string, cause?: unknown) {
    super(message);
    this.name = "ShareCardError";
    this.code = code;
    this.cause = cause;
  }
}

export interface RasterOptions extends BuildOptions {
  /**
   * How long to wait for the SVG to decode before giving up. Ten seconds is far
   * beyond a real decode (single-digit milliseconds) and exists only so a
   * pathological case surfaces as an error rather than a button that spins for
   * ever.
   */
  timeoutMs?: number;
  /** Output type. PNG by default — the clipboard and OG both want lossless. */
  type?: "image/png" | "image/jpeg" | "image/webp";
  /** Quality for the lossy types. Ignored for PNG. */
  quality?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

/**
 * Load an SVG data URI into an `HTMLImageElement`.
 *
 * `decode()` is preferred where available because `onload` can fire before the
 * image is actually decodable in some engines, and drawing a not-yet-decoded
 * image yields a blank canvas — a silently empty card, the exact failure this
 * whole file is written to avoid. `onload` remains as the fallback, and the
 * timeout covers both.
 */
const loadSvgImage = (dataUri: string, timeoutMs: number): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    let settled = false;

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      reject(
        new ShareCardError(
          "timeout",
          `The card image did not decode within ${timeoutMs}ms.`
        )
      );
    }, timeoutMs);

    const done = (error?: unknown) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        reject(
          new ShareCardError(
            "svg-load",
            "The card SVG failed to load. It is most likely not well-formed XML.",
            error
          )
        );
      } else {
        resolve(img);
      }
    };

    img.onload = () => {
      if (typeof img.decode === "function") {
        img.decode().then(() => done(), done);
      } else {
        done();
      }
    };
    img.onerror = (event) => done(event ?? new Error("image error"));
    img.src = dataUri;
  });

/**
 * `canvas.toBlob` as a promise that never resolves to null.
 *
 * `toBlob` is specified to hand `null` to its callback when encoding fails, and
 * browsers really do — out of memory on a large canvas, or an unsupported mime
 * type, in which case some engines fall back to PNG and others just give up. A
 * caller receiving `null` has no way to tell that from "still working", so it is
 * converted to a rejection here, once, rather than at four call sites later.
 */
const toBlob = (
  canvas: HTMLCanvasElement,
  type: string,
  quality?: number
): Promise<Blob> =>
  new Promise((resolve, reject) => {
    try {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else
            reject(
              new ShareCardError(
                "encode-failed",
                `The browser could not encode the card as ${type}.`
              )
            );
        },
        type,
        quality
      );
    } catch (error) {
      // Safari throws synchronously from toBlob on a tainted canvas rather than
      // passing null to the callback, so both paths have to be covered.
      reject(asEncodeError(error));
    }
  });

/**
 * A tainted canvas throws `SecurityError` on read-back. It should be impossible
 * here — the SVG is a data URI and `images.ts` only ever embeds data URIs — but
 * "impossible" is how you get a card that throws on the one manager with an
 * avatar, so it is named explicitly rather than lumped in with encoding errors.
 */
const asEncodeError = (error: unknown): ShareCardError => {
  const name =
    typeof error === "object" && error !== null && "name" in error
      ? String((error as { name: unknown }).name)
      : "";
  if (name === "SecurityError") {
    return new ShareCardError(
      "tainted",
      "The canvas was tainted by a cross-origin image, so the card cannot be " +
        "read back. Every bitmap on a card must be embedded as a data URI.",
      error
    );
  }
  return new ShareCardError("encode-failed", "Encoding the card failed.", error);
};

export interface RenderedCard {
  blob: Blob;
  /** The SVG that produced it — useful for debugging and for G6. */
  svg: string;
  width: number;
  height: number;
  scale: number;
}

/**
 * Render a card to a PNG blob, with the image it came from.
 *
 * The scale defaults to the display's pixel ratio (capped at 2×), so a card
 * copied on a retina laptop is 2400×1260 and one generated at build time is
 * whatever G6 asks for.
 */
export const renderCard = async (
  card: ShareCard,
  options: RasterOptions = {}
): Promise<RenderedCard> => {
  if (typeof document === "undefined") {
    throw new ShareCardError(
      "no-dom",
      "renderCard needs a DOM. In Node, call buildCardSvg and rasterise it " +
        "with a server-side renderer (see G6)."
    );
  }

  const {
    timeoutMs = DEFAULT_TIMEOUT_MS,
    type = "image/png",
    quality,
    scale = resolveScale(
      typeof window === "undefined" ? 1 : window.devicePixelRatio
    ),
  } = options;

  const svg = buildCardSvg(card, { scale });
  const { width, height } = rasterSize(scale);
  const img = await loadSvgImage(cardDataUri(svg), timeoutMs);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new ShareCardError(
      "no-context",
      "Could not get a 2D canvas context. The canvas may be too large, or a " +
        "privacy extension may be blocking it."
    );
  }

  // The SVG's intrinsic size already IS the target size (see buildCardSvg), so
  // this is a 1:1 blit of a vector rasterised at full resolution, not an upscale.
  ctx.drawImage(img, 0, 0, width, height);

  const blob = await toBlob(canvas, type, quality);
  return { blob, svg, width, height, scale };
};

/**
 * The blob on its own.
 *
 * Kept as a separate export because of a real Safari/iOS constraint in G3: the
 * `ClipboardItem` must be constructed with a **promise** of the blob,
 * synchronously inside the user gesture. Awaiting first loses the gesture and
 * the write fails silently. So this returns `Promise<Blob>` directly and is
 * meant to be called *un-awaited*:
 *
 *     navigator.clipboard.write([
 *       new ClipboardItem({ "image/png": renderCardBlob(card) }),
 *     ]);
 */
export const renderCardBlob = (
  card: ShareCard,
  options: RasterOptions = {}
): Promise<Blob> => renderCard(card, options).then((result) => result.blob);
