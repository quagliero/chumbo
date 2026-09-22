import type {
  KeyPlayDetail,
  TimelineFile,
} from "@/data/gamedays";

/**
 * How a matchup unfolded (L2), from a week's timeline file: both teams'
 * scores after every scoring moment, the key plays, the lead changes, and the
 * moment the winner went ahead for good.
 *
 * Pure: no data loading, no dictionary. Names are the caller's business, so
 * the same result can feed the chart, its popover and a sentence.
 */

export type Side = 0 | 1;

export interface FlowStep {
  /** Epoch seconds. */
  at: number;
  /** Both scores after this moment. */
  score: [number, number];
  side: Side;
  starterId: string;
  pts: number;
  /** Present when this is a key play: a touchdown, or more than 5 points. */
  key?: KeyPlayDetail;
  correction: boolean;
}

export interface GameFlow {
  steps: FlowStep[];
  keyPlays: FlowStep[];
  /** Moments the lead passed from one team to the other. */
  leadChanges: FlowStep[];
  /** When the eventual winner went ahead for good; absent for a tie. */
  decided?: FlowStep;
  final: [number, number];
  /** The largest deficit the winner came back from, in points. */
  comeback: number;
  /** The moment the winner was furthest behind. Absent for a tie, or a lead never lost. */
  comebackFrom?: FlowStep;
}

export const buildGameFlow = (
  file: TimelineFile,
  rosterIds: readonly [number, number]
): GameFlow | null => {
  const teams = rosterIds.map((id) => file.teams[String(id)]);
  if (!teams[0] || !teams[1]) return null;

  const merged = teams.flatMap((team, side) =>
    team.e.map(([dt, index, pts100, extra]) => ({
      at: file.t0 + dt,
      side: side as Side,
      // -1 is a team-level correction: an official score that is not quite
      // its starters' sum (sixteen NFL.com-era weeks).
      starterId: index < 0 ? "" : team.s[index],
      pts: pts100 / 100,
      key: typeof extra === "object" ? extra : undefined,
      correction: extra === 1,
    }))
  );
  // Stable, and team order breaks a tie: two moments on one play land in the
  // order the file has them.
  merged.sort((a, b) => a.at - b.at || a.side - b.side);

  const score: [number, number] = [0, 0];
  let leader: Side | null = null;
  let decided: FlowStep | undefined;
  const steps: FlowStep[] = [];
  const leadChanges: FlowStep[] = [];
  const worst: [number, number] = [0, 0];
  const worstAt: [FlowStep | undefined, FlowStep | undefined] = [undefined, undefined];

  for (const moment of merged) {
    score[moment.side] = Math.round((score[moment.side] + moment.pts) * 100) / 100;
    const step: FlowStep = { ...moment, score: [score[0], score[1]] };
    steps.push(step);

    // The low point of each side, kept with its moment: a comeback's story is
    // partly when it was at its worst ("34.2 down in Sunday's late games").
    for (const side of [0, 1] as const) {
      const deficit = score[side] - score[1 - side];
      if (deficit < worst[side]) {
        worst[side] = deficit;
        worstAt[side] = step;
      }
    }

    const now: Side | null =
      score[0] > score[1] ? 0 : score[1] > score[0] ? 1 : null;
    if (now !== null && now !== leader) {
      if (leader !== null) leadChanges.push(step);
      leader = now;
      decided = step;
    }
  }

  const final: [number, number] = [score[0], score[1]];
  const winner: Side | null =
    final[0] > final[1] ? 0 : final[1] > final[0] ? 1 : null;

  return {
    steps,
    keyPlays: steps.filter((step) => step.key),
    leadChanges,
    decided: winner === null ? undefined : decided,
    final,
    comeback: winner === null ? 0 : Math.round(-worst[winner] * 100) / 100,
    comebackFrom: winner === null ? undefined : worstAt[winner],
  };
};

/* ---------------------------------------------------------------- the clock */

const EASTERN = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  hourCycle: "h23",
});

/**
 * Which part of the NFL week a moment fell in, named from US Eastern time —
 * the way the week is spoken about. Nobody calls Thursday night's game
 * "Friday", whatever the clock says in London.
 */
export const slotOf = (at: number): string => {
  const parts = EASTERN.formatToParts(new Date(at * 1000));
  const day = parts.find((p) => p.type === "weekday")?.value ?? "";
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0);
  // A game running past midnight still belongs to the night it started.
  const late = hour < 6;
  const effective =
    late
      ? { Fri: "Thu", Sun: "Sat", Mon: "Sun", Tue: "Mon" }[day] ?? day
      : day;
  switch (effective) {
    case "Wed":
      return hour >= 18 ? "Wednesday night" : "Wednesday";
    case "Tue":
      return "Tuesday night";
    case "Thu":
      return "Thursday night";
    case "Fri":
      return "Friday";
    case "Sat":
      return "Saturday";
    case "Sun":
      if (late || hour >= 19) return "Sunday night";
      if (hour < 12) return "Sunday morning";
      return hour < 16 ? "Sunday early" : "Sunday late";
    case "Mon":
      return "Monday night";
    default:
      return effective;
  }
};

const EASTERN_MINUTES = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  weekday: "short",
  hour: "numeric",
  minute: "2-digit",
  hourCycle: "h23",
});

/**
 * An NFL week runs Wednesday to Tuesday, not Sunday to Saturday.
 *
 * Wednesday earns its place at the front: 2012 opened on one (the convention
 * had the Thursday), 2024 played Christmas on one, and putting it at the back
 * made the first game of Chumbo history the latest-decided game in Chumbo
 * history. Tuesday is at the back for the opposite reason — 2020 pushed two
 * games there, and a game decided on Tuesday night really is as late as it
 * gets.
 */
const WEEKDAYS = ["Wed", "Thu", "Fri", "Sat", "Sun", "Mon", "Tue"];

const easternParts = (at: number) => {
  const parts = EASTERN_MINUTES.formatToParts(new Date(at * 1000));
  const value = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    day: value("weekday"),
    hour: Number(value("hour")),
    minute: Number(value("minute")),
  };
};

/**
 * How late in the NFL week a moment is, in minutes from Wednesday 00:00
 * Eastern — the one number that orders every scoring moment of every week the
 * same way, so "the latest a game was ever decided" is a comparison and not a
 * feeling. A Monday-night game running past midnight lands on Tuesday and
 * therefore later still, which is right.
 */
export const minutesIntoWeek = (at: number): number => {
  const { day, hour, minute } = easternParts(at);
  const index = WEEKDAYS.indexOf(day);
  return (index < 0 ? 0 : index) * 24 * 60 + hour * 60 + minute;
};

/** "Monday, 11:42 pm" — Eastern, the clock the games were played on. */
export const clockOf = (at: number): string => {
  const { day, hour, minute } = easternParts(at);
  const full =
    { Thu: "Thursday", Fri: "Friday", Sat: "Saturday", Sun: "Sunday", Mon: "Monday", Tue: "Tuesday", Wed: "Wednesday" }[
      day
    ] ?? day;
  const suffix = hour < 12 ? "am" : "pm";
  const twelve = hour % 12 === 0 ? 12 : hour % 12;
  return `${full}, ${twelve}:${String(minute).padStart(2, "0")} ${suffix}`;
};

const EASTERN_DATE = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "numeric",
  day: "numeric",
  hour: "numeric",
  hourCycle: "h23",
});

/**
 * The calendar day a moment belongs to, in Eastern time, with the same rule
 * `slotOf` uses: a game running past midnight belongs to the night it started.
 * Monday night's 12:40 am touchdown was scored on Monday.
 */
export const dayOf = (at: number): { year: number; month: number; day: number } => {
  const parts = (time: number) =>
    Object.fromEntries(
      EASTERN_DATE.formatToParts(new Date(time * 1000)).map((p) => [p.type, p.value])
    );
  const first = parts(at);
  const settled = Number(first.hour) < 6 ? parts(at - 6 * 3600) : first;
  return {
    year: Number(settled.year),
    month: Number(settled.month),
    day: Number(settled.day),
  };
};

/**
 * When a game was over: its last scoring moment that was a PLAY. A correction
 * is dated by the play it follows, or for a team correction by the week's last
 * moment, which can put a game that was over on Sunday into Monday night.
 */
export const finishedAt = (flow: GameFlow): number | undefined =>
  [...flow.steps].reverse().find((step) => !step.correction)?.at ??
  flow.steps[flow.steps.length - 1]?.at;

/* ------------------------------------------------------------------ x axis */

/** Longest stretch of nothing shown at its real width, in seconds. */
const MAX_GAP = 30 * 60;

/**
 * A time axis with the dead hours taken out. A week is four days with about
 * twenty hours of football in it; drawn to scale, Sunday afternoon — where
 * most of it happens — would be a sliver between two long flat nights. Any
 * gap longer than half an hour is drawn as half an hour.
 *
 * Returns `position(at)` in squeezed seconds and the total span.
 */
export const squeezedTime = (times: readonly number[]) => {
  const sorted = [...new Set(times)].sort((a, b) => a - b);
  const offsets: number[] = [];
  let cursor = 0;
  sorted.forEach((at, i) => {
    if (i > 0) cursor += Math.min(at - sorted[i - 1], MAX_GAP);
    offsets.push(cursor);
  });
  const position = (at: number): number => {
    // Binary search for the last known time at or before `at`.
    let lo = 0;
    let hi = sorted.length - 1;
    if (hi < 0) return 0;
    if (at <= sorted[0]) return 0;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (sorted[mid] <= at) lo = mid;
      else hi = mid - 1;
    }
    return offsets[lo] + Math.min(at - sorted[lo], MAX_GAP);
  };
  return { position, span: cursor };
};

/* --------------------------------------------------------------- the words */

/** "on Monday night", "in Sunday's late games". */
export const whenSlot = (slot: string) =>
  ({
    "Thursday night": "on Thursday night",
    "Sunday morning": "in Sunday's early-morning game",
    "Sunday early": "in Sunday's early games",
    "Sunday late": "in Sunday's late games",
    "Sunday night": "on Sunday night",
    "Monday night": "on Monday night",
    "Tuesday night": "on Tuesday night",
    "Wednesday night": "on Wednesday night",
    Saturday: "on Saturday",
    Friday: "on Friday",
    Wednesday: "on Wednesday",
  })[slot] ?? `on ${slot}`;

/**
 * What a slot is called where its full name will not fit: a phone's axis, a
 * card's divider. The league's own shorthand, so "Late" means the 4pm games
 * to anyone who has ever watched one.
 */
const SHORT_SLOT: Record<string, string> = {
  "Thursday night": "TNF",
  "Sunday morning": "Sun am",
  "Sunday early": "Sun",
  "Sunday late": "Late",
  "Sunday night": "SNF",
  "Monday night": "MNF",
  // Not "TNF": Thursday has that. 2020's two Tuesday games get "Tue".
  "Tuesday night": "Tue",
  "Wednesday night": "Wed",
  Wednesday: "Wed",
  Saturday: "Sat",
  Friday: "Fri",
};

export const shortSlot = (slot: string): string => SHORT_SLOT[slot] ?? slot;

/**
 * Where each part of the week starts, from moments in order: one entry per
 * run of moments in the same slot, so a week reads
 * Thursday → Sunday → late → Sunday night → Monday.
 */
export const slotStarts = (
  times: readonly number[]
): { at: number; slot: string }[] => {
  const starts: { at: number; slot: string }[] = [];
  for (const at of times) {
    const slot = slotOf(at);
    if (starts[starts.length - 1]?.slot !== slot) starts.push({ at, slot });
  }
  return starts;
};

const count = (n: number) =>
  ["No", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine", "Ten"][n] ??
  String(n);

export const describeFlow = (
  flow: GameFlow,
  names: readonly [string, string],
  playerName: (id: string) => string
): string => {
  const { decided, leadChanges, comeback, final } = flow;
  if (!decided) return `Level at the end, ${final[0].toFixed(2)} apiece.`;
  const winner = names[decided.side];
  const changes =
    leadChanges.length === 0
      ? `${winner} led from the first score to the last.`
      : `${count(leadChanges.length)} lead change${leadChanges.length === 1 ? "" : "s"}.`;
  if (leadChanges.length === 0) return changes;
  const back = comeback >= 15 ? `, from ${comeback.toFixed(1)} down,` : "";
  // A correction has no player to credit — only the official score.
  const how = decided.correction
    ? "when the official score was settled"
    : `when ${playerName(decided.starterId)} scored`;
  return `${changes} ${winner} went ahead for good${back} ${whenSlot(slotOf(decided.at))}, ${how}.`;
};

