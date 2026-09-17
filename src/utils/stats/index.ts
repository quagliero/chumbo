// Importing a stat module registers its stats. Each module owns its own file
// so several can be written in parallel without fighting over this list.
import "./matchupStats";
import "./lineupStats";
import "./draftStats";
import "./transactionStats";
import "./identityStats";

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
