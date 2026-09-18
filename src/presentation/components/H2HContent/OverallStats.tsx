import { Link } from "react-router-dom";
import { useFormatter } from "use-intl";
import { Manager } from "@/types/manager";
import { Card } from "@/presentation/components/Card";
import { H2HData } from "./h2hData";

/**
 * Each side's wins, losses, ties and average score against the other, and
 * the current streak. Regular season only, as the playoff table says.
 */
const OverallStats = ({
  managerAData,
  managerBData,
  stats,
}: {
  managerAData: Manager;
  managerBData: Manager;
  stats: H2HData["stats"];
}) => {
  const { number } = useFormatter();

  return (
    <Card padding="none" className="mb-8">
      <div className="px-6 py-4 border-b border-gray-200">
        <h2 className="text-xl font-semibold text-gray-900">
          Overall Statistics
        </h2>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 divide-neutral-200 md:divide-x divide-y md:divide-y-0">
          {/* Manager A Stats */}
          <div className="text-center md:pb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              <Link
                to={`/managers/${managerAData?.id}`}
                className="text-blue-600 hover:text-blue-800 hover:underline"
              >
                {managerAData?.teamName}
              </Link>
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.managerAWins}
                </div>
                <div className="text-sm text-gray-600">Wins</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.managerBWins}
                </div>
                <div className="text-sm text-gray-600">Losses</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.ties}
                </div>
                <div className="text-sm text-gray-600">Ties</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {number(stats.managerAAvgPoints, {
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="text-sm text-gray-600">Avg Points</div>
              </div>
            </div>
          </div>

          {/* Manager B Stats */}
          <div className="text-center pt-4 md:pt-0 pb-4">
            <h3 className="text-lg font-semibold text-gray-900 mb-4">
              <Link
                to={`/managers/${managerBData?.id}`}
                className="text-purple-600 hover:text-purple-800 hover:underline"
              >
                {managerBData?.teamName}
              </Link>
            </h3>
            <div className="grid grid-cols-4 gap-4">
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.managerBWins}
                </div>
                <div className="text-sm text-gray-600">Wins</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.managerAWins}
                </div>
                <div className="text-sm text-gray-600">Losses</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {stats.ties}
                </div>
                <div className="text-sm text-gray-600">Ties</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-gray-900">
                  {number(stats.managerBAvgPoints, {
                    maximumFractionDigits: 2,
                  })}
                </div>
                <div className="text-sm text-gray-600">Avg Points</div>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-6 text-center">
          <div className="inline-flex items-center space-x-2">
            <span className="text-lg font-medium text-gray-900">
              Current Streak:
            </span>
            <span
              className={`px-3 py-1 rounded-full text-sm font-medium ${
                stats.currentStreak.manager === "A"
                  ? "bg-blue-100 text-blue-800"
                  : stats.currentStreak.manager === "B"
                  ? "bg-purple-100 text-purple-800"
                  : "bg-gray-100 text-gray-800"
              }`}
            >
              {stats.currentStreak.manager === "A"
                ? managerAData?.teamName
                : managerBData?.teamName}{" "}
              {stats.currentStreak.type}
              {stats.currentStreak.count}
            </span>
          </div>
        </div>
      </div>
    </Card>
  );
};

export default OverallStats;
