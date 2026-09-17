import managers from "@/data/managers.json";
import type { PrecomputedStat, PrecomputedStats } from "@/utils/stats/precomputed";
import type { StatEntry } from "@/utils/stats/types";
import { PHRASES, ordinal } from "./phrases";

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
}

export interface NarrativeSubject {
  /** Manager ids this note may be about. */
  managerIds?: string[];
  year?: number;
  week?: number;
}

const MANAGER_IDS = new Set(managers.map((m) => m.id));

/**
 * Does this entry describe the thing being narrated?
 *
 * `subject` means different things in different stats — a manager id, a player
 * name, "Pick 1", "fin vs sol" — so a blunt string compare would attach a
 * player's record to a manager who happens to share a name. The rule is: any
 * field the caller specified must match, and a manager-named subject must be
 * one of the managers asked about.
 */
const describes = (entry: StatEntry, subject: NarrativeSubject): boolean => {
  if (subject.year !== undefined && entry.year !== subject.year) return false;
  if (subject.week !== undefined && entry.week !== subject.week) return false;

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
  return rank === 1
    ? `The ${phrase} in Chumbo history.`
    : `The ${ordinal(rank)}-${phrase} in Chumbo history.`;
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
        rank,
        outOf: stat.total,
        weight,
        href: entry.href,
        approximate: entry.approximate,
      });
    });
  }

  return notes
    .sort((a, b) => b.weight - a.weight || a.statId.localeCompare(b.statId))
    .slice(0, limit);
};
