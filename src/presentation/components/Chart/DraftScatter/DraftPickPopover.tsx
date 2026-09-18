import { useEffect, useState } from "react";
import { areTransactionsLoaded, loadTransactions } from "@/data";
import { getStatContext } from "@/utils/stats/traverse";
import { playerTrades, type PlayerTrade } from "@/utils/stats/transactionStats";
import {
  PopoverLinks,
  PopoverNote,
  PopoverRows,
  PopoverTitle,
} from "../Popover";
import type { DraftScatterPoint } from "./useDraftScatter";

/**
 * What a dot on the draft scatter is (I2 + I3).
 *
 * The number on the chart is the player's whole season. When the drafter did
 * not keep all of it, this is where the rest of the story goes: who had him,
 * and — when he was traded — what came back and who won the deal, straight
 * off the trade ledger so it cannot disagree with the trades page.
 */

const one = (value: number) => value.toFixed(1);
const signed = (value: number) =>
  `${value >= 0 ? "+" : "−"}${Math.abs(value).toFixed(1)}`;

const managerHref = (id: string) => `/managers/${id}`;
const playerHref = (id: string) => `/players/${encodeURIComponent(id)}`;

/**
 * This player's trades that season, once the season's transactions are in.
 *
 * Transactions are their own lazy chunk (A2a) and the draft page does not
 * need them, so they are fetched only when somebody pins a pick that left its
 * drafter — one season's file, not fifteen. A preview shows them only if they
 * happen to be loaded already, so hovering across the chart downloads nothing.
 */
const usePickTrades = (
  point: DraftScatterPoint,
  fetchIfMissing: boolean
): PlayerTrade[] | "loading" | null => {
  const relevant = point.pointsElsewhere > 0;
  const loaded = areTransactionsLoaded([point.year]);
  const [, bump] = useState(0);

  useEffect(() => {
    if (!relevant || loaded || !fetchIfMissing) return;
    let live = true;
    loadTransactions([point.year]).then(() => live && bump((n) => n + 1));
    return () => {
      live = false;
    };
  }, [relevant, loaded, fetchIfMissing, point.year]);

  if (!relevant) return null;
  if (!loaded) return fetchIfMissing ? "loading" : null;
  return playerTrades(getStatContext(), point.year, point.playerId);
};

const Deal = ({ trade }: { trade: PlayerTrade }) => {
  const got = [
    ...trade.received.map((r) => `${r.name} (${one(r.points)})`),
    ...trade.picks.map((pick) => `a ${pick} pick`),
    ...(trade.faab ? [`$${trade.faab} FAAB`] : []),
  ];
  const back = got.length ? got.join(", ") : "nothing";

  // "Who benefited", from the ledger. Only a two-team deal has one other
  // side to name; past that, say the giver's own number and no more.
  let verdict: string | null = null;
  if (trade.net !== undefined) {
    if (trade.teams === 2) {
      const winner = trade.net >= 0 ? trade.from : trade.to;
      verdict = `${winner} won it by ${one(Math.abs(trade.net))}`;
    } else {
      verdict = `${trade.from} ${signed(trade.net)} on the deal`;
    }
  } else if (trade.picks.length || trade.faab) {
    verdict = "not scored — draft picks and FAAB have no points value";
  }

  return (
    <li>
      <span className="font-medium">Week {trade.week}:</span> {trade.from} sent
      him to {trade.to} for {back}
      {verdict && <span className="text-ink-muted"> — {verdict}</span>}
    </li>
  );
};

export const DraftPickPopover = ({
  point,
  pinned,
}: {
  point: DraftScatterPoint;
  pinned: boolean;
}) => {
  const trades = usePickTrades(point, pinned);
  const drafter = point.managerId;
  const leftByTrade =
    Array.isArray(trades) && trades.some((trade) => trade.from === drafter);

  return (
    <>
      <PopoverTitle
        sub={
          <>
            {point.year} · round {point.round}, pick {point.pickNo} · {drafter}
          </>
        }
      >
        {point.name}
        <span className="ml-1.5 text-xs font-normal text-ink-muted">
          {point.position}
        </span>
      </PopoverTitle>

      <PopoverRows
        rows={[
          ["Season", `${one(point.total)} pts`],
          ["That pick usually", `${one(point.baseline)} pts`],
          [
            "Value",
            <strong
              key="v"
              className={
                point.value >= 0 ? "text-series-1" : "text-result-loss"
              }
            >
              {signed(point.value)}
            </strong>,
          ],
          point.pointsElsewhere > 0 && [`For ${drafter}`, one(point.points)],
          point.pointsElsewhere > 0 && [
            "For others",
            one(point.pointsElsewhere),
          ],
        ]}
      />

      {trades === "loading" && <PopoverNote>Finding the trade…</PopoverNote>}
      {Array.isArray(trades) && trades.length > 0 && (
        <ul className="mt-1.5 max-w-[18rem] space-y-0.5 leading-snug">
          {trades.map((trade) => (
            <Deal
              key={`${trade.week}-${trade.from}-${trade.to}`}
              trade={trade}
            />
          ))}
        </ul>
      )}
      {Array.isArray(trades) && !leftByTrade && (
        <PopoverNote>
          {drafter} let him go; he was picked up elsewhere.
        </PopoverNote>
      )}
      {point.pointsElsewhere > 0 && trades === null && (
        <PopoverNote>
          Moved on during the season — click for the trade.
        </PopoverNote>
      )}
      {point.approximate && (
        <PopoverNote>
          2019&rsquo;s per-player scores are reconstructed, not recorded.
        </PopoverNote>
      )}

      {pinned && (
        <PopoverLinks
          links={[
            { to: playerHref(point.playerId), label: point.name },
            { to: managerHref(drafter), label: drafter },
            {
              to: `/seasons/${point.year}/draft`,
              label: `${point.year} draft`,
            },
            Array.isArray(trades) &&
              trades.length > 0 && {
                to: `/seasons/${point.year}/trades`,
                label: "Trades",
              },
          ]}
        />
      )}
    </>
  );
};
