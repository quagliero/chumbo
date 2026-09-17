/**
 * How each stat reads inside a sentence (E7).
 *
 * A note is built as "The Nth <phrase> in Chumbo history", so the phrase is a
 * noun, lower case, no article: "biggest margin of victory", not "Biggest
 * margin". The stat's own `label` is a column heading and reads badly in prose
 * ("The 3rd Biggest margin in Chumbo history"), which is why this exists rather
 * than reusing it.
 *
 * Kept here rather than added as a field to all 25 stats: the registry's job is
 * to compute, and a stat should not have to know it might be narrated. A stat
 * with no entry here falls back to its lower-cased label, which is clumsy but
 * never wrong — the sentence still carries the rank and the number.
 */
export const PHRASES: Record<string, string> = {
  "biggest-margin": "biggest margin of victory",
  "closest-margin": "narrowest win",
  "highest-scoring-loss": "highest-scoring loss",
  "lowest-scoring-win": "lowest-scoring win",
  // Kept to a bare noun phrase: anything with its own clause lands the
  // "in Chumbo history" tail in the wrong place ("...beaten almost everyone in
  // Chumbo history"). The evidence lives in the stat's own detail, not here.
  "beat-almost-everyone": "unluckiest week",
  "longest-win-streak": "longest winning streak",
  "longest-loss-streak": "longest losing streak",
  "rivalry-intensity": "closest rivalry",
  "revenge-games": "best record in rematches",
  "bench-points": "most points left on the bench",
  "bench-points-season": "most points benched in a season",
  "manager-efficiency": "best lineup efficiency",
  "worst-start-sit": "worst start/sit decision",
  "bench-bandit": "most points scored from a bench",
  "best-draft-picks": "best draft pick",
  "worst-draft-picks": "worst draft pick",
  "draft-position-luck": "luckiest draft slot",
  "most-drafted-players": "most-drafted player",
  "one-that-got-away": "one that got away",
  "trade-ledger": "most lopsided trade",
  "waiver-hit-rate": "best return per waiver claim",
  "roster-churn": "busiest season of roster moves",
  "on-this-day": "most notable week on this date",
  "manager-archetypes": "most distinctive manager profile",
  "championship-inevitability": "most inevitable championship",
};

/** "1st", "2nd", "23rd". */
export const ordinal = (n: number): string => {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
};
