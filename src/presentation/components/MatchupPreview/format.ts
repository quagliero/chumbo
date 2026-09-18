import type { PreviewSide } from "@/utils/matchupPreview";

export const recordOf = (side: PreviewSide) =>
  side.ties
    ? `${side.wins}–${side.losses}–${side.ties}`
    : `${side.wins}–${side.losses}`;

/** "jay leads 12–6 all time", or level, or a first meeting. */
export const seriesText = (
  a: PreviewSide,
  b: PreviewSide,
  h2h: { wins: number; losses: number; ties: number }
): string => {
  const { wins, losses, ties } = h2h;
  if (wins + losses + ties === 0) return "First regular-season meeting";
  const tail = ties ? `–${ties}` : "";
  if (wins === losses) return `Level at ${wins}–${losses}${tail} all time`;
  return wins > losses
    ? `${a.name} leads ${wins}–${losses}${tail} all time`
    : `${b.name} leads ${losses}–${wins}${tail} all time`;
};
