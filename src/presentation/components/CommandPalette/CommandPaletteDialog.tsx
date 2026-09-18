import {
  KeyboardEvent as ReactKeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { useRandomMatchup } from "@/presentation/components/RandomMatchup/useRandomMatchup";
import { YEAR_NUMBERS } from "@/domain/constants";
import { useDataLoaded } from "@/hooks/useSeasonData";
import { CommandItem, CommandKind, searchCommands } from "./commands";
import { fuzzyPositions, normalize, tokenize } from "./fuzzy";

/**
 * The palette itself (E3). Lazily loaded — the shell holds the key listener
 * and nothing else, because this pulls in the player dictionary index and the
 * site's payload budget is enforced by the build.
 */

const KIND_LABEL: Record<CommandKind, string> = {
  action: "Action",
  page: "Page",
  manager: "Manager",
  season: "Season",
  week: "Week",
  h2h: "H2H",
  player: "Player",
};

const OPTION_ID = (index: number) => `chumbo-command-option-${index}`;
const LISTBOX_ID = "chumbo-command-listbox";

/**
 * Split `text` into matched and unmatched runs, for highlighting.
 *
 * Positions come from the normalized string, so they only line up when
 * normalizing left the length alone — stripping a diacritic does not. When it
 * does not, the row simply renders unhighlighted rather than marking the wrong
 * letters.
 */
const highlight = (text: string, query: string) => {
  const normalized = normalize(text);
  if (normalized.length !== text.length) return [{ text, match: false }];

  const marked = new Set<number>();
  for (const token of tokenize(query)) {
    for (const position of fuzzyPositions(token, normalized)) marked.add(position);
  }
  if (marked.size === 0) return [{ text, match: false }];

  const runs: { text: string; match: boolean }[] = [];
  let start = 0;
  for (let i = 1; i <= text.length; i++) {
    const changed = i === text.length || marked.has(i) !== marked.has(start);
    if (changed) {
      runs.push({ text: text.slice(start, i), match: marked.has(start) });
      start = i;
    }
  }
  return runs;
};

/** Every tabbable thing inside the dialog, for the focus trap. */
const focusable = (root: HTMLElement | null): HTMLElement[] =>
  root
    ? Array.from(
        root.querySelectorAll<HTMLElement>(
          'input, button:not([disabled]), [href], [tabindex]:not([tabindex="-1"])'
        )
      ).filter((element) => element.offsetParent !== null)
    : [];

interface CommandPaletteDialogProps {
  onClose: () => void;
}

const CommandPaletteDialog = ({ onClose }: CommandPaletteDialogProps) => {
  // The index is every season's week count (from each league file, part of
  // its core) and every player, built on the first search. Neither is in the
  // bundle since A2b, so fetch both at once, now, rather than let the index
  // discover them one after the other.
  useDataLoaded({ years: YEAR_NUMBERS, parts: ["core"], players: true });
  const navigate = useNavigate();
  const { roll } = useRandomMatchup();
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Whatever had focus when the palette opened, so it can have it back.
  const returnFocusTo = useRef<HTMLElement | null>(null);

  const results = useMemo(() => searchCommands(query), [query]);

  // A new query means a new list; the caret belongs at the top of it.
  useEffect(() => setActive(0), [query]);

  useLayoutEffect(() => {
    returnFocusTo.current = document.activeElement as HTMLElement | null;
    inputRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = overflow;
      // Guard against the element having gone away while the palette was open.
      if (returnFocusTo.current?.isConnected) returnFocusTo.current.focus();
    };
  }, []);

  // Keep the caret in view without scrolling the page behind the dialog.
  useEffect(() => {
    listRef.current
      ?.querySelector(`#${OPTION_ID(active)}`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const choose = (item: CommandItem) => {
    onClose();
    if (item.action === "random-matchup") {
      void roll();
      return;
    }
    if (item.to) navigate(item.to);
  };

  const onKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    switch (event.key) {
      case "Escape":
        event.preventDefault();
        // Stop here: Escape inside the palette is the palette's, and nothing
        // behind it should also react.
        event.stopPropagation();
        onClose();
        return;
      case "ArrowDown":
        event.preventDefault();
        if (results.length) setActive((index) => (index + 1) % results.length);
        return;
      case "ArrowUp":
        event.preventDefault();
        if (results.length) {
          setActive((index) => (index - 1 + results.length) % results.length);
        }
        return;
      case "Home":
        if (results.length) {
          event.preventDefault();
          setActive(0);
        }
        return;
      case "End":
        if (results.length) {
          event.preventDefault();
          setActive(results.length - 1);
        }
        return;
      case "Enter": {
        const result = results[active];
        if (result) {
          event.preventDefault();
          choose(result.item);
        }
        return;
      }
      case "Tab": {
        // A real trap: while a modal is open, Tab must not walk into the page
        // behind it. Two stops in here, so this is mostly a wrap.
        const stops = focusable(panelRef.current);
        if (stops.length < 2) {
          event.preventDefault();
          return;
        }
        const first = stops[0];
        const last = stops[stops.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
        return;
      }
      default:
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-ink/40 px-2 pt-4 sm:px-4 sm:pt-[12vh]"
      // The backdrop closes, but only when the backdrop itself is clicked.
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      onKeyDown={onKeyDown}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Search the Chumbo"
        className="flex max-h-[85vh] w-full max-w-xl flex-col overflow-hidden rounded-card bg-surface shadow-card"
      >
        <div className="flex items-center gap-2 border-b border-line px-3 py-2">
          <svg
            viewBox="0 0 24 24"
            className="h-5 w-5 flex-none text-ink-faint"
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

          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            role="combobox"
            aria-expanded="true"
            aria-controls={LISTBOX_ID}
            aria-autocomplete="list"
            aria-label="Search managers, players, seasons and weeks"
            aria-activedescendant={
              results.length ? OPTION_ID(active) : undefined
            }
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            placeholder="Managers, players, seasons, weeks…"
            className="min-w-0 flex-1 bg-transparent py-1.5 text-base text-ink outline-none placeholder:text-ink-faint"
          />

          <button
            type="button"
            onClick={onClose}
            aria-label="Close search"
            className="flex-none rounded px-2 py-1 text-xs font-medium text-ink-muted hover:bg-hover hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-series-1"
          >
            Esc
          </button>
        </div>

        <ul
          ref={listRef}
          id={LISTBOX_ID}
          role="listbox"
          aria-label="Search results"
          className="min-h-0 flex-1 overflow-y-auto py-1"
        >
          {results.map(({ item }, index) => (
            <li
              key={item.id}
              id={OPTION_ID(index)}
              role="option"
              aria-selected={index === active}
              onMouseMove={() => setActive(index)}
              onClick={() => choose(item)}
              className={`flex cursor-pointer items-center gap-3 px-3 py-2 ${
                index === active ? "bg-hover" : ""
              }`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">
                  {highlight(item.title, query).map((run, runIndex) => (
                    <span
                      key={runIndex}
                      className={run.match ? "font-semibold text-series-1" : ""}
                    >
                      {run.text}
                    </span>
                  ))}
                </span>
                {item.subtitle && (
                  <span className="block truncate text-xs text-ink-muted">
                    {item.subtitle}
                  </span>
                )}
              </span>
              <span className="flex-none rounded border border-line px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-ink-faint">
                {KIND_LABEL[item.kind]}
              </span>
            </li>
          ))}

          {results.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-ink-muted">
              Nothing matches “{query}”.
            </li>
          )}
        </ul>

        {/* Announced on every keystroke, on every viewport — the visible
            count below is hidden on a phone, where the footer does not fit. */}
        <div className="sr-only" aria-live="polite">
          {results.length} result{results.length === 1 ? "" : "s"}
        </div>

        <div className="hidden items-center justify-between border-t border-line px-3 py-1.5 text-[11px] text-ink-faint sm:flex">
          <span>↑↓ to move · ↵ to open · esc to close</span>
          <span aria-hidden="true">
            {results.length} result{results.length === 1 ? "" : "s"}
          </span>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default CommandPaletteDialog;
