// Importing a stat module registers its stats. Each module owns its own file
// so several can be written in parallel without fighting over this list.
import "./matchupStats";
import "./lineupStats";
import "./draftStats";
import "./transactionStats";
import "./identityStats";
import "./gamedayStats";
import "./watchStat";

export {
  defineStat,
  allStats,
  getStat,
  computeStat,
  excludedSeasons,
  caveatSeasons,
} from "./registry";
export { getStatContext, provideTimelines } from "./traverse";
export type { TimelineSource } from "./traverse";
export type {
  FlowGame,
  Game,
  StatContext,
  StatDefinition,
  StatEntry,
  StatFormat,
  StatScope,
} from "./types";
