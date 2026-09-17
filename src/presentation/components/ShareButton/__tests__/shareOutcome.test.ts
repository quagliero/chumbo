/**
 * Every failure ends in a sentence, and one "failure" is not one.
 */

import { describe, expect, it } from "vitest";

// The modules directly, not the barrel: the barrel also exports the component,
// and these tests run in the `node` environment with no DOM to render it in.
import type { ShareFallbackReason, SharePath } from "../shareCapabilities";
import {
  classifyShareError,
  fallbackMessage,
  successMessage,
} from "../shareOutcome";

const PATHS: SharePath[] = ["share-sheet", "clipboard", "download", "unsupported"];

/** Shaped like a `ShareCardError` without importing the renderer chunk. */
const renderError = (code: string) => ({
  name: "ShareCardError",
  code,
  message: `render failed: ${code}`,
});

describe("classifyShareError", () => {
  /**
   * The case worth writing the classifier for. `navigator.share` rejects with
   * `AbortError` when the user opens the sheet and closes it again — they
   * changed their mind, which is a completed interaction. "Sharing failed" there
   * is a lie, and a red message for a deliberate cancel is worse than silence.
   */
  it("treats AbortError as a cancellation, not a failure", () => {
    const outcome = classifyShareError(
      new DOMException("Share canceled", "AbortError"),
      "share-sheet"
    );
    expect(outcome.status).toBe("cancelled");
    expect(outcome.message).toBe("");
  });

  it("treats an AbortError-shaped object the same way", () => {
    // Not every engine throws a real DOMException here, and the classifier
    // takes `unknown` precisely so it does not have to care.
    expect(classifyShareError({ name: "AbortError" }, "share-sheet").status).toBe(
      "cancelled"
    );
  });

  it("explains a blocked clipboard differently from a blocked share sheet", () => {
    const clipboard = classifyShareError(
      new DOMException("Write permission denied.", "NotAllowedError"),
      "clipboard"
    );
    const sheet = classifyShareError(
      new DOMException("Permission denied", "NotAllowedError"),
      "share-sheet"
    );
    expect(clipboard.status).toBe("error");
    expect(clipboard.message).toMatch(/clipboard/i);
    expect(sheet.message).not.toBe(clipboard.message);
    expect(sheet.message.length).toBeGreaterThan(0);
  });

  /**
   * The six G1 codes. If the renderer ever adds a seventh, the `Record` in
   * `shareOutcome.ts` stops compiling — this test is what says the six that
   * exist today each have their own words.
   */
  it("has words for every render failure code", () => {
    const codes = [
      "no-dom",
      "svg-load",
      "timeout",
      "no-context",
      "tainted",
      "encode-failed",
    ];
    for (const code of codes) {
      const outcome = classifyShareError(renderError(code), "clipboard");
      expect(outcome.status).toBe("error");
      expect(outcome.code).toBe(code);
      expect(outcome.message.length).toBeGreaterThan(0);
      expect(outcome.message).not.toMatch(/undefined/);
    }
  });

  it("still says something for an unknown render code", () => {
    const outcome = classifyShareError(renderError("something-new"), "clipboard");
    expect(outcome.status).toBe("error");
    expect(outcome.message.length).toBeGreaterThan(0);
  });

  it("suggests copying when a share target refuses the file", () => {
    expect(
      classifyShareError(new TypeError("not supported"), "share-sheet").message
    ).toMatch(/copy/i);
  });

  /**
   * The rule, as an invariant: anything at all that can be thrown produces a
   * non-empty message on every path. A silent button is the failure mode this
   * whole module exists to prevent.
   */
  it("never returns an empty message for a real failure", () => {
    const thrown: unknown[] = [
      undefined,
      null,
      "just a string",
      0,
      new Error("boom"),
      new DOMException("nope", "NotAllowedError"),
      new DOMException("nope", "SecurityError"),
      new DOMException("nope", "DataError"),
      { name: "ShareCardError", code: "timeout" },
      { unexpected: true },
    ];
    for (const error of thrown) {
      for (const path of PATHS) {
        const outcome = classifyShareError(error, path);
        if (outcome.status === "cancelled") continue;
        expect(outcome.message.length, `${String(error)} on ${path}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("successMessage", () => {
  it("says what happened, and what to do next where there is a next step", () => {
    expect(successMessage("clipboard")).toMatch(/paste/i);
    expect(successMessage("share-sheet").length).toBeGreaterThan(0);
    expect(successMessage("download", "chumbo-card.png")).toMatch(
      /chumbo-card\.png/
    );
    // Nothing succeeded, so there is nothing to report.
    expect(successMessage("unsupported")).toBe("");
  });
});

describe("fallbackMessage", () => {
  it("explains every downgrade", () => {
    const reasons: ShareFallbackReason[] = [
      "no-dom",
      "insecure-context",
      "no-clipboard-api",
      "no-share-api",
    ];
    for (const reason of reasons) {
      expect(fallbackMessage(reason).length).toBeGreaterThan(0);
    }
    // The one a developer can act on should say how.
    expect(fallbackMessage("insecure-context")).toMatch(/https/i);
  });
});
