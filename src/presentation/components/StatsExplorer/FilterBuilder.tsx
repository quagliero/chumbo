import React from "react";
import { PositionalFilter } from "@/utils/statsExplorer";
import managers from "@/data/managers.json";

interface FilterBuilderProps {
  filters: PositionalFilter[];
  onFiltersChange: (filters: PositionalFilter[]) => void;
  onPresetSelect: (presetName: string, filters: PositionalFilter[]) => void;
  selectedManagerId?: string;
  onManagerChange: (managerId: string | undefined) => void;
}

const POSITIONS: PositionalFilter["position"][] = [
  "QB",
  "RB",
  "RB_INDIVIDUAL",
  "WR",
  "WR_INDIVIDUAL",
  "TE",
  "K",
  "DEF",
  "FLEX",
];
const OPERATORS: PositionalFilter["operator"][] = [
  ">=",
  ">",
  "<=",
  "<",
  "=",
  "between",
];

const PRESET_FILTERS = {
  "QB 25+ Points": [
    { position: "QB" as const, operator: ">=" as const, points: 25 },
  ],
  "RB 20+ Points": [
    { position: "RB_INDIVIDUAL" as const, operator: ">=" as const, points: 20 },
  ],
  "QB 25+ AND RB 20+": [
    { position: "QB" as const, operator: ">=" as const, points: 25 },
    { position: "RB_INDIVIDUAL" as const, operator: ">=" as const, points: 20 },
  ],
  "All Starters 10+": [
    { position: "QB" as const, operator: ">=" as const, points: 10 },
    { position: "RB_INDIVIDUAL" as const, operator: ">=" as const, points: 10 },
    { position: "WR_INDIVIDUAL" as const, operator: ">=" as const, points: 10 },
    { position: "TE" as const, operator: ">=" as const, points: 10 },
    { position: "K" as const, operator: ">=" as const, points: 10 },
    { position: "DEF" as const, operator: ">=" as const, points: 10 },
  ],
};

const FilterBuilder: React.FC<FilterBuilderProps> = ({
  filters,
  onFiltersChange,
  onPresetSelect,
  selectedManagerId,
  onManagerChange,
}) => {
  const addFilter = () => {
    const newFilter: PositionalFilter = {
      position: "QB",
      operator: ">=",
      points: 0,
    };
    onFiltersChange([...filters, newFilter]);
  };

  const updateFilter = (
    index: number,
    field: keyof PositionalFilter,
    value: string | number
  ) => {
    const updatedFilters = [...filters];
    updatedFilters[index] = { ...updatedFilters[index], [field]: value };
    onFiltersChange(updatedFilters);
  };

  const removeFilter = (index: number) => {
    const updatedFilters = filters.filter((_, i) => i !== index);
    onFiltersChange(updatedFilters);
  };

  const clearAllFilters = () => {
    onFiltersChange([]);
  };

  return (
    <div className="bg-white rounded-lg shadow p-4 md:p-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
        <h2 className="text-xl font-bold text-gray-900">Filter Conditions</h2>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={addFilter}
            className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
          >
            Add Filter
          </button>
          {filters.length > 0 && (
            <button
              onClick={clearAllFilters}
              className="px-3 py-1 bg-gray-500 text-white text-sm rounded hover:bg-gray-600"
            >
              Clear All
            </button>
          )}
        </div>
      </div>

      {/* Manager Filter */}
      <div className="mb-6">
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Filter by Manager (Optional)
        </label>
        <select
          value={selectedManagerId || ""}
          onChange={(e) =>
            onManagerChange(e.target.value || undefined)
          }
          className="w-full sm:w-auto px-3 py-2 border border-gray-300 rounded text-sm"
        >
          <option value="">All Managers</option>
          {managers.map((manager) => (
            <option key={manager.id} value={manager.id}>
              {manager.teamName || manager.name}
            </option>
          ))}
        </select>
      </div>

      {/* Preset Filters */}
      <div className="mb-6">
        <h3 className="text-sm font-medium text-gray-700 mb-2">
          Quick Presets
        </h3>
        <div className="flex flex-wrap gap-2">
          {Object.entries(PRESET_FILTERS).map(([name, presetFilters]) => (
            <button
              key={name}
              onClick={() => onPresetSelect(name, presetFilters)}
              className="px-3 py-1 bg-gray-100 text-gray-700 text-sm rounded hover:bg-gray-200 border"
            >
              {name}
            </button>
          ))}
        </div>
      </div>

      {/* Active Filters */}
      {filters.length === 0 ? (
        <div className="text-gray-500 text-center py-8">
          <p>No filters applied. Add a filter to start exploring stats.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filters.map((filter, index) => {
            const isIndividualPosition =
              filter.position === "RB_INDIVIDUAL" ||
              filter.position === "WR_INDIVIDUAL";

            return (
              <div
                key={index}
                className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 p-3 bg-gray-50 rounded border"
              >
                <select
                  value={filter.position}
                  onChange={(e) =>
                    updateFilter(index, "position", e.target.value)
                  }
                  className="flex-1 sm:flex-none px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  {POSITIONS.map((pos) => (
                    <option key={pos} value={pos}>
                      {pos === "RB_INDIVIDUAL"
                        ? "Any RB (Individual)"
                        : pos === "WR_INDIVIDUAL"
                        ? "Any WR (Individual)"
                        : pos === "RB"
                        ? "RB Total"
                        : pos === "WR"
                        ? "WR Total"
                        : pos}
                    </option>
                  ))}
                </select>

                <select
                  value={filter.operator}
                  onChange={(e) => {
                    const newOperator = e.target.value as PositionalFilter["operator"];
                    updateFilter(index, "operator", newOperator);
                    // Clear maxPoints if switching away from "between"
                    if (newOperator !== "between" && filter.maxPoints !== undefined) {
                      const updatedFilters = [...filters];
                      const updatedFilter = { ...updatedFilters[index] };
                      delete updatedFilter.maxPoints;
                      updatedFilters[index] = updatedFilter;
                      onFiltersChange(updatedFilters);
                    }
                  }}
                  className="px-2 py-1 border border-gray-300 rounded text-sm"
                >
                  {OPERATORS.map((op) => (
                    <option key={op} value={op}>
                      {op === "between" ? "Between" : op}
                    </option>
                  ))}
                </select>

                {filter.operator === "between" ? (
                  <>
                    <input
                      type="number"
                      value={filter.points}
                      onChange={(e) =>
                        updateFilter(
                          index,
                          "points",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="px-2 py-1 border border-gray-300 rounded text-sm w-20"
                      min="0"
                      step="0.1"
                      placeholder="Min"
                    />
                    <span className="text-sm text-gray-600">and</span>
                    <input
                      type="number"
                      value={filter.maxPoints ?? filter.points}
                      onChange={(e) =>
                        updateFilter(
                          index,
                          "maxPoints",
                          parseFloat(e.target.value) || filter.points
                        )
                      }
                      className="px-2 py-1 border border-gray-300 rounded text-sm w-20"
                      min={filter.points}
                      step="0.1"
                      placeholder="Max"
                    />
                    <span className="text-sm text-gray-600">points</span>
                  </>
                ) : (
                  <>
                    <input
                      type="number"
                      value={filter.points}
                      onChange={(e) =>
                        updateFilter(
                          index,
                          "points",
                          parseFloat(e.target.value) || 0
                        )
                      }
                      className="px-2 py-1 border border-gray-300 rounded text-sm w-20"
                      min="0"
                      step="0.1"
                    />
                    <span className="text-sm text-gray-600">points</span>
                  </>
                )}

                {isIndividualPosition && (
                  <>
                    <span className="text-sm text-gray-600">with at least</span>
                    <input
                      type="number"
                      value={filter.minimumCount || 1}
                      onChange={(e) => {
                        const count = parseInt(e.target.value) || 1;
                        updateFilter(
                          index,
                          "minimumCount",
                          Math.max(1, count)
                        );
                      }}
                      className="px-2 py-1 border border-gray-300 rounded text-sm w-16"
                      min="1"
                    />
                    <span className="text-sm text-gray-600">player(s)</span>
                  </>
                )}

                <button
                  onClick={() => removeFilter(index)}
                  className="sm:ml-auto px-2 py-1 text-red-600 hover:bg-red-50 rounded text-sm"
                >
                  Remove
                </button>
              </div>
            );
          })}

          {/* Add Another Button */}
          <div className="mt-3">
            <button
              onClick={addFilter}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 w-full sm:w-auto"
            >
              Add Another Filter
            </button>
          </div>

          {/* Filter Logic Display */}
          <div className="mt-4 p-3 bg-blue-50 rounded border-l-4 border-blue-400">
            <p className="text-sm text-blue-800">
              <strong>Current Logic:</strong>{" "}
              {filters.length === 0
                ? "No conditions"
                : filters
                    .map((f) => {
                      const displayName =
                        f.position === "RB_INDIVIDUAL"
                          ? "Any RB (Individual)"
                          : f.position === "WR_INDIVIDUAL"
                          ? "Any WR (Individual)"
                          : f.position === "RB"
                          ? "RB Total"
                          : f.position === "WR"
                          ? "WR Total"
                          : f.position;
                      const countText =
                        f.minimumCount && f.minimumCount > 1
                          ? ` (at least ${f.minimumCount} players)`
                          : "";
                      const rangeText =
                        f.operator === "between"
                          ? ` between ${f.points} and ${f.maxPoints ?? f.points}`
                          : ` ${f.operator} ${f.points}`;
                      return `${displayName}${rangeText}${countText}`;
                    })
                    .join(" AND ")}
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default FilterBuilder;
