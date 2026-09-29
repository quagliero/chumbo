import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ExtendedRoster } from "@/types/roster";
import { ExtendedMatchup } from "@/types/matchup";
import { ExtendedLeague } from "@/types/league";
import ScheduleLuck from "@/presentation/components/ScheduleLuck/ScheduleLuck";
import {
  useHasRemaining,
  type LuckView,
} from "@/presentation/components/ScheduleLuck/useScheduleLuck";
import ScheduleComparison from "@/presentation/components/ScheduleComparison/ScheduleComparison";
import Breakdown from "@/presentation/components/Breakdown/Breakdown";
import ScrollableTabs from "@/presentation/components/ScrollableTabs/ScrollableTabs";

/**
 * A season's Schedule tab: everything about who played whom, one view at a
 * time, each at `/seasons/:year/schedule/:view`.
 */

type ScheduleView = LuckView | "comparison" | "breakdown";

const DEFAULT_SCHEDULE_VIEW: ScheduleView = "luck";

const VIEWS: { id: ScheduleView; label: string }[] = [
  { id: "luck", label: "Luck" },
  { id: "playoffs", label: "Playoff luck" },
  { id: "weeks", label: "Week by week" },
  { id: "remaining", label: "Remaining" },
  { id: "comparison", label: "Comparison" },
  { id: "breakdown", label: "Breakdown" },
];

const isScheduleView = (view: string | undefined): view is ScheduleView =>
  VIEWS.some((v) => v.id === view);

interface ScheduleProps {
  year: number;
  view: string | undefined;
  rosters: ExtendedRoster[];
  matchups: Record<string, ExtendedMatchup[]> | undefined;
  league: ExtendedLeague | undefined;
  getTeamName: (ownerId: string) => string;
}

const Schedule = ({
  year,
  view,
  rosters,
  matchups,
  league,
  getTeamName,
}: ScheduleProps) => {
  const hasRemaining = useHasRemaining(year);
  const views = VIEWS.filter((v) => v.id !== "remaining" || hasRemaining);
  const active: ScheduleView =
    isScheduleView(view) && views.some((v) => v.id === view)
      ? view
      : DEFAULT_SCHEDULE_VIEW;

  // A view this season does not have (Remaining, once the regular season is
  // over) shows the default, and the address says so.
  const navigate = useNavigate();
  useEffect(() => {
    if (view && view !== active) {
      navigate(`/seasons/${year}/schedule/${active}`, { replace: true });
    }
  }, [view, active, year, navigate]);

  return (
    <div className="container mx-auto space-y-6">
      <ScrollableTabs className="gap-2" as="nav">
        {views.map((v) => (
          <Link
            key={v.id}
            to={`/seasons/${year}/schedule/${v.id}`}
            replace
            aria-current={active === v.id ? "page" : undefined}
            className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
              active === v.id
                ? "bg-blue-800 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            {v.label}
          </Link>
        ))}
      </ScrollableTabs>

      {active === "comparison" ? (
        <ScheduleComparison
          rosters={rosters}
          matchups={matchups}
          league={league}
          getTeamName={getTeamName}
        />
      ) : active === "breakdown" ? (
        <Breakdown
          rosters={rosters}
          matchups={matchups}
          league={league}
          getTeamName={getTeamName}
          currentYear={year}
        />
      ) : (
        <ScheduleLuck year={year} view={active} />
      )}
    </div>
  );
};

export default Schedule;
