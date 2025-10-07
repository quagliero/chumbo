/**
 * Position colors for fantasy football players
 */
export const POSITION_COLORS: Record<string, string> = {
  RB: "bg-green-100",
  WR: "bg-blue-100",
  QB: "bg-red-100",
  TE: "bg-orange-100",
  K: "bg-purple-100",
  DEF: "bg-amber-700/20",
} as const;

/**
 * Standard lineup requirements for fantasy football
 */
export const STANDARD_LINEUP_REQUIREMENTS = {
  QB: 1,
  RB: 2,
  WR: 2,
  TE: 1,
  K: 1,
  DEF: 1,
} as const;

/**
 * Tab types for the history page
 */
export type TabType =
  | "standings"
  | "matchups"
  | "playoffs"
  | "draft"
  | "schedule-comparison"
  | "breakdown";

/**
 * Valid years for the application
 */
export type ValidYear =
  | 2012
  | 2013
  | 2014
  | 2015
  | 2016
  | 2017
  | 2018
  | 2019
  | 2020
  | 2021
  | 2022
  | 2023
  | 2024
  | 2025;
