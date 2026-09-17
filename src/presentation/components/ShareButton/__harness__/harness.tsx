/**
 * Dev-only harness for the share flow (G3/G4).
 *
 * Reachable at
 * `/src/presentation/components/ShareButton/__harness__/harness.html` under
 * `yarn dev`. Nothing imports it and it is not referenced from `index.html`, so
 * Vite never includes it in a production build.
 *
 * It exists because the things that go wrong here cannot be unit-tested: a
 * clipboard write that is refused because the gesture was lost, a share sheet
 * that never opens, a permission prompt, a card that fails to rasterise. The
 * only honest check is to press the button and look.
 *
 * The cards are throwaway sketches — the real templates are G2. Each case is
 * deliberately chosen to exercise a different path through the flow, including
 * the two failure paths, because "it worked once" is not the interesting claim.
 */

/* eslint-disable react-refresh/only-export-components --
   A dev entry point, not a module: it mounts itself and exports nothing by
   design, so there is no fast-refresh boundary to preserve. */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import "@/index.css";
import type { ShareCard } from "../../ShareCard";
import { ShareButton } from "../ShareButton";
import { chooseSharePath, readShareEnvironment } from "../shareCapabilities";

/**
 * A card built through a dynamic import, the way a page should.
 *
 * Importing the renderer here too would load the `share` chunk with the page
 * and hide the very thing worth checking — that nothing rasterising arrives
 * until a button is pressed. Watch the network panel on first click.
 */
const sketchCard = async (headline: string, detail: string): Promise<ShareCard> => {
  const { CARD_HEIGHT, CARD_PADDING, CARD_TOKENS, CARD_WIDTH, rect, text } =
    await import("../../ShareCard");

  return {
    title: headline,
    content: [
      rect({ x: 0, y: 0, width: CARD_WIDTH, height: 12, fill: CARD_TOKENS.win }),
      text(headline, {
        x: CARD_PADDING,
        y: 300,
        size: 78,
        weight: 800,
        fill: CARD_TOKENS.ink,
      }),
      text(detail, {
        x: CARD_PADDING,
        y: 380,
        size: 36,
        weight: 600,
        fill: CARD_TOKENS.inkMuted,
      }),
      text("THE CHUMBO", {
        x: CARD_PADDING,
        y: CARD_HEIGHT - 48,
        size: 28,
        weight: 800,
        tracking: 2,
        fill: CARD_TOKENS.inkFaint,
      }),
    ].join(""),
  };
};

/** Malformed markup: the `<img>` decode fails and G1 throws `svg-load`. */
const brokenCard = (): ShareCard => ({
  title: "Deliberately broken card",
  content: "<text x='20' y='20'>never closed",
});

/** A template that throws. Nothing to do with the renderer; must still report. */
const explodingCard = (): ShareCard => {
  throw new Error("template exploded");
};

/**
 * Pretend to be a phone.
 *
 * The G4 path cannot be exercised on a desktop otherwise: `navigator.share`
 * either does not exist or opens a real OS dialog, and the two things worth
 * checking — that the card becomes a `File` the sheet accepts, and that
 * *cancelling* the sheet is not reported as a failure — both need a share that
 * we control. Installed before the first render, because the flow reads its
 * capabilities once on mount.
 *
 *   ?fake-share         → a sheet that accepts the file
 *   ?fake-share=abort   → a sheet the user closes (rejects with AbortError)
 *   ?fake-share=refuse  → canShare says no to the real card, forcing a fallback
 *
 * Pair it with the device toolbar (or a narrow window) so `pointer: coarse`
 * matches too, which is what actually selects the share sheet over the
 * clipboard.
 */
const installFakeShareSheet = () => {
  const mode = new URLSearchParams(location.search).get("fake-share");
  if (mode === null && !location.search.includes("fake-share")) return null;

  const shared: { files: string[] }[] = [];
  const nav = navigator as Navigator & {
    share?: (data?: ShareData) => Promise<void>;
    canShare?: (data?: ShareData) => boolean;
  };

  nav.canShare = (data) => {
    if (!data?.files?.length) return false;
    // `refuse` accepts the one-byte probe and rejects the real card, which is
    // the mismatch the second canShare check in the hook exists for.
    return mode === "refuse" ? data.files[0].size < 100 : true;
  };
  nav.share = async (data) => {
    if (mode === "abort") {
      throw new DOMException("Share canceled", "AbortError");
    }
    shared.push({
      files: (data?.files ?? []).map((f) => `${f.name} ${f.type} ${f.size}B`),
    });
    (window as unknown as { __shared: unknown }).__shared = shared;
  };
  return mode ?? "accept";
};

/**
 * Take the clipboard away, so the last-resort download path can be pressed.
 *
 *   ?no-clipboard
 *
 * There is no other way to reach it on a modern desktop, and a fallback nobody
 * has ever run is a fallback that does not work.
 */
const disableClipboard = () => {
  if (!location.search.includes("no-clipboard")) return false;
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
  return true;
};

const fakeShare = installFakeShareSheet();
const clipboardDisabled = disableClipboard();

const Case = ({
  name,
  note,
  children,
}: {
  name: string;
  note: string;
  children: React.ReactNode;
}) => (
  <section className="mb-6 rounded-card border border-line bg-surface p-4 shadow-card">
    <h2 className="mb-1 text-sm font-semibold text-ink">{name}</h2>
    <p className="mb-3 max-w-[70ch] text-xs text-ink-muted">{note}</p>
    {children}
  </section>
);

/**
 * Read the clipboard back and say what is on it.
 *
 * Separate from the share button on purpose: reading needs its own permission,
 * which may be denied, and a denial here says nothing about whether the write
 * worked. It is the only way to confirm from inside the page that a real PNG
 * landed, so it is worth having — with its failure reported rather than hidden.
 */
const ClipboardReadBack = () => {
  const inspect = async (event: React.MouseEvent<HTMLButtonElement>) => {
    const out = event.currentTarget.nextElementSibling as HTMLElement;
    try {
      const items = await navigator.clipboard.read();
      const lines: string[] = [];
      for (const item of items) {
        for (const type of item.types) {
          const blob = await item.getType(type);
          lines.push(`${type} — ${(blob.size / 1024).toFixed(1)} kB`);
          if (type.startsWith("image/")) {
            const img = new Image();
            img.src = URL.createObjectURL(blob);
            img.style.width = "240px";
            img.style.display = "block";
            img.style.marginTop = "8px";
            img.style.border = "1px solid #dce0e9";
            out.appendChild(img);
          }
        }
      }
      out.prepend(
        document.createTextNode(lines.join(" · ") || "clipboard is empty")
      );
    } catch (error) {
      out.textContent = `read failed: ${String(error)}`;
    }
  };

  return (
    <div>
      <button
        type="button"
        onClick={inspect}
        className="min-h-[2.25rem] rounded-card border border-line bg-surface px-3 text-sm font-semibold text-ink hover:bg-hover"
      >
        Read the clipboard back
      </button>
      <div className="mt-2 font-mono text-xs text-ink-muted" />
    </div>
  );
};

const Harness = () => {
  const capabilities = readShareEnvironment();
  const decision = chooseSharePath(capabilities);

  return (
    <div className="max-w-[80ch]">
      <Case
        name="Capabilities, as this browser reports them"
        note="The matrix the decision is made from. On a desktop this should choose the clipboard even where canShareFiles is true."
      >
        <pre className="overflow-x-auto rounded-card bg-surface-sunk p-3 font-mono text-xs text-ink">
          {JSON.stringify(
            { capabilities, decision, fakeShare, clipboardDisabled },
            null,
            2
          )}
        </pre>
        {fakeShare && (
          <p className="mt-2 text-xs text-result-loss">
            A fake share sheet is installed ({fakeShare}). Nothing here reflects
            what this browser can really do.
          </p>
        )}
      </Case>

      <Case
        name="The happy path"
        note="Builds the card on click through a dynamic import, so the share chunk is not downloaded until now. Then copies it, or opens the sheet on a phone."
      >
        <ShareButton
          card={() => sketchCard("147.6 — 96.1", "2025 · week 14 · the happy path")}
        />
      </Case>

      <Case
        name="Icon only"
        note="Same flow with the label as the accessible name only. Tab to it and press Enter."
      >
        <ShareButton
          iconOnly
          card={() => sketchCard("Icon only", "keyboard operable, 44px target")}
        />
      </Case>

      <Case
        name="Failure: malformed SVG (G1 throws svg-load)"
        note="The renderer cannot decode the card. The button must say so rather than go quiet."
      >
        <ShareButton card={brokenCard} />
      </Case>

      <Case
        name="Failure: the template itself throws"
        note="Nothing to do with the renderer — a card builder that blows up must still end in a message."
      >
        <ShareButton card={explodingCard} />
      </Case>

      <Case
        name="Verification"
        note="Reading the clipboard needs a separate permission. If it is refused, that says nothing about the write."
      >
        <ClipboardReadBack />
      </Case>
    </div>
  );
};

// Cached across hot reloads: `createRoot` on a container that already has one
// warns, and the warning is confusing in a file whose whole job is to make real
// failures visible.
const container = document.getElementById("root") as HTMLElement;
const store = window as unknown as { __root?: ReturnType<typeof createRoot> };
store.__root ??= createRoot(container);
store.__root.render(
  <StrictMode>
    <Harness />
  </StrictMode>
);
