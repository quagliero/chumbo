#!/usr/bin/env node
/**
 * Correct a player id within specific seasons.
 *
 * Sleeper gives two players with the same name two ids, and the NFL.com-era
 * scrapes did not always pick the right one. The symptom is a career split in
 * half: the same person holds points under one id for some seasons and another
 * id for the rest, so his player page, his draft picks and every stat that
 * joins on an id see two different people.
 *
 * Idempotent — once a season is corrected there is nothing left to match, so
 * re-running reports zero changes. Run with --dry to see what it would do.
 *
 *   node scripts/fix-player-ids.js [--dry]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRY = process.argv.includes("--dry");

/**
 * Every correction we have had to make, with the evidence for it.
 *
 * Add to this rather than editing the data by hand: the table is the only
 * record of why a committed id differs from what the source said.
 */
const CORRECTIONS = [
  {
    from: "171",
    to: "749",
    years: [2015, 2016, 2017],
    player: "Zach Miller (Bears)",
    why:
      "Two tight ends called Zach Miller. 171 (gsis 00-0025425, born 1985) " +
      "is the Raiders/Seahawks one, who retired after 2014; 749 (gsis " +
      "00-0027125, born 1984) is the Bears one, who played 2014-2017. Every " +
      "appearance of 171 is 2015 or later, and the play-by-play rebuild (L1) " +
      "scores his weeks to the hundredth for 749 and to nothing for 171 — " +
      "eleven weeks of 2015-16 flagged in one pass. 749 appears nowhere else.",
  },
  {
    from: "1771",
    to: "3650",
    years: [2018],
    player: "Maurice Harris",
    why:
      "The NFL.com-era import matched \"M Harris\" to 1771, Marcus Harris " +
      "(NYG, gsis 00-0028627), who did not play in 2018. The Washington " +
      "receiver who did is Maurice Harris, 3650 (gsis 00-0032362). Found by " +
      "L0's play-by-play rebuild: in 2018 week 10 the lineup's 5.6 points " +
      "rebuild to exactly 5.6 for Maurice and to 0 for Marcus. Weeks 10 and " +
      "11 are the only appearances.",
  },
  {
    from: "748",
    to: "4068",
    years: [2017, 2018],
    player: "Mike Williams",
    why:
      "Two receivers of the same name. 748 is the earlier one (#15, Tampa " +
      "Bay/Buffalo), who was out of the league by 2014 and is correctly used " +
      "in 2012-2013. 4068 is the Chargers receiver, who entered the league in " +
      "2017 — so the 2017 and 2018 entries are his, not the older player's. " +
      "2019 onward already use 4068. He is never a starter in either season, " +
      "so no team score depends on this.",
  },

  /*
   * The legacy name keys. The NFL.com-era scrapes stored a player they could
   * not match to a Sleeper id under his bare name ("Ty Montgomery"), so a
   * player whose career straddled the migration has two keys: his early
   * seasons under the name, his later ones under the id — two player pages,
   * half a career on each. Found by matching every legacy name against the
   * dictionary and keeping only those whose id ALSO scores in the matchups.
   *
   * Position survives the merge. The same files carry `unmatched_players`,
   * `{ name: position }`, recording the slot each name-keyed player actually
   * filled that week; it is rewritten with the rest, and `getPlayerPosition`
   * looks it up by id first. So Pryor stays a 2013 QB and Montgomery a 2015
   * WR rather than taking the dictionary's position today.
   *
   * Considered and NOT merged: "Kevin Smith" (2012) is the Lions running back;
   * Sleeper's 2295 is a different, later receiver. "Jackie Battle" has a
   * Sleeper id (47) that never appears in the data, so nothing is split.
   */
  {
    from: "Ty Montgomery",
    to: "2399",
    years: [2015],
    player: "Ty Montgomery",
    why:
      "Scored 2015 under his name (as a WR, his position that year) and " +
      "2016-2019 under 2399 (as an RB, after the Packers moved him). One " +
      "player; the name key was only ever the scrape failing to match him.",
  },
  {
    from: "Terrelle Pryor",
    to: "1020",
    years: [2013],
    player: "Terrelle Pryor",
    why:
      "2013 under his name, at QB for Oakland; 2016-2018 under 1020 as a WR " +
      "after his conversion. Same person — the position change is exactly " +
      "why the scrape could not match him.",
  },
  {
    from: "Dexter McCluster",
    to: "564",
    years: [2012],
    player: "Dexter McCluster",
    why: "2012 under his name, 2014 and 2016 under 564. One player.",
  },
  {
    from: "Steven Hauschka",
    to: "775",
    years: [2013, 2014, 2015, 2016],
    player: "Stephen Hauschka",
    why:
      "Four Seattle seasons and three draft picks under 'Steven Hauschka', " +
      "then 2017 under 775, which Sleeper spells 'Stephen'. The spelling is " +
      "why an exact-name search missed him; the position (K) and the " +
      "unbroken run of seasons are why it is one career.",
  },
];

/** Where a player id can appear. Anything not listed here is left alone. */
const ID_ARRAYS = ["players", "starters", "reserve", "taxi"];
// `unmatched_players` is `{ name: position }` on the NFL.com-era matchups —
// see the legacy corrections above for why it has to move with the id.
const ID_MAPS = ["players_points", "adds", "drops", "unmatched_players"];
const ID_SCALARS = ["player_id"];

const jsonFiles = (dir) =>
  fs.existsSync(dir)
    ? fs
        .readdirSync(dir, { withFileTypes: true })
        .flatMap((e) =>
          e.isDirectory()
            ? jsonFiles(path.join(dir, e.name))
            : e.name.endsWith(".json")
              ? [path.join(dir, e.name)]
              : []
        )
    : [];

/** Rewrite `from` to `to` in the id-bearing places only. Returns a count. */
const rewrite = (node, from, to, key = null) => {
  let changed = 0;

  if (Array.isArray(node)) {
    if (key && ID_ARRAYS.includes(key)) {
      for (let i = 0; i < node.length; i++) {
        if (String(node[i]) === from) {
          node[i] = to;
          changed++;
        }
      }
    }
    for (const item of node) changed += rewrite(item, from, to);
    return changed;
  }

  if (node && typeof node === "object") {
    for (const k of Object.keys(node)) {
      if (ID_SCALARS.includes(k) && String(node[k]) === from) {
        node[k] = to;
        changed++;
        continue;
      }
      if (ID_MAPS.includes(k) && node[k] && typeof node[k] === "object") {
        if (Object.prototype.hasOwnProperty.call(node[k], from)) {
          // Rebuild rather than delete-and-set, so the key keeps its position
          // and the file's diff stays readable.
          node[k] = Object.fromEntries(
            Object.entries(node[k]).map(([id, v]) => [id === from ? to : id, v])
          );
          changed++;
        }
        continue;
      }
      changed += rewrite(node[k], from, to, k);
    }
  }

  return changed;
};

/** True if `id` appears anywhere in the season — used to refuse a collision. */
const present = (files, id) =>
  files.some((f) => {
    let found = false;
    const look = (node, key = null) => {
      if (found) return;
      if (Array.isArray(node)) {
        if (key && ID_ARRAYS.includes(key) && node.map(String).includes(id)) {
          found = true;
          return;
        }
        node.forEach((item) => look(item));
      } else if (node && typeof node === "object") {
        for (const k of Object.keys(node)) {
          if (ID_SCALARS.includes(k) && String(node[k]) === id) found = true;
          else if (ID_MAPS.includes(k) && node[k] && typeof node[k] === "object") {
            if (Object.prototype.hasOwnProperty.call(node[k], id)) found = true;
          } else look(node[k], k);
          if (found) return;
        }
      }
    };
    look(JSON.parse(fs.readFileSync(f, "utf8")));
    return found;
  });

let total = 0;
for (const c of CORRECTIONS) {
  console.log(`\n${c.player}: ${c.from} -> ${c.to}  (${c.years.join(", ")})`);

  for (const year of c.years) {
    const files = jsonFiles(path.join(root, "src/data", String(year)));
    if (!files.length) {
      console.log(`  ${year}  no data`);
      continue;
    }

    // Merging two ids inside one season would silently add their points
    // together. Nothing in the table does that, but refuse rather than trust it.
    if (present(files, c.to) && present(files, c.from)) {
      throw new Error(
        `${year}: both ${c.from} and ${c.to} are present — merging them would ` +
          `combine two players' scores. Resolve by hand.`
      );
    }

    let yearChanged = 0;
    for (const file of files) {
      const raw = fs.readFileSync(file, "utf8");
      const data = JSON.parse(raw);
      const n = rewrite(data, c.from, c.to);
      if (!n) continue;

      yearChanged += n;

      // Apply the change to the RAW TEXT, not by re-serialising the parsed
      // object. These files were written by several different tools and their
      // formatting varies (trim-picks minifies picks.json; the matchups keep
      // short arrays on one line); JSON.stringify would reflow all of it and
      // bury a two-token change in a thousand-line diff.
      //
      // The parse above is what makes that safe: it says how many id-bearing
      // occurrences there are, so if the raw text holds exactly that many
      // quoted `from` tokens, every one of them is an id and a textual swap is
      // identical to the structural one. If the counts disagree the token also
      // appears as something else, so refuse instead of guessing.
      const token = `"${c.from}"`;
      const occurrences = raw.split(token).length - 1;
      if (occurrences !== n) {
        throw new Error(
          `${path.relative(root, file)}: ${n} id reference(s) but ${occurrences} ` +
            `occurrence(s) of ${token} — it appears as something other than an id.`
        );
      }
      if (!DRY) fs.writeFileSync(file, raw.split(token).join(`"${c.to}"`));
      console.log(`  ${year}  ${path.relative(root, file)}  ${n}`);
    }

    if (!yearChanged) console.log(`  ${year}  nothing to change`);
    total += yearChanged;
  }
}

console.log(`\n${DRY ? "DRY RUN — " : ""}${total} reference(s) ${DRY ? "would be" : ""} rewritten.`);
