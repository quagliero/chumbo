import type { ReactNode } from "react";
import { useFormatter } from "use-intl";
import { Card } from "@/presentation/components/Card";
import { ScoreHeatmap } from "@/presentation/components/Chart/ScoreHeatmap/ScoreHeatmap";
import { getManagerAccent } from "@/domain/managerColors";
import type { DataMode, ManagerStats } from "@/utils/managerStats";
import { CareerTimeline } from "./CareerTimeline";
import { useCareerTimeline, type TimelineSeason } from "./useCareerTimeline";

/**
 * The manager page's summary tab (F3).
 *
 * It used to be eight stat cards in two grids — four across a four-column
 * track, then four across a five-column one. Two separate problems:
 *
 *   - The cards were equal-width but not equal-height, and "Scoring Crowns" is
 *     the only label of the eight that wraps. So that card grew a line, the row
 *     it was in sat crooked, and the numbers stopped lining up across the page.
 *     The fix is not a taller minimum height; it is that a count of trophies
 *     was never worth a whole card. They are chips on a shelf now, which cannot
 *     go ragged because they are text in a wrapping flow rather than cells in a
 *     grid.
 *   - Eight totals said nothing about when any of it happened. That is the
 *     timeline's job, and the heatmap's.
 *
 * Order is deliberate: the shelf (what they have won), the totals (how good
 * they have been), the timeline (when), the heatmap (how they score). Each one
 * is a smaller-grained view of the one above it.
 */

export const CareerSummary = ({
  stats,
  dataMode,
  seasonAction,
}: {
  stats: ManagerStats;
  dataMode: DataMode;
  /** A control at the end of each season's row — the season card's share. */
  seasonAction?: (season: TimelineSeason) => ReactNode;
}) => {
  const { number } = useFormatter();
  const timeline = useCareerTimeline(stats.managerId, stats.seasonStats);
  const accent = getManagerAccent(stats.managerId);

  const games = stats.totalWins + stats.totalLosses + stats.totalTies;
  const leagueGames = stats.leagueWins + stats.leagueLosses + stats.leagueTies;
  const pct = (part: number, whole: number) =>
    whole > 0
      ? `${number((part / whole) * 100, { maximumFractionDigits: 1 })}%`
      : "—";

  const seasonsPlayed = timeline.seasons.length;

  return (
    <div className="space-y-6">
      <Card>
        {/* ---- Trophy shelf ---------------------------------------------- */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          {timeline.titles > 0 ? (
            <>
              <span aria-hidden="true" className="text-2xl leading-none">
                {"🏆".repeat(Math.min(timeline.titles, 5))}
              </span>
              <span className="text-lg font-semibold text-ink">
                {timeline.titles} {timeline.titles === 1 ? "title" : "titles"}
              </span>
            </>
          ) : (
            <>
              <span
                aria-hidden="true"
                className="text-2xl leading-none opacity-20 grayscale"
              >
                🏆
              </span>
              <span className="text-lg text-ink-faint">No titles yet</span>
            </>
          )}
        </div>

        <ul className="mt-3 flex flex-wrap gap-x-4 gap-y-2 border-t border-line pt-3 text-sm text-ink-muted">
          <Honour
            icon="🥈"
            label="runner-up finish"
            value={timeline.finals - timeline.titles}
          />
          <Honour
            icon="🥉"
            label="third-place finish"
            value={timeline.podiums - timeline.finals}
          />
          <Honour icon="👑" label="scoring crown" value={timeline.scoringCrowns} />
          <Honour icon="🏈" label="playoff berth" value={timeline.playoffBerths} />
          <Honour
            icon="📅"
            label="season played"
            plural="seasons played"
            value={seasonsPlayed}
          />
        </ul>

        {/* ---- The totals -------------------------------------------------
            A wrapping flow of `label / value` pairs rather than a grid of
            cards. Nothing here can end up taller than its neighbour, because
            nothing here is a box. */}
        <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-3 border-t border-line pt-3">
          <Total
            label="Record"
            value={`${stats.totalWins}-${stats.totalLosses}${
              stats.totalTies > 0 ? `-${stats.totalTies}` : ""
            }`}
            note={`${pct(stats.totalWins, games)} of ${games} games`}
          />
          {/* Playing everybody every week is a regular-season idea; in
              playoffs-only mode these are structurally empty. */}
          {dataMode !== "playoffs" && (
            <Total
              label="vs the league"
              value={`${stats.leagueWins}-${stats.leagueLosses}`}
              note={`${pct(stats.leagueWins, leagueGames)} against the field`}
            />
          )}
          <Total
            label="Points for"
            value={number(stats.totalPointsFor, { maximumFractionDigits: 0 })}
            note={
              games > 0
                ? `${number(stats.totalPointsFor / games, {
                    maximumFractionDigits: 1,
                  })} a game`
                : "—"
            }
          />
          <Total
            label="Points against"
            value={number(stats.totalPointsAgainst, {
              maximumFractionDigits: 0,
            })}
            note={
              games > 0
                ? `${number(stats.totalPointsAgainst / games, {
                    maximumFractionDigits: 1,
                  })} a game`
                : "—"
            }
          />
          <Total
            label="Best finish"
            value={
              timeline.bestFinish === null
                ? "—"
                : ordinal(timeline.bestFinish)
            }
            note={timeline.bestFinish === null ? "no season finished" : "all-time"}
          />
        </dl>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Career</h2>
        <p className="mb-4 mt-0.5 text-xs text-ink-faint">
          Where they actually finished, from the playoff brackets — not the
          regular-season table. Tap a year for that season.
        </p>
        <CareerTimeline
          timeline={timeline}
          accent={accent}
          rowAction={seasonAction}
        />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Every week</h2>
        <p className="mb-4 mt-0.5 text-xs text-ink-faint">
          Every regular-season week they have played, one square each.
        </p>
        <ScoreHeatmap
          managerId={stats.managerId}
          managerName={stats.managerName}
        />
      </Card>
    </div>
  );
};

/**
 * One honour on the shelf. A zero is kept but faded — "never been runner-up" is
 * information, and the shelf should not change shape between managers.
 */
const Honour = ({
  icon,
  label,
  plural,
  value,
}: {
  icon: string;
  /** Singular. A zero takes the plural, which is what English does. */
  label: string;
  /** Only where adding an "s" is not the plural ("seasons played"). */
  plural?: string;
  value: number;
}) => (
  <li
    className={`flex items-center gap-1.5 whitespace-nowrap ${
      value === 0 ? "opacity-40" : ""
    }`}
  >
    <span aria-hidden="true">{icon}</span>
    <span className="font-numeric font-semibold tabular-nums text-ink">
      {value}
    </span>
    <span className="text-xs">{value === 1 ? label : plural ?? pluralise(label)}</span>
  </li>
);

/**
 * Enough English for five fixed labels: "finish" takes -es, "crown" and "berth"
 * take -s. Anything the rule does not cover passes its own plural instead.
 */
const pluralise = (word: string): string =>
  /(s|sh|ch|x|z)$/.test(word) ? `${word}es` : `${word}s`;

const Total = ({
  label,
  value,
  note,
}: {
  label: string;
  value: string;
  note: string;
}) => (
  <div className="whitespace-nowrap">
    <dt className="text-[11px] uppercase tracking-wide text-ink-faint">
      {label}
    </dt>
    <dd className="font-numeric text-xl font-semibold tabular-nums text-ink">
      {value}
    </dd>
    <dd className="text-xs text-ink-muted">{note}</dd>
  </div>
);

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

export default CareerSummary;
