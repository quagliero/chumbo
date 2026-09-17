/**
 * Turning whatever was thrown into something a human can read (G3/G4).
 *
 * The rule this file exists to enforce: **a share button that does nothing is
 * the worst outcome.** Every path can fail — permissions, an insecure origin, a
 * card that will not rasterise, a canvas-blocking extension — and each failure
 * has to end in a sentence on screen. So there is exactly one classifier, it
 * takes `unknown`, and it always returns a message.
 *
 * Two things it is careful about:
 *
 * - **`AbortError` is not a failure.** `navigator.share` rejects with it when
 *   the user closes the sheet without picking anything, which is a completed
 *   interaction, not an error. Showing "sharing failed" there is worse than
 *   showing nothing.
 * - **It does not `instanceof ShareCardError`.** That would need a runtime
 *   import of `../ShareCard`, which is the lazily-loaded renderer chunk — the
 *   one thing a button on every page must not pull in. So it reads `name` and
 *   `code` structurally. The *type* is imported, which is erased at build time,
 *   and it is what makes `SHARE_CARD_MESSAGES` below fail to compile if G1 ever
 *   adds a code this file has no words for.
 */

import type { ShareCardErrorCode } from "../ShareCard";
import type { ShareFallbackReason, SharePath } from "./shareCapabilities";

/** A failed or cancelled attempt. `cancelled` deliberately carries no message. */
export interface ShareFailure {
  status: "cancelled" | "error";
  message: string;
  /** `DOMException.name` or a `ShareCardError` code, for the console and tests. */
  code?: string;
}

const name = (error: unknown): string =>
  typeof error === "object" && error !== null && "name" in error
    ? String((error as { name: unknown }).name)
    : "";

const code = (error: unknown): string =>
  typeof error === "object" && error !== null && "code" in error
    ? String((error as { code: unknown }).code)
    : "";

/**
 * One message per G1 failure code. Exhaustive by type, and phrased for the
 * person holding the phone rather than the person who wrote the renderer:
 * `no-context` and `tainted` are our bug, so they say "something went wrong"
 * and leave the detail to the console.
 */
const SHARE_CARD_MESSAGES: Record<ShareCardErrorCode, string> = {
  "no-dom": "Sharing needs a browser that can draw images. This one cannot.",
  "svg-load": "Could not draw the card. This is a bug — please report it.",
  timeout: "Drawing the card took too long. Try again.",
  "no-context":
    "Your browser would not give us a canvas to draw on. A privacy extension " +
    "blocking canvas is the usual cause.",
  tainted: "Could not draw the card. This is a bug — please report it.",
  "encode-failed": "Could not turn the card into an image. Try again.",
};

const PERMISSION_MESSAGES: Record<string, string> = {
  clipboard:
    "Your browser blocked the copy. Allow clipboard access for this site, or " +
    "use the keyboard shortcut after clicking the page once.",
  "share-sheet": "Your browser blocked the share sheet. Try again.",
  download: "Your browser blocked the download.",
  unsupported: "Your browser blocked sharing.",
};

/**
 * Classify a thrown value from a share attempt.
 *
 * `path` only changes the wording — a blocked clipboard and a blocked share
 * sheet need different advice.
 */
export const classifyShareError = (
  error: unknown,
  path: SharePath
): ShareFailure => {
  const errorName = name(error);

  // The user closed the share sheet. Nothing failed, nothing to say.
  if (errorName === "AbortError") return { status: "cancelled", message: "", code: errorName };

  if (errorName === "ShareCardError") {
    const errorCode = code(error);
    const message =
      errorCode in SHARE_CARD_MESSAGES
        ? SHARE_CARD_MESSAGES[errorCode as ShareCardErrorCode]
        : "Could not draw the card.";
    return { status: "error", message, code: errorCode };
  }

  // Chrome and Safari both use NotAllowedError for "the permission is not
  // granted" and for "you were not in a user gesture", which read the same to
  // the user: it did not happen, and a second deliberate click may work.
  if (errorName === "NotAllowedError" || errorName === "SecurityError") {
    return {
      status: "error",
      message: PERMISSION_MESSAGES[path] ?? PERMISSION_MESSAGES.unsupported,
      code: errorName,
    };
  }

  // Web Share rejects with TypeError/DataError when a target will not take the
  // file, despite canShare having said yes.
  if (errorName === "TypeError" || errorName === "DataError") {
    return {
      status: "error",
      message: "That app would not accept the image. Try copying it instead.",
      code: errorName,
    };
  }

  return {
    status: "error",
    message: "Sharing failed. Try again.",
    code: errorName || undefined,
  };
};

/** What to say after it worked. Names what happened and what to do next. */
export const successMessage = (path: SharePath, fileName?: string): string => {
  switch (path) {
    case "clipboard":
      return "Card copied — paste it into the chat.";
    case "share-sheet":
      return "Shared.";
    case "download":
      return fileName ? `Saved ${fileName}.` : "Image saved.";
    case "unsupported":
      return "";
  }
};

/**
 * Why the button is not doing the better thing.
 *
 * Shown when the path taken is a downgrade, because "Download image" on a page
 * where the same button copies for everyone else is confusing without it.
 */
export const fallbackMessage = (reason: ShareFallbackReason): string => {
  switch (reason) {
    case "no-dom":
      return "This browser cannot share images.";
    case "insecure-context":
      return "Copying images needs a secure (https) connection, so this saves the file instead.";
    case "no-clipboard-api":
      return "This browser cannot copy images to the clipboard.";
    case "no-share-api":
      return "This browser has no share sheet.";
  }
};
