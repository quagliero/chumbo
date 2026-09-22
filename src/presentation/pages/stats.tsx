import React, { lazy, Suspense, useState, useMemo } from "react";
import { NavLink, useParams } from "react-router-dom";
import ScrollableTabs from "@/presentation/components/ScrollableTabs/ScrollableTabs";
import {
  FilterBuilder,
  StatsResults,
} from "@/presentation/components/StatsExplorer";
import {
  calculatePositionalStats,
  getAvailableYears,
  PositionalFilter,
} from "@/utils/statsExplorer";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { Card } from "@/presentation/components/Card";

// Lazy, so the points explorer — the default tab — never downloads the draft
// analysis, or the matchups for every season that it needs.
const DraftExplorer = lazy(
  () => import("@/presentation/components/DraftExplorer/DraftExplorer")
);

const WeekByWeekExplorer = lazy(
  () => import("@/presentation/components/WeekByWeek/WeekByWeek")
);

const TABS = [
  { id: "points", label: "Points" },
  { id: "draft", label: "Draft" },
  { id: "weeks", label: "Weeks" },
] as const;

/**
 * The Explorer: tools with nothing in common but the word "explore", so each
 * has its own address — `/explorer/points` (the default, and what `/explorer`
 * has always been), `/explorer/draft` and `/explorer/weeks`.
 */
const Stats: React.FC = () => {
  const { section } = useParams<{ section?: string }>();
  const active = section === "draft" || section === "weeks" ? section : "points";

  return (
    <div className="space-y-6">
      <div className="container mx-auto pt-6">
        <h1 className="text-2xl font-bold text-ink">Explorer</h1>
      </div>
      <div className="border-b border-gray-200">
        <div className="container mx-auto">
          <ScrollableTabs className="gap-8">
            {TABS.map((tab) => (
              <NavLink
                key={tab.id}
                to={`/explorer/${tab.id}`}
                className={`py-2 px-1 font-medium transition-colors ${
                  active === tab.id
                    ? "border-b-2 border-blue-800 text-blue-800"
                    : "text-gray-500 hover:text-gray-700"
                }`}
              >
                {tab.label}
              </NavLink>
            ))}
          </ScrollableTabs>
        </div>
      </div>
      <div className="container mx-auto pb-6">
        {active === "draft" ? (
          <Suspense fallback={<div className="h-96" />}>
            <DraftExplorer />
          </Suspense>
        ) : active === "weeks" ? (
          <Suspense fallback={<div className="h-96" />}>
            <WeekByWeekExplorer />
          </Suspense>
        ) : (
          <PointsExplorer />
        )}
      </div>
    </div>
  );
};

/** Positional scoring against win rates: the filter builder. */
const PointsExplorer: React.FC = () => {
  // A2a: the explorer walks every season's matchups, a lazy chunk now.
  useAllSeasons();
  const [filters, setFilters] = useState<PositionalFilter[]>([]);
  const [selectedYears, setSelectedYears] = useState<number[]>(
    getAvailableYears()
  );
  const [includePlayoffs, setIncludePlayoffs] = useState<boolean>(false);
  const [selectedManagerId, setSelectedManagerId] = useState<
    string | undefined
  >(undefined);

  // Calculate stats whenever filters or options change
  const results = useMemo(() => {
    if (filters.length === 0) return null;
    return calculatePositionalStats(
      filters,
      selectedYears,
      includePlayoffs,
      selectedManagerId
    );
  }, [filters, selectedYears, includePlayoffs, selectedManagerId]);

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
    <div className="space-y-6">
      <p className="text-gray-600">
        Positional scoring against win rates. Add filters to analyse specific
        scenarios.
      </p>

      {/* Year Selection */}
      <Card>
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
      </Card>

      {/* Filter Builder */}
      <FilterBuilder
        filters={filters}
        onFiltersChange={setFilters}
        onPresetSelect={handlePresetSelect}
        selectedManagerId={selectedManagerId}
        onManagerChange={setSelectedManagerId}
      />

      {/* Results */}
      <StatsResults results={results} isLoading={false} />

      {/* Help Section */}
      <Card>
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
              <strong>RB_INDIVIDUAL/WR_INDIVIDUAL:</strong> Checks individual
              player scores. You can add multiple filters with different
              criteria - each checks independently against all players at that
              position.
            </li>
            <li>
              <strong>FLEX:</strong> Points from the FLEX slot only
            </li>
            <li>
              <strong>TEAM:</strong> Total team points scored (all positions
              combined)
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
              <strong>RB_INDIVIDUAL &gt;= 15:</strong> ✅ Matches (at least one
              RB scored 15+, e.g., the one with 20)
            </li>
            <li>
              <strong>RB_INDIVIDUAL &gt;= 25:</strong> ❌ No match (no single RB
              scored 25+)
            </li>
          </ul>
          <p className="mt-2">
            <strong>Multi-Faceted Individual Filters:</strong> You can add
            multiple filters for the same individual position type with
            different criteria. For example:
          </p>
          <ul className="list-disc list-inside ml-4 space-y-1">
            <li>
              <strong>RB_INDIVIDUAL &gt;= 20</strong> AND{" "}
              <strong>RB_INDIVIDUAL &lt;= 5:</strong> Finds matchups where at
              least one RB scored 20+ AND at least one RB scored 5 or less
            </li>
            <li>
              <strong>RB_INDIVIDUAL &gt;= 20 with at least 2 players:</strong>{" "}
              Finds matchups where at least 2 individual RBs scored 20+
            </li>
          </ul>
        </div>
      </Card>
    </div>
  );
};

export default Stats;
