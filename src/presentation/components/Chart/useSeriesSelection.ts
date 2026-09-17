import { useState } from "react";
import { MAX_SERIES, SERIES_COLORS } from "@/domain/managerColors";

/**
 * Choosing which series a multi-line chart highlights.
 *
 * Shared by the power ribbon (D2) and the season arc (D1), because both solve
 * the same three problems and getting any of them subtly different between two
 * charts on the same site would be worse than either answer.
 *
 * **Click pins, hover only previews.** They were one state to begin with, which
 * meant clicking a manager and then moving the mouse away undid the click — and
 * left a phone, which never hovers, with no way to choose at all. Hover is
 * ignored entirely once something is pinned, so sweeping across the legend
 * cannot wipe a selection.
 *
 * **Selection is a set.** Comparing two or three careers is the question these
 * charts are actually asked ("did rich ever finish above me?"), and one at a
 * time made you hold the other line in your head.
 *
 * **The cap depends on the chart's form.** `managerColors.ts` is explicit that
 * only the first THREE palette slots clear all-pairs separation for scatter and
 * small-multiple forms, while eight is fine for lines a reader traces one at a
 * time. Eight is the default because the charts using this are bump charts and
 * season arcs; a scatter must pass `max: 3` and get it wrong loudly rather than
 * inherit a limit that does not apply to it. Raised by D4.
 *
 * **Colour comes from the validated palette in selection order, not from each
 * manager's accent.** The accents collide by design — twelve active managers
 * into eight hues, so thd, karsten and ryan are all blue (see
 * `managerColors.ts`). That is harmless when one manager is on screen and the
 * name carries the identity, and it draws two indistinguishable blue lines the
 * moment two can be selected. Selecting beyond `MAX_SERIES` is refused rather
 * than wrapped, for the same reason the palette stops there: a ninth colour is
 * not separable from one already on screen.
 */
export const useSeriesSelection = ({
  max = MAX_SERIES,
}: { max?: number } = {}) => {
  if (max > MAX_SERIES) {
    // A ninth colour is not separable from one already on screen, so there is
    // no honest way to honour this.
    throw new Error(`useSeriesSelection: max ${max} exceeds the palette's ${MAX_SERIES}`);
  }
  const [pinned, setPinned] = useState<Set<string>>(() => new Set());
  const [hovered, setHovered] = useState<string | null>(null);

  const highlighted =
    pinned.size > 0 ? pinned : hovered ? new Set([hovered]) : new Set<string>();

  const toggle = (key: string) =>
    setPinned((current) => {
      const next = new Set(current);
      // Deselecting is always allowed; selecting stops at MAX_SERIES.
      if (next.delete(key)) return next;
      if (next.size >= max) return current;
      next.add(key);
      return next;
    });

  const order = [...highlighted];

  return {
    pinned,
    highlighted,
    anyHighlighted: highlighted.size > 0,
    isOn: (key: string) => highlighted.has(key),
    /** True for a key that cannot be added because the cap is reached. */
    isFull: (key: string) => !highlighted.has(key) && pinned.size >= max,
    colourOf: (key: string) => {
      const index = order.indexOf(key);
      return index === -1 ? "currentColor" : SERIES_COLORS[index % max];
    },
    toggle,
    clear: () => setPinned(new Set()),
    setHovered,
    max,
  };
};
