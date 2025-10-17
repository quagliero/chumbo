import React, { useState, useMemo } from "react";
import {
  FilterBuilder,
  StatsResults,
} from "@/presentation/components/StatsExplorer";
import {
  calculatePositionalStats,
  getAvailableYears,
  PositionalFilter,
} from "@/utils/statsExplorer";

const Stats: React.FC = () => {
  const [filters, setFilters] = useState<PositionalFilter[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>(
    getAvailableYears()
  );
  const [includePlayoffs, setIncludePlayoffs] = useState<boolean>(false);

  // Calculate stats whenever filters or options change
  const results = useMemo(() => {
    if (filters.length === 0) return null;
    return calculatePositionalStats(filters, selectedYears, includePlayoffs);
  }, [filters, selectedYears, includePlayoffs]);

  const handlePresetSelect = (
    _presetName: string,
    presetFilters: PositionalFilter[]
  ) => {
    setFilters(presetFilters);
  };

  const handleYearToggle = (year: number) => {
    setSelectedYears((prev) =>
      prev.includes(year)
        ? prev.filter((y) => y !== year)
        : [...prev, year].sort()
    );
  };

  const selectAllYears = () => {
    setSelectedYears(getAvailableYears());
  };

  const clearAllYears = () => {
    setSelectedYears([]);
  };

  const availableYears = getAvailableYears();

  return (
    <div className="container mx-auto space-y-6 py-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Stats Explorer
        </h1>
        <p className="text-gray-600">
          Explore correlations between positional scoring and win rates. Add
          filters to analyze specific scenarios.
        </p>
      </div>

      {/* Year Selection */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-bold text-gray-900">Season Selection</h2>
          <div className="flex gap-2">
            <button
              onClick={selectAllYears}
              className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
            >
              Select All
            </button>
            <button
              onClick={clearAllYears}
              className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
            >
              Clear All
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2 mb-4">
          {availableYears.map((year) => (
            <label
              key={year}
              className="flex items-center space-x-2 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selectedYears.includes(year)}
                onChange={() => handleYearToggle(year)}
                className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-gray-700">{year}</span>
            </label>
          ))}
        </div>

        <div className="flex items-center space-x-4">
          <label className="flex items-center space-x-2 cursor-pointer">
            <input
              type="checkbox"
              checked={includePlayoffs}
              onChange={(e) => setIncludePlayoffs(e.target.checked)}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <span className="text-sm text-gray-700">Include Playoff Games</span>
          </label>
          <span className="text-sm text-gray-500">
            {selectedYears.length} of {availableYears.length} seasons selected
          </span>
        </div>
      </div>

      {/* Filter Builder */}
      <FilterBuilder
        filters={filters}
        onFiltersChange={setFilters}
        onPresetSelect={handlePresetSelect}
      />

      {/* Results */}
      <StatsResults results={results} isLoading={false} />

      {/* Help Section */}
      <div className="bg-white rounded-lg shadow p-6">
        <h3 className="text-lg font-bold text-gray-900 mb-4">How to Use</h3>
        <div className="space-y-3 text-sm text-gray-600">
          <p>
            <strong>1. Select Seasons:</strong> Choose which years to include in
            your analysis. You can include or exclude playoff games separately.
          </p>
          <p>
            <strong>2. Add Filters:</strong> Create conditions based on
            positional scoring. For example, &quot;QB &gt;= 25&quot; will only
            analyze matchups where the starting QB scored 25+ points.
          </p>
          <p>
            <strong>3. Combine Conditions:</strong> Add multiple filters to
            create complex scenarios. All conditions must be met (AND logic).
          </p>
          <p>
            <strong>4. Analyze Results:</strong> View win percentages, sample
            matchups, and positional breakdowns for matchups that met your
            criteria.
          </p>
          <p>
            <strong>Position Types:</strong>
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>
              <strong>RB/WR:</strong> Total points from all RB/WR slots combined
              (including FLEX)
            </li>
            <li>
              <strong>RB_INDIVIDUAL/WR_INDIVIDUAL:</strong> Highest scoring
              single RB/WR player (regardless of slot)
            </li>
            <li>
              <strong>FLEX:</strong> Points from the FLEX slot only
            </li>
          </ul>
          <p className="mt-2">
            <strong>Example:</strong> If you have RBs scoring 12, 8, and 20
            points across RB1, RB2, and FLEX slots:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>
              <strong>RB &gt;= 30:</strong> ✅ Matches (12+8+20 = 40 total)
            </li>
            <li>
              <strong>RB_INDIVIDUAL &gt;= 15:</strong> ✅ Matches (highest
              single RB scored 20)
            </li>
            <li>
              <strong>RB_INDIVIDUAL &gt;= 25:</strong> ❌ No match (no single RB
              scored 25+)
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Stats;
