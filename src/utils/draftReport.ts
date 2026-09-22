/**
 * Who drafts well, how, and whether it matters (the Draft explorer).
 *
 * Built on the D6 pick values (`utils/draftValue.ts`): every pick is what its
 * player's season was worth against the last starter at his position, minus
 * what that pick number usually returns on the same scale. A DRAFT is one
 * manager's picks in one season, and its value is the sum.
 *
 * Then the question the league actually argues about: does a good draft win?
 * Each settled season's drafts are ranked, and set against how that season
 * finished (the brackets, `finalStandings.ts`). The answer is printed with its
 * sample size, because fourteen seasons of twelve teams is 170-odd drafts and
 * a strategy five managers tried is five drafts, which is an anecdote.
 *
 * Pure: the page gives it picks and a way to look up a finish.
 */

export interface ReportPick {
  year: number;
  round: number;
  pickNo: number;
  rosterId: number;
  managerId: string;
  position: string;
  name: string;
  /** Points above (or below) the going rate for this pick number. */
  value: number;
  /** True where the season's bench scores are incomplete (2019). */
  approximate: boolean;
}

export interface Finish {
  /** 1 = champion. */
  position: number;
  /** Teams in the league that season. */
  of: number;
  /** How many of them made the playoffs. */
  playoffTeams: number;
}

export interface Draft {
  year: number;
  managerId: string;
  rosterId: number;
  /** Sum of the picks' values. */
  value: number;
  picks: number;
  /** Picks that beat the going rate for their slot. */
  hits: number;
  best: ReportPick;
  worst: ReportPick;
  /** This draft's place among the season's drafts, 1 = best. */
  rank: number;
  /** How many drafts that season. */
  of: number;
  /** How the season ended, once it has. */
  finish: Finish | null;
  approximate: boolean;
}

/** A tally of how a group of drafts' seasons ended. */
export interface Outcome {
  drafts: number;
  /** Of those, how many have a finish (settled seasons). */
  finished: number;
  averageFinish: number | null;
  playoffs: number;
  titles: number;
  averageValue: number;
}

const round1 = (value: number) => Math.round(value * 10) / 10;

export const buildDrafts = (
  picks: readonly ReportPick[],
  finishOf: (year: number, rosterId: number) => Finish | null
): Draft[] => {
  const byDraft = new Map<string, ReportPick[]>();
  for (const pick of picks) {
    const key = `${pick.year}|${pick.managerId}`;
    const list = byDraft.get(key);
    if (list) list.push(pick);
    else byDraft.set(key, [pick]);
  }

  const drafts: Omit<Draft, "rank" | "of">[] = [...byDraft.values()].map((own) => {
    const sorted = [...own].sort((a, b) => b.value - a.value);
    const { year, managerId, rosterId } = own[0];
    return {
      year,
      managerId,
      rosterId,
      value: round1(own.reduce((sum, pick) => sum + pick.value, 0)),
      picks: own.length,
      hits: own.filter((pick) => pick.value > 0).length,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
      finish: finishOf(year, rosterId),
      approximate: own.some((pick) => pick.approximate),
    };
  });

  // Ranked within each season: a draft is good or bad against the others
  // drafting from the same pool, not against 2013's.
  const bySeason = new Map<number, typeof drafts>();
  for (const draft of drafts) {
    const list = bySeason.get(draft.year) ?? [];
    list.push(draft);
    bySeason.set(draft.year, list);
  }
  return [...bySeason.values()].flatMap((season) =>
    [...season]
      .sort((a, b) => b.value - a.value)
      .map((draft, index) => ({ ...draft, rank: index + 1, of: season.length }))
  );
};

export const outcomeOf = (drafts: readonly Draft[]): Outcome => {
  const finished = drafts.filter((draft) => draft.finish);
  const finishes = finished.map((draft) => draft.finish!);
  return {
    drafts: drafts.length,
    finished: finished.length,
    averageFinish: finishes.length
      ? round1(finishes.reduce((sum, f) => sum + f.position, 0) / finishes.length)
      : null,
    playoffs: finishes.filter((f) => f.position <= f.playoffTeams).length,
    titles: finishes.filter((f) => f.position === 1).length,
    averageValue: drafts.length
      ? round1(drafts.reduce((sum, draft) => sum + draft.value, 0) / drafts.length)
      : 0,
  };
};

/* ------------------------------------------------------------------ drafters */

export interface Drafter {
  managerId: string;
  drafts: number;
  /** Mean of their drafts' values. */
  averageValue: number;
  /**
   * The same, shrunk toward the league (zero) by how little a handful of
   * drafts says — see `drafterShrinkage`. The number to rank drafters on.
   */
  rating: number;
  /**
   * Half-width of a 95% range for their true average: how far the average
   * could be from what their drafting is really worth, given how much drafts
   * swing from year to year.
   */
  margin: number;
  /** Mean of their drafts' ranks, as a share of the field (0 best, 1 worst). */
  averagePlace: number;
  /** Share of all their picks that beat the going rate. */
  hitRate: number;
  best: Draft;
  worst: Draft;
  outcome: Outcome;
}

/**
 * How many drafts' worth of "average" to add to a manager before trusting
 * their average: empirical Bayes, from the league's own drafts.
 *
 * Draft value swings a lot from year to year for the same manager (injuries,
 * breakouts nobody saw coming), and differs only somewhat between managers.
 * The ratio of the two — within-manager variance over the variance of their
 * true averages — is how many ordinary drafts a manager's own are worth. With
 * that, one great draft from a manager who only played one season cannot top
 * the table over someone who has drafted well for fourteen.
 */
export interface DrafterSpread {
  /** How many league-average drafts a manager's record is blended with. */
  k: number;
  /** Year-to-year variance of one manager's drafts. */
  within: number;
  /** The standard deviation of managers' averages, as observed. */
  spreadSd: number;
  /** What that would be if every manager were the same drafter. */
  noiseSd: number;
}

export const drafterShrinkage = (byManager: readonly (readonly number[])[]): number =>
  drafterSpread(byManager).k;

/**
 * The same measurement, kept whole: the page reports it as well as uses it.
 * When `spreadSd` is no bigger than `noiseSd`, the managers' averages differ
 * by no more than luck would make them — which is itself the finding.
 */
export const drafterSpread = (byManager: readonly (readonly number[])[]): DrafterSpread => {
  const means = byManager.map((values) => values.reduce((a, b) => a + b, 0) / values.length);
  let within = 0;
  let dof = 0;
  byManager.forEach((values, i) => {
    for (const value of values) within += (value - means[i]) ** 2;
    dof += values.length - 1;
  });
  const withinVar = dof > 0 ? within / dof : 0;
  const grand = means.reduce((a, b) => a + b, 0) / (means.length || 1);
  const spread =
    means.reduce((sum, mean) => sum + (mean - grand) ** 2, 0) / Math.max(1, means.length - 1);
  // The spread of observed averages includes their own noise; take it out.
  const noise =
    byManager.reduce((sum, values) => sum + withinVar / values.length, 0) /
    (byManager.length || 1);
  const between = spread - noise;
  return {
    // No real difference between managers at all: everyone is the league.
    k: between > 0 ? withinVar / between : Number.POSITIVE_INFINITY,
    within: withinVar,
    spreadSd: Math.sqrt(spread),
    noiseSd: Math.sqrt(noise),
  };
};

export const buildDrafters = (drafts: readonly Draft[]): Drafter[] => {
  const byManager = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const list = byManager.get(draft.managerId) ?? [];
    list.push(draft);
    byManager.set(draft.managerId, list);
  }
  const { k, within } = drafterSpread([...byManager.values()].map((own) => own.map((d) => d.value)));
  return [...byManager].map(([managerId, own]) => {
    const sorted = [...own].sort((a, b) => b.value - a.value);
    const picks = own.reduce((sum, draft) => sum + draft.picks, 0);
    const mean = own.reduce((sum, d) => sum + d.value, 0) / own.length;
    return {
      managerId,
      drafts: own.length,
      averageValue: round1(mean),
      rating: Number.isFinite(k) ? round1((mean * own.length) / (own.length + k)) : 0,
      margin: round1(1.96 * Math.sqrt(within / own.length)),
      averagePlace:
        own.reduce((sum, d) => sum + (d.of > 1 ? (d.rank - 1) / (d.of - 1) : 0), 0) /
        own.length,
      hitRate: picks ? own.reduce((sum, d) => sum + d.hits, 0) / picks : 0,
      best: sorted[0],
      worst: sorted[sorted.length - 1],
      outcome: outcomeOf(own),
    };
  });
};

/* ------------------------------------------------------- does it win? */

export interface DraftTier {
  label: string;
  outcome: Outcome;
}

/**
 * How the season ended, by where the draft ranked that year. Only settled
 * seasons: a draft whose season is still being played has no ending to set
 * it against.
 */
export const tiersOf = (drafts: readonly Draft[]): DraftTier[] => {
  const settled = drafts.filter((draft) => draft.finish);
  const third = (draft: Draft) => (draft.rank - 1) / Math.max(1, draft.of - 1);
  return [
    { label: "The season's best draft", outcome: outcomeOf(settled.filter((d) => d.rank === 1)) },
    { label: "Top third", outcome: outcomeOf(settled.filter((d) => third(d) < 1 / 3)) },
    { label: "Middle third", outcome: outcomeOf(settled.filter((d) => third(d) >= 1 / 3 && third(d) <= 2 / 3)) },
    { label: "Bottom third", outcome: outcomeOf(settled.filter((d) => third(d) > 2 / 3)) },
    { label: "The season's worst draft", outcome: outcomeOf(settled.filter((d) => d.rank === d.of)) },
  ];
};

/**
 * How closely draft rank and finishing position go together, season by
 * season, averaged: Spearman's rank correlation. 1 would be "the best draft
 * always wins"; 0, "the draft tells you nothing".
 */
export const draftFinishCorrelation = (drafts: readonly Draft[]): number | null => {
  const bySeason = new Map<number, Draft[]>();
  for (const draft of drafts) {
    if (!draft.finish) continue;
    const list = bySeason.get(draft.year) ?? [];
    list.push(draft);
    bySeason.set(draft.year, list);
  }
  const rhos: number[] = [];
  for (const season of bySeason.values()) {
    const n = season.length;
    if (n < 3) continue;
    const d2 = season.reduce((sum, d) => sum + (d.rank - d.finish!.position) ** 2, 0);
    rhos.push(1 - (6 * d2) / (n * (n * n - 1)));
  }
  return rhos.length ? rhos.reduce((a, b) => a + b, 0) / rhos.length : null;
};

/* ------------------------------------------------------------ strategies */

export interface Strategy {
  label: string;
  /** What it means, in the draft's own terms. */
  rule: string;
  drafts: Draft[];
  outcome: Outcome;
  /**
   * Its playoff rate after adding `PRIOR_DRAFTS` ordinary drafts at the
   * league's rate — what the record suggests once a small sample is not
   * allowed to speak louder than it can. Null before any season has ended.
   */
  playoffChance: number | null;
}

/**
 * How many league-average drafts each strategy's record is blended with. Ten
 * means a strategy tried ten times is judged half on its own results and half
 * on the league's; tried forty times, mostly on its own.
 */
export const PRIOR_DRAFTS = 10;

/** A rate, pulled toward the league's by `PRIOR_DRAFTS` of its drafts. */
const shrinkRate = (hits: number, trials: number, leagueRate: number) =>
  (hits + PRIOR_DRAFTS * leagueRate) / (trials + PRIOR_DRAFTS);

/** The early rounds, where a strategy is a strategy. */
const EARLY = 4;

const STRATEGIES: { label: string; rule: string; test: (early: string[]) => boolean }[] = [
  { label: "Zero RB", rule: "No running back in the first four rounds", test: (e) => !e.includes("RB") },
  { label: "RB-heavy", rule: "Three or more running backs in the first four", test: (e) => e.filter((p) => p === "RB").length >= 3 },
  { label: "WR-heavy", rule: "Three or more receivers in the first four", test: (e) => e.filter((p) => p === "WR").length >= 3 },
  { label: "Early QB", rule: "A quarterback in the first three rounds", test: (e) => e.slice(0, 3).includes("QB") },
  { label: "Early TE", rule: "A tight end in the first three rounds", test: (e) => e.slice(0, 3).includes("TE") },
];

/**
 * Drafts sorted by what their first rounds were spent on. Not exclusive — an
 * early quarterback and zero running backs is one draft in two rows — and
 * always beside "every draft", so a strategy is judged against the league
 * rather than against nothing.
 */
export const strategiesOf = (
  drafts: readonly Draft[],
  picks: readonly ReportPick[]
): Strategy[] => {
  const early = new Map<string, string[]>();
  for (const pick of [...picks].sort((a, b) => a.pickNo - b.pickNo)) {
    if (pick.round > EARLY) continue;
    const key = `${pick.year}|${pick.managerId}`;
    const list = early.get(key) ?? [];
    list.push(pick.position);
    early.set(key, list);
  }
  const league = outcomeOf(drafts);
  const leagueRate = league.finished ? league.playoffs / league.finished : null;
  const chance = (outcome: Outcome) =>
    leagueRate === null ? null : shrinkRate(outcome.playoffs, outcome.finished, leagueRate);
  const all: Strategy = {
    label: "Every draft",
    rule: "For comparison",
    drafts: [...drafts],
    outcome: league,
    playoffChance: leagueRate,
  };
  return [
    all,
    ...STRATEGIES.map(({ label, rule, test }) => {
      const matching = drafts.filter((draft) =>
        test(early.get(`${draft.year}|${draft.managerId}`) ?? [])
      );
      const outcome = outcomeOf(matching);
      return { label, rule, drafts: matching, outcome, playoffChance: chance(outcome) };
    }),
  ];
};
