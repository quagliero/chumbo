import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { getPlayer } from "@/data";
import { getManagerAccent } from "@/domain/managerColors";
import { usePrecomputedStats } from "@/hooks/usePrecomputedStats";
import { useAllSeasons } from "@/hooks/useSeasonData";
import {
  LINK_CLASS,
  ManagerLink,
  PlayerLink,
  SeasonLink,
} from "@/presentation/components/Links";
import { Card } from "@/presentation/components/Card";
import ScrollableTabs from "@/presentation/components/ScrollableTabs/ScrollableTabs";
import {
  getManagerHonours,
  getManagersWing,
  getRingOfShame,
  listYears,
  type ShameEntry,
  type WingEntry,
} from "@/utils/hallOfFame";

/* ------------------------------------------------------------------ *
 * The players' wing
 * ------------------------------------------------------------------ */

interface HOFInductee {
  name: string;
  /**
   * Sleeper id, where the inductee is a player the dictionary still carries.
   * Four inductees have none — Jacob Hester, Braxton Hoyett and Damar Hamlin
   * were trimmed out of players.json as non-fantasy positions, and
   * "Commissioner HD" is a person, not a player — so those names stay as text
   * rather than linking into a Player Not Found.
   */
  playerId?: string;
  /**
   * The induction citation.
   *
   * **Whoever won the Chumbo that year picks the inductee, so the citation is
   * THEIRS to write (F4a).** It is deliberately absent rather than stubbed.
   * Every inductee used to carry the sentence
   * "Placeholder text for X's Hall of Fame induction in YYYY. This will be
   * replaced with the actual blurb.", which reads on the page as if it were
   * league lore that nobody bothered to finish. An absent field renders as a
   * plainly-marked "citation pending" instead, and the wing's header counts how
   * many are still missing.
   *
   * The champion is derived from that season's bracket rather than stored
   * here, so the page always credits the right person and a data correction
   * (2019 was rebuilt twice) can never leave this list stale.
   *
   * To fill one in: add `blurb: "..."` to that year below. Newlines are kept,
   * so it can be several paragraphs. Nothing else needs changing.
   */
  blurb?: string;
}

const hofInductees: Record<number, HOFInductee> = {
  2012: { name: "Jacob Hester" },
  2013: { name: "Jamaal Charles", playerId: "323" },
  2014: { name: "Mark Sanchez", playerId: "350" },
  2015: { name: "Eddie Lacy", playerId: "1527" },
  2016: { name: "LeGarrette Blount", playerId: "730" },
  2017: { name: "Todd Gurley", playerId: "2315" },
  2018: { name: "Robbie Chosen", playerId: "3423" },
  2019: { name: "Travis Kelce", playerId: "1466" },
  2020: { name: "Darren Waller", playerId: "2505" },
  2021: { name: "Braxton Hoyett" },
  2022: { name: "Damar Hamlin" },
  2023: { name: "Christian McCaffrey", playerId: "4034" },
  2024: { name: "Commissioner HD" },
};

const initialsOf = (name: string): string =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase();

/**
 * The inductee portrait.
 *
 * `public/images/hof/` does not exist — all 26 files the page asked for (an
 * icon and a large version per year) are missing, so every tile rendered a
 * broken-image glyph. The `<img>` is kept so that dropping the files in makes
 * them appear with no further change; it simply hides itself on error and lets
 * the initials medallion underneath show through.
 */
const Portrait = ({ year, name }: { year: number; name: string }) => {
  const [failed, setFailed] = useState(false);

  return (
    <div className="relative w-24 h-24 rounded-full overflow-hidden bg-surface-sunk border border-line flex items-center justify-center">
      <span className="text-xl font-semibold text-ink-faint">
        {initialsOf(name)}
      </span>
      {!failed && (
        <img
          src={`/images/hof/${year}-icon.jpg`}
          alt=""
          onError={() => setFailed(true)}
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}
    </div>
  );
};

const PlayersWing = () => {
  const years = Object.keys(hofInductees)
    .map(Number)
    .sort((a, b) => a - b);

  // Who won each season, and therefore whose pick the inductee was. Derived
  // from the bracket rather than recorded alongside the name, so it cannot
  // fall out of step with the standings.
  const championOf = new Map<number, string>();
  for (const honours of getManagerHonours()) {
    for (const title of honours.titles) championOf.set(title, honours.managerId);
  }
  const written = years.filter((year) => hofInductees[year].blurb).length;

  return (
    <section className="space-y-4">
      <Card>
        <h2 className="text-xl font-bold text-ink">The Players' Wing</h2>
        <p className="mt-1 text-sm text-ink-muted">
          One inductee a season, chosen by whoever won the Chumbo that year —
          so the citation is theirs to write, not the commissioner's.{" "}
          <strong className="font-semibold text-ink">
            {written} of {years.length}
          </strong>{" "}
          have been written so far.
        </p>
      </Card>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
        {years.map((year) => {
          const inductee = hofInductees[year];
          const chooser = championOf.get(year);
          const player = inductee.playerId
            ? getPlayer(inductee.playerId)
            : undefined;

          return (
            <Card key={year} className="h-full">
              <div className="flex items-start gap-4">
                <Portrait year={year} name={inductee.name} />
                <div className="min-w-0">
                  <div className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    <SeasonLink year={year} title={`The ${year} season`}>
                      Class of {year}
                    </SeasonLink>
                  </div>
                  <h3 className="mt-1 text-lg font-bold leading-tight break-words">
                    <PlayerLink
                      playerId={inductee.playerId}
                      fallbackClassName="text-ink"
                      title={`${inductee.name} — player page`}
                      fallbackTitle="No player page: not in the fantasy player dictionary"
                    >
                      {inductee.name}
                    </PlayerLink>
                  </h3>
                  {player && (
                    <p className="text-sm text-ink-muted">
                      {player.position}
                      {player.team ? ` · ${player.team}` : ""}
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 border-t border-line pt-3">
                {inductee.blurb ? (
                  <p className="text-sm text-ink leading-relaxed whitespace-pre-line">
                    {inductee.blurb}
                  </p>
                ) : (
                  <div className="rounded border border-dashed border-line-strong bg-surface-sunk px-3 py-2">
                    <p className="text-sm font-semibold text-ink-muted">
                      Citation not yet written
                    </p>
                    <p className="mt-0.5 text-xs text-ink-faint">
                      The plaque is blank.{" "}
                      {chooser ? (
                        <>
                          <Link
                            to={`/managers/${chooser}`}
                            className="font-medium underline decoration-dotted underline-offset-2"
                          >
                            {chooser}
                          </Link>{" "}
                          won {year} and picked {inductee.name}, so this one is
                          theirs to write.
                        </>
                      ) : (
                        <>Nobody has recorded why {inductee.name} went in.</>
                      )}
                    </p>
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
};

/* ------------------------------------------------------------------ *
 * The managers' wing
 * ------------------------------------------------------------------ */

const Honour = ({ label, years }: { label: string; years: number[] }) => {
  if (years.length === 0) return null;
  return (
    <p className="text-sm text-ink-muted">
      <span className="font-semibold text-ink">
        {years.length} {label}
      </span>{" "}
      —{" "}
      {years.map((year, index) => (
        <span key={year}>
          {index > 0 && ", "}
          <SeasonLink year={year}>{year}</SeasonLink>
        </span>
      ))}
    </p>
  );
};

const ManagerCard = ({ entry }: { entry: WingEntry }) => (
  <Card padding="none" className="h-full">
    {/* F2: one manager per card, so the accent is decoration next to a name
        that already carries the identity. Inline style, not a generated class
        — a template-string class name is purged out of the build. */}
    <div className="h-1" style={{ backgroundColor: getManagerAccent(entry.managerId) }} />
    <div className="p-6">
      <h3 className="text-lg font-bold leading-tight break-words">
        <ManagerLink managerId={entry.managerId} title={`${entry.name} — manager page`}>
          {entry.name}
        </ManagerLink>
      </h3>
      <p className="text-sm text-ink-muted break-words">{entry.teamName}</p>

      {/* The Triple Crown: most wins, most points AND the title, in one season.
          Two of them in fifteen years, so it goes above everything else on the
          card rather than into the run of honours below. */}
      {entry.tripleCrowns.length > 0 && (
        <p className="mt-3 rounded border border-line-strong bg-surface-sunk px-2.5 py-1.5 text-xs">
          <span className="font-semibold text-ink">
            👑 Triple Crown
            {entry.tripleCrowns.length > 1 ? ` ×${entry.tripleCrowns.length}` : ""}
          </span>
          <span className="text-ink-muted">
            {" — "}most wins, most points and the title in{" "}
            {entry.tripleCrowns.map((year, index) => (
              <span key={year}>
                {index > 0 && ", "}
                <SeasonLink year={year}>{year}</SeasonLink>
              </span>
            ))}
          </span>
        </p>
      )}

      {entry.archetype && (
        <p className="mt-3 text-sm">
          <span className="font-semibold text-ink">{entry.archetype}</span>
          {entry.archetypeReason && (
            <span className="text-ink-muted"> — {entry.archetypeReason}</span>
          )}
        </p>
      )}

      <div className="mt-3 space-y-1">
        <Honour label={entry.titles.length === 1 ? "title" : "titles"} years={entry.titles} />
        <Honour
          label={entry.runnerUps.length === 1 ? "runner-up" : "runner-up finishes"}
          years={entry.runnerUps}
        />
        <Honour
          label={entry.spoons.length === 1 ? "Scumbo" : "Scumbos"}
          years={entry.spoons}
        />
        <p className="text-sm text-ink-faint">
          {entry.finishes.length} completed{" "}
          {entry.finishes.length === 1 ? "season" : "seasons"}
        </p>
      </div>
    </div>
  </Card>
);

const ManagersWing = ({ entries }: { entries: WingEntry[] }) => (
  <section className="space-y-4">
    <Card>
      <h2 className="text-xl font-bold text-ink">The Managers' Wing</h2>
      <p className="mt-1 text-sm text-ink-muted">
        One rule, and no committee:{" "}
        <strong className="font-semibold text-ink">
          you are in if you have won the Chumbo.
        </strong>{" "}
        Finishing positions come from the playoff brackets, not the regular-season
        table, so a 12-1 team that lost in the semi-final is not a champion here
        either. The character notes are the league's own{" "}
        <span className="italic">manager archetypes</span> — each one is the
        measure that manager is furthest from the league average on.
      </p>
    </Card>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
      {entries.map((entry) => (
        <ManagerCard key={entry.managerId} entry={entry} />
      ))}
    </div>
  </section>
);

/* ------------------------------------------------------------------ *
 * The Ring of Shame
 * ------------------------------------------------------------------ */

const ShameCard = ({ entry }: { entry: ShameEntry }) => (
  <Card padding="none" className="h-full">
    <div className="h-1 bg-result-loss" />
    <div className="p-6">
      <h3 className="text-lg font-bold leading-tight text-ink break-words">
        {entry.title}
      </h3>

      <p className="mt-3 text-2xl font-bold font-numeric tabular-nums text-result-loss break-words">
        {entry.value}
      </p>
      <p className="text-sm font-semibold">
        <ManagerLink
          managerId={entry.managerId}
          title={`${entry.name} — manager page`}
        >
          {entry.name}
        </ManagerLink>
        <span className="font-normal text-ink-faint"> · {entry.teamName}</span>
      </p>

      {entry.detail && (
        <p className="mt-3 text-sm text-ink break-words">{entry.detail}</p>
      )}

      <p className="mt-3 border-t border-line pt-3 text-xs text-ink-faint">
        {entry.basis}
        {entry.excluded.length > 0 && (
          <>
            {" "}
            Excludes {listYears(entry.excluded)}, whose per-player data is a
            reconstruction rather than a record.
          </>
        )}
        {entry.approximate && " This entry rests on reconstructed lineup data."}
      </p>

      {entry.href && (
        <p className="mt-2 text-sm">
          <Link to={entry.href} className={LINK_CLASS}>
            See it →
          </Link>
        </p>
      )}
    </div>
  </Card>
);

const RingOfShame = ({ entries }: { entries: ShameEntry[] }) => (
  <section className="space-y-4">
    <Card>
      <h2 className="text-xl font-bold text-ink">The Ring of Shame</h2>
      <p className="mt-1 text-sm text-ink-muted">
        Not a wing. A ring, so everyone can stand round it and point. Every
        number below is the real, current record holder, taken straight from the
        league's own statistics — the criterion is printed under each one, so
        nobody has to take it on trust. It ranks records rather than people,
        which is why one or two managers manage to turn up twice.
      </p>
    </Card>

    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 items-start">
      {entries.map((entry) => (
        <ShameCard key={entry.id} entry={entry} />
      ))}
    </div>
  </section>
);

/* ------------------------------------------------------------------ *
 * The page
 * ------------------------------------------------------------------ */

type WingId = "players" | "managers" | "shame";

const TABS: { id: WingId; label: string }[] = [
  { id: "players", label: "Players" },
  { id: "managers", label: "Managers" },
  { id: "shame", label: "Ring of Shame" },
];

const TabButton = ({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: ReactNode;
  onClick: () => void;
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-current={active ? "page" : undefined}
    className={
      active
        ? "px-4 py-2 text-sm font-semibold border-b-2 border-blue-600 text-blue-700"
        : "px-4 py-2 text-sm font-medium border-b-2 border-transparent text-ink-muted hover:text-ink"
    }
  >
    {children}
  </button>
);

const HallOfFame = () => {
  // A4: the build-time answers, not fifteen seasons of matchups. Suspends on
  // the `<Suspense>` boundary in App.tsx until the file is in.
  // The Scumbo is the worst BREAKDOWN — the all-play record — so this page
  // needs the matchups, not just the precomputed stats. Without them
  // `getSeasonCrowns` correctly returns nothing rather than awarding a partial
  // Scumbo off the two legs that come from the rosters alone, which is exactly
  // what it did before this line existed: the Triple Crown badge and the
  // Scumbo entries silently rendered as absent rather than wrong.
  useAllSeasons();
  const stats = usePrecomputedStats();
  const [wing, setWing] = useState<WingId>("players");

  const managersWing = getManagersWing(stats);
  const ring = getRingOfShame(stats);

  return (
    <div className="container mx-auto space-y-6 py-6">
      <div>
        <h1 className="text-3xl sm:text-4xl font-bold text-ink">Hall of Fame</h1>
        <p className="mt-1 text-ink-muted">
          Three rooms. One for the players, one for the managers who actually won
          something, and one nobody asked to be in.
        </p>
      </div>

      <ScrollableTabs className="border-b border-line">
        {TABS.map((tab) => (
          <TabButton
            key={tab.id}
            active={wing === tab.id}
            onClick={() => setWing(tab.id)}
          >
            {tab.label}
          </TabButton>
        ))}
      </ScrollableTabs>

      {wing === "players" && <PlayersWing />}
      {wing === "managers" && <ManagersWing entries={managersWing} />}
      {wing === "shame" && <RingOfShame entries={ring} />}
    </div>
  );
};

export default HallOfFame;
