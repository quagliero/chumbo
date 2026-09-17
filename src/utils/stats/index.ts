// Importing a stat module registers its stats. Add new modules here.
import "./matchupStats";

export { defineStat, allStats, getStat, computeStat, excludedSeasons } from "./registry";
export { getStatContext } from "./traverse";
export type {
  Game,
  StatContext,
  StatDefinition,
  StatEntry,
  StatFormat,
  StatScope,
} from "./types";
