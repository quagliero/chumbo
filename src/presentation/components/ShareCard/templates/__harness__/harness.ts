/**
 * Dev-only harness for the G2 templates.
 *
 * Reachable at
 * `/src/presentation/components/ShareCard/templates/__harness__/harness.html`
 * under `yarn dev`. Separate from G1's harness, which exercises the renderer
 * with throwaway sketches; this one renders the five real templates with the
 * worst real strings the league has, because the failure modes that matter
 * here — a name that overflows, a caveat that is invisible, a number that is
 * not the biggest thing on the card — are all invisible to a unit test.
 *
 * The strings are chosen, not invented: "Zaragoza's Zooting Zorro" is a live
 * team name, "Salt & Pepper" covers the ampersand, and the last case is the
 * hostile one from G1's own harness.
 */

import {
  ShareCardError,
  cardFileName,
  draftPickCard,
  embedImages,
  finalScoreCard,
  h2hRecordCard,
  managerSeasonCard,
  recordBrokenCard,
  renderCard,
  type ShareCard,
} from "../../index";

const avatarUrl = (hash: string) => `https://sleepercdn.com/avatars/${hash}`;

const AVATARS = [
  "6ed940c623fe35114ae55324a0107162",
  "b47411a51af1a59e018a624a96a54d4f",
].map(avatarUrl);

// The eight accents from src/domain/managerColors.ts. The yellow and the
// violet are the two that any white-on-accent assumption breaks on.
const BLUE = "#2a78d6";
const YELLOW = "#eda100";
const VIOLET = "#4a3aa7";
const GREEN = "#008300";
const ORANGE = "#eb6834";

const [crest, avatarA, avatarB] = await embedImages([
  "/images/logo.png",
  ...AVATARS,
]);

interface Case {
  name: string;
  card: ShareCard;
}

const cases: Case[] = [
  {
    name: "1. Final score — a long name, an ampersand, real avatars, a note",
    card: finalScoreCard({
      year: 2025,
      week: 14,
      teams: [
        { name: "Salt & Pepper", score: 96.08, avatar: avatarB },
        { name: "Zaragoza's Zooting Zorro", score: 147.62, avatar: avatarA },
      ],
      accent: BLUE,
      crest,
      note: { text: "The 3rd-biggest margin of victory in Chumbo history." },
    }),
  },
  {
    name: "1b. Final score — a tie, no avatars, playoff stage",
    card: finalScoreCard({
      year: 2019,
      week: 15,
      stage: "Championship",
      teams: [
        { name: "Norm", score: 88.4, avatar: null },
        { name: "The Roaches", score: 88.4, avatar: null },
      ],
      accent: GREEN,
      crest,
    }),
  },
  {
    name: "2. Manager season — champion badge on the yellow accent",
    card: managerSeasonCard({
      year: 2021,
      manager: { name: "Kevin", avatar: avatarA },
      teamName: "Kevin's Krispy Kreme Kroissants",
      wins: 11,
      losses: 3,
      pointsFor: 1842.64,
      finish: "1st",
      badge: "Champion",
      accent: YELLOW,
      crest,
      note: { text: "The most inevitable championship in Chumbo history." },
    }),
  },
  {
    name: "2b. Manager season — long manager name, no avatar, no badge, a tie",
    card: managerSeasonCard({
      year: 2016,
      manager: { name: "Zaragoza's Zooting Zorro", avatar: null },
      wins: 6,
      losses: 7,
      ties: 1,
      pointsFor: 1298.2,
      finish: "9th",
      accent: ORANGE,
      crest,
    }),
  },
  {
    name: "3. Head-to-head — a streak pill and a tie",
    card: h2hRecordCard({
      a: { name: "Zaragoza's Zooting Zorro", avatar: avatarA },
      b: { name: "Salt & Pepper", avatar: avatarB },
      wins: 14,
      losses: 10,
      ties: 1,
      streak: "Zorro has won the last four",
      accent: BLUE,
      crest,
      note: { text: "The closest rivalry in Chumbo history." },
    }),
  },
  {
    name: "4. Draft pick — accent block, position line, a note",
    card: draftPickCard({
      year: 2021,
      round: 1,
      pickInRound: 3,
      overall: 3,
      player: { name: "Christian McCaffrey", position: "RB", team: "CAR" },
      manager: { name: "Zaragoza's Zooting Zorro", avatar: avatarA },
      accent: VIOLET,
      crest,
      note: { text: "The worst draft pick in Chumbo history." },
    }),
  },
  {
    name: "5. Record broken — the siren, on the yellow accent",
    card: recordBrokenCard({
      value: "212.4",
      holder: "Kevin's Krispy Kreme Kroissants",
      when: "2021 · Week 9",
      accent: YELLOW,
      crest,
      note: { text: "The highest single-week score in Chumbo history." },
    }),
  },
  {
    name: "5b. Record broken — a 2019 fact, so the caveat must be visible",
    card: recordBrokenCard({
      value: "68.9",
      holder: "Norm",
      when: "2019 · Week 3",
      accent: VIOLET,
      crest,
      note: {
        text: "The most points left on the bench in Chumbo history.",
        approximate: true,
      },
    }),
  },
  {
    name: "6. Hostile: a team name that is markup, quotes, an ampersand, control characters",
    card: finalScoreCard({
      year: 2025,
      week: 1,
      teams: [
        {
          name: "</text><rect width=\"9999\" height=\"9999\" fill='red'/>",
          score: 101.5,
          avatar: null,
        },
        { name: "a < b && c > d \u0000\u0008", score: 99.9, avatar: null },
      ],
      accent: "#e34948",
      crest,
    }),
  },
  {
    name: "6b. Hostile: the same markup in every string on the loudest card",
    card: recordBrokenCard({
      value: "</text><rect width=\"9999\" height=\"9999\" fill='red'/>",
      holder: "Zaragoza's Zooting Zorro & Sons <script>alert(1)</script>",
      when: "2025 · Week 1",
      accent: YELLOW,
      crest,
      note: {
        text: "The 'biggest' & <loudest> record in Chumbo history.",
        approximate: true,
      },
    }),
  },
  {
    name: "7. No crest, no accent, no note — the bare minimum every template must survive",
    card: h2hRecordCard({
      a: { name: "Norm", avatar: null },
      b: { name: "Sol", avatar: null },
      wins: 3,
      losses: 3,
      span: "2025",
    }),
  },
];

const out = document.getElementById("out") as HTMLDivElement;

const show = (html: string) => {
  const div = document.createElement("div");
  div.className = "case";
  div.innerHTML = html;
  out.appendChild(div);
};

// Proof that the crest embedded at all: a broken crest is the one failure that
// would look like a deliberate design choice.
show(
  `<div class="meta">crest ${
    crest ? `embedded, ${(crest.length / 1024).toFixed(0)} kB data URI` : "MISSING"
  } · avatars ${[avatarA, avatarB].filter(Boolean).length}/2 embedded</div>`
);

for (const testCase of cases) {
  try {
    const { blob, width, height, scale, svg } = await renderCard(testCase.card);
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
        svg ${(svg.length / 1024).toFixed(1)} kB ·
        ${cardFileName(testCase.card.title)}
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
