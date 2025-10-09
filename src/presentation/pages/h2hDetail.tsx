import { useParams, Link } from "react-router-dom";
import H2HContent from "../components/H2HContent/H2HContent";

export default function H2HDetail() {
  const { managerA, managerB } = useParams<{
    managerA: string;
    managerB: string;
  }>();

  if (!managerA || !managerB) {
    return (
      <div className="container mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Invalid Matchup
          </h1>
          <p className="text-gray-600">
            Please provide valid manager IDs for both managers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <Link
              to="/h2h"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              ← Go to H2H
            </Link>
          </div>
        </div>
      </div>

      <H2HContent managerA={managerA} managerB={managerB} />
    </div>
  );
}
