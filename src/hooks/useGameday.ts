import { useEffect, useState } from "react";
import { getWeek, loadWeek, type WeekFile } from "@/data/gamedays";

/**
 * A week of the NFL (L1, L2) without suspending: `undefined` while it loads,
 * `null` for a week that has none, the file once it is here.
 *
 * Not Suspense on purpose. The stat lines and the chart decorate a score sheet
 * that is complete without them, so the page renders at once and they arrive
 * a moment later; a failed download leaves the page as it always was rather
 * than taking it down. The box scores and the timeline are one file, so the
 * two callers on a matchup page share one download.
 */
export const useWeek = (year: number, week: number): WeekFile | null | undefined => {
  const [file, setFile] = useState(() => getWeek(year, week));

  useEffect(() => {
    let live = true;
    const ready = getWeek(year, week);
    if (ready !== undefined) {
      setFile(ready);
      return;
    }
    setFile(undefined);
    loadWeek(year, week)
      .then((loaded) => live && setFile(loaded))
      .catch((error) => {
        console.warn("The week's box scores are unavailable:", error);
        if (live) setFile(null);
      });
    return () => {
      live = false;
    };
  }, [year, week]);

  return file;
};

/** The box scores (L1). */
export const useGameday = useWeek;
/** The scoring timelines (L2). */
export const useTimeline = useWeek;
