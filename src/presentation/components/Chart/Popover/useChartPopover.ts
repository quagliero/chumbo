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
  /** Props for the same datum's invisible near-miss target. See `HitProps`. */
  hit: (key: string, datum: T, x: number, y: number) => HitProps;
}

/**
 * A near-miss target: pointer handlers only, no role, no tab stop.
 *
 * A 10px dot is too small to tap. The sparse charts draw one of these, larger
 * and transparent, in a layer UNDER every visible dot — so a direct hit on a
 * dot always reaches that dot, and the halo only catches the taps that land
 * beside it. It is invisible to a screen reader and the keyboard, which reach
 * the same datum through the dot's own `mark`.
 */
export interface HitProps {
  "aria-hidden": true;
  "data-chart-mark": "";
  fill: "transparent";
  pointerEvents: "all";
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  onClick: (event: { currentTarget: Element }) => void;
  style: { cursor: "pointer" };
}

/** Radius of that halo. 12 makes a 24px target, the WCAG 2.2 minimum. */
export const HIT_RADIUS = 12;

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

  const hit = useCallback(
    (key: string, datum: T, x: number, y: number): HitProps => {
      const item: PopoverItem<T> = { key, datum, x, y };
      return {
        "aria-hidden": true,
        "data-chart-mark": "",
        fill: "transparent",
        pointerEvents: "all",
        onMouseEnter: () => store.preview(item),
        onMouseLeave: () => store.leave(key),
        onClick: (event) => store.toggle(item, event.currentTarget),
        style: { cursor: "pointer" },
      };
    },
    [store]
  );

  return { store, mark, hit };
};
