import {
  lazy,
  ReactNode,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { CommandPaletteContext } from "./context";

/**
 * The shell half of the command palette (E3).
 *
 * This is what every page pays for: a context, a `keydown` listener and a
 * boolean. The dialog — and with it the search index over ~4,400 players — is
 * a lazy chunk that is not fetched until the palette is first opened, or the
 * pointer lands on the header's search button.
 */

const CommandPaletteDialog = lazy(() => import("./CommandPaletteDialog"));

/** A very small stand-in while the dialog chunk arrives on a slow connection. */
const DialogFallback = () => (
  <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-2 pt-4 sm:px-4 sm:pt-[12vh]">
    <div className="h-14 w-full max-w-xl animate-pulse rounded-card bg-surface shadow-card" />
  </div>
);

export const CommandPaletteProvider = ({
  children,
}: {
  children: ReactNode;
}) => {
  const [isOpen, setIsOpen] = useState(false);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const prefetch = useCallback(() => {
    void import("./CommandPaletteDialog");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      // ⌘K / Ctrl+K only. Anything with Alt in it belongs to the browser, and
      // the key is compared case-insensitively because holding Shift is not
      // worth failing over.
      if (event.key.toLowerCase() !== "k") return;
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;

      event.preventDefault();
      setIsOpen((current) => !current);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const value = useMemo(
    () => ({ isOpen, open, close, prefetch }),
    [isOpen, open, close, prefetch]
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {isOpen && (
        <Suspense fallback={<DialogFallback />}>
          <CommandPaletteDialog onClose={close} />
        </Suspense>
      )}
    </CommandPaletteContext.Provider>
  );
};

export default CommandPaletteProvider;
