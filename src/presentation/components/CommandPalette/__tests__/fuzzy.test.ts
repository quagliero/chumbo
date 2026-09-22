import { describe, expect, it } from "vitest";
import {
  fuzzyPositions,
  fuzzyScore,
  isSubsequence,
  normalize,
  tokenize,
} from "../fuzzy";
import { searchCommands } from "../commands";

/** Score, asserting there was a match — most cases here expect one. */
const score = (token: string, text: string): number => {
  const value = fuzzyScore(token, text);
  expect(value, `"${token}" should match "${text}"`).not.toBeNull();
  return value as number;
};

describe("fuzzyScore", () => {
  it("matches a subsequence and rejects anything else", () => {
    expect(fuzzyScore("amrb", "amon-ra st. brown")).not.toBeNull();
    expect(fuzzyScore("brown", "brown")).not.toBeNull();
    expect(fuzzyScore("zz", "amon-ra st. brown")).toBeNull();
    // Right characters, wrong order.
    expect(fuzzyScore("ba", "abc")).toBeNull();
    // Longer than the haystack.
    expect(fuzzyScore("abcd", "abc")).toBeNull();
    expect(fuzzyScore("", "abc")).toBeNull();
  });

  it("prefers word starts to the middle of a word", () => {
    expect(score("mb", "mike brown")).toBeGreaterThan(score("mb", "mumble"));
  });

  it("prefers characters typed as a run", () => {
    expect(score("ab", "abz")).toBeGreaterThan(score("ab", "azb"));
  });

  it("prefers the shorter of two otherwise equal haystacks", () => {
    expect(score("ab", "ab")).toBeGreaterThan(score("ab", "abcdefgh"));
  });

  it("charges for skipping the front of the haystack", () => {
    expect(score("brown", "brownlee")).toBeGreaterThan(
      score("brown", "jim brownlee")
    );
  });

  it("ranks the intended player top across the whole dictionary", () => {
    // The case that motivated the DP: greedy matching takes the first `a` and
    // the first `r` and never reaches the initials.
    const rodgers = score("arod", "aaron rodgers");
    expect(rodgers).toBeGreaterThan(score("arod", "aaron rodriguez-odom"));
  });
});

describe("isSubsequence", () => {
  it("agrees with fuzzyScore about what matches", () => {
    const texts = ["aaron rodgers", "amon-ra st. brown", "2019 week 8"];
    const tokens = ["ar", "arod", "zz", "2019", "w8", "week"];

    for (const text of texts) {
      for (const token of tokens) {
        expect(isSubsequence(token, text)).toBe(
          fuzzyScore(token, text) !== null
        );
      }
    }
  });
});

describe("fuzzyPositions", () => {
  it("returns ascending in-bounds indices holding the query's characters", () => {
    const text = "amon-ra st. brown";
    const token = "amrb";
    const positions = fuzzyPositions(token, text);

    expect(positions).toHaveLength(token.length);
    positions.forEach((position, index) => {
      expect(position).toBeGreaterThanOrEqual(0);
      expect(position).toBeLessThan(text.length);
      expect(text[position]).toBe(token[index]);
      if (index > 0) expect(position).toBeGreaterThan(positions[index - 1]);
    });
  });

  it("lands on the word starts, not the first characters it happens to see", () => {
    // "aaron rodgers": the greedy answer would be 0,1 for "aa" and then miss.
    expect(fuzzyPositions("ar", "aaron rodgers")).toEqual([0, 6]);
  });

  it("returns nothing when there is no match", () => {
    expect(fuzzyPositions("zz", "aaron rodgers")).toEqual([]);
  });
});

describe("normalize and tokenize", () => {
  it("folds case and diacritics", () => {
    expect(normalize("Amon-Ra St. Brown")).toBe("amon-ra st. brown");
    expect(normalize("Manuél")).toBe("manuel");
  });

  it("splits on whitespace and drops the gaps", () => {
    expect(tokenize("  2019   week 8 ")).toEqual(["2019", "week", "8"]);
    expect(tokenize("   ")).toEqual([]);
  });
});

describe("searchCommands", () => {
  const titles = (query: string) =>
    searchCommands(query).map((result) => result.item.title);

  it("offers the dice and the top-level pages before anything is typed", () => {
    const empty = titles("");
    expect(empty).toContain("Random matchup");
    expect(empty).toContain("Managers");
  });

  it("puts a manager first for their own name", () => {
    expect(searchCommands("thd")[0].item.to).toBe("/managers/thd");
    expect(searchCommands("hadkiss")[0].item.to).toBe("/managers/hadkiss");
  });

  it("finds a manager by their team name", () => {
    expect(titles("wishful tinkering")).toContain("thd");
  });

  it("finds a season, and a week within it", () => {
    const weeks = searchCommands("2019 week 8");
    expect(weeks[0].item.to).toBe("/seasons/2019/matchups?week=8");
    expect(searchCommands("2014 draft")[0].item.to).toBe(
      "/seasons/2014/draft"
    );
  });

  it("takes the tokens of a query in any order", () => {
    expect(searchCommands("week 8 2019")[0].item.to).toBe(
      "/seasons/2019/matchups?week=8"
    );
  });

  it("finds a player from a partial name", () => {
    const results = searchCommands("rodgers");
    const player = results.find((result) => result.item.kind === "player");
    expect(player?.item.to).toMatch(/^\/players\//);
    expect(player?.item.title.toLowerCase()).toContain("rodgers");
  });

  it("finds a head-to-head pairing", () => {
    const results = searchCommands("thd vs jay");
    const pairing = results.find((result) => result.item.kind === "h2h");
    expect(pairing?.item.to).toBe("/h2h/thd/jay");
  });

  it("does not let one kind fill the list", () => {
    const kinds = searchCommands("a").map((result) => result.item.kind);
    expect(new Set(kinds).size).toBeGreaterThan(1);
  });

  it("returns nothing for a query that matches nothing", () => {
    expect(searchCommands("zzzzqqqq")).toEqual([]);
  });

  it("only ever offers routes the app can render", () => {
    const routes = [
      /^\/$/,
      /^\/(seasons|managers|players|h2h|hof|explorer|records|wiki|careers|luck|top-scores|breakdown|trades|schedule-comparison)/,
    ];

    for (const query of ["", "a", "2019", "thd", "rodgers", "week 3"]) {
      for (const { item } of searchCommands(query)) {
        if (!item.to) {
          expect(item.action).toBe("random-matchup");
          continue;
        }
        expect(
          routes.some((route) => route.test(item.to as string)),
          `${item.to} is not a route this app serves`
        ).toBe(true);
      }
    }
  });
});
