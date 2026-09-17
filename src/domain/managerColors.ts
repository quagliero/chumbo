import managers from "@/data/managers.json";

/**
 * Manager accent colours — and the rule about when colour can and cannot carry
 * identity (F2).
 *
 * BUILD_PLAN asked for "an identity colour per manager, used everywhere: their
 * line in every chart, their cell in the H2H matrix, their accent on matchup
 * cards". The first half of that works. The second half does not, and it is
 * worth being precise about why before any chart is built on it.
 *
 * There are 17 managers, 12 of them active. A categorical palette tops out at
 * eight hues — past that, adjacent colours stop being separable, and the
 * data-viz validator is explicit that only the first THREE slots clear
 * all-pairs separation for forms like scatter and small multiples. Seventeen
 * distinguishable hues do not exist at accessible contrast. Generating more by
 * rotating hue produces colours that look distinct to the author and identical
 * to a reader with deuteranopia.
 *
 * So the two uses are separated:
 *
 *   ACCENT (this file) — a stable hue per manager, for places where ONE
 *   manager is on screen: their page header, their card's top rule, the ring
 *   on their avatar. Two managers sharing a hue is fine here, because the
 *   colour is decoration and the avatar plus name carries the identity.
 *
 *   SERIES (`series-1..8` in tailwind.config.js) — the validated categorical
 *   palette, assigned in fixed order, for charts with at most eight things in
 *   them.
 *
 * A chart showing all twelve active managers must NOT colour them twelve ways.
 * Use one of: highlight-one-and-dim-the-rest (the bump chart, the season arc),
 * small multiples (one panel per manager), or fold everyone outside the top
 * few into a single "Other". This is a real constraint on D1, D2 and D4, not a
 * stylistic preference.
 */

const ACCENTS = [
  "#2a78d6", // blue
  "#eb6834", // orange
  "#1baf7a", // aqua
  "#eda100", // yellow
  "#e87ba4", // magenta
  "#008300", // green
  "#4a3aa7", // violet
  "#e34948", // red
] as const;

/**
 * Assignment is by position in managers.json, which is stable — managers are
 * appended, never reordered — so a manager keeps their colour across deploys.
 * Deliberately NOT hashed from the id: a hash silently reassigns every colour
 * the day someone's id changes.
 */
const byManager: Record<string, string> = Object.fromEntries(
  managers.map((manager, index) => [
    manager.id,
    ACCENTS[index % ACCENTS.length],
  ])
);

/** This manager's accent hue. Falls back to the muted ink token. */
export const getManagerAccent = (managerId: string): string =>
  byManager[managerId] ?? "#69738a";

/**
 * The validated categorical palette, in its fixed order.
 *
 * Index into this for chart series; never generate a ninth colour. If a chart
 * needs more than eight series, the chart is wrong, not the palette.
 */
export const SERIES_COLORS = ACCENTS;

/** The most series a single chart may colour-code. See the note above. */
export const MAX_SERIES = 8;
