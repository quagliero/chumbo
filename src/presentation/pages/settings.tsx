import {
  getLeagueRules,
  getCommonScoringSettings,
  formatScoringSetting,
  LeagueRules,
  getManualHistoricalChanges,
  getScoringChanges,
} from "../../utils/leagueRules";

const Settings = () => {
  const rules = getLeagueRules();
  const commonScoringSettings = getCommonScoringSettings(rules);
  const manualChanges = getManualHistoricalChanges();
  const scoringChanges = getScoringChanges(rules);

  const formatRosterPositions = (positions: string[]): string => {
    const counts: { [key: string]: number } = {};
    positions.forEach((pos) => {
      counts[pos] = (counts[pos] || 0) + 1;
    });

    return Object.entries(counts)
      .map(([pos, count]) => (count > 1 ? `${count} ${pos}` : pos))
      .join(", ");
  };

  const formatDraftType = (type: string): string => {
    return type.charAt(0).toUpperCase() + type.slice(1);
  };

  const formatPickTimer = (timer: number): string => {
    if (timer === 0) return "No time limit";
    const minutes = Math.floor(timer / 60);
    const seconds = timer % 60;
    if (minutes > 0) {
      return `${minutes}m ${seconds}s`;
    }
    return `${seconds}s`;
  };

  const getChangedFields = (
    currentRule: LeagueRules,
    previousRule: LeagueRules | null
  ) => {
    const changes: { [key: string]: { from: unknown; to: unknown } } = {};

    // Check league settings changes
    if (previousRule) {
      Object.entries(currentRule.settings).forEach(([key, value]) => {
        if (
          previousRule.settings[key as keyof typeof previousRule.settings] !==
          value
        ) {
          // Skip duplicate fields - numTeams and teams are the same
          if (key === "teams") return;

          changes[`settings.${key}`] = {
            from: previousRule.settings[
              key as keyof typeof previousRule.settings
            ],
            to: value,
          };
        }
      });

      // Check roster positions changes - compare sorted arrays, not formatted strings
      const currentPositions = [...currentRule.rosterPositions].sort();
      const previousPositions = [...previousRule.rosterPositions].sort();
      const currentPositionsStr = currentPositions.join(",");
      const previousPositionsStr = previousPositions.join(",");

      if (currentPositionsStr !== previousPositionsStr) {
        changes.rosterPositions = {
          from: formatRosterPositions(previousRule.rosterPositions),
          to: formatRosterPositions(currentRule.rosterPositions),
        };
      }

      // Check draft settings changes
      if (currentRule.draftSettings && previousRule.draftSettings) {
        Object.entries(currentRule.draftSettings).forEach(([key, value]) => {
          if (
            previousRule.draftSettings![
              key as keyof typeof previousRule.draftSettings
            ] !== value
          ) {
            // Skip duplicate fields - teams in draft settings is the same as numTeams in league settings
            if (key === "teams") return;

            changes[`draft.${key}`] = {
              from: previousRule.draftSettings![
                key as keyof typeof previousRule.draftSettings
              ],
              to: value,
            };
          }
        });
      } else if (currentRule.draftSettings && !previousRule.draftSettings) {
        // Draft settings were added
        changes.draftSettings = {
          from: "None",
          to: "Added",
        };
      } else if (!currentRule.draftSettings && previousRule.draftSettings) {
        // Draft settings were removed
        changes.draftSettings = {
          from: "Present",
          to: "Removed",
        };
      }
    }

    // Add manual changes for this year
    if (manualChanges[currentRule.year]) {
      Object.assign(changes, manualChanges[currentRule.year]);
    }

    // Add scoring changes for this year
    if (scoringChanges[currentRule.year]) {
      Object.assign(changes, scoringChanges[currentRule.year]);
    }

    return changes;
  };

  const formatChangeValue = (key: string, value: unknown): string => {
    if (key === "settings.tradeDeadline") {
      return (value as number) === 99 ? "None" : `Week ${value}`;
    }
    if (key === "settings.waiverType") {
      return value as string;
    }
    if (key === "settings.playoffSeedType") {
      return (value as number) === 0 ? "Bracket" : "Re-seed";
    }
    if (key === "draft.type") {
      return formatDraftType(value as string);
    }
    if (key === "draft.alphaSort") {
      return (value as boolean) ? "Yes" : "No";
    }
    if (key === "draft.pickTimer") {
      return formatPickTimer(value as number);
    }
    if (key === "rosterPositions") {
      return value as string;
    }
    if (key.startsWith("scoring.")) {
      const scoringKey = key.replace("scoring.", "");
      return formatScoringSetting(scoringKey, value as number);
    }
    return value?.toString() || "N/A";
  };

  return (
    <div className="max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-8">League Settings</h1>

      {/* Current League Settings */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-6">Current League Settings</h2>
        <div className="bg-white rounded-lg shadow-md p-6 border border-neutral-50">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div>
              <h3 className="text-lg font-medium mb-4">League Structure</h3>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="font-medium">Teams:</dt>
                  <dd>{rules[rules.length - 1]?.settings.numTeams}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">Playoff Teams:</dt>
                  <dd>{rules[rules.length - 1]?.settings.playoffTeams}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">Playoff Start:</dt>
                  <dd>
                    Week {rules[rules.length - 1]?.settings.playoffWeekStart}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">Playoff Seeding:</dt>
                  <dd>
                    {rules[rules.length - 1]?.settings.playoffSeedType === 0
                      ? "Bracket"
                      : "Re-seed"}
                  </dd>
                </div>
              </dl>
            </div>

            <div>
              <h3 className="text-lg font-medium mb-4">Roster Positions</h3>
              <p className="text-gray-700">
                {formatRosterPositions(
                  rules[rules.length - 1]?.rosterPositions || []
                )}
              </p>

              <h3 className="text-lg font-medium mb-4 mt-6">Waiver Settings</h3>
              <dl className="space-y-2">
                <div className="flex justify-between">
                  <dt className="font-medium">Type:</dt>
                  <dd>{rules[rules.length - 1]?.settings.waiverType}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">Budget:</dt>
                  <dd>${rules[rules.length - 1]?.settings.waiverBudget}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="font-medium">Trade Deadline:</dt>
                  <dd>
                    Week {rules[rules.length - 1]?.settings.tradeDeadline}
                  </dd>
                </div>
              </dl>
            </div>
          </div>

          {/* Draft Settings */}
          {rules[rules.length - 1]?.draftSettings && (
            <div className="mt-6 pt-6 border-t border-gray-200">
              <h3 className="text-lg font-medium mb-4">Draft Settings</h3>
              <h4 className="mb-4">
                Draft Order is calculated with a Monte Carlo sim that randomly
                sorts all draft attendees into a list 10,000 times, and this is
                then sorted by their average position in that list, with Scumbo
                being last, and any remaining teams being placed randomly
                between these.
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-gray-50 p-3 rounded">
                  <dt className="text-sm font-medium text-gray-600">Type</dt>
                  <dd className="text-sm">
                    {formatDraftType(
                      rules[rules.length - 1]!.draftSettings!.type
                    )}
                  </dd>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <dt className="text-sm font-medium text-gray-600">Rounds</dt>
                  <dd className="text-sm">
                    {rules[rules.length - 1]!.draftSettings!.rounds}
                  </dd>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <dt className="text-sm font-medium text-gray-600">
                    Pick Timer
                  </dt>
                  <dd className="text-sm">
                    {formatPickTimer(
                      rules[rules.length - 1]!.draftSettings!.pickTimer
                    )}
                  </dd>
                </div>
                <div className="bg-gray-50 p-3 rounded">
                  <dt className="text-sm font-medium text-gray-600">
                    Alphabetical Sort
                  </dt>
                  <dd className="text-sm">
                    {rules[rules.length - 1]!.draftSettings!.alphaSort
                      ? "Yes"
                      : "No"}
                  </dd>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Scoring Settings */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-6">Scoring Settings</h2>

        {/* Common Settings Across All Years */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h3 className="text-lg font-medium mb-4">Consistent Settings</h3>
          <p className="text-gray-600 mb-6">
            These scoring settings have been consistent across all years of the
            league.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(commonScoringSettings)
              .filter(([, value]) => value !== 0) // Only show non-zero values
              .map(([key, value]) => formatScoringSetting(key, value))
              .sort(([a], [b]) => a.localeCompare(b))
              .map((value) => (
                <div key={value} className="bg-gray-50 p-3 rounded">
                  <span className="text-sm font-medium">{value}</span>
                </div>
              ))}
          </div>
        </div>

        {/* Current Year's Unique Settings */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h3 className="text-lg font-medium mb-4">Current Season Settings</h3>
          <p className="text-gray-600 mb-6">
            These scoring settings are specific to the current season and may
            differ from previous years.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(rules[rules.length - 1]?.scoringSettings || {})
              .filter(([key, value]) => {
                // Show settings that are not in common settings OR have different values
                const commonValue = commonScoringSettings[key];
                return commonValue === undefined || commonValue !== value;
              })
              .filter(([, value]) => value !== 0) // Only show non-zero values
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([key, value]) => (
                <div
                  key={key}
                  className="bg-blue-50 p-3 rounded border border-blue-200"
                >
                  <span className="text-sm font-medium">
                    {formatScoringSetting(key, value)}
                  </span>
                </div>
              ))}
          </div>
        </div>
      </section>

      {/* Historical Changes */}
      <section className="mb-12">
        <h2 className="text-2xl font-semibold mb-6">Historical Changes</h2>
        <div className="space-y-6">
          {rules.reverse().map((rule, index) => {
            const previousRule =
              index < rules.length - 1 ? rules[index + 1] : null;
            const changes = getChangedFields(rule, previousRule);

            // Only show years that have changes
            if (Object.keys(changes).length === 0) {
              return null;
            }

            return (
              <div
                key={rule.year}
                className="bg-white rounded-lg shadow-md p-6"
              >
                <h3 className="text-xl font-semibold mb-4">{rule.year}</h3>

                <div className="space-y-4">
                  {Object.entries(changes)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([key, change]) => {
                      const fieldName = key.includes(".")
                        ? key
                            .split(".")[1]
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (str) => str.toUpperCase())
                        : key
                            .replace(/([A-Z])/g, " $1")
                            .replace(/^./, (str) => str.toUpperCase());

                      return (
                        <div
                          key={key}
                          className="flex justify-between items-center py-2 border-b border-gray-100 last:border-b-0"
                        >
                          <dt className="font-medium text-gray-700">
                            {fieldName}:
                          </dt>
                          <dd className="text-sm text-right">
                            <span className="text-red-600 line-through mr-2">
                              {formatChangeValue(key, change.from)}
                            </span>
                            <span className="text-green-600 font-medium">
                              → {formatChangeValue(key, change.to)}
                            </span>
                          </dd>
                        </div>
                      );
                    })}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

export default Settings;
