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
  // One LOSS, judged against every score that week — not a week. "The 10th-
  // unluckiest week" read as a bad week all round, under a single game. The
  // measure is spelled out by the qualifier below, since a clause here would
  // land the "in Chumbo history" tail in the wrong place.
  "beat-almost-everyone": "unluckiest loss",
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
  "biggest-comeback": "biggest comeback",
  // Not "latest-decided game": the sentence is about the play, and the play is
  // what the detail names.
  "latest-decisive-play": "latest decisive play",
  "monday-night-wins": "most games won on Monday night",
  // J3's foundations. "Most points, ever" is a column heading; in a sentence
  // it has to be a noun phrase, which is the whole reason this file exists.
  "most-points-season": "highest-scoring season",
  "career-points": "most points scored",
  "career-wins": "most wins",
};

/**
 * A scope the phrase itself cannot carry, appended in brackets.
 *
 * `rivalry-intensity` is the reason this exists. It averages the margin over
 * EVERY meeting, playoffs included (`oneSidePerGame(games)` — no
 * `isRegularSeason` filter), while the H2H page's record and the H2H card's
 * number are regular season only. "The closest rivalry in Chumbo history",
 * printed under "sol 14–6 fin", reads as a statement about that 14–6. It is
 * not, so it says so — the same qualifier E2's rail already uses on the same
 * stat, in the same words, because somebody will have both open.
 *
 * Bracketed and after "in Chumbo history" rather than folded into the phrase:
 * "The closest rivalry, playoffs included, in Chumbo history" puts the tail in
 * the wrong place, and an ordinal in front of it ("The 3rd-closest rivalry,
 * playoffs included, …") is worse.
 */
export const QUALIFIERS: Record<string, string> = {
  "rivalry-intensity": "playoffs included",
  // Unlucky by what? By how few of the week's other scores it lost to: a loss
  // with the week's second-best score was beaten by the only team that could.
  "beat-almost-everyone": "measured against every score that week",
};

/** "1st", "2nd", "23rd". */
export const ordinal = (n: number): string => {
  const rest = n % 100;
  if (rest >= 11 && rest <= 13) return `${n}th`;
  const last = n % 10;
  return `${n}${last === 1 ? "st" : last === 2 ? "nd" : last === 3 ? "rd" : "th"}`;
};
