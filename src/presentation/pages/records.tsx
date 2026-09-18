import { useEffect } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { Breadcrumbs } from "@/presentation/components/Breadcrumbs";
import { cardClassName } from "@/presentation/components/Card";
import { usePrecomputedStats } from "@/hooks/usePrecomputedStats";
import {
  NOT_RECORDS,
  holderName,
  recordListHref,
} from "@/utils/narrative/narrate";
import {
  RECORD_VALUE_STATS,
  formatStatValue,
} from "@/utils/narrative/recordValue";
import type { PrecomputedStat } from "@/utils/stats/precomputed";
import type { StatScope } from "@/utils/stats/types";

/**
 * The records, as lists: `/records` for every one of them, and
 * `/records/:statId` for one, ranked.
 *
 * This is where a note's sentence goes when it is clicked. "The 3rd-biggest
 * margin of victory in Chumbo history" is a claim about a list, and the reader
 * who clicks it wants to see the list — the two above it, the ones below — not
 * the one game again. So each note links here at its own row (`#rank-3`),
 * highlighted, and each row links on to the game, manager or trade it is.
 *
 * It reads the precomputed file (19 kB) and nothing else: the top of every
 * list, as the build worked it out, which is the same file the notes come
 * from, so a note and its list cannot disagree about the rank.
 */
const Records = () => {
  const { statId } = useParams<{ statId?: string }>();
  const stats = usePrecomputedStats();
  const listed = stats.stats.filter((stat) => !NOT_RECORDS.has(stat.id));

  if (!statId) return <RecordIndex stats={listed} />;

  const stat = listed.find((s) => s.id === statId);
  if (!stat) {
    return (
      <div className="container mx-auto py-6">
        <p className="text-ink-muted">
          There is no record called “{statId}”.{" "}
          <Link to="/records" className="underline">
            See them all
          </Link>
          .
        </p>
      </div>
    );
  }
  return <RecordList stat={stat} />;
};

/**
 * Whether a stat's number means anything on its own. Some rank by something
 * only the detail can explain — an archetype's distance from the league
 * average, the week a title became certain — and "3" beside a name is worse
 * than no number. The same list decides which records a card can headline.
 */
const showsValue = (stat: PrecomputedStat) => RECORD_VALUE_STATS.has(stat.id);

const SCOPES: { scope: StatScope; title: string }[] = [
  { scope: "league", title: "Games, drafts and trades" },
  { scope: "manager", title: "Managers" },
  { scope: "season", title: "Seasons" },
  { scope: "player", title: "Players" },
];

const RecordIndex = ({ stats }: { stats: PrecomputedStat[] }) => (
  <div className="container mx-auto space-y-8 py-6">
    <div>
      <h1 className="text-3xl font-bold text-ink sm:text-4xl">Chumbo records</h1>
      <p className="mt-1 text-ink-muted">
        Every list the site keeps, and who is top of it.
      </p>
    </div>
    {SCOPES.map(({ scope, title }) => {
      const group = stats.filter((stat) => stat.scope === scope);
      if (!group.length) return null;
      return (
        <section key={scope}>
          <h2 className="mb-3 text-lg font-semibold text-ink">{title}</h2>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
            {group.map((stat) => {
              const [top] = stat.entries;
              return (
                <Link
                  key={stat.id}
                  to={recordListHref(stat.id)}
                  className={cardClassName({ padding: "sm", interactive: true, className: "block" })}
                >
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    {stat.label}
                  </div>
                  {top && (
                    <div className="mt-1 flex items-baseline gap-2">
                      {showsValue(stat) && (
                        <span className="text-2xl font-bold tabular-nums text-ink">
                          {formatStatValue(top.value, stat.format)}
                        </span>
                      )}
                      <span
                        className={`truncate text-ink ${
                          showsValue(stat) ? "text-sm" : "text-2xl font-bold"
                        }`}
                      >
                        {holderName(top.subject)}
                      </span>
                    </div>
                  )}
                  {top?.detail && (
                    <p className="mt-1 line-clamp-2 text-xs text-ink-muted">{top.detail}</p>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      );
    })}
  </div>
);

const RecordList = ({ stat }: { stat: PrecomputedStat }) => {
  const { hash } = useLocation();
  const highlighted = Number(/^#rank-(\d+)$/.exec(hash)?.[1] ?? 0);

  // A note links to its row. The page renders the whole list, so bring the
  // row into view once it exists.
  useEffect(() => {
    if (!highlighted) return;
    document
      .getElementById(`rank-${highlighted}`)
      ?.scrollIntoView({ block: "center" });
  }, [highlighted, stat.id]);

  return (
    <div className="container mx-auto space-y-4 py-6">
      <Breadcrumbs
        crumbs={[{ label: "Records", to: "/records" }, { label: stat.label }]}
      />
      <div>
        <h1 className="text-2xl font-bold text-ink sm:text-3xl">{stat.label}</h1>
        <p className="mt-1 max-w-3xl text-ink-muted">{stat.description}</p>
        {stat.excluded.length > 0 && (
          <p className="mt-1 text-sm text-ink-faint">
            {stat.excluded.join(", ")} left out: that season's lineups are
            reconstructed, not recorded.
          </p>
        )}
        {stat.caveat.length > 0 && (
          <p className="mt-1 text-sm text-ink-faint">
            Entries from {stat.caveat.join(", ")} rest on reconstructed lineups
            and are marked.
          </p>
        )}
      </div>

      <div className={cardClassName({ padding: "none" })}>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line text-left text-xs uppercase tracking-wide text-ink-faint">
                <th className="px-3 py-2 text-right font-semibold">#</th>
                {showsValue(stat) && <th className="px-3 py-2 text-right font-semibold" />}
                <th className="px-3 py-2 font-semibold">Who</th>
                <th className="px-3 py-2 font-semibold">What</th>
              </tr>
            </thead>
            <tbody>
              {stat.entries.map((entry, index) => {
                const rank = index + 1;
                const isHighlighted = rank === highlighted;
                return (
                  <tr
                    key={`${entry.subject}-${index}`}
                    id={`rank-${rank}`}
                    aria-current={isHighlighted ? "true" : undefined}
                    className={`border-b border-line last:border-0 ${
                      isHighlighted ? "bg-band-mid" : index % 2 ? "bg-surface-sunk" : ""
                    }`}
                  >
                    <td className="px-3 py-2 text-right tabular-nums text-ink-faint">
                      {rank}
                    </td>
                    {showsValue(stat) && (
                      <td className="px-3 py-2 text-right font-semibold tabular-nums text-ink">
                        {formatStatValue(entry.value, stat.format)}
                      </td>
                    )}
                    <td className="px-3 py-2 font-medium text-ink">
                      {holderName(entry.subject)}
                    </td>
                    <td className="px-3 py-2 text-ink-muted">
                      {entry.href ? (
                        <Link
                          to={entry.href}
                          className="underline decoration-dotted underline-offset-2 hover:text-ink"
                        >
                          {entry.detail ?? "See it"}
                        </Link>
                      ) : (
                        entry.detail
                      )}
                      {entry.approximate && (
                        <span className="text-ink-faint"> · reconstructed</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      <p className="text-xs text-ink-faint">
        {stat.total > stat.entries.length
          ? `The top ${stat.entries.length} of ${stat.total.toLocaleString("en-GB")}.`
          : `All ${stat.total}.`}
      </p>
    </div>
  );
};

export default Records;
