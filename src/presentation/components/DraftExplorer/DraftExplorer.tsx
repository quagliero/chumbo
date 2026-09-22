/**
 * The Draft explorer: every pick, who drafts well, how, and whether it wins.
 *
 * One page-level computation (`useDraftScatter`, then `utils/draftReport.ts`)
 * feeds the chart and every table, and one filter — the teams chosen at the
 * top, kept in the URL so a filtered view can be shared — applies to all the
 * parts that are about particular managers. The two league-wide questions,
 * "does a good draft win?" and "which strategies work?", stay league-wide:
 * a strategy one manager tried twice is not a finding.
 */
import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { seasons } from "@/data";
import managers from "@/data/managers.json";
import { Card } from "@/presentation/components/Card";
import { DraftScatter } from "@/presentation/components/Chart/DraftScatter/DraftScatter";
import { useDraftScatter } from "@/presentation/components/Chart/DraftScatter/useDraftScatter";
import { getFinalStandings } from "@/utils/finalStandings";
import { isSeasonSettled } from "@/utils/playoffUtils";
import {
  buildDrafters,
  buildDrafts,
  draftFinishCorrelation,
  strategiesOf,
  tiersOf,
  type Draft,
  type Finish,
  type Outcome,
} from "@/utils/draftReport";

const NAMES = new Map(managers.map((m) => [m.id, m.name]));
const nameOf = (id: string) => NAMES.get(id) ?? id;

/** Fewer drafts than this and a row is an anecdote, and says so. */
const FEW = 10;

const signed = (value: number) => `${value > 0 ? "+" : value < 0 ? "−" : ""}${Math.abs(value).toFixed(1)}`;
const ordinal = (n: number) => {
  const teen = n % 100;
  if (teen >= 11 && teen <= 13) return `${n}th`;
  return `${n}${["th", "st", "nd", "rd"][n % 10] ?? "th"}`;
};
const percent = (part: number, whole: number) => (whole ? `${Math.round((100 * part) / whole)}%` : "—");

const finishOf = (year: number, rosterId: number): Finish | null => {
  if (!isSeasonSettled(seasons[year])) return null;
  const standings = getFinalStandings(year);
  const at = standings.find((s) => s.rosterId === rosterId);
  return at
    ? {
        position: at.position,
        of: standings.length,
        playoffTeams: seasons[year].league?.settings?.playoff_teams || 6,
      }
    : null;
};

const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-ink-faint";
const TD = "px-3 py-2";

const OutcomeCells = ({ outcome }: { outcome: Outcome }) => (
  <>
    <td className={`${TD} text-right tabular-nums`}>{outcome.drafts}</td>
    <td className={`${TD} text-right tabular-nums`}>
      {outcome.averageFinish === null ? "—" : outcome.averageFinish.toFixed(1)}
    </td>
    <td className={`${TD} text-right tabular-nums`}>{percent(outcome.playoffs, outcome.finished)}</td>
    <td className={`${TD} text-right tabular-nums`}>{outcome.titles}</td>
  </>
);

const DraftLine = ({ draft }: { draft: Draft }) => (
  <li className="flex flex-wrap items-baseline gap-x-2 py-1.5 text-sm">
    <span className="w-14 shrink-0 font-semibold tabular-nums text-ink">{signed(draft.value)}</span>
    <Link to={`/seasons/${draft.year}/draft`} className="font-medium text-ink hover:underline">
      {nameOf(draft.managerId)}, {draft.year}
      {draft.approximate && <span className="text-ink-faint" title="2019's bench scores are incomplete"> ~</span>}
    </Link>
    <span className="text-ink-muted">
      {draft.finish ? `finished ${ordinal(draft.finish.position)}` : "season still going"} · best pick{" "}
      {draft.best.name} ({signed(draft.best.value)})
    </span>
  </li>
);

const DraftExplorer = () => {
  const data = useDraftScatter();
  const [params, setParams] = useSearchParams();
  const selected = useMemo(
    () => new Set((params.get("teams") ?? "").split(",").filter(Boolean)),
    [params]
  );

  const drafts = useMemo(() => buildDrafts(data.points, finishOf), [data]);
  const drafters = useMemo(
    () => buildDrafters(drafts).sort((a, b) => b.averageValue - a.averageValue),
    [drafts]
  );
  const tiers = useMemo(() => tiersOf(drafts), [drafts]);
  const rho = useMemo(() => draftFinishCorrelation(drafts), [drafts]);
  const strategies = useMemo(() => strategiesOf(drafts, data.points), [drafts, data]);

  const picked = (id: string) => selected.size === 0 || selected.has(id);
  const toggle = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setParams(next.size ? { teams: [...next].join(",") } : {}, { replace: true });
  };

  const ranked = [...drafts].filter((d) => picked(d.managerId)).sort((a, b) => b.value - a.value);
  const settledSeasons = new Set(drafts.filter((d) => d.finish).map((d) => d.year)).size;

  return (
    <div className="space-y-6">
      <Card>
        <h2 className="text-lg font-semibold text-ink">Teams</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Choose teams to see only their picks on the chart and their drafts below. The rest of
          the league stays on the chart, faded, as the thing to compare against.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setParams({}, { replace: true })}
            aria-pressed={selected.size === 0}
            className={`rounded-full px-3 py-1 text-sm ${
              selected.size === 0 ? "bg-ink text-white" : "bg-surface-sunk text-ink-muted hover:text-ink"
            }`}
          >
            All teams
          </button>
          {drafters
            .map((d) => d.managerId)
            .sort((a, b) => nameOf(a).localeCompare(nameOf(b)))
            .map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => toggle(id)}
                aria-pressed={selected.has(id)}
                className={`rounded-full px-3 py-1 text-sm ${
                  selected.has(id) ? "bg-blue-600 text-white" : "bg-surface-sunk text-ink-muted hover:text-ink"
                }`}
              >
                {nameOf(id)}
              </button>
            ))}
        </div>
      </Card>

      <Card>
        <h2 className="mb-1 text-lg font-semibold text-ink">Draft value — every pick, every draft</h2>
        <p className="mb-4 text-sm text-ink-muted">
          Where the steals and the busts actually were, measured against what this league&rsquo;s
          own picks return rather than somebody else&rsquo;s ADP.
        </p>
        <DraftScatter data={data} managers={selected} />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Does a good draft win?</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          A draft&rsquo;s value is the sum of its picks&rsquo; — what each player scored that
          season, against what that pick number usually returns — and each season&rsquo;s drafts
          are ranked against each other. Set against how those {settledSeasons} seasons finished:
          {rho === null
            ? "."
            : ` the two go together, but loosely — a rank correlation of ${rho.toFixed(2)}, where 1 would be "the best draft always wins" and 0 "the draft tells you nothing".`}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Draft</th>
                <th className={`${TH} text-right`}>Drafts</th>
                <th className={`${TH} text-right`}>Avg finish</th>
                <th className={`${TH} text-right`}>Playoffs</th>
                <th className={`${TH} text-right`}>Titles</th>
              </tr>
            </thead>
            <tbody>
              {tiers.map((tier) => (
                <tr key={tier.label} className="border-b border-line last:border-0">
                  <td className={`${TD} font-medium text-ink`}>{tier.label}</td>
                  <OutcomeCells outcome={tier.outcome} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold text-ink">The drafters</h2>
        <p className="mt-1 text-sm text-ink-muted">
          Every manager&rsquo;s drafts, best on average first. &ldquo;Beat their slot&rdquo; is the
          share of their picks that returned more than that pick number usually does.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Manager</th>
                <th className={`${TH} text-right`}>Drafts</th>
                <th className={`${TH} text-right`}>Avg draft</th>
                <th className={`${TH} text-right`}>Beat their slot</th>
                <th className={TH}>Best</th>
                <th className={TH}>Worst</th>
                <th className={`${TH} text-right`}>Avg finish</th>
              </tr>
            </thead>
            <tbody>
              {drafters
                .filter((d) => picked(d.managerId))
                .map((d) => (
                  <tr key={d.managerId} className="border-b border-line last:border-0">
                    <td className={`${TD} font-medium text-ink`}>
                      <Link to={`/managers/${d.managerId}`} className="hover:underline">
                        {nameOf(d.managerId)}
                      </Link>
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>{d.drafts}</td>
                    <td className={`${TD} text-right font-semibold tabular-nums`}>{signed(d.averageValue)}</td>
                    <td className={`${TD} text-right tabular-nums`}>{Math.round(d.hitRate * 100)}%</td>
                    <td className={`${TD} tabular-nums text-ink-muted`}>
                      {d.best.year} ({signed(d.best.value)})
                    </td>
                    <td className={`${TD} tabular-nums text-ink-muted`}>
                      {d.worst.year} ({signed(d.worst.value)})
                    </td>
                    <td className={`${TD} text-right tabular-nums`}>
                      {d.outcome.averageFinish === null ? "—" : d.outcome.averageFinish.toFixed(1)}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="text-lg font-semibold text-ink">Best drafts</h2>
          <ol className="mt-2 divide-y divide-line">
            {ranked.slice(0, 10).map((d) => (
              <DraftLine key={`${d.year}-${d.managerId}`} draft={d} />
            ))}
          </ol>
        </Card>
        <Card>
          <h2 className="text-lg font-semibold text-ink">Worst drafts</h2>
          <ol className="mt-2 divide-y divide-line">
            {[...ranked]
              .reverse()
              .slice(0, 10)
              .map((d) => (
                <DraftLine key={`${d.year}-${d.managerId}`} draft={d} />
              ))}
          </ol>
        </Card>
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-ink">Draft strategies</h2>
        <p className="mt-1 max-w-3xl text-sm text-ink-muted">
          Drafts sorted by what their first rounds went on, and how the seasons ended. A draft
          can be in more than one row. Rows with fewer than {FEW} drafts are faded: a strategy
          a handful of managers tried is a story, not a finding.
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-line">
                <th className={TH}>Strategy</th>
                <th className={`${TH} text-right`}>Drafts</th>
                <th className={`${TH} text-right`}>Avg finish</th>
                <th className={`${TH} text-right`}>Playoffs</th>
                <th className={`${TH} text-right`}>Titles</th>
                <th className={`${TH} text-right`}>Avg draft</th>
              </tr>
            </thead>
            <tbody>
              {strategies.map((s) => (
                <tr
                  key={s.label}
                  className={`border-b border-line last:border-0 ${s.drafts.length < FEW ? "text-ink-faint" : ""}`}
                >
                  <td className={TD}>
                    <span className="font-medium">{s.label}</span>
                    <span className="block text-xs text-ink-faint">{s.rule}</span>
                  </td>
                  <OutcomeCells outcome={s.outcome} />
                  <td className={`${TD} text-right tabular-nums`}>{signed(s.outcome.averageValue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
};

export default DraftExplorer;
