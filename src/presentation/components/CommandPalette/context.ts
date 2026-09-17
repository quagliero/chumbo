import { createContext, useContext } from "react";

/**
 * The palette's context, kept out of the provider file so that file exports
 * components and nothing else — otherwise every edit to it drops React Fast
 * Refresh (the `react-refresh/only-export-components` rule).
 */

export interface CommandPaletteContextValue {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  /** Warm the dialog chunk — call on hover/focus of anything that opens it. */
  prefetch: () => void;
}

export const CommandPaletteContext =
  createContext<CommandPaletteContextValue | null>(null);

export const useCommandPalette = (): CommandPaletteContextValue => {
  const value = useContext(CommandPaletteContext);
  if (!value) {
    throw new Error("useCommandPalette used outside CommandPaletteProvider");
  }
  return value;
};

/** ⌘ on Apple hardware, Ctrl everywhere else. */
export const isAppleKeyboard = (): boolean =>
  typeof navigator !== "undefined" &&
  /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
