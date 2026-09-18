import type { GamedayLine } from "@/data/gamedays";

/**
 * A player's box score as one line (L1): "26/35, 286 yds, 3 TD · 4 car, 28
 * yds". What he did, in the order his position is judged by — a quarterback's
 * passing first, a running back's rushing, a receiver's catches — and only the
 * parts he actually did something in.
 */

const plural = (n: number, one: string, many = `${one}s`) =>
  `${n} ${n === 1 ? one : many}`;

const passing = (s: GamedayLine["s"]) => {
  if (!s.pAtt && !s.pYd) return "";
  const parts = [`${s.pCmp ?? 0}/${s.pAtt ?? 0}, ${s.pYd ?? 0} yds`];
  if (s.pTd) parts.push(`${s.pTd} TD`);
  if (s.int) parts.push(`${s.int} INT`);
  return parts.join(", ");
};

const rushing = (s: GamedayLine["s"]) => {
  if (!s.rAtt && !s.rYd && !s.rTd) return "";
  const parts = [`${s.rAtt ?? 0} car, ${s.rYd ?? 0} yds`];
  if (s.rTd) parts.push(`${s.rTd} TD`);
  return parts.join(", ");
};

const receiving = (s: GamedayLine["s"]) => {
  if (!s.rec && !s.tgt && !s.reYd && !s.reTd) return "";
  // Shut out: how many times he was looked for says more than "0 yds".
  if (!s.rec && s.tgt) return `0 catches on ${plural(s.tgt, "target")}`;
  const parts = [`${s.rec ?? 0} rec, ${s.reYd ?? 0} yds`];
  if (s.reTd) parts.push(`${s.reTd} TD`);
  return parts.join(", ");
};

const extras = (s: GamedayLine["s"]) =>
  [
    s.stTd ? `${plural(s.stTd, "return TD")}` : "",
    s["2pt"] ? `${s["2pt"]} 2PT` : "",
    s.fl ? `${plural(s.fl, "fumble")} lost` : "",
  ].filter(Boolean);

const kicking = (s: GamedayLine["s"]) =>
  [
    s.fgAtt ? `FG ${s.fgm ?? 0}/${s.fgAtt}${s.fgLong ? ` (long ${s.fgLong})` : ""}` : "",
    s.xpAtt ? `XP ${s.xpm ?? 0}/${s.xpAtt}` : "",
  ].filter(Boolean);

const defence = (s: GamedayLine["s"]) =>
  [
    s.sk ? plural(s.sk, "sack") : "",
    s.int ? `${s.int} INT` : "",
    s.fr ? `${s.fr} fumble rec` : "",
    s.td ? `${s.td} TD` : "",
    s.sf ? plural(s.sf, "safety", "safeties") : "",
    s.blk ? `${s.blk} blocked` : "",
    s.pa !== undefined ? `${s.pa} allowed` : "",
  ].filter(Boolean);

export const formatStatLine = (line: GamedayLine, position: string): string => {
  const s = line.s;
  if (position === "DEF") return defence(s).join(", ");
  if (position === "K") return kicking(s).join(" · ");

  const order =
    position === "QB"
      ? [passing, rushing, receiving]
      : position === "RB"
        ? [rushing, receiving, passing]
        : [receiving, rushing, passing];
  return [...order.map((part) => part(s)), ...extras(s)]
    .filter(Boolean)
    .join(" · ");
};
