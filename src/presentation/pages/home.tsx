import { useParams, useLocation } from "react-router-dom";
import { NavLink } from "react-router-dom";
import AllTimeTable from "../components/AllTimeTable";
import AllTimeBreakdown from "../components/AllTimeBreakdown";
import TopScores from "../components/TopScores";

type HomeTabType = "standings" | "breakdown" | "top-scores";

const Home = () => {
  const { tab } = useParams<{ tab: string }>();
  const location = useLocation();

  const activeTab = (tab as HomeTabType) || "standings";

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
            {["standings", "breakdown", "top-scores"].map((tabName) => (
              <NavLink
                key={tabName}
                to={`/${tabName}`}
                className={({ isActive }) => {
                  // Special handling for standings tab - it should be active on root path too
                  const isStandingsActive =
                    tabName === "standings" &&
                    (isActive || location.pathname === "/");
                  const isOtherTabActive = tabName !== "standings" && isActive;

                  return `py-2 px-1 font-medium capitalize transition-colors ${
                    isStandingsActive || isOtherTabActive
                      ? "border-b-2 border-blue-800 text-blue-800"
                      : "text-gray-500 hover:text-gray-700"
                  }`;
                }}
              >
                {tabName === "breakdown"
                  ? "Breakdown"
                  : tabName === "top-scores"
                  ? "Scores"
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
      </div>
    </div>
  );
};

export default Home;
