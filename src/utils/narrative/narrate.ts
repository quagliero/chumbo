import managers from "@/data/managers.json";
import type { PrecomputedStat, PrecomputedStats } from "@/utils/stats/precomputed";
import type { StatEntry, StatScope } from "@/utils/stats/types";
import { PHRASES, QUALIFIERS, ordinal } from "./phrases";
import { recordValueFor } from "./recordValue";

/**
 * The narrative engine (E7).
 *
 * **Facts get shared; tables don't.** A ranked list is a thing you scan and
 * forget; "the highest-scoring loss in Chumbo history" is a thing you paste into
 * the group chat. Everything needed to say the second is already in the first —
 * this is the bit that says it out loud.
 *
 * It reads the PRECOMPUTED answers rather than the live registry, for three
 * reasons. It costs a 19 kB file instead of the ~550 kB of matchups and
 * transactions the registry needs, so a matchup page can carry notes without
 * downloading the archive. The file keeps the top 25 of each stat, which is
 * already the right bar — nothing outside a stat's top 25 deserves a sentence.
 * And G6 renders OG images in Node from that same file, so a card and a page
 * cannot disagree about what was notable.
 *
 * No new facts are invented here. A note is always "this entry you already
 * computed is Nth in that list", which is why the engine cannot say anything
 * the site does not already stand behind.
 */

export interface Note {
  /** The sentence, ready to render. */
  text: string;
  statId: string;
  /**
   * What the stat is about, straight from the registry. A caller that can only
   * carry one kind of fact filters on it — a manager-season card has no
   * business printing "the most notable week on this date".
   */
  scope: StatScope;
  /** 1 = the record itself. */
  rank: number;
  /** How long the full list is, so "3rd of 2,460" can be shown if wanted. */
  outOf: number;
  /** Higher is more worth saying. Drives ordering and the cut-off. */
  weight: number;
  href?: string;
  /**
   * True when the fact rests on 2019's reconstructed per-player data. The UI
   * must mark it; a caveated fact presented flat is worse than no fact.
   */
  approximate?: boolean;
  /**
   * Whoever holds it, as a name worth printing: a manager's name rather than
   * their id, both names for a pairing, otherwise the subject verbatim (a
   * player's name, a draft slot).
   */
  holder: string;
  /** Set only when the holder is exactly one manager, so a card can use their accent. */
  managerId?: string;
  /**
   * The ranked number, formatted, when that number is the magnitude the
   * sentence is about. Undefined means this stat's number cannot be the hero
   * of a record card — see `recordValue.ts`.
   */
  recordValue?: string;
  year?: number;
  week?: number;
}

export interface NarrativeSubject {
  /** Manager ids this note may be about. */
  managerIds?: string[];
  /**
   * A rivalry, as the two managers in it. Order does not matter.
   *
   * Separate from `managerIds` because it is a narrower ask, not a looser one.
   * `managerIds: [a, b]` matches anything about EITHER manager, which on an
   * H2H page offers "the longest losing streak in Chumbo history" — true of
   * one of them across fifteen seasons, and printed under "thd 9–9 jay" it
   * reads as a claim about the series. `pairing` matches only the stats whose
   * subject is the pair itself.
   */
  pairing?: readonly [string, string];
  year?: number;
  week?: number;
}

const MANAGER_IDS = new Set(managers.map((m) => m.id));
const MANAGER_NAMES = new Map(managers.map((m) => [m.id, m.name]));

/**
 * How a pairing stat writes its subject — see `rivalry-intensity` in
 * `utils/stats/matchupStats.ts`, which emits `${a} vs ${b}` with the two ids
 * sorted.
 */
const PAIRING_SEPARATOR = " vs ";

/**
 * The two managers in a pairing subject ("fin vs sol"), or null.
 *
 * Deliberately strict, because this is the one place a subject string is taken
 * apart rather than compared whole. Exactly two halves, both of them real
 * manager ids, and not the same manager twice — so a player called "Rivalry vs
 * Nobody", or any subject that merely contains " vs ", parses to null and is
 * judged by the ordinary rules instead.
 */
const asPairing = (subject: string): [string, string] | null => {
  const parts = subject.split(PAIRING_SEPARATOR);
  if (parts.length !== 2) return null;
  const [a, b] = parts.map((part) => part.trim());
  if (a === b) return null;
  if (!MANAGER_IDS.has(a) || !MANAGER_IDS.has(b)) return null;
  return [a, b];
};

/**
 * The same rivalry, in either order — and NOT a different rivalry that happens
 * to share one manager.
 *
 * Both halves are checked against both halves, which is the whole rule: a
 * subset test ("does the entry mention either of these two?") would hang
 * `fin vs sol` on the `fin vs jay` page, and that is the exact shape of the
 * mistake `describes()` exists to prevent.
 */
const samePairing = (
  entry: readonly [string, string],
  asked: readonly [string, string]
): boolean =>
  (entry[0] === asked[0] && entry[1] === asked[1]) ||
  (entry[0] === asked[1] && entry[1] === asked[0]);

/** A name a card can print for whoever holds the entry. */
const holderName = (subject: string): string => {
  const manager = MANAGER_NAMES.get(subject);
  if (manager) return manager;
  const pair = asPairing(subject);
  return pair
    ? `${MANAGER_NAMES.get(pair[0])} vs ${MANAGER_NAMES.get(pair[1])}`
    : subject;
};

/**
 * Does this entry describe the thing being narrated?
 *
 * `subject` means different things in different stats — a manager id, a player
 * name, "Pick 1", "fin vs sol" — so a blunt string compare would attach a
 * player's record to a manager who happens to share a name. The rule is: any
 * field the caller specified must match, and a manager-named subject must be
 * one of the managers asked about.
 *
 * A caller asking about a `pairing` gets the third case: a subject that parses
 * as two manager ids is matched as a pair, in either order, and must be BOTH
 * of the ids asked for. That is narrower than the manager-id rule rather than
 * a relaxation of it — a pairing subject still cannot be reached by naming one
 * of its managers, with or without a year.
 */
const describes = (entry: StatEntry, subject: NarrativeSubject): boolean => {
  if (subject.year !== undefined && entry.year !== subject.year) return false;
  if (subject.week !== undefined && entry.week !== subject.week) return false;

  if (subject.pairing) {
    const pair = asPairing(entry.subject);
    // A pairing subject is judged ONLY against the pairing asked for. Falling
    // through to the manager-id rules below would let "fin vs sol" match a
    // page about fin, which is the thing this branch exists to stop.
    if (pair) return samePairing(pair, subject.pairing);
  }

  if (subject.managerIds?.length) {
    // Only judge the subject when it IS a manager id. A player's name or a
    // draft slot in the right week is still about that week.
    if (MANAGER_IDS.has(entry.subject)) {
      return subject.managerIds.includes(entry.subject);
    }
    // With no year or week to pin it to, a non-manager subject is not about
    // this manager at all — it is just some other row of the same stat.
    return subject.year !== undefined || subject.week !== undefined;
  }

  return subject.year !== undefined || subject.week !== undefined;
};

/**
 * How notable a placing is.
 *
 * Rank matters most, but the size of the field matters too: first of 2,460
 * draft picks is a bigger claim than first of twelve draft slots, and twelfth
 * of 2,460 is still remarkable while twelfth of twelve is last place. So the
 * weight is the share of the field beaten, with a strong bonus for the top
 * three — those are the only ones that get to be called "the".
 */
const weigh = (rank: number, outOf: number): number => {
  const share = outOf <= 1 ? 1 : 1 - (rank - 1) / outOf;
  const podium = rank === 1 ? 1 : rank <= 3 ? 0.4 : 0;
  return share + podium;
};

const phraseFor = (stat: PrecomputedStat): string =>
  PHRASES[stat.id] ?? stat.label.toLowerCase();

/**
 * "The highest-scoring loss in Chumbo history."
 * "The 3rd-biggest margin of victory in Chumbo history."
 *
 * An ordinal at every rank rather than "one of the ten biggest" past the top
 * few: the alternative needs a plural of each phrase, and "biggest margin of
 * victorys" is how that goes wrong. The ordinal is also the more useful claim —
 * 19th is a different boast from 6th, and "one of the ten" hides which.
 */
const sentence = (stat: PrecomputedStat, rank: number): string => {
  const phrase = phraseFor(stat);
  const qualifier = QUALIFIERS[stat.id];
  const tail = qualifier
    ? ` in Chumbo history (${qualifier}).`
    : " in Chumbo history.";
  return rank === 1
    ? `The ${phrase}${tail}`
    : `The ${ordinal(rank)}-${phrase}${tail}`;
};

/**
 * Sentences about `subject`, most notable first.
 *
 * `minWeight` is the bar for saying anything at all. A page with no notes should
 * show none rather than reach for something weak — a rail of "the 24th-closest
 * win" trains people to ignore the rail.
 */
export const narrate = (
  stats: PrecomputedStats | null,
  subject: NarrativeSubject,
  { limit = 3, minWeight = 0.9 }: { limit?: number; minWeight?: number } = {}
): Note[] => {
  if (!stats) return [];

  const notes: Note[] = [];

  for (const stat of stats.stats) {
    stat.entries.forEach((entry, index) => {
      if (!describes(entry, subject)) return;

      const rank = index + 1;
      const weight = weigh(rank, stat.total);
      if (weight < minWeight) return;

      notes.push({
        text: sentence(stat, rank),
        statId: stat.id,
        scope: stat.scope,
        rank,
        outOf: stat.total,
        weight,
        href: entry.href,
        approximate: entry.approximate,
        holder: holderName(entry.subject),
        managerId: MANAGER_IDS.has(entry.subject) ? entry.subject : undefined,
        recordValue: recordValueFor(stat.id, entry.value, stat.format),
        year: entry.year,
        week: entry.week,
      });
    });
  }

  return notes
    .sort((a, b) => b.weight - a.weight || a.statId.localeCompare(b.statId))
    .slice(0, limit);
};
