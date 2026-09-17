/**
 * Which sharing path this browser can actually take (G3/G4).
 *
 * There are three ways to get a 1200×630 PNG out of the page and into a group
 * chat, and browsers disagree about all of them:
 *
 * | path          | API                                   | where it wins            |
 * | ------------- | ------------------------------------- | ------------------------ |
 * | `share-sheet` | `navigator.share({ files })`          | phones — WhatsApp is *in* the sheet |
 * | `clipboard`   | `navigator.clipboard.write([item])`   | desktop — WhatsApp Web takes a paste |
 * | `download`    | `<a download>` on an object URL       | everywhere else, honestly |
 *
 * This module is **pure and DOM-free**: `detectShareCapabilities` reads a
 * `ShareEnvironment` it is handed, and `chooseSharePath` is a function from
 * capabilities to a decision. That is deliberate — the interesting logic here is
 * the branching, and mocking the whole clipboard stack in jsdom to test a
 * five-way branch tests the mock, not the branch. `readShareEnvironment()` is
 * the one function that touches globals, and it does nothing else.
 *
 * It imports nothing from `../ShareCard`, not even a type at runtime, because
 * the renderer is a lazily-loaded chunk with its own budget and a button that
 * pulls it onto the critical path defeats the point.
 */

/** The chosen way to share, in order of how good the flow is. */
export type SharePath = "share-sheet" | "clipboard" | "download" | "unsupported";

/** Why we could not take a better path. Turned into words by `shareOutcome.ts`. */
export type ShareFallbackReason =
  /** No `document`/`URL` — server-side, or a very old browser. */
  | "no-dom"
  /** Both APIs require a secure context. `http://` on a LAN IP is the usual cause. */
  | "insecure-context"
  /** No `navigator.clipboard.write`, or no `ClipboardItem` to give it. */
  | "no-clipboard-api"
  /** `navigator.share` is absent, or present but refuses files. */
  | "no-share-api";

export interface ShareDecision {
  path: SharePath;
  /** Set only when the path is a downgrade, so the user can be told why. */
  reason?: ShareFallbackReason;
}

/**
 * The browser facts the decision depends on. Booleans rather than the APIs
 * themselves, so a test can state a case in one line.
 */
export interface ShareCapabilities {
  /** There is a `document` and an `URL.createObjectURL` to build a link with. */
  dom: boolean;
  /** `window.isSecureContext`. Both share and clipboard need HTTPS or localhost. */
  secureContext: boolean;
  /** `navigator.share` exists *and* `canShare` accepted a probe PNG file. */
  canShareFiles: boolean;
  /** `navigator.clipboard.write` and `ClipboardItem` both exist. */
  clipboard: boolean;
  /**
   * The primary pointer is coarse — a phone or tablet.
   *
   * This is the difference between G4 and G3 and it is not pedantry: desktop
   * Chrome on macOS *does* implement `navigator.share({ files })`, and taking
   * it there would swap a one-keystroke paste into WhatsApp Web for a macOS
   * share dialog that does not have WhatsApp in it. The share sheet is the
   * better flow only where the OS sheet is the way you send things, which is
   * exactly where the pointer is a finger.
   */
  coarsePointer: boolean;
}

/**
 * A one-byte PNG-typed file, used only to ask `canShare` whether it takes files
 * at all.
 *
 * `navigator.share` existing does not mean Web Share **Level 2**: Safari 12–14
 * and every desktop Firefox behind a flag have `share` for text and URLs and
 * reject a `files` member, and the only way to find out is to ask `canShare`
 * with a real `File`. Probing with a fake one keeps detection synchronous —
 * which matters, because the clipboard path has to stay inside the user gesture
 * (see `useShareCard.ts`) and cannot afford to render a card just to decide.
 */
const canShareProbe = (nav: Navigator): boolean => {
  if (typeof nav.share !== "function" || typeof nav.canShare !== "function") {
    return false;
  }
  try {
    const probe = new File([new Uint8Array(1)], "chumbo-card.png", {
      type: "image/png",
    });
    return nav.canShare({ files: [probe] });
  } catch {
    // `File` is constructible everywhere that has Web Share, but canShare has
    // been seen to throw rather than return false. Either way: no files.
    return false;
  }
};

/**
 * Read the capabilities off the current globals.
 *
 * The only impure function in the module. Everything is optional-chained
 * because this runs during render on whatever the user brought.
 */
export const readShareEnvironment = (): ShareCapabilities => {
  const hasWindow = typeof window !== "undefined";
  const nav = typeof navigator === "undefined" ? undefined : navigator;

  return {
    dom:
      typeof document !== "undefined" &&
      typeof URL !== "undefined" &&
      typeof URL.createObjectURL === "function",
    // `isSecureContext` is itself missing on old browsers; those have no
    // clipboard API either, so treating absence as insecure costs nothing.
    secureContext: hasWindow && window.isSecureContext === true,
    canShareFiles: nav ? canShareProbe(nav) : false,
    clipboard:
      !!nav &&
      typeof nav.clipboard?.write === "function" &&
      typeof ClipboardItem !== "undefined",
    coarsePointer:
      hasWindow &&
      typeof window.matchMedia === "function" &&
      // `pointer: coarse` rather than a user-agent sniff, and rather than
      // `maxTouchPoints`, which is 5 on a touchscreen Windows laptop whose
      // owner is using a mouse and wants the clipboard.
      window.matchMedia("(pointer: coarse)").matches,
  };
};

/**
 * Capabilities → path. The whole decision, in one pure function.
 *
 * Order matters and each step is a judgement:
 *
 * 1. No DOM at all: nothing is possible, and the button must say so rather than
 *    shrug.
 * 2. Files-capable share sheet on a coarse pointer: G4. The best flow there is.
 * 3. Clipboard: G3, the desktop default even when a share sheet exists.
 * 4. Files-capable share sheet without a clipboard: better than a download, so
 *    a phone whose browser has no async clipboard still shares properly.
 * 5. Download: honest. The user gets the PNG and can attach it themselves.
 */
export const chooseSharePath = (caps: ShareCapabilities): ShareDecision => {
  if (!caps.dom) return { path: "unsupported", reason: "no-dom" };

  if (caps.canShareFiles && caps.coarsePointer) return { path: "share-sheet" };

  if (caps.clipboard) return { path: "clipboard" };

  if (caps.canShareFiles) return { path: "share-sheet", reason: "no-clipboard-api" };

  return {
    path: "download",
    // An insecure origin is the one cause the user (or the developer looking
    // over their shoulder) can do something about, so it is named ahead of the
    // generic "your browser cannot".
    reason: caps.secureContext ? "no-clipboard-api" : "insecure-context",
  };
};

/**
 * What the button should say before it is pressed.
 *
 * The label names the actual outcome. "Share" on a desktop that is about to put
 * a PNG on the clipboard is a small lie, and the user then goes looking for a
 * dialog that never appears.
 */
export const shareActionLabel = (path: SharePath): string => {
  switch (path) {
    case "share-sheet":
      return "Share";
    case "clipboard":
      return "Copy image";
    case "download":
      return "Download image";
    case "unsupported":
      return "Share";
  }
};
