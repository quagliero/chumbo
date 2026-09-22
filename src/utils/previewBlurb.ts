import { getPlayer, seasons } from "@/data";
import { getSeasonCrowns } from "@/utils/crowns";
import { describeH2HStreak, getAllTimeH2HRecord } from "@/utils/h2h";
import { getOptimalLineup } from "@/utils/lineupAnalysis";
import { formatOdds, type MatchupPreview, type PreviewSide } from "@/utils/matchupPreview";
import {
  getPlayoffWeekStart,
  isMeaningfulPlayoffGame,
  isSeasonSettled,
} from "@/utils/playoffUtils";
import { seriesTidbits, type Tidbit } from "@/utils/previewTidbits";
import { tradesBetween } from "@/utils/stats/transactionStats";
import { getStatContext } from "@/utils/stats/traverse";
import type { Game } from "@/utils/stats/types";

/**
 * The week's previews as text for the group chat (K1), one blurb per game:
 * the series, the real playoff meetings, the three most notable other facts,
 * and what the game does to both sides' playoff odds.
 *
 * Built from the same `MatchupPreview` the site's cards are, so a blurb and
 * the card it is posted with cannot disagree. It reads trades, drafts and
 * benches across every season, which the site never loads for a preview — so
 * this runs in Node (`yarn preview-blurbs`, after `loadAllSeasons`), never in
 * the browser.
 *
 * The heading uses team names, to match the cards; the sentences use the
 * managers', which is how the chat talks.
 */

const COUNT_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten"];
const count = (n: number) => COUNT_WORDS[n] ?? String(n);
const ordinal = (n: number) => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};
const score = (high: number, low: number) => `${high.toFixed(2)}–${low.toFixed(2)}`;
const listed = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "nothing")
    : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;

interface Side {
  managerId: string;
  name: string;
  preview: PreviewSide;
}

/** Every game between the two, A's half, oldest first. */
const meetingsOf = (a: { managerId: string }, b: { managerId: string }) =>
  getStatContext()
    .games.filter((g) => g.managerId === a.managerId && g.opponentManagerId === b.managerId)
    .sort((x, y) => x.year - y.year || x.week - y.week);

/** The other half of a game. */
const opponentHalf = (game: Game) =>
  getStatContext().games.find(
    (g) => g.year === game.year && g.week === game.week && g.rosterId === game.opponentRosterId
  );

const championOf = (year: number): string | undefined =>
  isSeasonSettled(seasons[year])
    ? getSeasonCrowns(year).find((crown) => crown.champion)?.managerId
    : undefined;

/* ---------------------------------------------------------------- */

/** "jay leads 10–8 all time. htc has won the last five." */
const seriesLine = (a: Side, b: Side): string => {
  const record = getAllTimeH2HRecord(a.preview.ownerId, b.preview.ownerId);
  const [w, l] = [record.team1Wins, record.team2Wins];
  if (record.games.length === 0) return "Their first regular-season meeting.";
  const ties = record.ties ? `–${record.ties}` : "";
  let lead: string;
  if (w === l) lead = `Level at ${w}–${l}${ties} all time: the winner takes the lead.`;
  else {
    const [leader, trailer, high, low] = w > l ? [a, b, w, l] : [b, a, l, w];
    lead =
      high - low === 1
        ? `${leader.name} leads ${high}–${low}${ties}; a win for ${trailer.name} levels it at ${high}–${high}.`
        : `${leader.name} leads ${high}–${low}${ties} all time.`;
    const streak = describeH2HStreak(record.games, a.name, b.name);
    if (streak?.startsWith(`${leader.name} `) && high - low > 1) {
      return `${lead.slice(0, -1)}, and${streak.slice(leader.name.length).replace(" regular-season meetings", "")}.`;
    }
  }
  const streak = describeH2HStreak(record.games, a.name, b.name);
  return streak ? `${lead} ${streak.replace(" regular-season meetings", "")}.` : lead;
};

/**
 * Their real playoff games: eliminations and finals, never consolation games
 * (half the league has logged off by then) or the game for third.
 */
export const playoffMeetings = <S extends { managerId: string }>(a: S, b: S) =>
  meetingsOf(a, b).flatMap((game) => {
    const season = seasons[game.year];
    const start = getPlayoffWeekStart(season);
    if (!game.isPlayoff || !isMeaningfulPlayoffGame(game.raw, season, game.week, start)) {
      return [];
    }
    if (game.result === "tie") return [];
    const rounds = Math.max(...(season.winners_bracket ?? []).map((m) => m.r));
    const fromEnd = rounds - (game.week - start + 1);
    const [winner, loser] = game.result === "win" ? [a, b] : [b, a];
    return [
      {
        year: game.year,
        round: fromEnd === 0 ? "final" : fromEnd === 1 ? "semi" : "first round",
        winner,
        loser,
        margin: Math.abs(game.margin),
        score: score(Math.max(game.points, game.opponentPoints), Math.min(game.points, game.opponentPoints)),
        wonTitle: championOf(game.year) === winner.managerId,
      },
    ];
  });

const knockoutLine = (a: Side, b: Side): string | null => {
  const knockouts = playoffMeetings(a, b);
  if (knockouts.length === 0) return null;

  type Knockout = (typeof knockouts)[number];
  const clause = (k: Knockout) =>
    k.round === "final"
      ? `${k.winner.name} beat ${k.loser.name} in the ${k.year} final, ${k.score}`
      : `${k.winner.name} knocked ${k.loser.name} out in the ${k.year} ${k.round}${
          k.margin < 1 ? `, by ${k.margin.toFixed(2)}` : ""
        }${k.wonTitle ? `, and went on to win the title` : ""}`;

  if (knockouts.length <= 2) {
    // Names are lower case, and stay that way at the start of a sentence.
    return `${knockouts.map(clause).join("; ")}.`;
  }
  const wonByA = knockouts.filter((k) => k.winner === a).length;
  const wonByB = knockouts.length - wonByA;
  const tally =
    wonByA === wonByB
      ? `They've met ${count(knockouts.length)} times in the playoffs, and won ${count(wonByA)} each.`
      : `They've met ${count(knockouts.length)} times in the playoffs, and ${
          wonByA > wonByB ? a.name : b.name
        } has won ${count(Math.max(wonByA, wonByB))}.`;
  const notable =
    knockouts.find((k) => k.round === "final") ??
    [...knockouts].sort((x, y) => x.margin - y.margin)[0];
  return `${tally} ${
    notable.round === "final" ? "The final" : "The closest"
  }: ${clause(notable)}.`;
};

/* ---------------------------------------------------------------- */

/** This season so far, against the rest of the week's teams. */
const seasonFacts = (a: Side, b: Side, everyone: PreviewSide[]): Tidbit[] => {
  const played = (s: PreviewSide) => s.wins + s.losses + s.ties;
  if (played(a.preview) === 0) return [];
  const record = (s: PreviewSide) =>
    s.ties ? `${s.wins}–${s.losses}–${s.ties}` : `${s.wins}–${s.losses}`;
  const points = (s: PreviewSide) => s.average * played(s);
  const most = Math.max(...everyone.map(points));
  const fewest = Math.min(...everyone.map(points));
  const facts: Tidbit[] = [];

  if (a.preview.losses + a.preview.ties === 0 && b.preview.losses + b.preview.ties === 0) {
    facts.push({ text: `${record(a.preview)} v ${record(b.preview)}.`, weight: 1.5 });
  }
  if (a.preview.wins === 0 && b.preview.wins === 0) {
    facts.push({ text: "Both still looking for a first win.", weight: 1.3 });
  }
  for (const side of [a, b]) {
    const s = side.preview;
    if (points(s) === most) {
      facts.push(
        s.wins <= s.losses
          ? {
              text: `${side.name} has scored the most points in the league, ${points(s).toFixed(1)}, and is only ${record(s)}.`,
              weight: 1.4,
            }
          : { text: `${side.name} leads the league in points.`, weight: 0.8 }
      );
    }
    if (points(s) === fewest) {
      facts.push({
        text: `${side.name} is ${record(s)} with the fewest points in the league.`,
        weight: 1.0,
      });
    }
  }
  return facts;
};

/** The defending champion, said once. */
const championFact = (a: Side, b: Side, year: number): Tidbit[] => {
  const holder = championOf(year - 1);
  const side = [a, b].find((s) => s.managerId === holder);
  if (!side) return [];
  const s = side.preview;
  return [
    {
      text:
        s.wins === 0 && s.losses > 0
          ? `${side.name}, the defending champion, is ${s.wins}–${s.losses}.`
          : `${side.name} is the defending champion.`,
      weight: s.wins === 0 && s.losses > 0 ? 1.45 : 0.7,
    },
  ];
};

/** A bench that should have won it, or one that didn't matter. */
const benchFact = (a: Side, b: Side): Tidbit[] => {
  let best: Tidbit | null = null;
  for (const game of meetingsOf(a, b)) {
    if (!game.isRegularSeason || game.benchIncomplete || game.result === "tie") continue;
    const other = opponentHalf(game);
    if (!other) continue;
    for (const [side, half, won] of [
      [a, game, game.result === "win"],
      [b, other, game.result === "loss"],
    ] as const) {
      const left = getOptimalLineup(half.raw, game.year).pointsLeftOnBench;
      const margin = Math.abs(game.margin);
      const when = `week ${game.week} of ${game.year}`;
      const candidate: Tidbit | null =
        won && left >= 30
          ? {
              text: `In ${when} ${side.name} left ${left.toFixed(1)} on the bench and still won${
                margin < 5 ? `, by ${margin.toFixed(2)}` : ""
              }.`,
              weight: 0.5 + left / 60 + (margin < 5 ? 0.3 : 0),
            }
          : !won && left > margin && left >= 20
            ? {
                text: `${side.name} lost in ${when} by ${margin.toFixed(2)}, with ${left.toFixed(1)} on the bench.`,
                weight: 0.6 + (left - margin) / 40,
              }
            : null;
      if (candidate && (!best || candidate.weight > best.weight)) best = candidate;
    }
  }
  return best ? [best] : [];
};

/** How often, and how recently, these two have done business. */
const tradeFact = (a: Side, b: Side, year: number, meetings: number): Tidbit[] => {
  const trades = tradesBetween(getStatContext(), a.managerId, b.managerId);
  const latest = trades[trades.length - 1];
  const deal = (t: NonNullable<typeof latest>) => {
    const [gotA, gotB] = [t.got[a.managerId], t.got[b.managerId]];
    // Picks only, all one draft: "a swap of 2026 picks, thd getting rounds 6 and 10".
    const rounds = (items: string[]) =>
      items.map((item) => item.match(/^(\d{4}) round (\d+)$/)).filter((m) => m !== null);
    const [roundsA, roundsB] = [rounds(gotA), rounds(gotB)];
    const drafts = new Set([...roundsA, ...roundsB].map((m) => m[1]));
    if (roundsA.length === gotA.length && roundsB.length === gotB.length && drafts.size === 1) {
      const which = (ms: RegExpMatchArray[]) =>
        listed(ms.map((m) => Number(m[2])).sort((x, y) => x - y).map(String));
      return `a swap of ${[...drafts][0]} picks, ${a.name} getting rounds ${which(roundsA)} and ${b.name} ${which(roundsB)}`;
    }
    return `${a.name} got ${listed(gotA.slice(0, 3))}, ${b.name} got ${listed(gotB.slice(0, 3))}`;
  };
  if (trades.length === 0) {
    return meetings >= 8 ? [{ text: "These two have never made a trade.", weight: 1.0 }] : [];
  }
  if (trades.length === 1) {
    return [
      {
        text: `One trade in all that time, in ${latest.year}: ${deal(latest)}.`,
        weight: latest.year >= year - 1 ? 1.1 : 0.9,
      },
    ];
  }
  if (latest.year >= year - 1) {
    return [
      {
        text: `${trades.length} trades between them, the latest in ${latest.year}: ${deal(latest)}.`,
        weight: 1.1,
      },
    ];
  }
  return trades.length >= 10
    ? [{ text: `${trades.length} trades between them, more than almost any pair in the league.`, weight: 0.8 }]
    : [];
};

/** The best single game by a starter in the series, and what the player cost. */
const bestGameFact = (a: Side, b: Side): Tidbit[] => {
  let best: { points: number; playerId: string; game: Game; side: Side } | null = null;
  for (const game of meetingsOf(a, b)) {
    if (!game.isRegularSeason) continue;
    const other = opponentHalf(game);
    for (const [side, half] of [
      [a, game],
      [b, other],
    ] as const) {
      half?.starters.forEach((playerId, i) => {
        const points = half.startersPoints[i] ?? 0;
        if (playerId && playerId !== "0" && (!best || points > best.points)) {
          best = { points, playerId, game: half, side };
        }
      });
    }
  }
  const top = best as { points: number; playerId: string; game: Game; side: Side } | null;
  if (!top || top.points < 30) return [];
  const player = getPlayer(top.playerId, top.game.year);
  const name = player?.full_name ?? top.playerId;
  const pick = seasons[top.game.year]?.picks?.find((p) => String(p.player_id) === top.playerId);
  const cost = !pick
    ? "undrafted that year"
    : pick.roster_id === top.game.rosterId
      ? `a ${ordinal(pick.round)}-round pick`
      : `drafted by someone else in round ${pick.round}`;
  return [
    {
      text: `Best game in the series: ${name}'s ${top.points.toFixed(1)} for ${top.side.name} in ${top.game.year}, ${cost}.`,
      weight: 0.5 + (top.points - 30) / 20 + (!pick || pick.round >= 8 ? 0.3 : 0),
    },
  ];
};

/* ---------------------------------------------------------------- */

const oddsLine = (a: Side, b: Side): string | null => {
  const part = (s: Side) =>
    s.preview.stakes
      ? `${s.name} ${formatOdds(s.preview.stakes.ifWin)} with a win, ${formatOdds(
          s.preview.stakes.ifLose
        )} with a loss`
      : null;
  const parts = [part(a), part(b)].filter(Boolean);
  return parts.length ? `Playoff odds: ${parts.join("; ")}.` : null;
};

/** How many facts go in after the series and the playoffs. */
export const BLURB_FACTS = 3;

/** Where this season stands leads the blurb when it made the cut. */
const SEASON = Symbol("season");
type Fact = Tidbit & { [SEASON]?: true };
const seasonal = (facts: Tidbit[]): Fact[] => facts.map((f) => ({ ...f, [SEASON]: true }));

export const previewBlurb = (preview: MatchupPreview, week: MatchupPreview[]): string => {
  const [pa, pb] = preview.sides;
  const side = (p: PreviewSide): Side => ({
    managerId: p.managerId ?? p.ownerId,
    name: p.managerName,
    preview: p,
  });
  const a = side(pa);
  const b = side(pb);
  const meetings = meetingsOf(a, b).filter((g) => g.isRegularSeason).length;

  const pool: Fact[] = [
    ...seasonal(seasonFacts(a, b, week.flatMap((p) => p.sides))),
    ...seasonal(championFact(a, b, preview.year)),
    // The site's own facts, in the managers' names; the best game is told
    // again below with what the player cost.
    ...seriesTidbits(
      { managerId: pa.managerId, ownerId: pa.ownerId, name: a.name },
      { managerId: pb.managerId, ownerId: pb.ownerId, name: b.name },
      preview.week
    ).filter((t) => !t.text.startsWith("Best game")),
    ...benchFact(a, b),
    ...tradeFact(a, b, preview.year, meetings),
    ...bestGameFact(a, b),
  ].sort((x, y) => y.weight - x.weight);

  const chosen = pool.slice(0, BLURB_FACTS);
  const body = [
    ...chosen.filter((f) => f[SEASON]).map((f) => f.text),
    seriesLine(a, b),
    knockoutLine(a, b),
    ...chosen.filter((f) => !f[SEASON]).map((f) => f.text),
  ]
    .filter(Boolean)
    .join(" ");
  const odds = oddsLine(a, b);
  return [`*${pa.teamName} (${a.name}) v ${pb.teamName} (${b.name})*`, body, odds]
    .filter(Boolean)
    .join("\n");
};

export const weekBlurbs = (previews: MatchupPreview[]): string =>
  previews.map((preview) => previewBlurb(preview, previews)).join("\n\n");
