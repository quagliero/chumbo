import { useParams, useNavigate, Link, Navigate } from "react-router-dom";
import { useMemo, useState } from "react";
import {
  getManagerStats,
  DataMode,
  TopPerformance,
  ManagerStats,
  ManagerH2HRecord,
} from "@/utils/managerStats";
import {
  CareerSummary,
  H2HTable,
  AllStarLineup,
  MostDraftedPlayers,
  MostCappedPlayers,
  TopPerformances,
  SeasonBreakdown,
} from "@/presentation/components/ManagerDetail";
import type { H2HRecordWithOpponent } from "@/presentation/components/ManagerDetail";
import ScrollableTabs from "@/presentation/components/ScrollableTabs/ScrollableTabs";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { getManagerAccent } from "@/domain/managerColors";
import { Card } from "@/presentation/components/Card";
import { Breadcrumbs } from "@/presentation/components/Breadcrumbs";
import { managers, seasons } from "@/data";
import { YEARS, type ValidYear } from "@/domain/constants";
import { getFinalStandings } from "@/utils/finalStandings";
import { narrate } from "@/utils/narrative/narrate";
import { ordinal } from "@/utils/narrative/phrases";
import { getTeamName } from "@/utils/teamName";
import { getUserAvatarUrl, getUserByOwnerId } from "@/utils/userAvatar";
import { useNarrativeStats } from "@/presentation/components/Narrative";
import { ShareButton } from "@/presentation/components/ShareButton";

/**
 * Has this season actually been decided?
 *
 * Asked of `finalStandings` rather than of `completedSeasons()`, which answers
 * the same question ("is there a winners bracket") — because this page already
 * reads finishing position from that module, and routing the second question
 * through `hallOfFame.ts` would make the manager page depend on the Hall of
 * Fame's whole chunk to run a two-line filter. A season nobody has bracketed
 * yet has every standing sourced from regular-season record, and a finish
 * claimed off that is a prediction, not a result.
 */
const isDecided = (year: number): boolean =>
  getFinalStandings(year).some((s) => s.source === "bracket");

/** Their most recent avatar, for a card that is not about one season. */
const latestAvatarUrl = (ownerId: string): string | null => {
  for (const year of [...YEARS].sort((a, b) => b - a)) {
    const url = getUserAvatarUrl(
      getUserByOwnerId(ownerId, seasons[year as ValidYear]?.users)
    );
    if (url) return url;
  }
  return null;
};

/**
 * A season record with the tie column dropped when there are none, for the
 * caption under the button.
 *
 * Deliberately not the templates' `formatRecord`: that lives in the lazy share
 * chunk, and importing it to label a button would pull 25 kB of rasteriser
 * onto every manager page. Same en dashes, same rule, three lines.
 */
const formatRecord = (wins: number, losses: number, ties: number) =>
  ties ? `${wins}–${losses}–${ties}` : `${wins}–${losses}`;

const ManagerDetail = () => {
  // A2a: getManagerStats walks every season's matchups, which are a lazy
  // chunk now; suspend until they are in.
  useAllSeasons();
  const { managerId, tab, section } = useParams<{
    managerId: string;
    tab?: string;
    section?: string;
  }>();
  const navigate = useNavigate();
  const [dataMode, setDataMode] = useState<DataMode>("regular");
  // Non-suspending, like `NarrativeNotes`: the sentence on the share card is a
  // garnish and this page must not hold its render on one.
  const stats = useNarrativeStats();

  // Get current tab from URL params, default to 'summary'
  const currentTab = tab || "summary";

  // Get current player section from URL params, default to 'allstars'
  const selectedPlayerSection = section || "allstars";

  const managerStats = useMemo((): ManagerStats | null => {
    if (!managerId) return null;
    return getManagerStats(managerId, dataMode) as ManagerStats;
  }, [managerId, dataMode]);

  // Filter performances by position
  const filteredPerformances = useMemo((): TopPerformance[] => {
    if (!managerStats) return [];

    const performances: TopPerformance[] =
      (managerStats as ManagerStats).topPerformances?.map(
        (performance: TopPerformance) => ({
          playerId: performance.playerId,
          playerName: performance.playerName,
          points: performance.points,
          year: performance.year,
          week: performance.week,
          matchup_id: performance.matchup_id,
          opponentName: performance.opponentName,
          result: performance.result,
        })
      ) || [];

    return performances;
  }, [managerStats]);

  /**
   * The season the share card is about, and everything it needs.
   *
   * ## Why one season and not the career
   *
   * `managerSeasonCard` is about one season and there is no career template,
   * so the card shows **their best season**: a title if they have one,
   * otherwise their highest finish, tie-broken towards the most recent. That
   * is a career page's highlight rather than an arbitrary slice, and it is
   * deliberately the same choice `scripts/og/routes.ts` makes — so the card
   * this button copies is the card a link to this page already previews as.
   * The caption next to the button names the season, because a share button
   * that produces a fact you did not ask for is worse than no button.
   *
   * ## Two things the card must not claim
   *
   * The finish comes from `finalStandings` (bracket-decided, champion = 1),
   * never from regular-season order — and never at all for a season without a
   * winners bracket, because "finished 1st" in September is a prediction.
   *
   * And `pointsFor` is a regular-season total, so this reads the REGULAR
   * career regardless of the data-mode select: switching to "Playoffs only"
   * must not quietly relabel 240 playoff points as the season. That is the
   * default mode, so it is a cache hit rather than a second walk of history.
   */
  const bestSeason = useMemo(() => {
    if (!managerId) return null;
    const manager = managers.find((m) => m.id === managerId);
    const career = getManagerStats(managerId, "regular");
    if (!manager || !career || career.seasonStats.length === 0) return null;

    const ranked = career.seasonStats
      .map((season) => {
        const rosterId = seasons[season.year as ValidYear]?.rosters?.find(
          (r) => r.owner_id === manager.sleeper.id
        )?.roster_id;
        const position =
          rosterId !== undefined && isDecided(season.year)
            ? getFinalStandings(season.year).find(
                (s) => s.rosterId === rosterId
              )?.position ?? null
            : null;
        return { season, position };
      })
      // Best finish first; a season with no bracket sorts last; ties go to the
      // most recent, which is the one the league is arguing about.
      .sort(
        (a, b) =>
          (a.position ?? 99) - (b.position ?? 99) || b.season.year - a.season.year
      );

    const best = ranked[0];
    const year = best.season.year;
    return {
      manager,
      season: best.season,
      year,
      record: formatRecord(
        best.season.wins,
        best.season.losses,
        best.season.ties
      ),
      finish: best.position ? ordinal(best.position) : undefined,
      // The rosette, read off the finish this card already has.
      //
      // `crowns.ts` knows more — it would also say "Triple Crown" and
      // "Scumbo", and `scripts/og/routes.ts` uses it for exactly that — but
      // reaching it from here makes the manager page depend on the crowns
      // chunk for one word, and the total bundle budget is 5 kB from its
      // ceiling. A Triple Crown winner gets "Champion", which is less than
      // the site says rather than more; and the one thing that must never be
      // wrong, claiming a title, is the one thing this cannot get wrong,
      // because the position is bracket-decided or it is absent.
      badge: best.position === 1 ? "Champion" : undefined,
      teamName: getTeamName(
        manager.sleeper.id,
        seasons[year as ValidYear]?.users
      ),
      avatarUrl: latestAvatarUrl(manager.sleeper.id),
    };
  }, [managerId]);

  // Prepare H2H records for the component
  const h2hRecords: H2HRecordWithOpponent[] = useMemo(() => {
    if (!managerStats) return [];
    return Object.entries((managerStats as ManagerStats).h2hRecords || {}).map(
      ([opponentId, record]: [string, ManagerH2HRecord]) => ({
        opponentId,
        opponentName: record.managerName || "Unknown",
        record: record,
      })
    );
  }, [managerStats]);

  // Redirect to summary tab if no tab is specified
  if (!tab && managerId) {
    return <Navigate to={`/managers/${managerId}/summary`} replace />;
  }

  // Redirect to all-stars section if on players tab but no section specified
  if (currentTab === "players" && !section && managerId) {
    return <Navigate to={`/managers/${managerId}/players/allstars`} replace />;
  }

  if (!managerStats) {
    return (
      <div className="container mx-auto py-8">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-600">
            Manager not found
          </h1>
          <button
            onClick={() => navigate("/managers")}
            className="mt-4 text-blue-600 hover:text-blue-800"
          >
            ← Back to Managers
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto space-y-6">
      <Breadcrumbs
        crumbs={[
          { label: "Managers", to: "/managers" },
          { label: managerStats.managerName },
        ]}
      />
      {/* Header. The rule is the manager's accent — exactly one manager is on
          screen here, which is the case F2 carves out for identity colour.
          Stacks on a phone: the name and the data-mode select side by side at
          375px squeezed the select to about eighty pixels. */}
      <div
        className="flex flex-col gap-3 border-l-4 pl-3 sm:flex-row sm:items-center sm:justify-between"
        style={{ borderLeftColor: getManagerAccent(managerStats.managerId) }}
      >
        <div>
          <h1 className="text-3xl font-bold">{managerStats.managerName}</h1>
          <p className="text-xl text-gray-600">{managerStats.teamName}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <div className="flex items-center space-x-2">
            <span className="text-sm text-gray-600">Data Mode:</span>
            <select
              value={dataMode}
              onChange={(e) => setDataMode(e.target.value as DataMode)}
              className="px-3 py-2 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="regular">Regular Season</option>
              <option value="playoffs">Playoffs Only</option>
              <option value="combined">Regular + Playoffs</option>
            </select>
          </div>

          {/* G2/G3/G4. The card is built on click: embedding the avatar and
              the crest are fetches, and nobody should pay for them just by
              opening a manager page. */}
          {bestSeason && (
            <div className="flex flex-col items-start gap-1">
              <ShareButton
                card={async () => {
                  const [{ managerSeasonCard }, { embedImage }] =
                    await Promise.all([
                      import("@/presentation/components/ShareCard/templates"),
                      import("@/presentation/components/ShareCard"),
                    ]);
                  const [crest, avatar] = await Promise.all([
                    embedImage("/images/logo.png"),
                    bestSeason.avatarUrl
                      ? embedImage(bestSeason.avatarUrl)
                      : null,
                  ]);
                  return managerSeasonCard({
                    year: bestSeason.year,
                    manager: { name: bestSeason.manager.name, avatar },
                    teamName: bestSeason.teamName,
                    wins: bestSeason.season.wins,
                    losses: bestSeason.season.losses,
                    ties: bestSeason.season.ties,
                    pointsFor: bestSeason.season.pointsFor,
                    finish: bestSeason.finish,
                    badge: bestSeason.badge,
                    accent: getManagerAccent(bestSeason.manager.id),
                    crest,
                    // Filtered to notes about a manager or a season: a
                    // manager-season card has no business printing "the 2nd
                    // most notable week on this date", which is league-scoped
                    // and true of a page this card is not.
                    note: narrate(
                      stats,
                      {
                        managerIds: [bestSeason.manager.id],
                        year: bestSeason.year,
                      },
                      { limit: 8 }
                    ).find(
                      (n) => n.scope === "manager" || n.scope === "season"
                    ),
                  });
                }}
              />
              {/* Which season the card is about, said before it is drawn. */}
              <p className="text-xs text-gray-500">
                Card: {bestSeason.year} — {bestSeason.record}
                {bestSeason.finish ? `, finished ${bestSeason.finish}` : ""}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-gray-200">
        <ScrollableTabs className="-mb-px space-x-8">
          <Link
            to={`/managers/${managerId}/summary`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "summary"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Summary
          </Link>
          <Link
            to={`/managers/${managerId}/seasons`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "seasons"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Seasons
          </Link>
          <Link
            to={`/managers/${managerId}/h2h`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "h2h"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            H2H
          </Link>
          <Link
            to={`/managers/${managerId}/players/allstars`}
            className={`py-2 px-1 border-b-2 font-medium text-sm ${
              currentTab === "players"
                ? "border-blue-500 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
            }`}
          >
            Players
          </Link>
        </ScrollableTabs>
      </div>

      {/* Player Section Filter Buttons */}
      {currentTab === "players" && (
        <div className=" bg-white">
          <div className="">
            <div className="flex flex-wrap gap-2">
              <Link
                to={`/managers/${managerId}/players/allstars`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "allstars"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                All Stars
              </Link>
              <Link
                to={`/managers/${managerId}/players/drafted`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "drafted"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Most Drafted
              </Link>
              <Link
                to={`/managers/${managerId}/players/capped`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "capped"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Most Capped
              </Link>
              <Link
                to={`/managers/${managerId}/players/performances`}
                className={`px-3 py-1 rounded-md text-sm font-medium transition-colors ${
                  selectedPlayerSection === "performances"
                    ? "bg-blue-600 text-white"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                }`}
              >
                Top Performances
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* Tab Content */}
      {currentTab === "summary" && managerStats && (
        <CareerSummary stats={managerStats} dataMode={dataMode} />
      )}

      {currentTab === "seasons" && managerStats && (
        <SeasonBreakdown seasonStats={managerStats.seasonStats} />
      )}

      {currentTab === "h2h" && managerStats && (
        <H2HTable
          h2hRecords={h2hRecords}
          managerId={(managerStats as ManagerStats).managerId}
        />
      )}

      {currentTab === "players" && managerStats && (
        <Card padding="none" className="py-4">
          {/* All-Star Lineup */}
          {selectedPlayerSection === "allstars" && (
            <AllStarLineup
              allStarLineup={(managerStats as ManagerStats).allStarLineup || []}
            />
          )}

          {/* Most Drafted Players */}
          {selectedPlayerSection === "drafted" && (
            <MostDraftedPlayers
              mostDraftedPlayers={
                (managerStats as ManagerStats).mostDraftedPlayers || []
              }
            />
          )}

          {/* Most Capped Players */}
          {selectedPlayerSection === "capped" && (
            <MostCappedPlayers
              mostCappedPlayers={
                (managerStats as ManagerStats).mostCappedPlayers || []
              }
            />
          )}

          {/* Top Performances */}
          {selectedPlayerSection === "performances" && (
            <TopPerformances performances={filteredPerformances} />
          )}
        </Card>
      )}
    </div>
  );
};

export default ManagerDetail;
