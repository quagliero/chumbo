import { useMemo } from "react";
import { useParams, Link } from "react-router-dom";
import H2HContent from "@/presentation/components/H2HContent/H2HContent";
import { managers } from "@/data";
import { useAllSeasons } from "@/hooks/useSeasonData";
import { getAllTimeH2HRecord } from "@/utils/h2h";
import { narrate } from "@/utils/narrative/narrate";
import {
  NarrativeNotes,
  useNarrativeStats,
} from "@/presentation/components/Narrative";
import { ShareButton } from "@/presentation/components/ShareButton";
import { h2hShare } from "@/presentation/shareCards/factories";

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
   * Whether there is a card to share. The card itself comes from
   * `shareCards/cardData`, the same place the link preview of this page reads,
   * so the two cannot disagree. Two managers who have never met get no
   * button: a 0–0 card is not a fact.
   */
  const canShare = useMemo(() => {
    const a = managers.find((m) => m.id === managerA);
    const b = managers.find((m) => m.id === managerB);
    if (!a || !b || a.id === b.id) return false;
    const record = getAllTimeH2HRecord(a.sleeper.id, b.sleeper.id);
    return record.team1Wins + record.team2Wins + record.ties > 0;
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
          {/* I4: the page's card, at the end of the page's heading row. The
              streak and the span come from the same data as the preview. */}
          {canShare && (
            <ShareButton
              what="head-to-head card"
              // The note is narrated on click, not on every render.
              card={async () =>
                h2hShare(
                  managerA,
                  managerB,
                  narrate(stats, { pairing: [managerA, managerB] })[0]
                )()
              }
            />
          )}
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
        </div>
      </div>

      <H2HContent managerA={managerA} managerB={managerB} />
    </div>
  );
}
