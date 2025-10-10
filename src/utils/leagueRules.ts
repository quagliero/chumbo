import { YEARS } from "@/domain/constants";
import { ExtendedLeague } from "@/types/league";

export interface DraftSettings {
  rounds: number;
  alphaSort: boolean;
  pickTimer: number;
  type: string;
  teams: number;
}

interface DraftData {
  settings?: {
    rounds?: number;
    alpha_sort?: number;
    pick_timer?: number;
    teams?: number;
  };
  type?: string;
}

export interface LeagueRules {
  year: number;
  name: string;
  settings: {
    numTeams: number;
    playoffTeams: number;
    playoffWeekStart: number;
    playoffSeedType: number;
    draftRounds: number;
    maxKeepers: number;
    waiverBudget: number;
    waiverType: string;
    tradeDeadline: number;
    vetoVotesNeeded: number;
  };
  rosterPositions: string[];
  scoringSettings: {
    [key: string]: number;
  };
  draftSettings?: DraftSettings;
}

export const getLeagueRules = (): LeagueRules[] => {
  const rules: LeagueRules[] = [];

  YEARS.forEach((year: number) => {
    try {
      // Use dynamic import with import.meta.glob
      const leagueData = import.meta.glob("../data/*/league.json", {
        eager: true,
      });
      const draftData = import.meta.glob("../data/*/draft.json", {
        eager: true,
      });
      const leagueKey = `../data/${year}/league.json`;
      const draftKey = `../data/${year}/draft.json`;

      if (leagueData[leagueKey]) {
        const data = (leagueData[leagueKey] as { default: ExtendedLeague })
          .default;

        let draftSettings: DraftSettings | undefined;
        if (draftData[draftKey]) {
          const draft = (draftData[draftKey] as { default: DraftData }).default;
          draftSettings = {
            rounds: draft.settings?.rounds || 15,
            alphaSort: draft.settings?.alpha_sort === 1,
            pickTimer: draft.settings?.pick_timer || 0,
            type: draft.type || "snake",
            teams: draft.settings?.teams || 12,
          };
        }

        rules.push({
          year,
          name: data.name || `The Chumbo ${year}`,
          settings: {
            numTeams: data.settings?.num_teams || 12,
            playoffTeams: data.settings?.playoff_teams || 6,
            playoffWeekStart: data.settings?.playoff_week_start || 15,
            playoffSeedType: data.settings?.playoff_seed_type || 0,
            draftRounds: data.settings?.draft_rounds || 3,
            maxKeepers: data.settings?.max_keepers || 1,
            waiverBudget: data.settings?.waiver_budget || 100,
            waiverType: getWaiverType(data.settings?.waiver_type),
            tradeDeadline: data.settings?.trade_deadline || 99,
            vetoVotesNeeded: 6, // Default value since it's not in the type
          },
          rosterPositions: data.roster_positions || [],
          scoringSettings: data.scoring_settings || {},
          draftSettings,
        });
      }
    } catch {
      console.warn(`Could not load league data for ${year}`);
    }
  });

  return rules.sort((a, b) => a.year - b.year);
};

export const getScoringChanges = (
  rules: LeagueRules[]
): { [year: number]: { [key: string]: { from: unknown; to: unknown } } } => {
  const scoringChanges: {
    [year: number]: { [key: string]: { from: unknown; to: unknown } };
  } = {};

  for (let i = 1; i < rules.length; i++) {
    const currentRule = rules[i];
    const previousRule = rules[i - 1];
    const nextRule = i < rules.length - 1 ? rules[i + 1] : null;
    const yearChanges: { [key: string]: { from: unknown; to: unknown } } = {};

    // Compare scoring settings
    const currentScoring = currentRule.scoringSettings;
    const previousScoring = previousRule.scoringSettings;

    // Get all unique scoring keys
    const allKeys = new Set([
      ...Object.keys(currentScoring),
      ...Object.keys(previousScoring),
    ]);

    allKeys.forEach((key) => {
      const currentValue = currentScoring[key];
      const previousValue = previousScoring[key];

      // If previous value was undefined, check if it's the same as next year
      if (previousValue === undefined && nextRule) {
        const nextValue = nextRule.scoringSettings[key];
        // If current and next are the same, skip this change (it's just a data gap)
        if (currentValue === nextValue) return;
      }

      // If this is the first year with a new field and it's 0/default, skip it
      if (previousValue === undefined && currentValue === 0) return;

      // Skip changes where current value is undefined (field was removed)
      if (currentValue === undefined) return;

      // Only show changes for non-zero values or when a value becomes zero
      if (
        currentValue !== previousValue &&
        (currentValue !== 0 || previousValue !== 0)
      ) {
        yearChanges[`scoring.${key}`] = {
          from: previousValue,
          to: currentValue,
        };
      }
    });

    if (Object.keys(yearChanges).length > 0) {
      scoringChanges[currentRule.year] = yearChanges;
    }
  }

  return scoringChanges;
};

const getWaiverType = (type?: number): string => {
  switch (type) {
    case 0:
      return "Standard";
    case 1:
      return "FAAB";
    case 2:
      return "FAAB with Continual Rolling List Tiebreaker";
    default:
      return "Standard";
  }
};

export const getManualHistoricalChanges = (): {
  [year: number]: { [key: string]: { from: unknown; to: unknown } };
} => {
  return {
    2014: {
      "manual.regularSeasonGames": {
        from: "14",
        to: "13",
      },
    },
    2015: {
      "manual.flexPosition": {
        from: "RB/WR",
        to: "RB/WR/TE",
      },
      "manual.draftOrder": {
        from: "Platform randomised default",
        to: "'Predict The Pick' NFL Draft competition",
      },
    },
    2019: {
      "manual.draftOrder": {
        from: "Predict The Pick' NFL Draft competition",
        to: "Assigned projected Top 30 NFL Draftee",
      },
    },
    2020: {
      "manual.draftOrder": {
        from: "Assigned projected Top 30 NFL Draftee",
        to: "Consolation Playoffs for #1, Scumbo last, randomised rest",
      },
    },
    2021: {
      "manual.regularSeasonGames": {
        from: "13",
        to: "14",
      },
    },
    2024: {
      "manual.draftOrder": {
        from: "Consolation Playoffs for #1, Scumbo last, randomised rest",
        to: "Draft attendees top, Scumbo last, randomised rest",
      },
    },
    2025: {
      "manual.draftOrder": {
        from: "Draft attendees top, Scumbo last, randomised rest",
        to: "Monte Carlo simulation (draft/non-draft attendees), Scumbo last",
      },
    },
    // Add more manual changes as needed
  };
};

export const getCommonScoringSettings = (
  rules: LeagueRules[]
): { [key: string]: number } => {
  if (rules.length === 0) return {};

  const allSettings = rules.map((rule) => rule.scoringSettings);
  const commonSettings: { [key: string]: number } = {};

  // Get all unique scoring keys
  const allKeys = new Set<string>();
  allSettings.forEach((settings) => {
    Object.keys(settings).forEach((key) => allKeys.add(key));
  });

  // Find settings that are consistent across all years
  allKeys.forEach((key) => {
    const values = allSettings
      .map((settings) => settings[key])
      .filter((val) => val !== undefined);
    if (
      values.length === allSettings.length &&
      values.every((val) => val === values[0])
    ) {
      commonSettings[key] = values[0];
    }
  });

  return commonSettings;
};

export const formatScoringSetting = (key: string, value: number): string => {
  const settingMap: { [key: string]: string } = {
    // Passing
    pass_yd: "Passing Yard",
    pass_td: "Passing Touchdown",
    pass_int: "Interception Thrown",
    pass_2pt: "2-Point Conversion Pass",

    // Rushing
    rush_yd: "Rushing Yard",
    rush_td: "Rushing Touchdown",
    rush_2pt: "2-Point Conversion Rush",

    // Receiving
    rec_yd: "Receiving Yard",
    rec_td: "Receiving Touchdown",
    rec_2pt: "2-Point Conversion Reception",

    // Kicking
    fgm_0_19: "Field Goal 0-19 Yards",
    fgm_20_29: "Field Goal 20-29 Yards",
    fgm_30_39: "Field Goal 30-39 Yards",
    fgm_40_49: "Field Goal 40-49 Yards",
    fgm_50p: "Field Goal 50+ Yards",
    xpm: "Extra Point Made",
    xpmiss: "Extra Point Missed",
    fgmiss_0_19: "Field Goal Missed 0-19 Yards",
    fgmiss_20_29: "Field Goal Missed 20-29 Yards",
    fgmiss_30_39: "Field Goal Missed 30-39 Yards",
    fgmiss_40_49: "Field Goal Missed 40-49 Yards",
    fgmiss_50p: "Field Goal Missed 50+ Yards",

    // Defense
    sack: "DST Sack",
    int: "DST Interception",
    ffr: "DST Fumble Recovery",
    ff: "DST Forced Fumble",
    fum_rec: "DST Fumble Recovery",
    def_td: "DST Defensive Touchdown",
    def_2pt: "DST 2-Point Conversion",
    safe: "DST Safety",
    blk_kick: "DST Blocked Kick",

    // Misc
    fum_lost: "Fumble Lost",

    // Special Teams
    def_st_ff: "DST Special Teams Forced Fumble",
    def_st_td: "DST Special Teams Touchdown",
    def_st_fum_rec: "DST Special Teams Fumble Recovery",
    st_td: "Player Special Teams Touchdown",
    st_fum_rec: "Player Special Teams Fumble Recovery",
    st_ff: "Player Special Teams Forced Fumble",

    // IDP
    idp_int: "Player Interception",
    idp_ff: "Player Forced Fumble",
    idp_fum_rec: "Player Fumble Recovery",
    idp_def_td: "Player Defensive Touchdown",

    // Points Allowed
    pts_allow: "Points per point allowed",
    pts_allow_0: "Points Allowed 0",
    pts_allow_1_6: "Points Allowed 1-6",
    pts_allow_7_13: "Points Allowed 7-13",
    pts_allow_14_20: "Points Allowed 14-20",
    pts_allow_21_27: "Points Allowed 21-27",
    pts_allow_28_34: "Points Allowed 28-34",
    pts_allow_35p: "Points Allowed 35+",
  };

  const displayName =
    settingMap[key] ||
    key.replace(/_/g, " ").replace(/\b\w/g, (l) => l.toUpperCase());
  const sign = value >= 0 ? "+" : "";
  return `${displayName}: ${sign}${value || 0}`;
};
