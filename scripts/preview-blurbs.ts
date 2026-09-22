/**
 * The week's preview blurbs for the group chat (K1), as WhatsApp text.
 *
 *   yarn preview-blurbs [--year 2026] [--week 3] [--out file] [--issue file]
 *
 * `--issue` also writes them as Markdown for the weekly issue, each blurb in
 * its own code block: a code block keeps WhatsApp's *bold* as asterisks
 * rather than rendering it, and gives each one a copy button.
 *
 * Defaults to the live season's next unplayed week. Prints nothing and exits
 * cleanly when there is no week to preview (the off-season, the playoffs).
 * The weekly update runs it; see scripts/update-season.js.
 *
 * Runs through vite-node, like build-aggregates, so the blurbs are built from
 * the same previews the site's cards are.
 */
import fs from "node:fs";
import { loadAllSeasons } from "@/data";
import { CURRENT_YEAR } from "@/domain/constants";
import { buildMatchupPreview, fixturesFor, previewWeek, stakesFor } from "@/utils/matchupPreview";
import { weekBlurbs } from "@/utils/previewBlurb";
import { SITE_ORIGIN } from "./og/tags";

const arg = (flag: string) => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};

await loadAllSeasons();

const year = Number(arg("--year") ?? CURRENT_YEAR);
const week = arg("--week") ? Number(arg("--week")) : previewWeek(year);

if (week === null) {
  console.error(`No week of ${year} to preview.`);
  process.exit(0);
}

const stakes = stakesFor(year, week);
const previews = fixturesFor(year, week).flatMap(([id]) => {
  const preview = buildMatchupPreview(year, week, id, stakes);
  return preview ? [preview] : [];
});
const text = weekBlurbs(previews);

const out = arg("--out");
if (out) fs.writeFileSync(out, `${text}\n`);
else console.log(text);

const issue = arg("--issue");
if (issue) {
  const blocks = text.split("\n\n").map((blurb) => "```text\n" + blurb + "\n```");
  fs.writeFileSync(
    issue,
    [
      `The ${year} week ${week} previews, for the group chat, with the cards at ${SITE_ORIGIN}/seasons/${year}/matchups/${week}.`,
      ...blocks,
      "Rewritten by each run of the Update the season workflow until the week is played, so the odds are the latest.",
    ].join("\n\n") + "\n"
  );
}
