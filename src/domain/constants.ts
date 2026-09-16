export const YEARS = [
  2012, 2013, 2014, 2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023, 2024,
  2025, 2026,
] as const;

export const CURRENT_YEAR = YEARS[YEARS.length - 1];

/**
 * The single source of truth for which seasons exist. Derived from YEARS, so
 * adding a season is a one-line change here.
 */
export type ValidYear = (typeof YEARS)[number];

/** YEARS widened to plain numbers, for arithmetic and `.includes()` checks. */
export const YEAR_NUMBERS: readonly number[] = YEARS;
