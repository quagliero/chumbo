import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import H2HContent from "@/presentation/components/H2HContent/H2HContent";
import { managers, seasons } from "@/data";
import { YEARS, type ValidYear } from "@/domain/constants";
import { getManagerAccent } from "@/domain/managerColors";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { getAllTimeH2HRecord } from "@/utils/h2h";
import { narrate } from "@/utils/narrative/narrate";
import { getUserAvatarUrl, getUserByOwnerId } from "@/utils/userAvatar";
import {
  NarrativeNotes,
  useNarrativeStats,
} from "@/presentation/components/Narrative";
import { ShareButton } from "@/presentation/components/ShareButton";

/**
 * Their most recent avatar, which is the face the league knows.
 *
 * Not "their avatar in the season this is about", because this card is not
 * about a season. `users.json` is eagerly loaded for every year (only matchups
 * and transactions are lazy — A2a), so this costs nothing.
 */
const latestAvatarUrl = (ownerId: string): string | null => {
  for (const year of [...YEARS].sort((a, b) => b - a)) {
    const url = getUserAvatarUrl(
      getUserByOwnerId(ownerId, seasons[year as ValidYear]?.users)
    );
    if (url) return url;
  }
  return null;
};

export default function H2HDetail() {
  // The all-time record walks every season's matchups, which are a lazy chunk
  // (A2a). `H2HContent` already suspends on them; this page now reads them
  // too, so it has to say so itself rather than rely on a child having asked.
  useAllSeasons();
  const { managerA, managerB } = useParams<{
    managerA: string;
    managerB: string;
  }>();
  const stats = useNarrativeStats();

  /**
   * Everything the share card needs, and nothing the page did not already
   * know. Null when either id is not a manager, or when the two have never
   * met — a 0–0 card is not a fact.
   */
  const share = useMemo(() => {
    const a = managers.find((m) => m.id === managerA);
    const b = managers.find((m) => m.id === managerB);
    if (!a || !b || a.id === b.id) return null;

    const record = getAllTimeH2HRecord(a.sleeper.id, b.sleeper.id);
    const wins = record.team1Wins;
    const losses = record.team2Wins;
    if (wins + losses + record.ties === 0) return null;

    return {
      a,
      b,
      wins,
      losses,
      ties: record.ties,
      // One accent, and it belongs to whoever is ahead (the F2 rule). A level
      // series gets the template's neutral ink.
      accent:
        wins > losses
          ? getManagerAccent(a.id)
          : losses > wins
          ? getManagerAccent(b.id)
          : undefined,
      avatarA: latestAvatarUrl(a.sleeper.id),
      avatarB: latestAvatarUrl(b.sleeper.id),
    };
  }, [managerA, managerB]);

  if (!managerA || !managerB) {
    return (
      <div className="container mx-auto">
        <div className="text-center py-12">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">
            Invalid Matchup
          </h1>
          <p className="text-gray-600">
            Please provide valid manager IDs for both managers.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center space-x-4">
            <Link
              to="/h2h"
              className="text-blue-600 hover:text-blue-800 text-sm font-medium"
            >
              ← Go to H2H
            </Link>
          </div>
        </div>

        <div className="flex flex-wrap items-start justify-between gap-3">
          {/*
            E7, now that it can speak about a pairing. `pairing` rather than
            `managerIds`: the latter matches anything about EITHER manager, and
            "the longest losing streak in Chumbo history" printed above
            "thd 9–9 jay" reads as a claim about the series. Renders nothing at
            all for the ~200 pairings that are not among the closest rivalries.
          */}
          <NarrativeNotes subject={{ pairing: [managerA, managerB] }} />

          {/* G2's card "that exists to end an argument", on the page where the
              argument happens. Built on click — the two avatars are fetches. */}
          {share && (
            <ShareButton
              className="ml-auto"
              card={async () => {
                const [{ h2hRecordCard }, { embedImage }] = await Promise.all([
                  import("@/presentation/components/ShareCard/templates"),
                  import("@/presentation/components/ShareCard"),
                ]);
                const [crest, avatarA, avatarB] = await Promise.all([
                  embedImage("/images/logo.png"),
                  share.avatarA ? embedImage(share.avatarA) : null,
                  share.avatarB ? embedImage(share.avatarB) : null,
                ]);
                return h2hRecordCard({
                  a: { name: share.a.name, avatar: avatarA },
                  b: { name: share.b.name, avatar: avatarB },
                  wins: share.wins,
                  losses: share.losses,
                  ties: share.ties,
                  // The span the number actually has. `getAllTimeH2HRecord`
                  // skips playoff weeks, so a card that said only "All time"
                  // — as this page's prerendered preview still does — would be
                  // overclaiming by two rounds of football. Worded to say both
                  // halves inside the footer's 404px: "All time · regular
                  // season" measures 436 and comes out ellipsised, which is
                  // the one thing worse than a short span.
                  span: "Every regular season",
                  accent: share.accent,
                  crest,
                  note: narrate(stats, {
                    pairing: [share.a.id, share.b.id],
                  })[0],
                });
              }}
            />
          )}
        </div>
      </div>

      <H2HContent managerA={managerA} managerB={managerB} />
    </div>
  );
}
