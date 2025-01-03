export interface BracketMatch {
  r: number; // round
  m: number; // match
  w: number; // winner
  l: number; // loser
  t1: number; // team 1
  t2: number; // team 2
  p?: number; // position (optional)
  t1_from?: {
    w?: number; // winner from (optional)
    l?: number; // loser from (optional)
  };
  t2_from?: {
    w?: number; // winner from (optional)
    l?: number; // loser from (optional)
  };
}

export type WinnersBracket = BracketMatch[];
export type LosersBracket = BracketMatch[];
