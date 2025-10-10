import { useMemo } from "react";
import { seasons } from "@/data";
import { ValidYear } from "@/constants/fantasy";

/**
 * Custom hook for getting season data
 * @param year - The year to get data for
 * @returns Season data or undefined if not found
 */
export const useSeasonData = (year: number) => {
  return useMemo(() => {
    return seasons[year as ValidYear];
  }, [year]);
};

/**
 * Custom hook for getting available years
 * @returns Array of available years sorted descending
 */
export const useAvailableYears = () => {
  return useMemo(() => {
    return Object.keys(seasons)
      .map((year) => Number(year))
      .sort((a, b) => b - a);
  }, []);
};

/**
 * Custom hook for getting the most recent season
 * @returns Most recent season data
 */
export const useMostRecentSeason = () => {
  return useMemo(() => {
    const years = Object.keys(seasons)
      .map(Number)
      .sort((a, b) => b - a);
    return seasons[years[0] as ValidYear];
  }, []);
};
