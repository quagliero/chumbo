/**
 * The path decision (G3/G4).
 *
 * This is the whole reason `chooseSharePath` is a pure function over a
 * capability record rather than a pile of `if (navigator.…)` inside the click
 * handler. Faking `navigator.clipboard`, `ClipboardItem`, `canShare`,
 * `isSecureContext` and `matchMedia` in jsdom well enough to exercise a
 * five-way branch tests the fake; this tests the branch.
 */

import { describe, expect, it } from "vitest";

import {
  chooseSharePath,
  shareActionLabel,
  type ShareCapabilities,
  type SharePath,
} from "../shareCapabilities";

/** A modern desktop browser on https, which is the least interesting case. */
const caps = (overrides: Partial<ShareCapabilities> = {}): ShareCapabilities => ({
  dom: true,
  secureContext: true,
  canShareFiles: false,
  clipboard: true,
  coarsePointer: false,
  ...overrides,
});

describe("chooseSharePath", () => {
  const cases: {
    name: string;
    caps: ShareCapabilities;
    path: SharePath;
    reason?: string;
  }[] = [
    {
      name: "iOS Safari — share sheet, with WhatsApp already in it",
      caps: caps({ canShareFiles: true, coarsePointer: true }),
      path: "share-sheet",
    },
    {
      name: "Android Chrome — same",
      caps: caps({ canShareFiles: true, coarsePointer: true }),
      path: "share-sheet",
    },
    {
      name: "desktop Chrome on macOS — clipboard, EVEN THOUGH it can share files",
      // The regression this case exists for: desktop Chrome implements Web
      // Share Level 2, so a naive `if (canShare)` sends a laptop user to a
      // macOS share dialog that has no WhatsApp in it, instead of putting the
      // PNG one keystroke away from WhatsApp Web.
      caps: caps({ canShareFiles: true, coarsePointer: false }),
      path: "clipboard",
    },
    {
      name: "desktop Firefox — no Web Share at all",
      caps: caps({ canShareFiles: false }),
      path: "clipboard",
    },
    {
      name: "old iOS Safari — share() exists but refuses files",
      caps: caps({ canShareFiles: false, coarsePointer: true }),
      path: "clipboard",
    },
    {
      name: "phone with a files-capable sheet but no async clipboard",
      caps: caps({ canShareFiles: true, clipboard: false, coarsePointer: true }),
      path: "share-sheet",
    },
    {
      name: "desktop with a files-capable sheet and no clipboard",
      caps: caps({ canShareFiles: true, clipboard: false }),
      path: "share-sheet",
      reason: "no-clipboard-api",
    },
    {
      name: "http:// on a LAN IP — no secure context, so neither API exists",
      caps: caps({ secureContext: false, clipboard: false }),
      path: "download",
      reason: "insecure-context",
    },
    {
      name: "secure but ancient — nothing but a download",
      caps: caps({ clipboard: false }),
      path: "download",
      reason: "no-clipboard-api",
    },
    {
      name: "no DOM — nothing is possible and the button must say so",
      caps: caps({ dom: false, clipboard: false }),
      path: "unsupported",
      reason: "no-dom",
    },
  ];

  for (const testCase of cases) {
    it(testCase.name, () => {
      const decision = chooseSharePath(testCase.caps);
      expect(decision.path).toBe(testCase.path);
      expect(decision.reason).toBe(testCase.reason);
    });
  }

  /**
   * The "never fails silently" rule, as an invariant rather than a case: as
   * long as there is a DOM, there is always something the button can do, because
   * an object URL and an `<a download>` work everywhere. If this ever fails,
   * some capability combination has a dead button in it.
   */
  it("always finds an actionable path when there is a DOM", () => {
    for (const canShareFiles of [true, false]) {
      for (const clipboard of [true, false]) {
        for (const coarsePointer of [true, false]) {
          for (const secureContext of [true, false]) {
            const decision = chooseSharePath(
              caps({ canShareFiles, clipboard, coarsePointer, secureContext })
            );
            expect(decision.path, JSON.stringify({ canShareFiles, clipboard, coarsePointer, secureContext })).not.toBe(
              "unsupported"
            );
          }
        }
      }
    }
  });

  it("only reports a reason when the path is a downgrade", () => {
    expect(chooseSharePath(caps()).reason).toBeUndefined();
    expect(
      chooseSharePath(caps({ canShareFiles: true, coarsePointer: true })).reason
    ).toBeUndefined();
  });
});

describe("shareActionLabel", () => {
  /**
   * The label has to name the outcome — "Share" on a button that silently
   * copies leaves the user waiting for a dialog — so every path needs words,
   * including `unsupported`, where the button is still there and still clicks.
   */
  it("labels every path", () => {
    const paths: SharePath[] = [
      "share-sheet",
      "clipboard",
      "download",
      "unsupported",
    ];
    for (const path of paths) {
      expect(shareActionLabel(path).length).toBeGreaterThan(0);
    }
    expect(shareActionLabel("clipboard")).toMatch(/copy/i);
    expect(shareActionLabel("download")).toMatch(/download/i);
  });
});
