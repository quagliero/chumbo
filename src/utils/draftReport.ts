/**
 * Who drafts well, how, and whether it matters (the Draft explorer).
 *
 * Built on the D6 pick values (`Chart/DraftScatter/draftValue.ts`): every pick
 * is what its player scored that season minus what that pick number has
 * returned on average. A DRAFT is one manager's picks in one season, and its
 * value is the sum — points above the going rate, for the whole draft.
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
  /** Mean of their drafts' ranks, as a share of the field (0 best, 1 worst). */
  averagePlace: number;
  /** Share of all their picks that beat the going rate. */
  hitRate: number;
  best: Draft;
  worst: Draft;
  outcome: Outcome;
}

export const buildDrafters = (drafts: readonly Draft[]): Drafter[] => {
  const byManager = new Map<string, Draft[]>();
  for (const draft of drafts) {
    const list = byManager.get(draft.managerId) ?? [];
    list.push(draft);
    byManager.set(draft.managerId, list);
  }
  return [...byManager].map(([managerId, own]) => {
    const sorted = [...own].sort((a, b) => b.value - a.value);
    const picks = own.reduce((sum, draft) => sum + draft.picks, 0);
    return {
      managerId,
      drafts: own.length,
      averageValue: round1(own.reduce((sum, d) => sum + d.value, 0) / own.length),
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
}

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
  const all: Strategy = {
    label: "Every draft",
    rule: "For comparison",
    drafts: [...drafts],
    outcome: outcomeOf(drafts),
  };
  return [
    all,
    ...STRATEGIES.map(({ label, rule, test }) => {
      const matching = drafts.filter((draft) =>
        test(early.get(`${draft.year}|${draft.managerId}`) ?? [])
      );
      return { label, rule, drafts: matching, outcome: outcomeOf(matching) };
    }),
  ];
};
