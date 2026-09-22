/**
 * The parts every card shares (G2).
 *
 * Five templates, one look. This file is what makes the five feel like they
 * came from the same place: the accent rule along the top, the avatar, the
 * eyebrow label, the footer that says where the picture came from, and the
 * single rule about how a caveated fact is marked.
 *
 * **Why a chrome module rather than five self-contained templates.** The cards
 * are shared away from the site, next to each other, in the same thread. The
 * failure mode B1 was written to fix — "ten different card treatments" — is
 * exactly what five independently-laid-out templates would reproduce, and it
 * shows up worst at thumbnail size where the only thing a reader has to go on
 * is the silhouette. So the furniture is written once and the templates only
 * own their middle.
 *
 * Everything here is a pure string function, for the same reason the renderer
 * is: G6 runs it in Node with no DOM.
 *
 * ## The rules these helpers encode, so a template cannot get them wrong
 *
 * - **One accent per card.** `getManagerAccent` is identity decoration for a
 *   single manager (see the F2 note in `src/domain/managerColors.ts`). A card
 *   about two managers gets ONE accent — the winner's, the leader's — used as
 *   the top rule and the avatar ring, never as two competing blocks.
 * - **The accent is a rule, a ring or a block of large type**, never a ground
 *   for body text: white is 2.2:1 on the league's yellow (`tokens.ts`). `pill`
 *   and `band` are the sanctioned accent-as-block uses and both size their text
 *   well above the large-text threshold, through `onAccent`.
 * - **Nothing below 26px.** At WhatsApp thumbnail width the card is ~200px, a
 *   sixth of the design space, so 26px is 4px in the thread. The floor is 26
 *   and it is only for the caveat and the URL — the one thing a card is *about*
 *   is 90px or more.
 * - **A flagged fact says so.** 2019's per-player scoring is a reconstruction
 *   (`src/domain/dataQuality.ts`), and a caveated fact shared flat is worse
 *   than no card. `CardNote.approximate` is threaded through every template and
 *   surfaces as visible words, not a colour or an asterisk.
 */

import { CARD_HEIGHT, CARD_PADDING, CARD_WIDTH } from "../card";
import { METRIC_HEADROOM, estimateTextWidth } from "../fonts";
import { circleClip, circle, group, image, rect, text } from "../svg";
import { fitFontSize, truncateToWidth } from "../text";
import { CARD_TOKENS, onAccent } from "../tokens";

/** Usable width between the side margins. */
export const CONTENT_WIDTH = CARD_WIDTH - CARD_PADDING * 2;

/**
 * The footer strip.
 *
 * 88px so it can hold the wordmark and the site's address on two lines without
 * either dropping under the legibility floor. It is the same height on all five
 * cards, which is most of why they read as a set.
 */
export const FOOTER_HEIGHT = 88;

/** The lowest y a template may draw its own content at. */
export const CONTENT_BOTTOM = CARD_HEIGHT - FOOTER_HEIGHT;

/** Height of the accent rule along the top edge. */
export const TOP_RULE = 10;

/**
 * Where the card came from.
 *
 * Both halves matter and they are for different readers. The wordmark is for
 * the league, who recognise it at thumbnail size and need no explanation. The
 * address is for whoever the card gets forwarded to, who has never heard of
 * the Chumbo and has no other way to find it — an image pasted into WhatsApp
 * carries no link, so if the URL is not drawn on the card it does not exist.
 *
 * Hard-coded rather than read from `location.origin`: G6 generates these in
 * Node, and a card built at 3am by a build script must say the same thing as
 * one built in a browser.
 */
export const SITE_NAME = "THE CHUMBO";
export const SITE_URL = "chumbo.netlify.app";

/**
 * A sentence a card has earned, from `narrate()` (E7).
 *
 * Structurally a `Note`, so a caller writes
 * `note: narrate(stats, { year, week })[0]` and is done. Not imported as
 * `Note` on purpose: the templates must stay usable from the OG build step
 * without dragging the narrative engine and `managers.json` in behind them.
 */
export interface CardNote {
  /** "The biggest margin of victory in Chumbo history." */
  text: string;
  /** True when the fact rests on 2019's incomplete bench scores. */
  approximate?: boolean;
}

/**
 * The short and long forms of the 2019 caveat.
 *
 * Wording matched to `NarrativeNotes`, which appends "· reconstructed" on the
 * site. The card and the page must not caveat the same fact two different
 * ways — somebody will have both open.
 */
export const CAVEAT_SHORT = "reconstructed";
export const CAVEAT_LONG = "2019 bench scores are incomplete";

/** Somebody on a card: a team, or a manager. */
export interface CardPerson {
  /** The headline name — a team name, or a manager's name. */
  name: string;
  /** A data URI from `embedImage(getUserAvatarUrl(user))`, or null. */
  avatar?: string | null;
}

/** What every template accepts, beyond the fact itself. */
export interface CardChrome {
  /**
   * One manager's accent, from `getManagerAccent`. Defaults to ink — a black
   * rule is neutral and legible, which is the right answer when the card is
   * not about a single manager.
   */
  accent?: string;
  /** The league crest, from `embedImage("/images/logo.png")`. */
  crest?: string | null;
  /** A sentence from `narrate()`, if the fact has earned one. */
  note?: CardNote;
}

/** The default accent: neutral, and legible under any of the eight hues. */
export const NEUTRAL_ACCENT = CARD_TOKENS.ink;

/** The accent rule along the top edge. The cheapest identity mark there is. */
export const topRule = (accent: string = NEUTRAL_ACCENT): string =>
  rect({ x: 0, y: 0, width: CARD_WIDTH, height: TOP_RULE, fill: accent });

/**
 * A full-width accent band, for the one card that needs to shout.
 *
 * The accent as a *block* with one line of large type on it — the second of the
 * two sanctioned uses in `tokens.ts`. The type is 44px, well over the 24px the
 * 3:1 large-text threshold needs, and the ink comes from `onAccent` rather than
 * being assumed white.
 */
export const band = (
  label: string,
  accent: string,
  {
    height = 168,
    size = 46,
    width = CONTENT_WIDTH,
  }: { height?: number; size?: number; width?: number } = {}
): string => {
  const ink = onAccent(accent);
  return group({}, [
    rect({ x: 0, y: 0, width: CARD_WIDTH, height, fill: accent }),
    text(truncateToWidth(label, width, size, { weight: 800 }), {
      x: CARD_PADDING,
      y: height / 2,
      size,
      weight: 800,
      tracking: 1,
      fill: ink,
      baseline: "central",
    }),
  ]);
};

/** The small caps-y label above a block. Uppercased here so it always is. */
export const eyebrow = (
  label: string,
  {
    x = CARD_PADDING,
    y,
    width = CONTENT_WIDTH,
    anchor,
    size = 30,
    fill = CARD_TOKENS.inkFaint,
  }: {
    x?: number;
    y: number;
    width?: number;
    anchor?: "start" | "middle" | "end";
    size?: number;
    fill?: string;
  }
): string =>
  text(
    truncateToWidth(label.toUpperCase(), width, size, { weight: 700 }),
    { x, y, size, weight: 700, tracking: 3, fill, anchor }
  );

/**
 * An avatar, or the initial in a circle when there is none.
 *
 * The fallback is not optional politeness: `getUserAvatarUrl` returns null for
 * managers who never set a picture, and `embedImage` returns null whenever the
 * fetch fails, so the no-picture branch is a normal Tuesday rather than an edge
 * case.
 *
 * `ring` paints the manager's accent around it — the exact use F2 sanctions
 * ("the ring on their avatar"), and the one place a card can be colour-coded
 * to a person without asking colour to carry information it cannot.
 *
 * `id` must be unique within the card: two clip paths sharing an id means the
 * second avatar is clipped to the first one's circle.
 */
export const avatar = ({
  id,
  person,
  cx,
  cy,
  r,
  ring,
}: {
  id: string;
  person: CardPerson;
  cx: number;
  cy: number;
  r: number;
  ring?: string;
}): string => {
  const clip = circleClip(`av-${id}`, cx, cy, r);
  const initial = [...person.name.trim()][0] ?? "?";
  const face = person.avatar
    ? [
        clip.def,
        image(person.avatar, {
          x: cx - r,
          y: cy - r,
          width: r * 2,
          height: r * 2,
          "clip-path": clip.ref,
        }),
      ]
    : [
        circle({ cx, cy, r, fill: CARD_TOKENS.surfaceSunk }),
        text(initial.toUpperCase(), {
          x: cx,
          y: cy,
          size: r,
          weight: 800,
          fill: CARD_TOKENS.inkFaint,
          anchor: "middle",
          baseline: "central",
        }),
      ];
  return group({}, [
    ...face,
    // Drawn last so it sits over the bitmap's edge rather than under it.
    ring
      ? circle({
          cx,
          cy,
          r: r + 4,
          fill: "none",
          stroke: ring,
          "stroke-width": 7,
        })
      : "",
  ]);
};

/**
 * A label-over-value block: the unit the manager-season card is built from.
 *
 * The value shrinks to fit its column rather than truncating, because a number
 * is the one thing on a card that must never be cut — "1,84…" is not a
 * smaller version of the fact, it is a different and wrong one.
 */
export const metric = (
  label: string,
  value: string,
  {
    x,
    y,
    width,
    size = 78,
    min = 40,
    fill = CARD_TOKENS.ink,
    anchor,
  }: {
    x: number;
    y: number;
    width: number;
    size?: number;
    min?: number;
    fill?: string;
    anchor?: "start" | "middle" | "end";
  }
): string => {
  const fitted = fitValue(value, width, size, min);
  return group({}, [
    eyebrow(label, { x, y: y - size - 8, width, size: 26, anchor }),
    text(truncateToWidth(value, width, fitted, { weight: 800 }), {
      x,
      y,
      size: fitted,
      weight: 800,
      fill,
      anchor,
      numeric: true,
      tracking: fitted > 90 ? -2 : 0,
    }),
  ]);
};

/**
 * `fitFontSize` with the weight every number on a card uses.
 *
 * A wrapper, not new arithmetic: it exists so the weight-800 assumption is
 * stated once. Passing the weight at a dozen call sites is how one of them ends
 * up at 400, under-estimates by 7%, and overflows on somebody else's machine.
 */
export const fitValue = (
  value: string,
  width: number,
  max: number,
  min = 40
): number => fitFontSize(value, width, max, { weight: 800, min });

/**
 * The sentence, and the caveat if there is one, as a single line.
 *
 * Inline rather than a separate marker so it cannot be cropped off, styled
 * away, or read as decoration. The same "· reconstructed" the site shows.
 */
export const noteLine = (
  note: CardNote,
  {
    x = CARD_PADDING,
    y,
    width = CONTENT_WIDTH,
    size = 30,
    fill = CARD_TOKENS.inkMuted,
    anchor,
  }: {
    x?: number;
    y: number;
    width?: number;
    size?: number;
    fill?: string;
    anchor?: "start" | "middle" | "end";
  }
): string => {
  // The caveat is reserved BEFORE the sentence is fitted, so a narrow column
  // cuts the sentence and never the qualifier. Truncating the joined string
  // was the first version, and on the draft card — whose note column is 778px
  // — it produced "The most points left on the bench in Chumbo history…",
  // dropping the one word the line was carrying. A test catches it now.
  const suffix = note.approximate ? ` · ${CAVEAT_SHORT}` : "";
  const reserved = suffix
    ? estimateTextWidth(suffix, size, 600) * METRIC_HEADROOM
    : 0;
  const sentence = truncateToWidth(note.text, width - reserved, size, {
    weight: 600,
  });
  return text(`${sentence}${suffix}`, {
    x,
    y,
    size,
    weight: 600,
    fill,
    anchor,
  });
};

/**
 * The caveat on its own line, in full, for a card with room for it.
 *
 * The record card gets this rather than the inline form: a card that announces
 * a league record on reconstructed data is precisely the one that must not be
 * able to be read as flat fact, so the caveat gets its own line and its own
 * marker instead of trailing a sentence.
 */
export const caveatLine = ({
  x = CARD_PADDING,
  y,
  width = CONTENT_WIDTH,
  size = 26,
}: { x?: number; y: number; width?: number; size?: number }): string =>
  text(truncateToWidth(`⚠ ${CAVEAT_LONG}`, width, size, { weight: 700 }), {
    x,
    y,
    size,
    weight: 700,
    fill: CARD_TOKENS.inkMuted,
  });

/**
 * A pill.
 *
 * Sized from the text rather than fixed, because the things that go in one —
 * "CHAMPION", "SCUMBO", "SOL HAS WON THE LAST FOUR" — differ by a factor of
 * three in length. `anchor` says which edge `x` is: `"end"` for a badge pinned
 * to the top-right corner, `"middle"` for one centred on the card.
 */
export const pill = (
  label: string,
  {
    x,
    y,
    fill,
    size = 30,
    height = 54,
    anchor = "start",
    ink,
  }: {
    x: number;
    y: number;
    fill: string;
    size?: number;
    height?: number;
    anchor?: "start" | "middle" | "end";
    /** Override the automatic on-fill ink, for a pill on a neutral fill. */
    ink?: string;
  }
): string => {
  const natural = estimateTextWidth(label, size, 800) * METRIC_HEADROOM;
  const padding = height * 0.8;
  // The room comes first and the width is derived from IT, not the other way
  // round. Sizing the pill and then re-deriving the text's room by subtracting
  // the padding back off is the same number in arithmetic and a hair under it
  // in floating point, and `truncateToWidth` is a `<=` — so the first pill
  // this shipped with read "ZORRO HAS WON THE LAST FO…" inside a pill with
  // 35px of empty space either side of it.
  const room = Math.min(natural, CONTENT_WIDTH - padding);
  const width = room + padding;
  const body =
    natural <= room
      ? label
      : truncateToWidth(label, room, size, { weight: 800 });
  const left =
    anchor === "end" ? x - width : anchor === "middle" ? x - width / 2 : x;
  return group({}, [
    rect({ x: left, y, width, height, rx: height / 2, fill }),
    text(body, {
      x: left + width / 2,
      y: y + height / 2,
      size,
      weight: 800,
      tracking: 1,
      fill: ink ?? onAccent(fill),
      anchor: "middle",
      baseline: "central",
    }),
  ]);
};

/** A hairline divider across the content width. */
export const divider = (y: number, x = CARD_PADDING, width = CONTENT_WIDTH) =>
  rect({ x, y, width, height: 1, fill: CARD_TOKENS.line });

/**
 * The footer: crest, wordmark, address, and the fact's coordinates.
 *
 * `meta` is where the card says *when* — "2025 · WEEK 14", "ALL TIME". It sits
 * right-aligned and opposite the wordmark because that is the one piece of
 * information every one of the five cards has, and putting it in the same
 * place on all five means a reader knows where to look without reading.
 */
export const footer = ({
  meta,
  crest,
}: {
  meta?: string;
  crest?: string | null;
}): string => {
  const wordmarkX = CARD_PADDING + (crest ? 66 : 0);
  return group({}, [
    rect({
      x: 0,
      y: CONTENT_BOTTOM,
      width: CARD_WIDTH,
      height: FOOTER_HEIGHT,
      fill: CARD_TOKENS.surfaceSunk,
    }),
    divider(CONTENT_BOTTOM, 0, CARD_WIDTH),
    crest
      ? image(crest, {
          x: CARD_PADDING,
          y: CONTENT_BOTTOM + 16,
          width: 48,
          height: 56,
          // Meet, not slice: the crest is portrait 256x338 and cropping it to a
          // landscape box takes the top off the shield.
          preserveAspectRatio: "xMidYMid meet",
        })
      : "",
    text(SITE_NAME, {
      x: wordmarkX,
      y: CONTENT_BOTTOM + 40,
      size: 30,
      weight: 800,
      tracking: 2,
      fill: CARD_TOKENS.ink,
    }),
    text(SITE_URL, {
      x: wordmarkX,
      y: CONTENT_BOTTOM + 70,
      size: 22,
      weight: 600,
      fill: CARD_TOKENS.inkFaint,
    }),
    meta
      ? text(truncateToWidth(meta.toUpperCase(), 420, 28, { weight: 700 }), {
          x: CARD_WIDTH - CARD_PADDING,
          y: CONTENT_BOTTOM + FOOTER_HEIGHT / 2,
          size: 28,
          weight: 700,
          tracking: 2,
          fill: CARD_TOKENS.inkMuted,
          anchor: "end",
          baseline: "central",
          numeric: true,
        })
      : "",
  ]);
};

/**
 * "2025 · WEEK 14", or just "2025".
 *
 * A one-liner, but it is the string that appears on four of the five cards and
 * the em-dash-versus-middot decision should be made once.
 */
export const seasonMeta = (year: number, week?: number): string =>
  week === undefined ? `${year}` : `${year} · Week ${week}`;

/** A score, always to one decimal. Sleeper gives 147.62; the league says 147.6. */
export const formatScore = (points: number): string =>
  Number.isFinite(points) ? points.toFixed(1) : "—";

/**
 * A season points total, with thousands separated: "1,842.6".
 *
 * Grouped by hand rather than with `toLocaleString`, which follows the host's
 * locale — so the same fact would render "1,842.6" in the browser and
 * "1.842,6" in a German CI container building the OG images. A card and the
 * page it came from must not disagree about a number.
 */
export const formatPoints = (points: number): string => {
  if (!Number.isFinite(points)) return "—";
  const [whole, fraction] = points.toFixed(1).split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${fraction}`;
};

/**
 * A W–L(–T) record, with the tie column dropped when there are none.
 *
 * En dashes, not hyphens: at 130px a hyphen between two numbers reads as a
 * minus sign, and "14-10" at that size looks like arithmetic rather than a
 * record. The width table in `fonts.ts` carries the en dash for this reason.
 */
export const formatRecord = (
  wins: number,
  losses: number,
  ties = 0
): string =>
  ties ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;
