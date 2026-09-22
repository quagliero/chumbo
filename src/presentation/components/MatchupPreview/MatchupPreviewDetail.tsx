import { Link } from "react-router-dom";
import { Breadcrumbs } from "@/presentation/components/Breadcrumbs";
import { cardClassName } from "@/presentation/components/Card";
import { ShareButton } from "@/presentation/components/ShareButton";
import { matchupPreviewShare } from "@/presentation/shareCards/factories";
import { formatOdds, formStreak, type PreviewSide } from "@/utils/matchupPreview";
import { FormGuide, TeamAvatar } from "./parts";
import { recordOf, seriesText } from "./format";
import { useWeekPreviews } from "./usePreviews";

/**
 * One game before it is played (K1), at the address it will have once it is:
 * `/seasons/:year/matchups/:week/:matchupId`. The link somebody shares on
 * Tuesday keeps working on Sunday night, when the same page becomes the
 * result.
 */
export const MatchupPreviewDetail = ({
  year,
  week,
  matchupId,
}: {
  year: number;
  week: number;
  matchupId: number;
}) => {
  const preview = useWeekPreviews(year, week).find((p) => p.matchupId === matchupId);
  if (!preview) return <div className="container mx-auto">Matchup not found</div>;

  const [a, b] = preview.sides;
  const last = preview.lastMeeting;

  return (
    <div className="container mx-auto space-y-6">
      <div className="flex flex-wrap items-center gap-3">
        <Breadcrumbs
          crumbs={[
            { label: "Seasons", to: "/seasons" },
            { label: String(year), to: `/seasons/${year}/standings` },
            { label: "Matchups", to: `/seasons/${year}/matchups` },
            { label: `Week ${week}`, to: `/seasons/${year}/matchups/${week}` },
            { label: `${a.name} vs ${b.name}` },
          ]}
        />
        <ShareButton
          what="preview card"
          className="ml-auto"
          card={matchupPreviewShare(year, week, matchupId)}
        />
      </div>

      <p className="text-sm font-semibold uppercase tracking-wide text-ink-faint">
        Week {week} preview · as it stood before kick-off
      </p>

      <div className="grid grid-cols-1 items-stretch gap-4 md:grid-cols-3">
        <SidePanel year={year} side={a} />
        <div className={cardClassName({ padding: "sm", className: "order-first flex flex-col items-center justify-center text-center md:order-none" })}>
          <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
            All time, regular season
          </div>
          <div className="mt-1 text-4xl font-extrabold tabular-nums text-ink">
            {preview.h2h.wins + preview.h2h.losses + preview.h2h.ties === 0
              ? "—"
              : `${preview.h2h.wins}–${preview.h2h.losses}${
                  preview.h2h.ties ? `–${preview.h2h.ties}` : ""
                }`}
          </div>
          <div className="mt-1 text-sm text-ink-muted">{seriesText(a, b, preview.h2h)}</div>
          {preview.h2h.streak && (
            <div className="mt-1 text-sm text-ink">{preview.h2h.streak}</div>
          )}
          <Link
            to={`/h2h/${a.managerId}/${b.managerId}`}
            className="mt-2 text-xs underline decoration-dotted underline-offset-2 text-ink-muted hover:text-ink"
          >
            Every game they have played
          </Link>
        </div>
        <SidePanel year={year} side={b} />
      </div>

      {(a.stakes || b.stakes) && (
        <section className={cardClassName({ padding: "sm" })}>
          <h2 className="mb-2 font-semibold text-ink">What is at stake</h2>
          <table className="w-full text-sm tabular-nums">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="py-1 font-semibold">Playoff odds</th>
                <th className="py-1 text-right font-semibold">Now</th>
                <th className="py-1 text-right font-semibold">With a win</th>
                <th className="py-1 text-right font-semibold">With a loss</th>
              </tr>
            </thead>
            <tbody>
              {[a, b].map((side) =>
                side.stakes ? (
                  <tr key={side.rosterId} className="border-t border-line">
                    <td className="py-1.5 font-medium text-ink">{side.name}</td>
                    <td className="py-1.5 text-right">{formatOdds(side.stakes.now)}</td>
                    <td className="py-1.5 text-right text-result-win">{formatOdds(side.stakes.ifWin)}</td>
                    <td className="py-1.5 text-right text-result-loss">{formatOdds(side.stakes.ifLose)}</td>
                  </tr>
                ) : null
              )}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-ink-faint">
            From 10,000 simulations of the rest of the regular season, each
            team scoring around its average so far.{" "}
            <Link
              to={`/seasons/${year}/playoff-odds`}
              className="underline decoration-dotted underline-offset-2"
            >
              Full playoff odds
            </Link>
          </p>
        </section>
      )}

      {preview.tidbits.length > 0 && (
        <section className={cardClassName({ padding: "sm" })}>
          <h2 className="mb-2 font-semibold text-ink">In the series</h2>
          <ul className="space-y-1.5 text-sm text-ink">
            {preview.tidbits.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="text-ink-faint">·</span>
                {line}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(preview.onTheLine.length > 0 || last) && (
        <section className={cardClassName({ padding: "sm" })}>
          <h2 className="mb-2 font-semibold text-ink">On the line</h2>
          <ul className="space-y-1.5 text-sm text-ink">
            {preview.onTheLine.map((line) => (
              <li key={line} className="flex gap-2">
                <span aria-hidden="true" className="text-ink-faint">★</span>
                {line}
              </li>
            ))}
            {last && (
              <li className="flex gap-2">
                <span aria-hidden="true" className="text-ink-faint">★</span>
                <span>
                  Last met in{" "}
                  <Link
                    to={last.href}
                    className="underline decoration-dotted underline-offset-2"
                  >
                    {last.year} week {last.week}
                    {last.playoffs ? " (playoffs)" : ""}
                  </Link>
                  :{" "}
                  {last.result === "T"
                    ? `tied at ${last.pointsA.toFixed(1)}`
                    : last.result === "W"
                      ? `${a.name} won ${last.pointsA.toFixed(1)}–${last.pointsB.toFixed(1)}`
                      : `${b.name} won ${last.pointsB.toFixed(1)}–${last.pointsA.toFixed(1)}`}
                </span>
              </li>
            )}
          </ul>
        </section>
      )}
    </div>
  );
};

const SidePanel = ({ year, side }: { year: number; side: PreviewSide }) => {
  const streak = formStreak(side.form);
  return (
    <div className={cardClassName({ padding: "sm" })}>
      <div className="flex items-center gap-3">
        <TeamAvatar year={year} side={side} size="w-12 h-12" />
        <div className="min-w-0">
          <h2 className="truncate text-xl font-bold text-ink">
            {side.managerId ? (
              <Link to={`/managers/${side.managerId}`} className="hover:underline">
                {side.name}
              </Link>
            ) : (
              side.name
            )}
          </h2>
          <div className="truncate text-xs text-ink-muted">{side.managerName}</div>
        </div>
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-y-1 text-sm">
        <dt className="text-ink-faint">This season</dt>
        <dd className="text-right tabular-nums text-ink">{recordOf(side)}</dd>
        <dt className="text-ink-faint">Points a game</dt>
        <dd className="text-right tabular-nums text-ink">
          {side.average ? side.average.toFixed(1) : "—"}
        </dd>
        <dt className="text-ink-faint">Form</dt>
        <dd className="text-right">
          <FormGuide form={side.form} />
        </dd>
      </dl>
      {streak && <p className="mt-2 text-xs text-ink-muted">Has {streak}.</p>}
    </div>
  );
};
