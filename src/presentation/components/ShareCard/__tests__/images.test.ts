import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearImageCache, embedImage } from "../images";

/**
 * I1. The bug this guards is invisible by construction: when `embedImage`
 * fails, a card draws the manager's initial, which looks deliberate. So for
 * months every card drew initials, because the page had already painted the
 * avatar through a plain `<img>` and the browser's no-CORS cache entry made the
 * CORS fetch fail. Only a retry that bypasses the cache gets the face.
 *
 * Node has no FileReader, so a minimal one is stubbed; `fetch` is stubbed to
 * behave like the poisoned cache — reject unless asked to reload.
 */

class StubFileReader {
  result: string | null = null;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  readAsDataURL(blob: Blob) {
    blob.arrayBuffer().then((buffer) => {
      this.result = `data:${blob.type};base64,${btoa(String.fromCharCode(...new Uint8Array(buffer)))}`;
      this.onload?.();
    });
  }
}

const jpeg = () =>
  new Response(new Blob([new Uint8Array([0xff, 0xd8, 0xff, 0xe0])], { type: "image/png" }));

beforeEach(() => {
  clearImageCache();
  vi.stubGlobal("FileReader", StubFileReader);
});
afterEach(() => vi.unstubAllGlobals());

describe("embedImage", () => {
  it("gets past a poisoned cache entry by fetching once from the network", async () => {
    const fetch = vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.cache !== "reload") throw new TypeError("Failed to fetch");
      return jpeg();
    });
    vi.stubGlobal("fetch", fetch);

    const uri = await embedImage("https://sleepercdn.com/uploads/face.jpg");

    expect(uri).toMatch(/^data:image\/png;base64,/);
    expect(fetch.mock.calls.map(([, init]) => init?.cache)).toEqual(["default", "reload"]);
  });

  it("uses the cache and makes one request when the cache is clean", async () => {
    const fetch = vi.fn(async () => jpeg());
    vi.stubGlobal("fetch", fetch);

    expect(await embedImage("https://sleepercdn.com/avatars/abc")).not.toBeNull();
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("still returns null, not a throw, when both attempts fail", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("Failed to fetch");
    });
    vi.stubGlobal("fetch", fetch);

    expect(await embedImage("https://sleepercdn.com/avatars/gone")).toBeNull();
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("does not embed something that is not an image", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(new Blob(["<html>"], { type: "text/html" })))
    );
    expect(await embedImage("https://example.com/not-an-image")).toBeNull();
  });
});
