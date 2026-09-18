import { useState } from "react";
import { Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { cardClassName } from "@/presentation/components/Card";
import { CareerSparkline } from "@/presentation/components/Chart/CareerSparkline/CareerSparkline";
import type { CareerShape } from "@/presentation/components/Chart/CareerSparkline/useCareerSparkline";
import { getManagerAccent } from "@/domain/managerColors";
import type { DataMode, ManagerStats } from "@/utils/managerStats";

/**
 * One manager, one card (F1).
 *
 * What was here before was fourteen identical white rectangles holding a stack
 * of `Label: value` rows in the same grey, with the four things anybody
 * actually opens this page for — who has won it — as a row of emoji at the
 * bottom, after Points Avg. This inverts that: face, then trophies, then the
 * numbers, then the shape of the career.
 *
 * Three things are load-bearing and easy to undo by accident:
 *
 * **The card is a four-row subgrid** (F1d). The grid that holds these defines
 * the rows; each card spans four of them and contributes its sections to the
 * parent's tracks instead of its own. So the trophy shelf of every card in a
 * row starts at the same y, and so does every stat block and every sparkline —
 * which is the entire reason the grid is scannable. Before this, "Zaragoza's
 * Zooting Zorro" wrapped to two lines and pushed its own stats down out of
 * line with its neighbours'. The team name is also clamped to two lines, which
 * is belt and braces: it caps the damage in a browser without subgrid rather
 * than being the mechanism.
 *
 * **The accent is per-manager and that is allowed here** — exactly one manager
 * is on screen per card, which is the case F2 carves out. See
 * `managerColors.ts` for why a chart may not do the same thing.
 *
 * **No class name is built from a template string.** The accent reaches the
 * DOM as an inline CSS value, because Tailwind's purge only keeps classes it
 * can see as literals in the source.
 */

const TROPHIES_SHOWN = 5;

export const ManagerCard = ({
  stats,
  shape,
  years,
  avatarUrl,
  dataMode,
  rank,
  rankLabel,
  story,
}: {
  stats: ManagerStats;
  /** Their finishing positions, or undefined if they have never played. */
  shape?: CareerShape;
  /** The league's seasons, shared by every sparkline so the lines line up. */
  years: readonly number[];
  avatarUrl: string | null;
  dataMode: DataMode;
  /** Position in the current sort, 1-based. */
  rank: number;
  /** What the sort is by, so the rank badge can say what it means. */
  rankLabel: string;
  /** Their career in a line (F1e). See `managerStory.ts`. */
  story?: string | null;
}) => {
  const { number } = useFormatter();
  const accent = getManagerAccent(stats.managerId);

  const games = stats.totalWins + stats.totalLosses + stats.totalTies;
  const winPct = games > 0 ? (stats.totalWins / games) * 100 : 0;
  const pointsAvg = games > 0 ? stats.totalPointsFor / games : 0;

  const leagueGames = stats.leagueWins + stats.leagueLosses + stats.leagueTies;
  const leaguePct = leagueGames > 0 ? (stats.leagueWins / leagueGames) * 100 : 0;

  const pct = (value: number) =>
    `${number(value, { maximumFractionDigits: 1 })}%`;

  return (
    <Link
      to={`/managers/${stats.managerId}`}
      // `row-span-4` + `grid-rows-subgrid`: see the note above. The top border
      // is the manager's rule, so it is widened here and coloured inline.
      className={cardClassName({
        padding: "none",
        interactive: true,
        className:
          "row-span-4 grid grid-rows-subgrid border-t-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
      })}
      style={{ borderTopColor: accent }}
    >
      {/* ---- Identity ------------------------------------------------- */}
      <div className="flex items-start gap-3 px-4 pt-4 pb-3 sm:px-5">
        <Avatar
          url={avatarUrl}
          name={stats.managerName}
          teamName={stats.teamName}
          accent={accent}
        />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-ink">
            {stats.managerName}
          </h2>
          {/* Two lines maximum. "Zaragoza's Zooting Zorro" gets both of them. */}
          <p className="mt-0.5 line-clamp-2 text-sm leading-snug text-ink-muted">
            {stats.teamName}
          </p>
          {/* F1e. Inside the identity row, which the subgrid already sizes to
              the tallest card in the row, so a two-line story cannot knock
              the trophy shelves out of line. */}
          {story && (
            <p className="mt-1.5 text-xs leading-snug text-ink">{story}</p>
          )}
        </div>
        <span
          className="shrink-0 rounded-full bg-surface-sunk px-2 py-0.5 text-xs font-medium tabular-nums text-ink-muted"
          aria-label={`Number ${rank} by ${rankLabel}`}
        >
          #{rank}
        </span>
      </div>

      {/* ---- Trophy case (F1b) ---------------------------------------- */}
      <div className="border-y border-line bg-surface-sunk px-4 py-3 sm:px-5">
        <div className="flex min-h-[1.75rem] items-center gap-2">
          {stats.championships > 0 ? (
            <>
              <span aria-hidden="true" className="text-xl leading-none">
                {"🏆".repeat(Math.min(stats.championships, TROPHIES_SHOWN))}
              </span>
              <span className="text-sm font-semibold text-ink">
                {stats.championships}{" "}
                {stats.championships === 1 ? "title" : "titles"}
              </span>
            </>
          ) : (
            <>
              {/* Same height, deliberately: an empty shelf is still a shelf,
                  and collapsing it would misalign every card in the row. */}
              <span
                aria-hidden="true"
                className="text-xl leading-none opacity-20 grayscale"
              >
                🏆
              </span>
              <span className="text-sm text-ink-faint">No titles yet</span>
            </>
          )}
        </div>

        <dl className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-muted">
          <Honour icon="🥈" label="runner-up" value={stats.runnerUps} />
          <Honour icon="🥉" label="third" value={stats.thirdPlace} />
          <Honour icon="👑" label="scoring crown" value={stats.scoringCrowns} />
          <Honour icon="🏈" label="playoff berth" value={stats.playoffs} />
        </dl>
      </div>

      {/* ---- The numbers ---------------------------------------------- */}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 px-4 py-3 sm:grid-cols-3 sm:px-5">
        <Stat
          label="Record"
          value={`${stats.totalWins}-${stats.totalLosses}${
            stats.totalTies > 0 ? `-${stats.totalTies}` : ""
          }`}
        />
        <Stat label="Win %" value={pct(winPct)} />
        <Stat
          label="Points / gm"
          value={number(pointsAvg, { maximumFractionDigits: 1 })}
        />
        <Stat
          label="Points"
          value={number(stats.totalPointsFor, { maximumFractionDigits: 0 })}
        />
        {/* Playing everyone every week is a regular-season idea; in playoffs
            mode these are structurally zero, so they are dropped rather than
            shown as a row of noughts. Dropping them for every card at once
            keeps the row heights equal. */}
        {dataMode !== "playoffs" && (
          <>
            <Stat
              label="vs league"
              value={`${stats.leagueWins}-${stats.leagueLosses}`}
            />
            <Stat label="vs league %" value={pct(leaguePct)} />
          </>
        )}
      </dl>

      {/* ---- Career shape (F1c) --------------------------------------- */}
      <div className="px-4 pb-4 sm:px-5">
        <div className="flex items-baseline justify-between text-[11px] text-ink-faint">
          <span aria-hidden="true">{`'${String(years[0]).slice(2)}`}</span>
          <span className="truncate px-2 text-center">
            {shape ? careerCaption(shape) : "No seasons played"}
          </span>
          <span aria-hidden="true">{`'${String(
            years[years.length - 1]
          ).slice(2)}`}</span>
        </div>
        {shape ? (
          <CareerSparkline shape={shape} years={years} />
        ) : (
          // Same box, so a manager with no seasons does not shorten their card.
          <div className="h-10" />
        )}
      </div>
    </Link>
  );
};

/**
 * The manager's picture, ringed in their accent.
 *
 * Sleeper's CDN 404s from time to time and the NFL.com URLs the pre-2020
 * managers carry are a decade old, so a broken image falls back to a monogram
 * rather than to the browser's broken-image glyph.
 */
const Avatar = ({
  url,
  name,
  teamName,
  accent,
}: {
  url: string | null;
  name: string;
  teamName: string;
  accent: string;
}) => {
  const [failed, setFailed] = useState(false);

  return (
    <div
      className="shrink-0 rounded-full border-2 p-0.5"
      style={{ borderColor: accent }}
    >
      {url && !failed ? (
        <img
          src={url}
          alt={`${name}'s avatar`}
          loading="lazy"
          width={44}
          height={44}
          className="h-11 w-11 rounded-full bg-surface-sunk object-cover"
          onError={() => setFailed(true)}
        />
      ) : (
        <div
          className="flex h-11 w-11 items-center justify-center rounded-full text-base font-semibold text-white"
          style={{ backgroundColor: accent }}
          role="img"
          aria-label={`${name}'s avatar`}
        >
          {(teamName || name).charAt(0).toUpperCase()}
        </div>
      )}
    </div>
  );
};

/**
 * One honour on the shelf. A zero is kept but faded — "never been runner-up" is
 * information, and removing the entry would make the shelves different widths.
 */
const Honour = ({
  icon,
  label,
  value,
}: {
  icon: string;
  label: string;
  value: number;
}) => (
  <div className={`flex items-center gap-1 ${value === 0 ? "opacity-40" : ""}`}>
    <dt className="sr-only">{`${label}s`}</dt>
    <span aria-hidden="true">{icon}</span>
    <dd className="font-semibold tabular-nums text-ink">{value}</dd>
  </div>
);

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div className="min-w-0">
    <dt className="text-[11px] uppercase tracking-wide text-ink-faint">
      {label}
    </dt>
    <dd className="truncate text-sm font-semibold tabular-nums text-ink">
      {value}
    </dd>
  </div>
);

/** "15 seasons · best 1st · now 4th". The sparkline's caption, in words. */
const careerCaption = (shape: CareerShape): string => {
  if (!shape.latest) return "No seasons played";
  const parts = [
    `${shape.seasonsPlayed} ${shape.seasonsPlayed === 1 ? "season" : "seasons"}`,
  ];
  // `bestFinish` counts settled seasons only, so a manager leading a season
  // still being played does not get "no titles yet · best 1st" on one card.
  if (shape.bestFinish !== null) parts.push(`best ${ordinal(shape.bestFinish)}`);
  if (shape.latest.position !== shape.bestFinish) {
    parts.push(`now ${ordinal(shape.latest.position)}`);
  }
  return parts.join(" · ");
};

const ordinal = (n: number): string => {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};

export default ManagerCard;
