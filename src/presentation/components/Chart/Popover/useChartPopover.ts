import { useCallback, useState, type KeyboardEvent } from "react";
import {
  createPopoverStore,
  type PopoverItem,
  type PopoverStore,
} from "./popoverStore";

/** The marks' half of the I2 popover. See `ChartPopover.tsx`. */

export interface ChartPopoverHandle<T> {
  store: PopoverStore<T>;
  /**
   * Props for a mark: pointer, focus and keyboard handlers, plus the ARIA that
   * makes it a button. `label` is what a screen reader hears on the mark
   * itself — the one-line summary the old `<title>` held.
   */
  mark: (
    key: string,
    datum: T,
    x: number,
    y: number,
    label: string
  ) => MarkProps;
}

export interface MarkProps {
  role: "button";
  tabIndex: 0;
  "aria-label": string;
  "aria-haspopup": "dialog";
  "data-chart-mark": "";
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onFocus: () => void;
  onBlur: () => void;
  onClick: (event: { currentTarget: Element }) => void;
  onKeyDown: (event: KeyboardEvent<Element>) => void;
  style: { cursor: "pointer"; outline: "none" };
}

export const useChartPopover = <T>(): ChartPopoverHandle<T> => {
  const [store] = useState(() => createPopoverStore<T>());

  // Stable across renders, so memoised marks never re-render for a hover.
  const mark = useCallback(
    (key: string, datum: T, x: number, y: number, label: string): MarkProps => {
      const item: PopoverItem<T> = { key, datum, x, y };
      return {
        role: "button",
        tabIndex: 0,
        "aria-label": label,
        "aria-haspopup": "dialog",
        "data-chart-mark": "",
        onMouseEnter: () => store.preview(item),
        onMouseLeave: () => store.leave(key),
        onFocus: () => store.preview(item),
        onBlur: () => store.leave(key),
        onClick: (event) => store.toggle(item, event.currentTarget),
        onKeyDown: (event) => {
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault();
            store.toggle(item, event.currentTarget);
          }
        },
        style: { cursor: "pointer", outline: "none" },
      };
    },
    [store]
  );

  return { store, mark };
};
