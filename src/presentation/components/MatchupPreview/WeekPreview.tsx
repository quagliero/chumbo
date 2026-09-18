import { Link } from "react-router-dom";
import { cardClassName } from "@/presentation/components/Card";
import { stakesText, type MatchupPreview, type PreviewSide } from "@/utils/matchupPreview";
import { FormGuide, TeamAvatar } from "./parts";
import { recordOf, seriesText } from "./format";
import { useWeekPreviews } from "./usePreviews";

/**
 * The week still to be played (K1): one card per game, each linking to its
 * full preview. What each card leads with is what the group chat argues about
 * before a game — the series, the form, and what a result does to the season.
 */
export const WeekPreview = ({ year, week }: { year: number; week: number }) => {
  const previews = useWeekPreviews(year, week);
  const hasStakes = previews.some((p) => p.sides.some((side) => side.stakes));

  return (
    <section aria-labelledby={`preview-${year}-${week}`} className="space-y-4">
      <div>
        <h2 id={`preview-${year}-${week}`} className="text-lg font-semibold text-ink">
          Week {week} preview
        </h2>
        {hasStakes && (
          <p className="text-sm text-ink-muted">
            Playoff odds with a win and with a loss, from 10,000 simulations of
            the rest of the regular season.
          </p>
        )}
      </div>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {previews.map((preview) => (
          <PreviewCard key={preview.matchupId} preview={preview} />
        ))}
      </div>
    </section>
  );
};

const SideRow = ({ year, side }: { year: number; side: PreviewSide }) => (
  <div className="flex items-center gap-2">
    <TeamAvatar year={year} side={side} />
    <div className="min-w-0 flex-1">
      <div className="truncate font-medium text-ink">
        {side.name}{" "}
        <span className="text-xs font-normal text-ink-faint">({recordOf(side)})</span>
      </div>
      <FormGuide form={side.form} />
    </div>
    {side.stakes && (
      <div className="text-right text-xs leading-tight text-ink-muted">
        {stakesText(side.stakes)}
      </div>
    )}
  </div>
);

const PreviewCard = ({ preview }: { preview: MatchupPreview }) => {
  const [a, b] = preview.sides;
  const line = preview.h2h.streak ?? preview.onTheLine[0];
  return (
    <Link
      to={`/seasons/${preview.year}/matchups/${preview.week}/${preview.matchupId}`}
      className={cardClassName({ padding: "sm", interactive: true, className: "block" })}
    >
      <div className="space-y-2">
        <SideRow year={preview.year} side={a} />
        <SideRow year={preview.year} side={b} />
      </div>
      <div className="mt-3 border-t border-line pt-2 text-xs text-ink-muted">
        <div className="font-medium text-ink">{seriesText(a, b, preview.h2h)}</div>
        {line && <div className="mt-0.5">{line}</div>}
      </div>
    </Link>
  );
};
