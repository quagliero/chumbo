import { useFormatter } from "use-intl";
import { SeasonLink } from "@/presentation/components/Links";
import { normalisedFinish } from "@/presentation/components/Chart/CareerSparkline/useCareerSparkline";
import { roundToTwoDecimals } from "@/utils/recordUtils";
import type { CareerTimeline as Timeline, TimelineSeason } from "./useCareerTimeline";

/**
 * The career timeline (F3).
 *
 * What was here was eight stat tiles — Overall Record, League Performance,
 * Points For, Points Against, then Championships, Finals, Scoring Crowns,
 * Playoffs — in two grids of four across a five-column track. "Scoring Crowns"
 * wrapped onto two lines, so that tile was taller than the three beside it and
 * the row sat crooked; the fifth column was always empty; and between them the
 * eight tiles said nothing about WHEN any of it happened. A manager with three
 * titles in 2013, 2014 and 2015 and nothing since read identically to one who
 * had won it three times in the last five years.
 *
 * So: one row per season, in order, with the trophies on the season that earned
 * them. The shape of a career is the thing this page is for, and it is now the
 * thing you see first.
 *
 * **The bar is the finishing position, normalised by the size of the field.**
 * The league was ten teams in 2012-13 and twelve since, so 8th is a worse
 * season in 2012 than in 2015; drawn at raw position they would be the same
 * length. `normalisedFinish` is the sparkline's (F1c) — same reasoning, same
 * function, so the two pictures of a career on this site cannot disagree.
 *
 * **The accent is the manager's, and that is allowed here** — exactly one
 * manager is on screen, which is the case F2 carves out for accent colour. The
 * bar's length carries the information; the colour is decoration, and a reader
 * who cannot see it loses nothing.
 */

export const CareerTimeline = ({
  timeline,
  accent,
}: {
  timeline: Timeline;
  accent: string;
}) => {
  const { number } = useFormatter();

  if (timeline.seasons.length === 0) {
    return <p className="text-sm text-ink-muted">No seasons played.</p>;
  }

  return (
    <ol className="space-y-0">
      {timeline.seasons.map((season, index) => (
        <li
          key={season.year}
          className="grid grid-cols-[2.75rem_0.75rem_1fr] items-stretch gap-x-2 sm:gap-x-3"
        >
          <div className="pt-1 text-right">
            <SeasonLink
              year={season.year}
              className="font-numeric text-sm font-semibold tabular-nums text-ink hover:underline"
            >
              {season.year}
            </SeasonLink>
          </div>

          {/* The rail. The line is drawn on the cell rather than on a single
              absolutely positioned element so it stretches with whatever the
              row's content turns out to be — two lines on a phone, one on a
              desktop — without either of them having to know the other's
              height. It stops at the last season rather than trailing off. */}
          <div className="relative flex justify-center">
            <span
              aria-hidden="true"
              className={`w-px bg-line ${
                index === timeline.seasons.length - 1 ? "h-3" : "h-full"
              }`}
            />
            <span
              aria-hidden="true"
              className="absolute top-2 h-2.5 w-2.5 rounded-full border-2 border-surface"
              style={{ backgroundColor: season.inProgress ? "#98a0b3" : accent }}
            />
          </div>

          <div className="pb-4">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
              <span className="text-sm font-semibold text-ink">
                {season.position === null
                  ? "No standings"
                  : `${ordinal(season.position)} of ${season.field}`}
              </span>
              {season.inProgress && (
                <span
                  className="rounded-full bg-surface-sunk px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-ink-muted"
                  title="The season is still being played, so this is where they stand rather than where they finished."
                >
                  so far
                </span>
              )}
              <span className="font-numeric text-sm tabular-nums text-ink-muted">
                {season.wins}-{season.losses}
                {season.ties > 0 ? `-${season.ties}` : ""}
              </span>
              {/* Rounded to Sleeper's own two decimals before being formatted
                  to whole points. The season totals arrive as a float sum —
                  1456.4999999999995 where the career total, summed in a
                  different order, is exactly 1456.5 — and without this the
                  same number reads 1456 here and 1457 in the card above. */}
              <span className="font-numeric text-xs tabular-nums text-ink-faint">
                {number(roundToTwoDecimals(season.pointsFor), {
                  maximumFractionDigits: 0,
                })}{" "}
                for ·{" "}
                {number(roundToTwoDecimals(season.pointsAgainst), {
                  maximumFractionDigits: 0,
                })}{" "}
                against
              </span>
              <Trophies season={season} />
            </div>

            <FinishBar season={season} accent={accent} />
          </div>
        </li>
      ))}
    </ol>
  );
};

/**
 * How far up the league they finished, as a bar. Full = champion, empty =
 * wooden spoon.
 *
 * An in-progress season is drawn hollow, because the number behind it is a
 * league table and not a result. A position the brackets never decided — the
 * bottom two of 2012 and 2013, which bracketed only eight of ten — is drawn
 * normally but says so on hover: it is a real finish, just one settled by the
 * table rather than by a game.
 */
const FinishBar = ({
  season,
  accent,
}: {
  season: TimelineSeason;
  accent: string;
}) => {
  if (season.position === null) return null;

  const share = normalisedFinish(season.position, season.field);
  const title = season.inProgress
    ? `${ordinal(season.position)} of ${season.field} with the season still in progress`
    : season.source === "record"
    ? `${ordinal(season.position)} of ${season.field}, settled by regular-season record — the playoff bracket did not reach them`
    : `${ordinal(season.position)} of ${season.field}`;

  return (
    <div
      className="mt-1.5 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-surface-sunk"
      title={title}
    >
      <div
        className="h-full rounded-full"
        style={{
          // A champion is 100% and the wooden spoon is 0%, which would be
          // invisible — floor it at a sliver so every season has a mark.
          width: `${Math.max(3, share * 100)}%`,
          backgroundColor: season.inProgress ? "#c6ccda" : accent,
        }}
      />
    </div>
  );
};

/**
 * The season's honours.
 *
 * Derived from the finishing position rather than from `championshipResult`, so
 * the trophy and the "2nd of 12" beside it can never disagree — they are the
 * same number read twice. Nothing is awarded for a season still being played.
 */
const Trophies = ({ season }: { season: TimelineSeason }) => {
  const honours: { icon: string; label: string }[] = [];

  if (!season.inProgress && season.position !== null) {
    if (season.position === 1) honours.push({ icon: "🏆", label: "Champion" });
    else if (season.position === 2)
      honours.push({ icon: "🥈", label: "Runner-up" });
    else if (season.position === 3)
      honours.push({ icon: "🥉", label: "Third place" });
  }
  if (season.scoringCrown)
    honours.push({ icon: "👑", label: "Scoring crown — most points in the league" });
  if (season.madePlayoffs && (season.position ?? 99) > 3)
    honours.push({ icon: "🏈", label: "Made the playoffs" });

  if (honours.length === 0) return null;

  return (
    <span className="flex items-center gap-1">
      {honours.map((honour) => (
        <span
          key={honour.icon}
          title={honour.label}
          aria-label={honour.label}
          role="img"
          className="text-sm leading-none"
        >
          {honour.icon}
        </span>
      ))}
    </span>
  );
};

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

export default CareerTimeline;
