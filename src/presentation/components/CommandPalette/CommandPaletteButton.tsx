import { useState } from "react";
import { isAppleKeyboard, useCommandPalette } from "./context";

/**
 * The header's way into the palette, for people who do not know ⌘K exists —
 * which, on a phone, is everybody.
 */
export const CommandPaletteButton = () => {
  const { open, prefetch } = useCommandPalette();
  // Resolved once: the site is a client-rendered SPA, so `navigator` is there
  // on the first render and the hint never has to change after it.
  const [modifier] = useState(() => (isAppleKeyboard() ? "⌘" : "Ctrl "));

  return (
    <button
      type="button"
      onClick={open}
      onPointerEnter={prefetch}
      onFocus={prefetch}
      aria-label="Search managers, players, seasons and weeks"
      aria-keyshortcuts="Meta+K Control+K"
      title="Search (⌘K)"
      className="flex-none flex h-9 items-center gap-2 rounded-card px-2 text-ink-muted hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1 sm:border sm:border-line sm:pr-1.5"
    >
      <svg
        viewBox="0 0 24 24"
        className="h-5 w-5 flex-none"
        aria-hidden="true"
        focusable="false"
      >
        <circle
          cx="11"
          cy="11"
          r="6.5"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
        />
        <path
          d="M16 16l4.5 4.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
        />
      </svg>
      <span className="hidden text-sm sm:inline">Search</span>
      <kbd className="hidden rounded border border-line px-1 py-0.5 text-[10px] font-medium text-ink-faint sm:inline">
        {modifier}K
      </kbd>
    </button>
  );
};

export default CommandPaletteButton;
