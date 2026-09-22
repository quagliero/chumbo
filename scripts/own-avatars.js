#!/usr/bin/env node
/**
 * Keep our own copy of every team logo Sleeper hosts for us.
 *
 * NFL.com's fantasy platform shut down and took every 2012-2018 team
 * logo with it: the site had only ever hotlinked them, and 27 of 32 came back
 * only because a browser cache still had them (see "The 2012-2018 avatars" in
 * CLAUDE.md). Sleeper's are one policy change, one CDN rule or one shutdown
 * away from the same fate. So this downloads each one ONCE into
 * `public/avatars/sleeper/`, and points the season's data at the local copy —
 * the same shape the NFL-era seasons already have, which `getUserAvatarUrl`
 * and the link-preview renderer both handle.
 *
 *   yarn own-avatars [--dry-run]
 *
 * What it covers: every team's picture in every season's `users.json` (a
 * custom upload in `metadata.avatar`, or else the account avatar), and the
 * division logos in `league.json`. Player headshots are not team logos and are
 * not here.
 *
 * How it fails: per image, and safely. A logo that will not download keeps its
 * Sleeper URL, which still works while Sleeper does, and the next run tries
 * again. It never writes a local path it has not saved a file for, so nothing
 * can point at a missing image.
 *
 * Size: a logo is kept byte for byte when it is already small. One that is not
 * — a phone photo uploaded as a team logo, 2 MB of it — is re-drawn at
 * 256×256, which is more than any place the site shows one (the largest is a
 * 96-pixel circle on a share card, drawn at twice that). The file name is
 * Sleeper's own content hash, so a logo that changes is a new file and an old
 * season keeps the logo it had.
 *
 * Idempotent: a URL whose file is already on disk is not fetched again, and a
 * season already pointing at local copies is left as it is.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Resvg } from "@resvg/resvg-js";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataRoot = path.join(root, "src/data");
const outDir = path.join(root, "public/avatars/sleeper");
const sourcesPath = path.join(root, "scripts/data/sleeper-avatar-sources.json");
const PUBLIC_PREFIX = "/avatars/sleeper/";

const DRY_RUN = process.argv.includes("--dry-run");

/** Kept as they are below this. */
const KEEP_BELOW = 100 * 1024;
/** Re-drawn to this square above it. */
const SIZE = 256;

const SLEEPER = /^https:\/\/sleepercdn\.com\/(?:avatars|uploads)\//;

/** Sleeper's content hash, from either kind of URL. */
const idOf = (url) =>
  url
    .split("?")[0]
    .split("/")
    .pop()
    .replace(/\.[a-z0-9]+$/i, "");

/** What the bytes are, whatever the URL or the Content-Type claims. */
const kindOf = (bytes) => {
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e) return { ext: "png", mime: "image/png" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return { ext: "jpg", mime: "image/jpeg" };
  if (bytes.slice(0, 4).toString() === "GIF8") return { ext: "gif", mime: "image/gif" };
  if (bytes.slice(0, 4).toString() === "RIFF" && bytes.slice(8, 12).toString() === "WEBP") {
    return { ext: "webp", mime: "image/webp" };
  }
  return null;
};

/**
 * A 256×256 PNG of an image, cropped to a square from the middle — the same
 * crop every avatar on the site and on every card is drawn with. Done through
 * resvg, which the link previews already depend on, so this needs nothing new
 * installed on a laptop or on the Actions runner.
 */
const shrink = (bytes, mime) => {
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}">` +
    `<image href="data:${mime};base64,${bytes.toString("base64")}" width="${SIZE}" height="${SIZE}" preserveAspectRatio="xMidYMid slice"/>` +
    `</svg>`;
  const rendered = new Resvg(svg, { fitTo: { mode: "width", value: SIZE } }).render();
  // resvg draws nothing where it cannot decode an image, rather than failing.
  // A transparent square is not a copy of anybody's logo.
  const pixels = rendered.pixels;
  let painted = 0;
  for (let i = 3; i < pixels.length; i += 4) if (pixels[i] > 0) painted++;
  if (painted < (SIZE * SIZE) / 20) throw new Error("the image did not decode");
  return Buffer.from(rendered.asPng());
};

/** Every Sleeper image the data points at, and where. */
const findImages = () => {
  const found = new Map(); // url -> [{ file, where }]
  const note = (url, file, where) => {
    if (!url || !SLEEPER.test(url)) return;
    const list = found.get(url) ?? [];
    list.push({ file, where });
    found.set(url, list);
  };

  for (const year of fs.readdirSync(dataRoot).filter((d) => /^\d{4}$/.test(d)).sort()) {
    const usersPath = path.join(dataRoot, year, "users.json");
    if (fs.existsSync(usersPath)) {
      for (const user of JSON.parse(fs.readFileSync(usersPath, "utf8"))) {
        // The picture `getUserAvatarUrl` would show: a custom upload first,
        // then the account's own avatar.
        const upload = user.metadata?.avatar;
        if (upload && SLEEPER.test(upload)) note(upload, usersPath, user.user_id);
        else if (!upload && user.avatar) {
          note(`https://sleepercdn.com/avatars/${user.avatar}`, usersPath, user.user_id);
        }
      }
    }
    const leaguePath = path.join(dataRoot, year, "league.json");
    if (fs.existsSync(leaguePath)) {
      const metadata = JSON.parse(fs.readFileSync(leaguePath, "utf8")).metadata ?? {};
      for (const [key, value] of Object.entries(metadata)) {
        if (/^division_\d+_avatar$/.test(key)) note(value, leaguePath, key);
      }
    }
  }
  return found;
};

const saved = (id) =>
  fs.existsSync(outDir)
    ? fs.readdirSync(outDir).find((name) => name.replace(/\.[a-z0-9]+$/i, "") === id)
    : undefined;

const download = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
};

/**
 * Point the data at the local copies. users.json is re-serialised (it
 * round-trips byte for byte); league.json is edited as text, one exact URL at
 * a time, because not every season's file round-trips.
 */
const rewrite = (local) => {
  const byFile = new Map();
  for (const [url, { uses }] of local) {
    for (const use of uses) {
      const list = byFile.get(use.file) ?? [];
      list.push({ url, path: local.get(url).path, where: use.where });
      byFile.set(use.file, list);
    }
  }

  let changed = 0;
  for (const [file, uses] of byFile) {
    const raw = fs.readFileSync(file, "utf8");
    let next;
    if (file.endsWith("users.json")) {
      const users = JSON.parse(raw);
      for (const user of users) {
        const use = uses.find((u) => u.where === user.user_id);
        if (!use) continue;
        user.metadata = { ...(user.metadata ?? {}), avatar: use.path };
      }
      next = `${JSON.stringify(users, null, 2)}${raw.endsWith("\n") ? "\n" : ""}`;
    } else {
      next = raw;
      for (const use of uses) next = next.split(JSON.stringify(use.url)).join(JSON.stringify(use.path));
    }
    if (next !== raw) {
      fs.writeFileSync(file, next);
      changed++;
    }
  }
  return changed;
};

const main = async () => {
  const images = findImages();
  const sources = fs.existsSync(sourcesPath)
    ? JSON.parse(fs.readFileSync(sourcesPath, "utf8"))
    : {};
  const local = new Map(); // url -> { path, uses }
  let fetched = 0;
  let bytesIn = 0;
  let bytesOut = 0;
  const failed = [];

  for (const [url, uses] of images) {
    const id = idOf(url);
    const existing = saved(id);
    if (existing) {
      local.set(url, { path: `${PUBLIC_PREFIX}${existing}`, uses });
      continue;
    }
    if (DRY_RUN) {
      console.log(`would fetch ${url}  (${uses.length} use${uses.length === 1 ? "" : "s"})`);
      continue;
    }
    try {
      const bytes = await download(url);
      const kind = kindOf(bytes);
      if (!kind) throw new Error("not an image format this knows");
      const [out, ext] =
        bytes.length < KEEP_BELOW ? [bytes, kind.ext] : [shrink(bytes, kind.mime), "png"];
      const name = `${id}.${ext}`;
      fs.mkdirSync(outDir, { recursive: true });
      fs.writeFileSync(path.join(outDir, name), out);
      sources[`${PUBLIC_PREFIX}${name}`] = url;
      local.set(url, { path: `${PUBLIC_PREFIX}${name}`, uses });
      fetched++;
      bytesIn += bytes.length;
      bytesOut += out.length;
      console.log(
        `saved ${name}  ${Math.round(bytes.length / 1024)} kB${
          out === bytes ? "" : ` -> ${Math.round(out.length / 1024)} kB`
        }`
      );
    } catch (error) {
      // Left pointing at Sleeper, which still works while Sleeper does.
      failed.push(`${url}: ${error.message}`);
    }
  }

  if (DRY_RUN) {
    console.log(`\n${images.size} Sleeper images referenced, ${images.size - local.size} not yet saved.`);
    return;
  }

  const sorted = Object.fromEntries(Object.entries(sources).sort(([a], [b]) => a.localeCompare(b)));
  fs.mkdirSync(path.dirname(sourcesPath), { recursive: true });
  fs.writeFileSync(sourcesPath, `${JSON.stringify(sorted, null, 2)}\n`);
  const files = rewrite(local);

  console.log(
    `\n🖼  ${images.size} team logos on Sleeper; ${fetched} saved this run` +
      (fetched ? ` (${Math.round(bytesIn / 1024)} kB fetched, ${Math.round(bytesOut / 1024)} kB kept)` : "") +
      `; ${files} data file${files === 1 ? " now points" : "s now point"} at our copies.`
  );
  if (failed.length) {
    console.warn(`⚠️  Still on Sleeper, will retry next run:\n  ${failed.join("\n  ")}`);
  }
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
