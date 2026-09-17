/**
 * The fuzzy matcher behind the command palette (E3).
 *
 * Hand-rolled, deliberately: the corpus is a few thousand short strings, and
 * `fuse.js` is 12 kB gzipped against a payload story (2.89 MB -> 342 kB) that
 * Workstream A spent itself buying. This is the one thing the palette needs —
 * rank a subsequence match so that "amrb" finds "Amon-Ra St. Brown".
 *
 * The scorer is a small dynamic program rather than a greedy scan, because
 * greedy left-to-right matching takes the first occurrence of each character
 * and then cannot see the better one further right: "arod" against "Aaron
 * Rodgers" greedily eats both leading `a`s and matches nothing at a word
 * start. The DP is O(query x text) over strings of twenty-odd characters,
 * which is nothing, and it is guarded by a linear subsequence pre-check that
 * throws out the vast majority of the dictionary before any of it runs.
 */

/** Characters after which the next character begins a new word. */
const SEPARATORS = new Set([" ", "-", "_", ".", "'", "/", ",", "(", ")", "&"]);

/** Landing on the first letter of a word is the strongest signal there is. */
const WORD_START_BONUS = 12;
/** ...and the very start of the string is stronger still. */
const FIRST_CHAR_BONUS = 6;
/** Characters typed as a run should beat the same characters scattered about. */
const CONSECUTIVE_BONUS = 10;
/** Charged per character skipped between two matches. */
const GAP_PENALTY = 0.6;
/**
 * Charged per character of the haystack, so a query that matches all of a
 * short label outranks the same query buried in a long one. Small: it breaks
 * ties, it does not decide matches.
 */
const LENGTH_PENALTY = 0.05;

/**
 * Lowercase and strip diacritics, so "manuel" finds "Manuél" and a name that
 * arrives from Sleeper accented is still reachable from an ASCII keyboard.
 */
export const normalize = (value: string): string =>
  value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/** Split a query into tokens. Each must match; their order is not required. */
export const tokenize = (query: string): string[] =>
  normalize(query).split(/\s+/).filter(Boolean);

/** Is `text[index]` the first character of a word? */
const isWordStart = (text: string, index: number): boolean =>
  index === 0 || SEPARATORS.has(text[index - 1]);

const positionBonus = (text: string, index: number): number =>
  index === 0
    ? WORD_START_BONUS + FIRST_CHAR_BONUS
    : isWordStart(text, index)
    ? WORD_START_BONUS
    : 0;

/**
 * Cheap rejection: is `token` a subsequence of `text` at all? Greedy answers
 * that question exactly — only the *score* needs the DP.
 */
export const isSubsequence = (token: string, text: string): boolean => {
  let from = 0;
  for (let i = 0; i < token.length; i++) {
    const found = text.indexOf(token[i], from);
    if (found === -1) return false;
    from = found + 1;
  }
  return true;
};

/**
 * Score `token` against `text`, both already normalized. `null` when `token`
 * is not a subsequence of `text`. Higher is better, and scores are comparable
 * across different haystacks — which is what the length penalty is for.
 */
export const fuzzyScore = (token: string, text: string): number | null => {
  if (!token || token.length > text.length) return null;
  if (!isSubsequence(token, text)) return null;

  const n = text.length;
  let previous = new Float64Array(n).fill(-Infinity);
  let current = new Float64Array(n).fill(-Infinity);

  for (let q = 0; q < token.length; q++) {
    const needle = token[q];
    // Best score for the previous query character ending at or before j - 2,
    // already charged for the gap it would leave. Decayed as j advances
    // rather than recomputed, which is what keeps the inner loop linear.
    let bestDetached = -Infinity;

    for (let j = 0; j < n; j++) {
      if (j >= 2) {
        bestDetached = Math.max(bestDetached - GAP_PENALTY, previous[j - 2]);
      }

      if (text[j] !== needle) {
        current[j] = -Infinity;
        continue;
      }

      if (q === 0) {
        // Haystack characters the query skipped before its first match are a
        // gap like any other.
        current[j] = positionBonus(text, j) - j * GAP_PENALTY;
        continue;
      }

      const adjacent = j > 0 ? previous[j - 1] : -Infinity;
      const best = Math.max(
        adjacent === -Infinity ? -Infinity : adjacent + CONSECUTIVE_BONUS,
        bestDetached
      );

      current[j] =
        best === -Infinity ? -Infinity : best + positionBonus(text, j);
    }

    const swap = previous;
    previous = current;
    current = swap;
  }

  let best = -Infinity;
  for (let j = 0; j < n; j++) best = Math.max(best, previous[j]);

  // `isSubsequence` already established there is a match, so `best` is finite.
  return best - n * LENGTH_PENALTY;
};

/**
 * The indices of `text` that `token` matched, for highlighting. The same DP
 * with its choices kept, so a highlight can never disagree with the score that
 * ranked the row. Run only for the handful of rows actually on screen.
 */
export const fuzzyPositions = (token: string, text: string): number[] => {
  if (!token || !isSubsequence(token, text)) return [];

  const n = text.length;
  const m = token.length;
  const rows: Float64Array[] = [];
  const cameFrom: Int32Array[] = [];

  for (let q = 0; q < m; q++) {
    const row = new Float64Array(n).fill(-Infinity);
    const from = new Int32Array(n).fill(-1);
    const needle = token[q];
    let bestDetached = -Infinity;
    let bestDetachedAt = -1;

    for (let j = 0; j < n; j++) {
      if (j >= 2 && q > 0) {
        const entering = rows[q - 1][j - 2];
        const decayed = bestDetached - GAP_PENALTY;
        if (entering >= decayed) {
          bestDetached = entering;
          bestDetachedAt = j - 2;
        } else {
          bestDetached = decayed;
        }
      }

      if (text[j] !== needle) continue;

      if (q === 0) {
        row[j] = positionBonus(text, j) - j * GAP_PENALTY;
        continue;
      }

      const adjacent = j > 0 ? rows[q - 1][j - 1] : -Infinity;
      const adjacentScore =
        adjacent === -Infinity ? -Infinity : adjacent + CONSECUTIVE_BONUS;

      if (adjacentScore === -Infinity && bestDetached === -Infinity) continue;

      if (adjacentScore >= bestDetached) {
        row[j] = adjacentScore + positionBonus(text, j);
        from[j] = j - 1;
      } else {
        row[j] = bestDetached + positionBonus(text, j);
        from[j] = bestDetachedAt;
      }
    }

    rows.push(row);
    cameFrom.push(from);
  }

  let end = -1;
  let best = -Infinity;
  for (let j = 0; j < n; j++) {
    if (rows[m - 1][j] > best) {
      best = rows[m - 1][j];
      end = j;
    }
  }
  if (end === -1) return [];

  const positions: number[] = [];
  for (let q = m - 1; q >= 0 && end >= 0; q--) {
    positions.push(end);
    if (q > 0) end = cameFrom[q][end];
  }
  return positions.reverse();
};
