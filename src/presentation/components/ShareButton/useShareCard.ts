/**
 * The share flow (G3 + G4).
 *
 * One hook, three paths, and two constraints that shape all of it.
 *
 * ## 1. The clipboard path must never leave the user gesture
 *
 * Safari (and iOS in particular) grants a clipboard write only from inside the
 * event the user's tap produced. Rendering the card first — a canvas round-trip
 * — and *then* writing hands Safari a write with no gesture behind it, and it
 * fails **silently**: no rejection, no clipboard, no message. The fix is the
 * `ClipboardItem` promise form:
 *
 * ```ts
 * navigator.clipboard.write([
 *   new ClipboardItem({ "image/png": renderCardBlob(card) }),   // un-awaited
 * ]);
 * ```
 *
 * Both the construction and the `write` happen synchronously in the handler;
 * the blob arrives later. G1 exports `renderCardBlob` returning `Promise<Blob>`
 * precisely so it can be passed un-awaited.
 *
 * The awkward consequence is the lazy import. The renderer is a separate chunk
 * (25 kB gzip, budgeted) that must not download until somebody shares, so it
 * arrives via `import()` — which is async, and awaiting it loses the gesture
 * just as surely. So the import goes *inside* the promise handed to
 * `ClipboardItem`. Nothing is awaited before `write`, and the chunk still
 * downloads on demand.
 *
 * ## 2. The share-sheet path cannot use that trick
 *
 * `navigator.share` takes a `File`, not a promise of one, so the card has to be
 * rendered first. That is legal — `share` needs *transient* activation, which
 * lasts five seconds in both WebKit and Chromium, and a card rasterises in
 * single-digit milliseconds — but it is a real difference, and if a render ever
 * did run long, the resulting `NotAllowedError` is surfaced rather than eaten.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ShareCard } from "../ShareCard";
import {
  chooseSharePath,
  readShareEnvironment,
  type ShareDecision,
  type SharePath,
} from "./shareCapabilities";
import {
  classifyShareError,
  fallbackMessage,
  successMessage,
} from "./shareOutcome";

/**
 * A card, or a way to get one.
 *
 * Deliberately not just `ShareCard`: a G2 template that needs an avatar goes
 * through `embedImage`, which is async, and no page should rasterise a card on
 * every render on the off-chance someone shares it. A function is called on
 * click and may return a promise.
 */
export type ShareCardInput = ShareCard | (() => ShareCard | Promise<ShareCard>);

export type ShareStatus = "idle" | "working" | "done" | "error";

export interface ShareState {
  status: ShareStatus;
  /** The path this browser takes. Known before the first click, for the label. */
  path: SharePath;
  /** The full decision, including why the path is a downgrade if it is. */
  decision: ShareDecision;
  /** What to tell the user right now. Empty when there is nothing to say. */
  message: string;
  /** For the console and for tests; never shown. */
  code?: string;
}

export interface UseShareCardOptions {
  card: ShareCardInput;
  /**
   * How long a success message stays before the button goes quiet again.
   * Failures are never auto-cleared: if it did not work, the reason should
   * still be on screen when the user looks back at it.
   */
  resetAfterMs?: number;
  /** What is being shared, e.g. "season card" — named in the success message. */
  what?: string;
  /** Called with the raw error. Failures also reach the console regardless. */
  onError?: (error: unknown) => void;
}

/** The renderer chunk. Every path goes through here, and nothing else imports it. */
const loadRenderer = () => import("../ShareCard");

const resolveCard = (input: ShareCardInput): Promise<ShareCard> =>
  // Wrapped rather than called directly, so a template that throws
  // synchronously becomes a rejection like any other failure instead of
  // escaping the chain and killing the handler.
  Promise.resolve().then(() => (typeof input === "function" ? input() : input));

const renderBlob = (input: ShareCardInput): Promise<Blob> =>
  Promise.all([loadRenderer(), resolveCard(input)]).then(([renderer, card]) =>
    renderer.renderCardBlob(card)
  );

const clipboardAvailable = () =>
  typeof ClipboardItem !== "undefined" &&
  typeof navigator !== "undefined" &&
  typeof navigator.clipboard?.write === "function";

/** Hand the user the PNG. The honest last resort. */
const saveBlob = (blob: Blob, fileName: string) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  // Not revoked in the same tick: Safari has been seen to cancel a download
  // whose object URL disappears before it starts.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
};

interface ShareOutcome {
  path: SharePath;
  fileName?: string;
}

export const useShareCard = ({
  card,
  resetAfterMs = 5_000,
  onError,
  what,
}: UseShareCardOptions) => {
  // Detected once: the answer cannot change within a page view, and the button
  // label needs it before the first click.
  const decision = useMemo(() => chooseSharePath(readShareEnvironment()), []);

  const [state, setState] = useState<ShareState>({
    status: "idle",
    path: decision.path,
    decision,
    message: "",
  });

  const alive = useRef(true);
  const resetTimer = useRef<ReturnType<typeof setTimeout>>();
  // A second click while the first render is in flight would rasterise the card
  // twice and race two clipboard writes.
  const busy = useRef(false);
  // The path actually being attempted, which can differ from the chosen one
  // when a share target refuses the real file. Failure wording follows it.
  const attempted = useRef<SharePath>(decision.path);

  // Set on mount as well as cleared on unmount, which is not belt-and-braces:
  // under StrictMode React mounts, unmounts and remounts, and a ref survives
  // that — so a cleanup that only ever sets `false` leaves the hook permanently
  // convinced it is unmounted and every message it would show is dropped. Found
  // by clicking the button in the harness and watching a handled failure fail to
  // appear on screen, which is precisely the silence this flow must not have.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      clearTimeout(resetTimer.current);
    };
  }, []);

  const settle = useCallback(
    (status: ShareStatus, message: string, code?: string) => {
      busy.current = false;
      if (!alive.current) return;
      setState({ status, message, code, path: decision.path, decision });
      clearTimeout(resetTimer.current);
      if (status === "done" && resetAfterMs > 0) {
        resetTimer.current = setTimeout(() => {
          if (alive.current) {
            setState({ status: "idle", message: "", path: decision.path, decision });
          }
        }, resetAfterMs);
      }
    },
    [decision, resetAfterMs]
  );

  const succeeded = useCallback(
    ({ path, fileName }: ShareOutcome) =>
      settle("done", successMessage(path, fileName, what)),
    [settle, what]
  );

  const failed = useCallback(
    (error: unknown) => {
      const failure = classifyShareError(error, attempted.current);
      // Closing the share sheet is a completed interaction, not a failure:
      // straight back to idle with nothing said.
      if (failure.status === "cancelled") {
        settle("idle", "");
        return;
      }
      // The message on screen is deliberately short; the cause goes here so a
      // bug report has something in it.
      console.error("[share] failed", failure.code, error);
      onError?.(error);
      settle("error", failure.message, failure.code);
    },
    [onError, settle]
  );

  /**
   * G3, and the one function in here whose statement order is load-bearing:
   * everything up to and including `write` is synchronous. Nothing may be
   * awaited before it. See the note at the top of the file.
   */
  const copyToClipboard = useCallback(() => {
    const blob = renderBlob(card);
    // If `write` rejects for its own reason, this promise's rejection would
    // otherwise be unhandled and show as console noise. An inert handler marks
    // it handled without consuming it: `write` holds the same promise and still
    // sees a render failure.
    blob.catch(() => {});

    let item: ClipboardItem | null = null;
    try {
      item = new ClipboardItem({ "image/png": blob });
    } catch (error) {
      // Firefox before 127 has `ClipboardItem` but rejects a promise value.
      // Those browsers do not have the gesture restriction, so rendering first
      // and writing after is safe there — which is the branch below.
      console.warn("[share] ClipboardItem would not take a promise", error);
    }

    try {
      const written = item
        ? navigator.clipboard.write([item])
        : blob.then((resolved) =>
            navigator.clipboard.write([
              new ClipboardItem({ "image/png": resolved }),
            ])
          );
      written.then(() => succeeded({ path: "clipboard" })).catch(failed);
    } catch (error) {
      // `write` is specified to reject, but Safari has a history of throwing
      // synchronously from clipboard calls, and an exception escaping the click
      // handler is the silent failure this whole file is written against.
      failed(error);
    }
  }, [card, failed, succeeded]);

  /**
   * G4. Render, wrap in a `File`, ask `canShare` again with the real file, hand
   * it to the sheet.
   *
   * The second `canShare` is not redundant: detection probed with a one-byte
   * stand-in, and a target can still refuse a 400 kB PNG. If it does, this
   * drops to the clipboard and then to a download rather than reporting a
   * failure — the user asked for the image, not for a particular API.
   */
  const runShareSheet = useCallback(async (): Promise<ShareOutcome> => {
    const [renderer, resolved] = await Promise.all([
      loadRenderer(),
      resolveCard(card),
    ]);
    const blob = await renderer.renderCardBlob(resolved);
    const fileName = renderer.cardFileName(resolved.title);
    const file = new File([blob], fileName, { type: blob.type });

    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: resolved.title });
      return { path: "share-sheet" };
    }

    console.warn(
      "[share] canShare accepted a probe file but refused the card; falling back"
    );
    if (clipboardAvailable()) {
      attempted.current = "clipboard";
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return { path: "clipboard" };
    }

    attempted.current = "download";
    saveBlob(blob, fileName);
    return { path: "download", fileName };
  }, [card]);

  const runDownload = useCallback(async (): Promise<ShareOutcome> => {
    const [renderer, resolved] = await Promise.all([
      loadRenderer(),
      resolveCard(card),
    ]);
    const blob = await renderer.renderCardBlob(resolved);
    const fileName = renderer.cardFileName(resolved.title);
    saveBlob(blob, fileName);
    return { path: "download", fileName };
  }, [card]);

  const share = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    attempted.current = decision.path;
    setState((current) => ({
      ...current,
      status: "working",
      message: "",
      code: undefined,
    }));

    switch (decision.path) {
      case "clipboard":
        copyToClipboard();
        return;
      case "share-sheet":
        runShareSheet().then(succeeded).catch(failed);
        return;
      case "download":
        runDownload().then(succeeded).catch(failed);
        return;
      case "unsupported":
        // Nothing to attempt — but the user still gets told why, which is the
        // entire point of having a reason on the decision.
        settle(
          "error",
          decision.reason
            ? fallbackMessage(decision.reason)
            : "This browser cannot share images.",
          decision.reason
        );
    }
  }, [
    copyToClipboard,
    decision,
    failed,
    runDownload,
    runShareSheet,
    settle,
    succeeded,
  ]);

  // For a toast's close button: a failure is never auto-cleared (see
  // `resetAfterMs`), so the reader needs a way to put it away.
  const dismiss = useCallback(() => settle("idle", ""), [settle]);

  return { ...state, share, dismiss };
};
