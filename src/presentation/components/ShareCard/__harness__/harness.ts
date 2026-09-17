/**
 * Dev-only harness for the G1 renderer.
 *
 * Reachable at `/src/presentation/components/ShareCard/__harness__/harness.html`
 * under `yarn dev`. Nothing imports it, and it is not referenced from
 * `index.html`, so Vite never includes it in a production build.
 *
 * It exists because the failure modes this renderer is written against — a font
 * that silently falls back, an avatar that silently does not load, a tainted
 * canvas, `toBlob` returning null — are all invisible to a unit test. The only
 * honest check is to make a real PNG and look at it.
 *
 * The cards below are throwaway sketches, NOT the G2 templates. They exist to
 * exercise the API and to put the nastiest real strings in the league through
 * it.
 */

import {
  CARD_HEIGHT,
  CARD_PADDING,
  CARD_TOKENS,
  CARD_WIDTH,
  ShareCardError,
  cardFileName,
  circleClip,
  embedImage,
  fitFontSize,
  group,
  image,
  onAccent,
  onAccentMuted,
  rect,
  renderCard,
  text,
  truncateToWidth,
  wrapToWidth,
  textLines,
  type ShareCard,
} from "../index";

const avatar = (hash: string) => `https://sleepercdn.com/avatars/${hash}`;

const CONTENT_WIDTH = CARD_WIDTH - CARD_PADDING * 2;

/** The strip along the bottom of every card. */
const footer = (label: string) =>
  group({}, [
    rect({
      x: 0,
      y: CARD_HEIGHT - 76,
      width: CARD_WIDTH,
      height: 76,
      fill: CARD_TOKENS.surfaceSunk,
    }),
    rect({
      x: 0,
      y: CARD_HEIGHT - 76,
      width: CARD_WIDTH,
      height: 1,
      fill: CARD_TOKENS.line,
    }),
    text("THE CHUMBO", {
      x: CARD_PADDING,
      y: CARD_HEIGHT - 38,
      size: 28,
      weight: 800,
      tracking: 2,
      fill: CARD_TOKENS.ink,
      baseline: "middle",
    }),
    text(label, {
      x: CARD_WIDTH - CARD_PADDING,
      y: CARD_HEIGHT - 38,
      size: 26,
      weight: 600,
      fill: CARD_TOKENS.inkMuted,
      anchor: "end",
      baseline: "middle",
      numeric: true,
    }),
  ]);

interface Side {
  team: string;
  score: number;
  avatarUri: string | null;
}

/** Sketch: a final score. Two long names and two scores. */
const finalScoreCard = (
  home: Side,
  away: Side,
  accent: string,
  meta: string
): ShareCard => {
  const nameWidth = 640;
  const side = (s: Side, y: number, won: boolean) => {
    const size = fitFontSize(s.team, nameWidth, 62, { weight: 700, min: 34 });
    const clip = circleClip(`avatar-${y}`, CARD_PADDING + 44, y, 44);
    return group({}, [
      clip.def,
      s.avatarUri
        ? image(s.avatarUri, {
            x: CARD_PADDING,
            y: y - 44,
            width: 88,
            height: 88,
            "clip-path": clip.ref,
          })
        : group({}, [
            rect({
              x: CARD_PADDING,
              y: y - 44,
              width: 88,
              height: 88,
              rx: 44,
              fill: CARD_TOKENS.surfaceSunk,
            }),
            text([...s.team][0] ?? "?", {
              x: CARD_PADDING + 44,
              y,
              size: 44,
              weight: 700,
              fill: CARD_TOKENS.inkFaint,
              anchor: "middle",
              baseline: "central",
            }),
          ]),
      text(truncateToWidth(s.team, nameWidth, size, { weight: 700 }), {
        x: CARD_PADDING + 118,
        y,
        size,
        weight: 700,
        fill: won ? CARD_TOKENS.ink : CARD_TOKENS.inkMuted,
        baseline: "central",
      }),
      text(s.score.toFixed(1), {
        x: CARD_WIDTH - CARD_PADDING,
        y,
        size: 66,
        weight: 800,
        fill: won ? CARD_TOKENS.win : CARD_TOKENS.inkMuted,
        anchor: "end",
        baseline: "central",
        numeric: true,
      }),
    ]);
  };

  return {
    title: `${home.team} ${home.score} – ${away.team} ${away.score}`,
    content: [
      rect({ x: 0, y: 0, width: CARD_WIDTH, height: 10, fill: accent }),
      text("FINAL", {
        x: CARD_PADDING,
        y: 122,
        size: 30,
        weight: 700,
        tracking: 3,
        fill: CARD_TOKENS.inkFaint,
      }),
      side(home, 250, home.score >= away.score),
      rect({
        x: CARD_PADDING,
        y: 330,
        width: CONTENT_WIDTH,
        height: 1,
        fill: CARD_TOKENS.line,
      }),
      side(away, 412, away.score > home.score),
      footer(meta),
    ].join(""),
  };
};

/** Sketch: a broken record. One enormous number, an emoji, an accent ground. */
const recordCard = (
  headline: string,
  value: string,
  detail: string,
  accent: string
): ShareCard => {
  const ink = onAccent(accent);
  return {
    title: `${headline} — ${value}`,
    content: [
      rect({ x: 0, y: 0, width: CARD_WIDTH, height: CARD_HEIGHT, fill: accent }),
      textLines(wrapToWidth(headline, CONTENT_WIDTH, 52, { maxLines: 2 }), {
        x: CARD_PADDING,
        y: 130,
        size: 52,
        weight: 700,
        fill: ink,
        lineHeight: 62,
      }),
      text(value, {
        x: CARD_PADDING,
        y: 360,
        size: 170,
        weight: 800,
        fill: ink,
        tracking: -4,
        numeric: true,
      }),
      text(truncateToWidth(detail, CONTENT_WIDTH, 36), {
        x: CARD_PADDING,
        y: 430,
        size: 36,
        weight: 600,
        fill: onAccentMuted(accent),
      }),
      rect({
        x: 0,
        y: CARD_HEIGHT - 76,
        width: CARD_WIDTH,
        height: 76,
        fill: CARD_TOKENS.surface,
      }),
      text("THE CHUMBO", {
        x: CARD_PADDING,
        y: CARD_HEIGHT - 38,
        size: 28,
        weight: 800,
        tracking: 2,
        fill: CARD_TOKENS.ink,
        baseline: "middle",
      }),
    ].join(""),
  };
};

interface Case {
  name: string;
  card: () => Promise<ShareCard>;
}

const cases: Case[] = [
  {
    name: "Long team name + apostrophe + ampersand, with real Sleeper avatars",
    card: async () => {
      const [a, b] = await Promise.all([
        embedImage(avatar("6ed940c623fe35114ae55324a0107162")),
        embedImage(avatar("b47411a51af1a59e018a624a96a54d4f")),
      ]);
      return finalScoreCard(
        { team: "Zaragoza's Zooting Zorro", score: 147.62, avatarUri: a },
        { team: "Salt & Pepper", score: 96.08, avatarUri: b },
        "#2a78d6",
        "2025 · WEEK 14"
      );
    },
  },
  {
    name: "No avatar at all (the fallback branch), short names",
    card: async () =>
      finalScoreCard(
        { team: "Norm", score: 88.4, avatarUri: null },
        { team: "The Roaches", score: 88.4, avatarUri: null },
        "#eb6834",
        "2019 · WEEK 3"
      ),
  },
  {
    name: "Emoji headline on the yellow accent (the worst case for white text)",
    card: async () =>
      recordCard(
        "\u{1F6A8} New league record — highest single week",
        "212.4",
        "Kevin's Krispy Kreme Kroissants, 2021 week 9",
        "#eda100"
      ),
  },
  {
    name: "Emoji headline on the violet accent",
    card: async () =>
      recordCard(
        "\u{1F6A8} New league record — longest winning streak",
        "14",
        "Zaragoza's Zooting Zorro, 2023–2024",
        "#4a3aa7"
      ),
  },
  {
    name: "Hostile input: markup, quotes and a control character in the name",
    card: async () =>
      finalScoreCard(
        {
          team: "</text><rect width=\"9999\" height=\"9999\" fill='red'/>",
          score: 101.5,
          avatarUri: null,
        },
        { team: "a < b && c > d \u0000\u0008", score: 99.9, avatarUri: null },
        "#e34948",
        "HOSTILE · INPUT"
      ),
  },
];

const out = document.getElementById("out") as HTMLDivElement;

const show = (html: string) => {
  const div = document.createElement("div");
  div.className = "case";
  div.innerHTML = html;
  out.appendChild(div);
};

for (const testCase of cases) {
  try {
    const card = await testCase.card();
    const { blob, width, height, scale, svg } = await renderCard(card);
    const url = URL.createObjectURL(blob);
    show(`
      <h2>${testCase.name}</h2>
      <div class="row">
        <div class="full"><img src="${url}" alt="" /></div>
        <div class="thumb">
          <img src="${url}" alt="" />
          <div class="meta">200px — thumbnail test</div>
        </div>
      </div>
      <div class="meta">
        ${width}×${height} @${scale}x · ${(blob.size / 1024).toFixed(0)} kB ·
        ${blob.type} · svg ${(svg.length / 1024).toFixed(1)} kB ·
        ${cardFileName(card.title)}
      </div>
    `);
  } catch (error) {
    const code = error instanceof ShareCardError ? error.code : "unknown";
    show(`
      <h2>${testCase.name}</h2>
      <div class="error">FAILED [${code}] ${String(error)}</div>
    `);
  }
}
