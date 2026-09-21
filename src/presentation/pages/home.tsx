import { useParams, useLocation } from "react-router-dom";
import { lazy, Suspense, useMemo } from "react";
import { NavLink } from "react-router-dom";
import AllTimeTable from "@/presentation/components/AllTimeTable";
import AllTimeBreakdown from "@/presentation/components/AllTimeBreakdown";
import TopScores from "@/presentation/components/TopScores";
import AllTimeScheduleComparison from "@/presentation/components/AllTimeScheduleComparison/AllTimeScheduleComparison";
import AllTimeTrades from "@/presentation/components/AllTimeTrades";
import ScrollableTabs from "@/presentation/components/ScrollableTabs/ScrollableTabs";
import { OnThisDay } from "@/presentation/components/OnThisDay";
import { RecordsWatch } from "@/presentation/components/RecordsWatch";

// D2 lives in the `charts` chunk (see vite.config.ts). Lazy so that landing on
// the standings tab -- which is most visits -- does not download the chart code
// to render a table.
const PowerRibbon = lazy(() =>
  import("@/presentation/components/Chart/PowerRibbon/PowerRibbon").then((m) => ({
    default: m.PowerRibbon,
  }))
);

// D7, same deal: the `charts` chunk, fetched only when this tab is opened.
const LuckChart = lazy(() =>
  import("@/presentation/components/Chart/LuckChart/LuckChart").then((m) => ({
    default: m.LuckChart,
  }))
);

// D4, same deal again — seventeen histograms are the last thing a visit to the
// standings should pay for.
const ScoreDistribution = lazy(() =>
  import(
    "@/presentation/components/Chart/ScoreDistribution/ScoreDistribution"
  ).then((m) => ({ default: m.ScoreDistribution }))
);

type HomeTabType =
  | "standings"
  | "careers"
  | "luck"
  | "spread"
  | "breakdown"
  | "top-scores"
  | "schedule-comparison"
  | "trades";

const Home = () => {
  const { tab, view } = useParams<{ tab: string; view?: string }>();
  const location = useLocation();

  // Determine active tab based on URL path
  const activeTab = useMemo(() => {
    if (location.pathname.startsWith("/schedule-comparison")) {
      return "schedule-comparison";
    }
    return (tab as HomeTabType) || "standings";
  }, [location.pathname, tab]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="container mx-auto">
        <h1 className="text-2xl font-bold">All Time League Stats</h1>
      </div>

      {/* E6. Above the tabs, not inside one: it is the same on every tab, and
          a cumulative-totals table is a poor first thing to meet. It carries
          its own Suspense and error boundary, so a missing all-time.json costs
          the module and not the page. */}
      <div className="container mx-auto space-y-4">
        <OnThisDay />
        {/* J3, under it: the archive reaching forward, then the live season
            reaching for the archive. Renders nothing when there is nothing
            on pace, which is most of the off-season. */}
        <RecordsWatch />
      </div>

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="container mx-auto">
          <ScrollableTabs className="gap-8">
            {[
              "standings",
              "careers",
              "luck",
              "spread",
              "breakdown",
              "top-scores",
              "schedule-comparison",
              "trades",
            ].map((tabName) => (
              <NavLink
                key={tabName}
                to={
                  tabName === "schedule-comparison"
                    ? "/schedule-comparison/league"
                    : `/${tabName}`
                }
                className={({ isActive }) => {
                  // Special handling for standings tab - it should be active on root path too
                  const isStandingsActive =
                    tabName === "standings" &&
                    (isActive || location.pathname === "/");

                  // Special handling for schedule-comparison tab
                  const isScheduleComparisonActive =
                    tabName === "schedule-comparison" &&
                    location.pathname.startsWith("/schedule-comparison");

                  const isOtherTabActive =
                    tabName !== "standings" &&
                    tabName !== "schedule-comparison" &&
                    isActive;

                  return `py-2 px-1 font-medium capitalize transition-colors ${
                    isStandingsActive ||
                    isScheduleComparisonActive ||
                    isOtherTabActive
                      ? "border-b-2 border-blue-800 text-blue-800"
                      : "text-gray-500 hover:text-gray-700"
                  }`;
                }}
              >
                {tabName === "careers"
                  ? "Careers"
                  : tabName === "luck"
                  ? "Luck"
                  : tabName === "spread"
                  ? "Spread"
                  : tabName === "breakdown"
                  ? "Breakdown"
                  : tabName === "top-scores"
                  ? "Scores"
                  : tabName === "schedule-comparison"
                  ? "Schedule Comparison"
                  : tabName === "trades"
                  ? "Trades"
                  : "Standings"}
              </NavLink>
            ))}
          </ScrollableTabs>
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-96">
        {activeTab === "standings" && <AllTimeTable />}
        {activeTab === "careers" && (
          <div className="container mx-auto">
            <h2 className="mb-1 text-lg font-semibold">Every career, one picture</h2>
            <p className="mb-4 text-sm text-ink-muted">
              Where each manager finished, season by season.
            </p>
            <Suspense fallback={<div className="h-64" />}>
              <PowerRibbon />
            </Suspense>
          </div>
        )}
        {activeTab === "luck" && (
          <div className="container mx-auto">
            <h2 className="mb-1 text-lg font-semibold">
              Who the schedule flattered
            </h2>
            <p className="mb-4 text-sm text-ink-muted">
              Wins you got against wins your scores deserved.
            </p>
            <Suspense fallback={<div className="h-64" />}>
              <LuckChart />
            </Suspense>
          </div>
        )}
        {activeTab === "spread" && (
          <div className="container mx-auto">
            <h2 className="mb-1 text-lg font-semibold">
              Metronomes and gamblers
            </h2>
            <p className="mb-4 text-sm text-ink-muted">
              Every week anyone has scored, one histogram per manager.
            </p>
            <Suspense fallback={<div className="h-64" />}>
              <ScoreDistribution />
            </Suspense>
          </div>
        )}
        {activeTab === "breakdown" && <AllTimeBreakdown />}
        {activeTab === "top-scores" && <TopScores />}
        {activeTab === "schedule-comparison" && (
          <AllTimeScheduleComparison key={view} />
        )}
        {activeTab === "trades" && <AllTimeTrades />}
      </div>
    </div>
  );
};

export default Home;
