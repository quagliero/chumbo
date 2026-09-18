import type { CareerTimeline } from "@/presentation/components/ManagerDetail/useCareerTimeline";

/**
 * One line per manager for the Managers page (F1e): "3 titles, the last in
 * 2021, but no playoffs since 2022."
 *
 * The rule the narrative engine (E7) lives by applies here too: it invents
 * nothing. Every clause is a count or a year read off the same career
 * timeline the manager page draws — bracket-settled finishes, playoff berths —
 * plus the Scumbos from `crowns.ts`, and a test recounts each one. A season
 * still being played is ignored entirely: "no playoffs since 2022" said in
 * week 2 would be a prediction.
 *
 * Two clauses at most. The first is who they are (titles, or finals, or their
 * best finish); the second is what has happened lately, or the thing the
 * league would needle them about. They are joined with "but" when the second
 * cuts against the first and "and" when it does not, because "3 titles, and no
 * playoffs since 2022" reads as a compliment it is not.
 */

export interface StoryInput {
  timeline: CareerTimeline;
  /** Settled seasons in which they held the worst all-play record. */
  scumboYears: readonly number[];
  /** The most recent settled season in the league — "have they left?" */
  latestSettledYear: number;
}

/** Below this, a run of seasons is not a streak and a gap is not a drought. */
const RUN = 3;

const WORDS = ["", "One", "Two", "Three", "Four", "Five", "Six", "Seven"];
const count = (n: number) => (n < WORDS.length ? WORDS[n] : String(n));
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

export const managerStory = ({
  timeline,
  scumboYears,
  latestSettledYear,
}: StoryInput): string | null => {
  const settled = timeline.seasons.filter(
    (s) => !s.inProgress && s.position !== null
  );
  if (settled.length === 0) return null;

  // One season is not a career: "best finish" of one, then "last played" in
  // the same year, says the same thing twice and badly.
  if (settled.length === 1) {
    const [only] = settled;
    return `One season: ${ordinal(only.position as number)} of ${only.field} in ${only.year}.`;
  }

  // --- Who they are ------------------------------------------------------
  const titleYears = settled.filter((s) => s.position === 1).map((s) => s.year);
  const finals = settled.filter((s) => s.position === 2).length;

  let lead: string;
  let proud: boolean;
  if (titleYears.length === 1) {
    lead = `Champion in ${titleYears[0]}`;
    proud = true;
  } else if (titleYears.length > 1) {
    lead = `${count(titleYears.length)} titles, the last in ${Math.max(...titleYears)}`;
    proud = true;
  } else if (finals > 0) {
    lead =
      finals === 1
        ? "Reached a final, never won one"
        : `${count(finals)} finals, never a title`;
    proud = false;
  } else {
    lead = `Best finish ${ordinal(timeline.bestFinish ?? 0)}`;
    proud = false;
  }

  // --- What has happened since -------------------------------------------
  const years = settled.map((s) => s.year);
  const lastYear = Math.max(...years);
  const playoffYears = settled.filter((s) => s.madePlayoffs).map((s) => s.year);
  const lastPlayoffs = playoffYears.length ? Math.max(...playoffYears) : null;

  // Consecutive calendar seasons of playoffs, ending with their latest.
  let streak = 0;
  for (let y = lastYear; playoffYears.includes(y); y--) streak++;

  // Settled seasons played since their last playoffs.
  const dry = settled.filter((s) => s.year > (lastPlayoffs ?? -Infinity)).length;

  type Tone = "for" | "against" | "neutral";
  let tail: { text: string; tone: Tone } | null = null;
  if (lastYear < latestSettledYear) {
    tail = { text: `last played in ${lastYear}`, tone: "neutral" };
  } else if (lastPlayoffs === null && settled.length >= RUN) {
    tail = { text: "never made the playoffs", tone: "against" };
  } else if (lastPlayoffs !== null && dry >= RUN) {
    tail = { text: `no playoffs since ${lastPlayoffs}`, tone: "against" };
  } else if (streak >= RUN) {
    tail = {
      text: `in the playoffs ${lower(count(streak))} years running`,
      tone: "for",
    };
  } else if (scumboYears.length > 1) {
    tail = {
      text: `${lower(count(scumboYears.length))}-time Scumbo`,
      tone: "against",
    };
  } else if (scumboYears.length === 1) {
    tail = { text: `Scumbo in ${scumboYears[0]}`, tone: "against" };
  }

  if (!tail) return `${lead}.`;
  const join =
    proud && tail.tone === "against"
      ? ", but"
      : proud && tail.tone === "for"
        ? ", and"
        : ";";
  return `${lead}${join} ${tail.text}.`;
};
