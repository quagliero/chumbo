import { Card } from "@/presentation/components/Card";
import { ManagerLink } from "@/presentation/components/Links";
import type { LuckWeek, TeamLuck } from "@/utils/scheduleLuck";
import {
  useScheduleLuck,
  type LuckView,
  type ScheduleLuckData,
  type SchedulePlayoffs,
  type Team,
} from "./useScheduleLuck";

/**
 * Schedule luck: how much of a season the fixture list decided.
 *
 * Four views of one idea, all in `utils/scheduleLuck.ts` and
 * `calculateScheduleOdds`:
 *
 *   1. every record the scores could have produced, with the real one on it;
 *   2. the playoff odds with the schedule and without it;
 *   3. where the luck came from, week by week;
 *   4. and, while there are games left, what the rest of the fixture list is
 *      worth to each team.
 *
 * Points against is deliberately not the measure anywhere here — see the
 * module comment in `scheduleLuck.ts`.
 */

const GREEN = "22, 163, 74";
const RED = "220, 38, 38";
const WIN = "#2a6344";
const LOSS = "#a8241c";
const BAR = "#c6ccda";

/** −1..1 to a green or red wash, neutral at 0. */
const wash = (strength: number, max = 0.6) => {
  const s = Math.max(-1, Math.min(1, strength));
  return `rgba(${s >= 0 ? GREEN : RED}, ${(Math.abs(s) * max).toFixed(3)})`;
};

const signed = (value: number, digits = 1) => {
  const fixed = Math.abs(value).toFixed(digits);
  if (Number(fixed) === 0) return (0).toFixed(digits);
  return `${value > 0 ? "+" : "−"}${fixed}`;
};

const ordinal = (n: number) => {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
};

const recordText = (t: { wins: number; losses: number; ties: number }) =>
  `${t.wins}-${t.losses}${t.ties ? `-${t.ties}` : ""}`;

/** "Luckier than 96% of schedules", or the plain version near the middle. */
const verdict = (percentile: number) => {
  if (percentile >= 0.6) return `Luckier than ${Math.round(percentile * 100)}% of schedules`;
  if (percentile <= 0.4) return `Unluckier than ${Math.round((1 - percentile) * 100)}% of schedules`;
  return "In line with their scores";
};

const luckColour = (luck: number) =>
  luck >= 0.5 ? WIN : luck <= -0.5 ? LOSS : "#151922";

const TeamName = ({ team }: { team: Team | undefined }) =>
  team ? (
    <ManagerLink ownerId={team.ownerId} className="hover:underline">
      {team.name}
    </ManagerLink>
  ) : (
    <span>?</span>
  );

/* ------------------------------------------------------------------ *
 * 1. Every record the scores could have produced
 * ------------------------------------------------------------------ */

const BAR_WIDTH = 9;
const BAR_GAP = 2;
const STRIP_HEIGHT = 34;
/** Room above the bars for the pointer to the real record. */
const STRIP_TOP = 8;

/**
 * One bar per possible win total, as tall as its chance on a random schedule;
 * the real total is the coloured bar, and the tick underneath is the expected
 * number. Where the coloured bar sits against the hump is the whole story.
 */
const RecordStrip = ({ team }: { team: TeamLuck }) => {
  const { distribution, actualWins, expectedWins } = team;
  const peak = Math.max(...distribution);
  const width = distribution.length * (BAR_WIDTH + BAR_GAP) - BAR_GAP;
  const centre = (k: number) => k * (BAR_WIDTH + BAR_GAP) + BAR_WIDTH / 2;
  const actual = Math.floor(actualWins);
  const colour = luckColour(team.luck);

  return (
    <svg
      width={width}
      height={STRIP_TOP + STRIP_HEIGHT + 12}
      role="img"
      aria-label={
        `${recordText(team)} against ${expectedWins.toFixed(1)} expected wins. ` +
        distribution
          .map((p, k) => `${k} wins: ${(p * 100).toFixed(0)}%`)
          .join(", ")
      }
      className="block"
    >
      {distribution.map((p, k) => {
        const h = peak > 0 ? Math.max(1, (p / peak) * STRIP_HEIGHT) : 1;
        return (
          <rect
            key={k}
            x={k * (BAR_WIDTH + BAR_GAP)}
            y={STRIP_TOP + STRIP_HEIGHT - h}
            width={BAR_WIDTH}
            height={h}
            rx={1.5}
            fill={k === actual ? colour : BAR}
          >
            <title>{`${k} win${k === 1 ? "" : "s"}: ${(p * 100).toFixed(1)}% of schedules`}</title>
          </rect>
        );
      })}
      {/* The real record can be a sliver — 11-3 from 7.4 deserved is a 0.3%
          bar — so it also gets a pointer that cannot be missed. */}
      <path
        d={`M ${centre(actual)} ${STRIP_TOP + STRIP_HEIGHT - Math.max(1, (distribution[actual] / peak) * STRIP_HEIGHT) - 1} l -4 -6 h 8 z`}
        fill={colour}
      />
      {/* The expected number, between bars when it is fractional. */}
      <path
        d={`M ${expectedWins * (BAR_WIDTH + BAR_GAP) + BAR_WIDTH / 2} ${STRIP_TOP + STRIP_HEIGHT + 2} l -4 6 h 8 z`}
        fill="#69738a"
      />
      <text
        x={centre(0)}
        y={STRIP_TOP + STRIP_HEIGHT + 11}
        textAnchor="middle"
        className="fill-ink-faint text-[9px]"
      >
        0
      </text>
      <text
        x={centre(distribution.length - 1)}
        y={STRIP_TOP + STRIP_HEIGHT + 11}
        textAnchor="middle"
        className="fill-ink-faint text-[9px]"
      >
        {distribution.length - 1}
      </text>
    </svg>
  );
};

const RecordsSection = ({ data }: { data: ScheduleLuckData }) => (
  <Card className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold text-ink">
        Actual record vs. expected
      </h3>
      <p className="mt-1 text-sm text-ink-muted">
        Expected wins: each week, the share of the league their score beat,
        added up. Grey bars: how likely each win total was, given the team's weekly
        scores and a random opponent each week. Coloured bar: their actual
        record. Triangle: the expected number of wins.
      </p>
    </div>
    <ol className="divide-y divide-line">
      {data.luck.map((team) => {
        const t = data.teams.get(team.rosterId);
        return (
          <li
            key={team.rosterId}
            className="grid grid-cols-[minmax(5.5rem,8rem)_1fr] items-center gap-x-4 gap-y-1 py-2.5 sm:grid-cols-[8rem_auto_1fr]"
          >
            <div>
              <div className="font-medium text-ink">
                <TeamName team={t} />
              </div>
              <div className="text-sm tabular-nums text-ink-muted">
                {recordText(team)}
              </div>
            </div>
            <div className="overflow-x-auto">
              <RecordStrip team={team} />
            </div>
            <div className="col-span-2 text-sm sm:col-span-1">
              <span
                className="font-semibold tabular-nums"
                style={{ color: luckColour(team.luck) }}
              >
                {signed(team.luck)} wins
              </span>{" "}
              <span className="text-ink-muted">
                vs. expected ({team.expectedWins.toFixed(1)}) ·{" "}
                {verdict(team.percentile)}
              </span>
              <div className="text-xs text-ink-faint">
                Opponents' average weekly rank:{" "}
                {ordinal(Math.round(team.opponentRank))}
                {team.facedTopScore > 0
                  ? ` · Faced the week's top score: ${team.facedTopScore}`
                  : ""}
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  </Card>
);

/* ------------------------------------------------------------------ *
 * 2. Playoff odds, with the schedule and without it
 * ------------------------------------------------------------------ */

const OddsRow = ({
  row,
  team,
  live,
}: {
  row: SchedulePlayoffs;
  team: Team | undefined;
  live: boolean;
}) => {
  const effect = row.actual - row.fair;
  const lo = Math.min(row.actual, row.fair);
  const hi = Math.max(row.actual, row.fair);
  const colour = effect >= 0 ? WIN : LOSS;
  const soFar = row.neutralRest - row.fair;
  const toCome = row.actual - row.neutralRest;

  const summary = live
    ? `${Math.round(row.actual)}% (random: ${Math.round(row.fair)}%)`
    : `${row.actual === 100 ? "Made it" : "Missed"} (random: ${Math.round(row.fair)}%)`;

  return (
    <li className="grid grid-cols-[minmax(5.5rem,8rem)_1fr] items-center gap-x-4 gap-y-1 py-2 sm:grid-cols-[8rem_1fr_20rem]">
      <div className="font-medium text-ink">
        <TeamName team={team} />
      </div>
      <div className="relative h-5" aria-hidden="true">
        <div className="absolute inset-x-0 top-1/2 h-px bg-line" />
        <div
          className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full"
          style={{ left: `${lo}%`, width: `${hi - lo}%`, backgroundColor: colour, opacity: 0.35 }}
        />
        {/* Fair: hollow. Actual: filled. */}
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-surface"
          style={{ left: `${row.fair}%`, borderColor: "#69738a" }}
        />
        <div
          className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full"
          style={{ left: `${row.actual}%`, backgroundColor: Math.abs(effect) < 1 ? "#151922" : colour }}
        />
      </div>
      <div className="col-span-2 text-sm sm:col-span-1">
        <span className="tabular-nums text-ink">{summary}</span>
        {Math.abs(effect) >= 1 ? (
          <span className="ml-1 font-semibold tabular-nums" style={{ color: colour }}>
            {signed(effect, 0)}
          </span>
        ) : null}
        {live && (Math.abs(soFar) >= 1 || Math.abs(toCome) >= 1) ? (
          <div className="text-xs tabular-nums text-ink-faint">
            Played so far {signed(soFar, 0)} · Still to play {signed(toCome, 0)}
          </div>
        ) : null}
      </div>
    </li>
  );
};

const PlayoffsSection = ({ data }: { data: ScheduleLuckData }) => {
  const rows = [...data.playoffs].sort(
    (a, b) => b.actual - a.actual || b.fair - a.fair
  );
  if (rows.length === 0) return null;
  return (
    <Card className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-ink">
          {data.live
            ? "Playoff odds: real schedule vs. random"
            : "Playoffs: real schedule vs. random"}
        </h3>
        <p className="mt-1 text-sm text-ink-muted">
          {data.live
            ? "Filled dot: playoff odds with the real schedule. Hollow dot: odds if every week's opponent (past and future) were random. The gap is the schedule's effect."
            : `Filled dot: what happened. Hollow dot: how often they made the top ${data.playoffTeams} when the season's scores were replayed with random opponents each week.`}{" "}
          Ranked by record, then points for. Divisions ignored.
        </p>
      </div>
      <div className="hidden grid-cols-[8rem_1fr_20rem] gap-x-4 text-xs text-ink-faint sm:grid">
        <span />
        <span className="flex justify-between">
          <span>0%</span>
          <span>50%</span>
          <span>100%</span>
        </span>
        <span />
      </div>
      <ol className="divide-y divide-line">
        {rows.map((row) => (
          <OddsRow
            key={row.rosterId}
            row={row}
            team={data.teams.get(row.rosterId)}
            live={data.live}
          />
        ))}
      </ol>
    </Card>
  );
};

/* ------------------------------------------------------------------ *
 * 3. Week by week
 * ------------------------------------------------------------------ */

const describeWeek = (week: LuckWeek, opponent: string) => {
  const verb = week.result === "W" ? "Beat" : week.result === "L" ? "Lost to" : "Tied with";
  const beaten = Math.round(week.share * (week.teams - 1));
  return (
    `Week ${week.week}: ${verb} ${opponent}, ${week.points.toFixed(2)}–${week.opponentPoints.toFixed(2)}. ` +
    `Score ranked ${ordinal(week.rank)} of ${week.teams} (would have beaten ${beaten} of ${week.teams - 1}). ` +
    `${opponent} ranked ${ordinal(week.opponentRank)}. Luck: ${signed(week.luck, 2)} wins.`
  );
};

const WeeksSection = ({ data }: { data: ScheduleLuckData }) => (
  <Card className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold text-ink">Week by week</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Green: won with a score that would usually lose. Red: lost with a
        score that would usually win. "vs 1st" means the opponent had that
        week's top score. Hover for details.
      </p>
    </div>
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-center text-xs">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface pr-3 text-left font-medium text-ink-faint">
              Week
            </th>
            {data.weeks.map((week) => (
              <th key={week} scope="col" className="px-1 font-medium text-ink-faint">
                {week}
              </th>
            ))}
            <th scope="col" className="pl-2 font-medium text-ink-faint">
              Luck
            </th>
          </tr>
        </thead>
        <tbody>
          {data.luck.map((team) => {
            const byWeek = new Map(team.weeks.map((w) => [w.week, w]));
            return (
              <tr key={team.rosterId}>
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface pr-3 text-left text-sm font-medium text-ink">
                  <TeamName team={data.teams.get(team.rosterId)} />
                </th>
                {data.weeks.map((weekNumber) => {
                  const week = byWeek.get(weekNumber);
                  if (!week) {
                    return <td key={weekNumber} className="h-10 min-w-[2.75rem] rounded bg-surface-sunk" />;
                  }
                  const label = describeWeek(
                    week,
                    data.teams.get(week.opponentId)?.name ?? "their opponent"
                  );
                  return (
                    <td
                      key={weekNumber}
                      title={label}
                      aria-label={label}
                      className="h-10 min-w-[2.75rem] rounded px-1 leading-tight text-ink"
                      style={{ backgroundColor: wash(week.luck / 0.9) }}
                    >
                      <div className="font-semibold">{week.result}</div>
                      <div
                        className={`text-[0.65rem] ${
                          week.opponentRank === 1 ? "font-semibold text-ink" : "text-ink-muted"
                        }`}
                      >
                        vs {ordinal(week.opponentRank)}
                      </div>
                    </td>
                  );
                })}
                <td
                  className="pl-2 text-sm font-semibold tabular-nums"
                  style={{ color: luckColour(team.luck) }}
                >
                  {signed(team.luck)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </Card>
);

/* ------------------------------------------------------------------ *
 * 4. Remaining schedule
 * ------------------------------------------------------------------ */

const RemainingSection = ({ data }: { data: ScheduleLuckData }) => (
  <Card className="space-y-4">
    <div>
      <h3 className="text-lg font-semibold text-ink">Remaining schedule</h3>
      <p className="mt-1 text-sm text-ink-muted">
        Chance of winning each remaining game, hardest schedules first. Red:
        a tougher opponent than their average; green: easier. Wins: expected
        wins left. Schedule: wins gained or lost vs. an average schedule.
        {data.weeks.length < 6
          ? ` Only ${data.weeks.length} week${data.weeks.length === 1 ? "" : "s"} played, so teams still look similar and the differences are small.`
          : ""}
      </p>
    </div>
    <div className="overflow-x-auto">
      <table className="border-separate border-spacing-0.5 text-center text-xs">
        <thead>
          <tr>
            <th scope="col" className="sticky left-0 z-10 bg-surface pr-3 text-left font-medium text-ink-faint">
              Week
            </th>
            {data.remainingWeeks.map((week) => (
              <th key={week} scope="col" className="px-1 font-medium text-ink-faint">
                {week}
              </th>
            ))}
            <th scope="col" className="pl-2 font-medium text-ink-faint">
              Wins
            </th>
            <th scope="col" className="pl-2 font-medium text-ink-faint">
              Schedule
            </th>
          </tr>
        </thead>
        <tbody>
          {data.remaining.map((row) => {
            const byWeek = new Map(row.games.map((g) => [g.week, g]));
            const average = row.games.length ? row.neutralWins / row.games.length : 0.5;
            const effect = -row.difficulty;
            return (
              <tr key={row.rosterId}>
                <th scope="row" className="sticky left-0 z-10 whitespace-nowrap bg-surface pr-3 text-left text-sm font-medium text-ink">
                  <TeamName team={data.teams.get(row.rosterId)} />
                </th>
                {data.remainingWeeks.map((weekNumber) => {
                  const game = byWeek.get(weekNumber);
                  if (!game) {
                    return <td key={weekNumber} className="h-10 min-w-[3.5rem] rounded bg-surface-sunk" />;
                  }
                  const opponent = data.teams.get(game.opponentId)?.name ?? "?";
                  const chance = Math.round(game.winProbability * 100);
                  const label = `Week ${weekNumber} against ${opponent}: ${chance}% to win (${Math.round(average * 100)}% vs. an average opponent).`;
                  return (
                    <td
                      key={weekNumber}
                      title={label}
                      aria-label={label}
                      className="h-10 min-w-[3.5rem] rounded px-1 leading-tight text-ink"
                      style={{ backgroundColor: wash((game.winProbability - average) / 0.25) }}
                    >
                      <div className="max-w-[4.5rem] truncate font-medium">{opponent}</div>
                      <div className="tabular-nums text-ink-muted">{chance}%</div>
                    </td>
                  );
                })}
                <td className="pl-2 text-sm tabular-nums text-ink">
                  {row.expectedWins.toFixed(1)}
                </td>
                <td
                  className="pl-2 text-sm font-semibold tabular-nums"
                  style={{ color: luckColour(effect * 2) }}
                >
                  {signed(effect)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  </Card>
);

/* ------------------------------------------------------------------ */

const ScheduleLuck = ({ year, view }: { year: number; view: LuckView }) => {
  const data = useScheduleLuck(year);

  if (view === "remaining") {
    return data.live && data.remaining.length > 0 ? (
      <RemainingSection data={data} />
    ) : (
      <div className="py-8 text-center text-ink-muted">
        The regular season is over.
      </div>
    );
  }

  if (data.weeks.length === 0) {
    return (
      <div className="py-8 text-center text-ink-muted">No games played yet.</div>
    );
  }

  if (view === "playoffs") return <PlayoffsSection data={data} />;
  if (view === "weeks") return <WeeksSection data={data} />;
  return <RecordsSection data={data} />;
};

export default ScheduleLuck;
