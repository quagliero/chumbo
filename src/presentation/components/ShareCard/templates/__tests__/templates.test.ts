/**
 * What the templates are tested for, and why it is these things (G2).
 *
 * A card is a picture, and a test cannot look at a picture — that is what the
 * harness next door is for, and it is not optional. What a test CAN do is hold
 * the three properties whose failures are invisible until after somebody has
 * already pasted the card into the group chat:
 *
 *   1. **Well-formed.** An SVG that is not well-formed does not render half a
 *      card; the `<img>` fails to load and `toBlob` never runs. A team name
 *      from Sleeper is user input, so this is one escaping mistake away at all
 *      times.
 *   2. **Nothing overflows.** Text is positioned by anchor and fitted by
 *      estimate, so a name that is too long does not wrap or clip — it simply
 *      runs off the edge of the picture, where nothing will tell you.
 *   3. **A caveated fact says so.** 2019's per-player scoring is a
 *      reconstruction, and a card that claims a league record on it without
 *      saying so is worse than no card.
 */

import { describe, expect, it } from "vitest";
import { CARD_WIDTH } from "../../card";
import { estimateTextWidth, type FontWeight } from "../../fonts";
import { CARD_TOKENS } from "../../tokens";
import {
  CAVEAT_LONG,
  SITE_NAME,
  SITE_URL,
  draftPickCard,
  finalScoreCard,
  formatPickLabel,
  formatPoints,
  formatRecord,
  h2hRecordCard,
  managerSeasonCard,
  matchupPreviewCard,
  recordBrokenCard,
  weekRecapCard,
} from "../index";
import { FINAL_SCORE_NAME_BOX } from "../finalScore";

/** A live team name, and the reason `truncateToWidth` exists. */
const LONG = "Zaragoza's Zooting Zorro";
/** The punctuation the league actually uses. */
const PUNCTUATED = "Salt & Pepper's \"Best\" <Team> — 'ever'";
/** What an attacker (or a bored manager) would try. */
const HOSTILE = '</text><rect width="9999" height="9999" fill=\'red\'/>';

// ---------------------------------------------------------------------------
// A minimal XML scanner.
//
// Node has no XML parser and the renderer's whole contract is that it emits
// well-formed markup, so the check is written here rather than taken on faith.
// It only has to handle the subset the primitives emit — attribute values are
// always double-quoted and always escaped, so quote tracking is enough.
// ---------------------------------------------------------------------------

interface Element {
  name: string;
  attrs: Record<string, string>;
  text: string;
}

const unescapeXml = (value: string) =>
  value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

const parseAttrs = (source: string): Record<string, string> => {
  const out: Record<string, string> = {};
  for (const match of source.matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    out[match[1]] = unescapeXml(match[2]);
  }
  return out;
};

/**
 * Scan `markup`, asserting it is well-formed, and return every element with
 * its attributes and its immediate text.
 *
 * Throws on a mismatched or unclosed tag and on a bare `<` or `>` in text —
 * which is exactly what an unescaped team name produces.
 */
const scan = (markup: string): Element[] => {
  const elements: Element[] = [];
  const stack: { name: string; index: number }[] = [];
  let i = 0;

  while (i < markup.length) {
    const lt = markup.indexOf("<", i);
    const text = markup.slice(i, lt === -1 ? markup.length : lt);
    if (text.includes(">")) {
      throw new Error(`bare ">" in text: ${JSON.stringify(text.slice(0, 40))}`);
    }
    if (stack.length && text) {
      elements[stack[stack.length - 1].index].text += unescapeXml(text);
    }
    if (lt === -1) break;

    let j = lt + 1;
    let quoted = false;
    for (; j < markup.length; j += 1) {
      const char = markup[j];
      if (char === '"') quoted = !quoted;
      else if (char === ">" && !quoted) break;
    }
    if (j >= markup.length) throw new Error("unterminated tag");

    const body = markup.slice(lt + 1, j);
    if (body.startsWith("/")) {
      const name = body.slice(1).trim();
      const open = stack.pop();
      if (!open || open.name !== name) {
        throw new Error(`mismatched </${name}> (open: ${open?.name ?? "none"})`);
      }
    } else {
      const selfClosing = body.endsWith("/");
      const name = body.replace(/\/$/, "").trim().split(/\s/)[0];
      elements.push({
        name,
        attrs: parseAttrs(body),
        text: "",
      });
      if (!selfClosing) stack.push({ name, index: elements.length - 1 });
    }
    i = j + 1;
  }

  if (stack.length) {
    throw new Error(`unclosed: ${stack.map((s) => s.name).join(", ")}`);
  }
  return elements;
};

/** Horizontal extent of every string on the card, per its own anchor. */
const textExtents = (markup: string) => {
  const elements = scan(markup);
  const spans: { text: string; left: number; right: number }[] = [];

  elements.forEach((element, index) => {
    if (element.name !== "text") return;
    const size = Number(element.attrs["font-size"] ?? 16);
    const weight = Number(element.attrs["font-weight"] ?? 400) as FontWeight;
    const anchor = element.attrs["text-anchor"] ?? "start";
    // `textLines` puts the strings in tspans, each with its own x.
    const children = elements
      .slice(index + 1)
      .filter((child, offset) => child.name === "tspan" && offset < 8);
    const pieces = children.length
      ? children.map((child) => ({
          text: child.text,
          x: Number(child.attrs.x ?? element.attrs.x ?? 0),
        }))
      : [{ text: element.text, x: Number(element.attrs.x ?? 0) }];

    for (const piece of pieces) {
      if (!piece.text) continue;
      const width = estimateTextWidth(piece.text, size, weight);
      const left =
        anchor === "end"
          ? piece.x - width
          : anchor === "middle"
            ? piece.x - width / 2
            : piece.x;
      spans.push({ text: piece.text, left, right: left + width });
    }
  });

  return spans;
};

const person = (name: string) => ({ name, avatar: null });

/** One of each card, with the same nasty name in every name-shaped slot. */
const allFive = (name: string) => ({
  finalScore: finalScoreCard({
    year: 2025,
    week: 14,
    teams: [
      { name, score: 96.08, avatar: null },
      { name: `${name} II`, score: 147.62, avatar: null },
    ],
    accent: "#eda100",
    note: { text: "The 3rd-biggest margin of victory in Chumbo history." },
  }),
  managerSeason: managerSeasonCard({
    year: 2021,
    manager: person(name),
    teamName: name,
    wins: 11,
    losses: 3,
    pointsFor: 1842.64,
    finish: "1st",
    badge: "Champion",
    accent: "#eda100",
  }),
  h2h: h2hRecordCard({
    a: person(name),
    b: person(`${name} II`),
    wins: 14,
    losses: 10,
    ties: 1,
    streak: `${name} has won the last four`,
    accent: "#4a3aa7",
  }),
  draftPick: draftPickCard({
    year: 2021,
    round: 1,
    pickInRound: 3,
    overall: 3,
    player: { name, position: "RB", team: "CAR" },
    manager: person(name),
    accent: "#4a3aa7",
  }),
  recordBroken: recordBrokenCard({
    value: "212.4",
    holder: name,
    when: "2021 · Week 9",
    accent: "#eda100",
    note: { text: "The highest single-week score in Chumbo history." },
  }),
  weekRecap: weekRecapCard({
    year: 2025,
    week: 7,
    rows: [
      { label: "Top score", text: `${name} 162.4, and still lost to ${name} II` },
      { label: "Closest game", text: `${name} 97.6–96.5 ${name} II, by 1.06` },
      { label: "Luckiest win", text: `${name}, with the week's 7th-best score (beat 5 of 11)` },
      { label: "Worst benching", text: `${name} left 44.2 on the bench — enough to have won` },
      { label: "Low score", text: "not drawn: the card holds four" },
    ],
    note: { text: "The 3rd-highest score in Chumbo history." },
  }),
  matchupPreview: matchupPreviewCard({
    year: 2026,
    week: 3,
    a: { ...person(name), record: "2–0", stakes: "win 71% · lose 38%" },
    b: { ...person(`${name} II`), record: "0–2", stakes: "win 12% · lose 3%" },
    wins: 14,
    losses: 10,
    ties: 1,
    note: { text: `${name} has won the last four regular-season meetings` },
  }),
});

const NAMES = ["Norm", LONG, PUNCTUATED, HOSTILE];

describe("every template, with every name the league can throw at it", () => {
  for (const name of NAMES) {
    const cards = allFive(name);
    for (const [key, card] of Object.entries(cards)) {
      it(`${key} is well-formed with ${JSON.stringify(name.slice(0, 24))}`, () => {
        expect(() => scan(card.content)).not.toThrow();
        expect(card.title.length).toBeGreaterThan(0);
      });

      it(`${key} keeps every string inside the card with ${JSON.stringify(
        name.slice(0, 24)
      )}`, () => {
        for (const span of textExtents(card.content)) {
          expect(span.left, span.text).toBeGreaterThanOrEqual(0);
          expect(span.right, span.text).toBeLessThanOrEqual(CARD_WIDTH);
        }
      });
    }
  }
});

describe("hostile input cannot change a card's shape", () => {
  // The point of the primitives' escaping: a team name that is markup must
  // produce the same NUMBER of elements as a team name that is a word. One
  // extra element means the name broke out of its `<text>` and the card is
  // whatever the attacker (or the joker) wrote.
  const benign = allFive("Norm");
  const hostile = allFive(HOSTILE);

  for (const key of Object.keys(benign) as (keyof typeof benign)[]) {
    it(`${key} has the same element count either way`, () => {
      const before = scan(benign[key].content);
      const after = scan(hostile[key].content);
      expect(after.length).toBe(before.length);
      expect(after.map((e) => e.name)).toEqual(before.map((e) => e.name));
    });

    it(`${key} contains no unescaped markup from the name`, () => {
      expect(hostile[key].content).not.toContain("<rect width=\"9999\"");
      expect(hostile[key].content).toContain("&lt;/text&gt;");
    });
  }

  it("strips the control characters XML cannot carry at all", () => {
    // `&#x0;` is illegal too, so escaping alone would still produce a document
    // the parser rejects.
    const card = finalScoreCard({
      year: 2025,
      week: 1,
      teams: [
        { name: "a bc", score: 1, avatar: null },
        { name: "d", score: 2, avatar: null },
      ],
    });
    expect(card.content).toContain("abc");
    expect(card.content).not.toContain(" ");
    expect(card.content).not.toContain("");
  });
});

describe("the 2019 caveat", () => {
  const flagged = {
    text: "The most points left on the bench in Chumbo history.",
    approximate: true,
  };

  it("is spelled out in full on the record card, where the claim is loudest", () => {
    const card = recordBrokenCard({
      value: "68.9",
      holder: "Norm",
      when: "2019 · Week 3",
      note: flagged,
    });
    expect(card.content).toContain(CAVEAT_LONG);
    // And a second time as a chip in the band, for the reader who only ever
    // sees the 200px thumbnail, where a 26px line is four grey pixels.
    expect(card.content).toContain("Reconstructed data");
    // And in the title, which is the alt text, the share subject and the
    // filename — all three of which travel without the picture.
    expect(card.title).toContain("reconstructed");
  });

  it("rides along on every other card that carries a note", () => {
    const cards = [
      finalScoreCard({
        year: 2019,
        week: 3,
        teams: [
          { name: "Norm", score: 101.5, avatar: null },
          { name: "Sol", score: 99.9, avatar: null },
        ],
        note: flagged,
      }),
      managerSeasonCard({
        year: 2019,
        manager: person("Norm"),
        wins: 8,
        losses: 6,
        pointsFor: 1400,
        note: flagged,
      }),
      h2hRecordCard({ a: person("Norm"), b: person("Sol"), wins: 3, losses: 3, note: flagged }),
      draftPickCard({
        year: 2019,
        round: 1,
        pickInRound: 3,
        player: { name: "Someone" },
        manager: person("Norm"),
        note: flagged,
      }),
    ];
    for (const card of cards) {
      expect(card.content).toContain("reconstructed");
    }
  });

  it("says nothing when the fact is not flagged", () => {
    const card = recordBrokenCard({
      value: "212.4",
      holder: "Norm",
      note: { text: "The highest single-week score in Chumbo history." },
    });
    expect(card.content).not.toContain("reconstructed");
    expect(card.content).not.toContain("Reconstructed");
  });
});

describe("the card says where it came from", () => {
  it("carries the wordmark and the address on all five", () => {
    for (const card of Object.values(allFive("Norm"))) {
      expect(card.content).toContain(SITE_NAME);
      // An image pasted into WhatsApp carries no link, so if the URL is not
      // drawn on the card it does not exist.
      expect(card.content).toContain(SITE_URL);
    }
  });
});

describe("finalScoreCard", () => {
  const card = (aScore: number, bScore: number) =>
    finalScoreCard({
      year: 2025,
      week: 14,
      teams: [
        { name: "Alpha", score: aScore, avatar: null },
        { name: "Beta", score: bScore, avatar: null },
      ],
      accent: "#2a78d6",
    });

  it("puts the winner on the top row whichever order it was handed", () => {
    // Position, not just colour, answers "who won" — which is what survives
    // both a thumbnail and a colour-blind reader.
    const loserFirst = card(96, 147);
    expect(loserFirst.content.indexOf("Beta")).toBeLessThan(
      loserFirst.content.indexOf("Alpha")
    );
    const winnerFirst = card(147, 96);
    expect(winnerFirst.content.indexOf("Alpha")).toBeLessThan(
      winnerFirst.content.indexOf("Beta")
    );
  });

  it("colours the winner's score with the win token and the loser's muted", () => {
    const content = card(147, 96).content;
    expect(content).toContain(CARD_TOKENS.win);
    expect(content).toContain(CARD_TOKENS.inkMuted);
  });

  it("gives a tie no winner: both scores tie-coloured, neither ringed", () => {
    const content = card(88.4, 88.4).content;
    expect(content).not.toContain(CARD_TOKENS.win);
    expect(content).toContain(CARD_TOKENS.tie);
    expect(content).toContain("FINAL · TIED");
    expect(content).not.toContain('stroke="#2a78d6"');
  });

  it("rounds a Sleeper score to the league's one decimal", () => {
    expect(card(147.62, 96.08).content).toContain("147.6");
  });

  it("fits a long name to the box the layout reserves for it", () => {
    const long = finalScoreCard({
      year: 2025,
      week: 14,
      teams: [
        { name: LONG, score: 147.62, avatar: null },
        { name: "Norm", score: 96.08, avatar: null },
      ],
    });
    const name = textExtents(long.content).find((s) => s.text.startsWith("Zaragoza"));
    expect(name).toBeDefined();
    expect(name!.right - name!.left).toBeLessThanOrEqual(
      FINAL_SCORE_NAME_BOX.width
    );
  });

  it("falls back to the initial when a manager has no avatar", () => {
    const content = card(1, 2).content;
    // `getUserAvatarUrl` returns null for managers who never set a picture, so
    // this branch is a normal Tuesday rather than an edge case.
    expect(content).toContain(">A<");
    expect(content).toContain(">B<");
  });

  it("gives each avatar its own clip path", () => {
    // Two clip paths sharing an id means the second avatar is clipped to the
    // first one's circle, which looks like a rendering bug in the browser.
    const withAvatars = finalScoreCard({
      year: 2025,
      week: 14,
      teams: [
        { name: "Alpha", score: 147, avatar: "data:image/png;base64,AAA" },
        { name: "Beta", score: 96, avatar: "data:image/png;base64,BBB" },
      ],
    });
    const ids = scan(withAvatars.content)
      .filter((e) => e.name === "clipPath")
      .map((e) => e.attrs.id);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

describe("h2hRecordCard", () => {
  it("does not truncate a pill that fits", () => {
    // Regression: sizing the pill from the text and then re-deriving the
    // text's room by subtracting the padding back off is the same number in
    // arithmetic and a hair under it in floating point, so the first version
    // rendered "ZORRO HAS WON THE LAST FO…" inside a pill with 35px of empty
    // space either side.
    const card = h2hRecordCard({
      a: person(LONG),
      b: person("Salt & Pepper"),
      wins: 14,
      losses: 10,
      streak: "Zorro has won the last four",
    });
    expect(card.content).toContain("ZORRO HAS WON THE LAST FOUR");
    expect(card.content).not.toContain("FO…");
  });

  it("reads from the left manager's point of view", () => {
    const card = h2hRecordCard({
      a: person("Alpha"),
      b: person("Beta"),
      wins: 14,
      losses: 10,
    });
    expect(card.title).toBe("Alpha 14–10 Beta · All time head-to-head");
  });

  it("keeps ties out of the headline number", () => {
    const card = h2hRecordCard({
      a: person("Alpha"),
      b: person("Beta"),
      wins: 14,
      losses: 10,
      ties: 1,
    });
    expect(card.content).toContain("1 tie");
    expect(card.content).not.toContain(">14–10–1<");
  });
});

describe("draftPickCard", () => {
  it("writes a pick the way a draft board does", () => {
    expect(formatPickLabel(1, 3)).toBe("1.03");
    expect(formatPickLabel(12, 12)).toBe("12.12");
  });

  it("names the round and pick when there is no overall number", () => {
    const card = draftPickCard({
      year: 2021,
      round: 4,
      pickInRound: 7,
      player: { name: "Someone" },
      manager: person("Norm"),
    });
    expect(card.content).toContain("ROUND 4, PICK 7");
  });
});

describe("number formatting", () => {
  it("groups thousands without asking the host's locale", () => {
    // `toLocaleString` would render "1.842,6" in a German CI container, and a
    // card must not disagree with the page it came from.
    expect(formatPoints(1842.64)).toBe("1,842.6");
    expect(formatPoints(842.6)).toBe("842.6");
    expect(formatPoints(12345.67)).toBe("12,345.7");
  });

  it("uses en dashes in a record, because a hyphen at 130px is a minus sign", () => {
    expect(formatRecord(9, 5)).toBe("9–5");
    expect(formatRecord(6, 7, 1)).toBe("6–7–1");
  });
});
