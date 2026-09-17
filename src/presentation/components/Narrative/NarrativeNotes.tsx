import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  getPrecomputedStats,
  loadPrecomputedStats,
  type PrecomputedStats,
} from "@/utils/stats/precomputed";
import { narrate, type NarrativeSubject } from "@/utils/narrative/narrate";

/**
 * The sentences a page has earned (E7).
 *
 * Renders nothing at all when there is nothing notable, which is the whole
 * discipline: a rail that always says something trains people to stop reading
 * it, and the point of this is that when it speaks, it is worth pasting into
 * the group chat.
 *
 * Reads the precomputed file synchronously and does NOT suspend. A note is a
 * garnish — a matchup page must not wait on it, and a page that has not loaded
 * the file simply has no notes yet.
 */
/**
 * The precomputed file, fetched WITHOUT suspending.
 *
 * `usePrecomputedStats` throws the promise so a page waits for it, which is
 * right for a page built out of those stats and wrong for a note: a matchup
 * must not hold its own render on a garnish. So this kicks the same (deduped,
 * cached) fetch off and re-renders when it lands.
 *
 * Reading the cache alone was the first version, and it meant the notes never
 * appeared anywhere that had not already loaded the file for another reason —
 * absent rather than late, and silent either way. That is the same shape of bug
 * the crowns hit on the Hall of Fame page.
 */
const useNarrativeStats = (): PrecomputedStats | null => {
  const [stats, setStats] = useState(getPrecomputedStats);

  useEffect(() => {
    if (stats) return;
    let live = true;
    loadPrecomputedStats()
      .then((loaded) => {
        if (live) setStats(loaded);
      })
      .catch((error) => {
        // A missing file means no notes, not a broken page — but say so, or a
        // bad deploy looks like a league with nothing notable in it.
        console.warn("Narrative notes unavailable:", error);
      });
    return () => {
      live = false;
    };
  }, [stats]);

  return stats;
};

export const NarrativeNotes = ({
  subject,
  limit = 3,
  className,
}: {
  subject: NarrativeSubject;
  limit?: number;
  className?: string;
}) => {
  const stats = useNarrativeStats();
  const notes = narrate(stats, subject, { limit });
  if (!notes.length) return null;

  return (
    <ul className={`space-y-1.5 ${className ?? ""}`}>
      {notes.map((note) => (
        <li key={note.statId} className="flex items-baseline gap-2 text-sm text-ink">
          <span aria-hidden="true" className="text-ink-faint">★</span>
          <span>
            {note.href ? (
              <Link
                to={note.href}
                className="underline decoration-dotted underline-offset-2 hover:text-ink"
              >
                {note.text}
              </Link>
            ) : (
              note.text
            )}
            {note.rank > 1 && (
              <span className="text-ink-faint">
                {" "}
                ({note.rank} of {note.outOf})
              </span>
            )}
            {/* 2019's per-player data is a reconstruction. A caveated fact
                presented flat is worse than no fact. */}
            {note.approximate && (
              <span
                className="text-ink-faint"
                title="2019's per-player data is reconstructed, not recorded"
              >
                {" "}
                · reconstructed
              </span>
            )}
          </span>
        </li>
      ))}
    </ul>
  );
};
