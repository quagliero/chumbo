/**
 * The state behind a chart popover (I2), kept out of React on purpose.
 *
 * The draft scatter has 2,460 marks. If "which mark is the pointer over" were
 * React state in the chart, every mouseover would re-render every one of them.
 * So the marks write to this store through handlers that never change, and
 * only the popover — one small component — subscribes to it.
 *
 * Two states, one rule:
 *
 *   - a **preview** follows the pointer (or keyboard focus) and vanishes when
 *     it leaves. It is look-don't-touch: it takes no pointer events, so it can
 *     never sit between the cursor and the next dot and make the chart flicker.
 *   - a **pin** is a click (or a tap, or Enter). It stays until dismissed, it
 *     takes pointer events, and it is where the links live — so leaving a page
 *     is a deliberate second click rather than an accident of the first.
 *
 * While something is pinned, hovering other marks does nothing. A preview
 * replacing a pinned card under the reader's hand is the flicker again.
 */

export interface PopoverItem<T> {
  /** Stable identity of the mark, e.g. "2018-4". */
  key: string;
  datum: T;
  /** Anchor, in the chart's drawing frame (margins not yet added). */
  x: number;
  y: number;
}

export interface PopoverState<T> {
  item: PopoverItem<T> | null;
  pinned: boolean;
  /** The mark that opened a pin, so Escape can hand focus back to it. */
  opener: Element | null;
}

const EMPTY: PopoverState<never> = { item: null, pinned: false, opener: null };

export interface PopoverStore<T> {
  get: () => PopoverState<T>;
  subscribe: (listener: () => void) => () => void;
  /** Pointer or focus arrived on a mark. Ignored while something is pinned. */
  preview: (item: PopoverItem<T>) => void;
  /** Pointer or focus left a mark. Only ever clears a preview, never a pin. */
  leave: (key: string) => void;
  /** A click, tap or Enter on a mark: pin it, or unpin it if it is the pin. */
  toggle: (item: PopoverItem<T>, opener?: Element | null) => void;
  dismiss: () => void;
}

export const createPopoverStore = <T>(): PopoverStore<T> => {
  let state: PopoverState<T> = EMPTY;
  const listeners = new Set<() => void>();

  const set = (next: PopoverState<T>) => {
    if (
      next.item?.key === state.item?.key &&
      next.pinned === state.pinned &&
      next.item?.datum === state.item?.datum
    ) {
      return;
    }
    state = next;
    listeners.forEach((listener) => listener());
  };

  return {
    get: () => state,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    preview: (item) => {
      if (state.pinned) return;
      set({ item, pinned: false, opener: null });
    },
    leave: (key) => {
      if (state.pinned || state.item?.key !== key) return;
      set(EMPTY);
    },
    toggle: (item, opener = null) => {
      if (state.pinned && state.item?.key === item.key) set(EMPTY);
      else set({ item, pinned: true, opener });
    },
    dismiss: () => set(EMPTY),
  };
};
