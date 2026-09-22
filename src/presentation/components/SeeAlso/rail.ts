/**
 * The shape of a "see also" rail (E2).
 *
 * E7 says *what was notable* about the thing you are looking at. This says
 * *where to go next* — and the two must never say the same thing twice on one
 * page, so a rail item that would restate a narrative note is dropped by the
 * builder rather than rendered next to it.
 *
 * Two rules the builders enforce, because a bad rail is worse than none:
 *
 *   1. **Every item is a link, and every link goes somewhere real.** An item is
 *      only built from data the page already holds, so "Week 12" is in the rail
 *      because a two-sided Week 12 game exists in the season's matchups, not
 *      because Week 12 is a plausible thing to write.
 *   2. **No padding.** A count is the real count or it is not shown. "Drafted
 *      once" is what a player drafted once gets; there is no "drafted by
 *      several managers" to hide behind.
 */

export interface RailItem {
  /** Stable key within a section. */
  id: string;
  /** An in-app route. Always a page that exists. */
  to: string;
  /** The clickable phrase. The whole row is the target. */
  label: string;
  /** The fact that earns the click. Plain text, never a second link. */
  detail?: string;
  /**
   * True when the fact rests on 2019's incomplete bench scores. Marked,
   * never hidden — a caveated fact presented flat is worse than no fact.
   */
  approximate?: boolean;
}

export interface RailSection {
  /** Shown above the items. Omitted for the leading section. */
  heading?: string;
  items: RailItem[];
}

/** Sections with nothing in them are not sections. */
export const compactSections = (sections: RailSection[]): RailSection[] =>
  sections.filter((section) => section.items.length > 0);

/**
 * A score, exactly as the rest of the site writes it: up to two decimals, with
 * no trailing zeros. "117.96", "114.6", "123.02".
 *
 * One decimal was the first version and it rounded a real 117.96 to "118.0" —
 * in a league where games are decided by hundredths, the rail would have been
 * quoting a score the week list one click later disagreed with.
 */
export const points = (value: number): string =>
  String(Math.round(value * 100) / 100);

/**
 * A team name, fit to sit in a sentence.
 *
 * Several team names in the data carry trailing whitespace — "Zaragozas
 * Zooting Zorro " — which nothing notices in a table cell and which reads as
 * "Zaragozas Zooting Zorro 's most-capped players" the moment it is put in
 * running text.
 */
export const clean = (name: string): string => name.trim();
