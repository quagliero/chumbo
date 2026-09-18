import { useEffect, useState } from "react";
import {
  getGameday,
  loadGameday,
  type GamedayFile,
} from "@/data/gamedays";

/**
 * A week's box scores (L1), without suspending: `undefined` while they load,
 * `null` for a week that has none, the file once it is here.
 *
 * Not Suspense on purpose. The stat lines decorate a score sheet that is
 * already complete without them, so the page renders at once and the lines
 * arrive a moment later; a failed download leaves the page as it always was
 * rather than taking it down.
 */
export const useGameday = (
  year: number,
  week: number
): GamedayFile | null | undefined => {
  const [file, setFile] = useState(() => getGameday(year, week));

  useEffect(() => {
    let live = true;
    const ready = getGameday(year, week);
    if (ready !== undefined) {
      setFile(ready);
      return;
    }
    setFile(undefined);
    loadGameday(year, week)
      .then((loaded) => live && setFile(loaded))
      .catch((error) => {
        console.warn("Box scores unavailable:", error);
        if (live) setFile(null);
      });
    return () => {
      live = false;
    };
  }, [year, week]);

  return file;
};
