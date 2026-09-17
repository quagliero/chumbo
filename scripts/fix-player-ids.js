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
];

/** Where a player id can appear. Anything not listed here is left alone. */
const ID_ARRAYS = ["players", "starters", "reserve", "taxi"];
const ID_MAPS = ["players_points", "adds", "drops"];
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
