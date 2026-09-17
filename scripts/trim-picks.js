#!/usr/bin/env node
/**
 * Trim picks.json (A1e).
 *
 * Every pick carried a 13-field `metadata` block duplicating the player's name,
 * position, team and number — data that now lives in the slim player dictionary
 * built by `yarn build-players`. Across all seasons that was 1.0 MB of the
 * 1.7 MB still shipping eagerly, and none of it was ever displayed:
 * `getPlayer()` resolves for all 2,640 picks, so the metadata fallbacks in
 * DraftBoard and useDraftPicks were unreachable.
 *
 * Two things are salvaged before it goes, so nothing is actually lost:
 *
 *   - Positions that differ from the dictionary are written into that season's
 *     players.delta.json overlay. These are real year-accurate values: Devin
 *     Funchess and N'Keal Harry were WRs when drafted and Sleeper lists them as
 *     TE today. The overlay mechanism exists for exactly this.
 *   - Names that differ are reported, not kept. They are almost all formatting
 *     (O.J. vs OJ, "Jr." suffixes); the three real renames — Robby Anderson to
 *     Robbie Chosen, Washington Football Team to Commanders, Hollywood to
 *     Marquise Brown — are noted in the output for the record. There is no
 *     per-season name overlay, and inventing one for three players is not
 *     worth it.
 *
 * `draft_id`, `is_keeper` and `reactions` are dropped too: nothing reads them,
 * and draft_id is identical for every pick in a season (it is on draft.json).
 *
 * Run: yarn trim-picks   (idempotent — re-running a trimmed file is a no-op)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const dataDir = path.join(root, "src/data");

const KEEP = ["round", "pick_no", "picked_by", "draft_slot", "player_id", "roster_id"];

const read = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const players = read(path.join(dataDir, "players.json"));

const years = fs
  .readdirSync(dataDir, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^\d{4}$/.test(e.name))
  .map((e) => Number(e.name))
  .sort((a, b) => a - b);

let before = 0, after = 0, trimmed = 0, positionsSaved = 0;
const renames = [];

for (const year of years) {
  const picksPath = path.join(dataDir, `${year}/picks.json`);
  if (!fs.existsSync(picksPath)) continue;

  const picks = read(picksPath);
  before += fs.statSync(picksPath).size;

  const overlayPath = path.join(dataDir, `${year}/players.delta.json`);
  const overlay = fs.existsSync(overlayPath) ? read(overlayPath) : {};
  let overlayChanged = false;

  const slim = picks.map((pick) => {
    const meta = pick.metadata;
    if (meta) {
      const base = players[pick.player_id];

      // Salvage a year-accurate position the dictionary no longer has.
      if (meta.position && base?.position && meta.position !== base.position) {
        const entry = overlay[pick.player_id] ?? {};
        if (entry.p !== meta.position) {
          entry.p = meta.position;
          overlay[pick.player_id] = entry;
          overlayChanged = true;
          positionsSaved += 1;
        }
      }

      // Report a name that differed, for the record.
      const metaName = `${meta.first_name ?? ""} ${meta.last_name ?? ""}`.trim();
      const baseName = base
        ? `${base.first_name ?? ""} ${base.last_name ?? ""}`.trim()
        : "";
      if (metaName && baseName && metaName !== baseName) {
        renames.push(`${year}  "${baseName}"  was  "${metaName}"`);
      }
      trimmed += 1;
    }

    const out = {};
    for (const field of KEEP) if (pick[field] !== undefined) out[field] = pick[field];
    // `position` is only present on some hand-made legacy picks; keep it.
    if (pick.position !== undefined) out.position = pick.position;
    return out;
  });

  fs.writeFileSync(picksPath, JSON.stringify(slim) + "\n");
  after += fs.statSync(picksPath).size;

  if (overlayChanged) {
    fs.writeFileSync(overlayPath, JSON.stringify(overlay) + "\n");
  }
}

const mb = (b) => (b / 1024 / 1024).toFixed(2);
console.log(`picks trimmed:        ${trimmed}`);
console.log(`positions salvaged:   ${positionsSaved} (written to players.delta.json)`);
console.log(`picks.json total:     ${mb(before)} MB -> ${mb(after)} MB`);
if (renames.length) {
  const distinct = [...new Set(renames)];
  console.log(`\nnames that differed from the dictionary (${distinct.length}, not kept):`);
  for (const r of distinct) console.log(`  ${r}`);
}
