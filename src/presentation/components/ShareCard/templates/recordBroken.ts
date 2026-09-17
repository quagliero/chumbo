/**
 * A broken record (G2).
 *
 * The loudest of the five, and the only one with a siren on it. This is the
 * card the whole workstream is for: somebody opens the site, finds out they
 * have just done something nobody has done in fifteen seasons, and pastes the
 * proof into the group chat.
 *
 * ## Layout decisions
 *
 * **The alert is a band, the number is on white.** The obvious design is a
 * full-bleed accent with everything reversed out of it, and the harness in G1
 * shows what that costs: on the league's yellow, white text measures 2.2:1 and
 * the number — the only thing on the card that matters — is the least legible
 * thing on it. So the accent does what `tokens.ts` says it is good for, a
 * block with one line of large type, and the number sits in ink on white at
 * 15:1. The band still does the work of being unmistakable at thumbnail size;
 * a coloured stripe with a siren in it is recognisable before anything is read.
 *
 * **The sentence comes from `narrate()`, not from here.** "The biggest margin
 * of victory in Chumbo history" is E7's job, and the reason it is E7's job is
 * that it cannot say anything the site does not already stand behind. A
 * template that composed its own superlatives would be free to be wrong.
 *
 * **The caveat gets its own line.** Every other card appends "· reconstructed"
 * to the sentence. This one does not, because this is the exact card where a
 * caveated fact read flat does the most damage: a league record claimed on
 * 2019's reconstructed per-player data, shared into a thread, is an argument
 * nobody can settle afterwards. So it gets a line of its own with a warning
 * sign in front of it, in words, saying which data and why — plus a white chip
 * in the band, because the line is 26px and the thumbnail is 200px wide.
 */

import { CARD_PADDING, CARD_WIDTH, type ShareCard } from "../card";
import { text, textLines } from "../svg";
import { truncateToWidth, wrapToWidth } from "../text";
import { CARD_TOKENS } from "../tokens";
import {
  type CardChrome,
  CONTENT_WIDTH,
  NEUTRAL_ACCENT,
  band,
  caveatLine,
  fitValue,
  footer,
  pill,
} from "./chrome";

export interface RecordBrokenCardProps extends CardChrome {
  /**
   * What the record is, as a sentence. Pass `narrate(...)[0]` as `note` and
   * leave this out; this is the fallback for a caller with a fact the
   * narrative engine has no phrase for.
   */
  label?: string;
  /** The number, already formatted: "212.4", "14", "97.3%". */
  value: string;
  /** Whose record it is — a manager, a team, a player. */
  holder: string;
  /** "2021 · Week 9". Also the footer's meta line. */
  when?: string;
  /**
   * The line in the band. Defaults to the siren. Override for a smaller claim
   * — "SEASON RECORD", "CLUB RECORD" — but not to make a weak fact shout.
   */
  kicker?: string;
}

const DEFAULT_KICKER = "\u{1F6A8} NEW LEAGUE RECORD";
const BAND_HEIGHT = 168;
const SENTENCE_BASELINE = 248;
const SENTENCE_LINE_HEIGHT = 48;
const VALUE_BASELINE = 438;
const HOLDER_BASELINE = 492;
const CAVEAT_BASELINE = 528;
/** Width the "reconstructed data" chip needs, kept clear of the kicker. */
const CAVEAT_BADGE_ROOM = 360;

export const recordBrokenCard = ({
  label,
  value,
  holder,
  when,
  kicker = DEFAULT_KICKER,
  accent = NEUTRAL_ACCENT,
  crest,
  note,
}: RecordBrokenCardProps): ShareCard => {
  const sentence = note?.text ?? label ?? "";
  // Two lines at most. A third would push the number down into the footer, and
  // the number is not negotiable — a record card that shrank its own number to
  // fit a longer sentence has its priorities backwards.
  const lines = sentence
    ? wrapToWidth(sentence, CONTENT_WIDTH, 40, { weight: 700, maxLines: 2 })
    : [];
  const valueSize = fitValue(value, CONTENT_WIDTH, 176, 96);
  // Holder only, not "holder · when": the when is in the footer, where all
  // five cards put it, and printing it twice on one card buys nothing.
  const attribution = holder;
  // The siren is the one thing on the card that must not end up in the
  // filename or read out by a screen reader as "siren colon".
  const spokenKicker = kicker.replace(/[^\p{L}\p{N} ,.'&:-]/gu, "").trim();

  return {
    title: `${spokenKicker}: ${value} — ${attribution}${
      when ? `, ${when}` : ""
    }${note?.approximate ? " (reconstructed data)" : ""}`,
    content: [
      band(kicker, accent, {
        height: BAND_HEIGHT,
        // Leave the badge's corner alone when there is one to put there.
        width: note?.approximate ? CONTENT_WIDTH - CAVEAT_BADGE_ROOM : undefined,
      }),
      // A white chip in the band, and the explanation in full below it. Two
      // markings for one caveat, because they reach different readers: the
      // line is for whoever opens the card, and the chip is for whoever only
      // ever sees the thumbnail — at 200px the 26px line is four grey pixels,
      // and "there is a qualifier on this record" has to survive that.
      note?.approximate
        ? pill("Reconstructed data", {
            x: CARD_WIDTH - CARD_PADDING,
            y: BAND_HEIGHT / 2 - 27,
            fill: CARD_TOKENS.surface,
            ink: CARD_TOKENS.ink,
            size: 26,
            anchor: "end",
          })
        : "",
      lines.length
        ? textLines(lines, {
            x: CARD_PADDING,
            y: SENTENCE_BASELINE,
            size: 40,
            weight: 700,
            fill: CARD_TOKENS.ink,
            lineHeight: SENTENCE_LINE_HEIGHT,
          })
        : "",
      // Truncated as well as fitted. `fitValue` stops shrinking at 96px, which
      // is the floor on the one thing the card is about — so a "value" that is
      // not a number (a caller passing a sentence, or something hostile) would
      // otherwise run off the edge at 96px rather than being cut.
      text(truncateToWidth(value, CONTENT_WIDTH, valueSize, { weight: 800 }), {
        x: CARD_PADDING,
        y: VALUE_BASELINE,
        size: valueSize,
        weight: 800,
        fill: CARD_TOKENS.ink,
        tracking: -4,
        numeric: true,
      }),
      attribution
        ? text(truncateToWidth(attribution, CONTENT_WIDTH, 34, { weight: 700 }), {
            x: CARD_PADDING,
            y: HOLDER_BASELINE,
            size: 34,
            weight: 700,
            fill: CARD_TOKENS.inkMuted,
          })
        : "",
      note?.approximate ? caveatLine({ y: CAVEAT_BASELINE }) : "",
      footer({ meta: when ?? "All time", crest }),
    ].join(""),
  };
};
