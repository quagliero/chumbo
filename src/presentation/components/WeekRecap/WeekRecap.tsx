import { Fragment, useMemo } from "react";
import { Link } from "react-router-dom";
import { useDataLoaded } from "@/hooks/useSeasonData";
import { cardClassName } from "@/presentation/components/Card";
import { NarrativeNotes } from "@/presentation/components/Narrative";
import { useNarrativeStats } from "@/presentation/components/Narrative/useNarrativeStats";
import { ShareButton } from "@/presentation/components/ShareButton";
import { weekRecapShare } from "@/presentation/shareCards/factories";
import { narrate } from "@/utils/narrative/narrate";
import { buildWeekRecap, recapLines } from "@/utils/weekRecap";

/**
 * "Week N in the Chumbo" (J2), at the top of a played week's matchups.
 *
 * The lines come from `recapLines`, which also writes the share card and the
 * link preview, so the page, the picture and the preview say the same thing.
 * The all-time notes underneath are E7's, pinned to this week.
 */
export const WeekRecap = ({ year, week }: { year: number; week: number }) => {
  // The season, and the players for the benching line's optimal lineups.
  useDataLoaded({ years: [year], players: true });
  const recap = useMemo(() => buildWeekRecap(year, week), [year, week]);
  const stats = useNarrativeStats();
  if (!recap) return null;

  const lines = recapLines(recap);
  const [note] = narrate(stats, { year, week }, { limit: 1 });

  return (
    <section
      aria-labelledby={`recap-${year}-${week}`}
      className={cardClassName({ padding: "sm", className: "border border-line" })}
    >
      <div className="mb-3 flex items-center gap-3">
        <h2 id={`recap-${year}-${week}`} className="text-lg font-semibold text-ink">
          Week {week} in the Chumbo
        </h2>
        <ShareButton
          what="week card"
          className="ml-auto"
          card={weekRecapShare(
            year,
            week,
            note && { text: note.text, approximate: note.approximate }
          )}
        />
      </div>
      <dl className="grid grid-cols-1 gap-x-6 gap-y-1.5 text-sm sm:grid-cols-[max-content,1fr]">
        {lines.map((line, index) => (
          <Fragment key={`${line.label}-${index}`}>
            <dt className="pt-1 text-xs font-semibold uppercase tracking-wide text-ink-faint sm:pt-0.5">
              {line.label}
            </dt>
            <dd className="text-ink">
              {line.href ? (
                <Link
                  to={line.href}
                  className="underline decoration-dotted underline-offset-2 hover:text-ink-muted"
                >
                  {line.text}
                </Link>
              ) : (
                line.text
              )}
            </dd>
          </Fragment>
        ))}
      </dl>
      <NarrativeNotes subject={{ year, week }} className="mt-3 border-t border-line pt-3" />
    </section>
  );
};
