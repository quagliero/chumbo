import { getSeasonCrowns } from "@/utils/crowns";

/**
 * The word on a manager-season card, top right where a rosette would go (I4).
 *
 * Shared by the manager page's season cards and the prerendered link previews
 * (`scripts/og/routes.ts`), so a card copied off the page and the preview of
 * the same page cannot disagree about what a season was.
 *
 * In the order that matters, per the league's own taxonomy:
 *
 *   - **Triple Crown** — most wins, most points AND the title. Outranks the
 *     plain title, because it is a title and more.
 *   - **Champion**.
 *   - **Triple Scumbo** — worst all-play record, fewest wins AND fewest points.
 *   - **Scumbo** — the worst all-play record, which is what the Scumbo is
 *     awarded for. Not last place: the two disagree in five of fourteen
 *     seasons (`seasonBreakdown.ts`).
 *
 * The OG script used to say "Scumbo" only for all three legs, which made the
 * actual Scumbo — worst breakdown — invisible on a card unless it came with
 * the other two.
 *
 * `crowns.ts` returns booleans and leg counts on purpose; the words are copy,
 * written once here. Returns nothing for an unsettled season: nothing
 * provisional earns a rosette.
 */
export const seasonBadge = (
  year: number,
  managerId: string
): string | undefined => {
  const crown = getSeasonCrowns(year).find((c) => c.managerId === managerId);
  if (!crown || crown.provisional) return undefined;
  if (crown.crownLegs === 3) return "Triple Crown";
  if (crown.champion) return "Champion";
  if (crown.scumboLegs === 3) return "Triple Scumbo";
  if (crown.worstAllPlay) return "Scumbo";
  return undefined;
};
