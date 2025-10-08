import { useParams, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { NavLink } from "react-router-dom";
import AllTimeTable from "../components/AllTimeTable";
import AllTimeBreakdown from "../components/AllTimeBreakdown";
import TopScores from "../components/TopScores";
import AllTimeScheduleComparison from "../components/AllTimeScheduleComparison/AllTimeScheduleComparison";

type HomeTabType =
  | "standings"
  | "breakdown"
  | "top-scores"
  | "schedule-comparison";

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

      {/* Tab Navigation */}
      <div className="border-b border-gray-200">
        <div className="container mx-auto">
          <nav className="flex gap-8">
            {[
              "standings",
              "breakdown",
              "top-scores",
              "schedule-comparison",
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
                {tabName === "breakdown"
                  ? "Breakdown"
                  : tabName === "top-scores"
                  ? "Scores"
                  : tabName === "schedule-comparison"
                  ? "Schedule Comparison"
                  : "Standings"}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>

      {/* Content Area */}
      <div className="min-h-96">
        {activeTab === "standings" && <AllTimeTable />}
        {activeTab === "breakdown" && <AllTimeBreakdown />}
        {activeTab === "top-scores" && <TopScores />}
        {activeTab === "schedule-comparison" && (
          <AllTimeScheduleComparison key={view} />
        )}
      </div>
    </div>
  );
};

export default Home;
