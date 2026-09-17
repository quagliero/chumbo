#!/usr/bin/env python3
"""
Find the five lost Chumbo team logos in a browser cache.

NFL.com's fantasy platform shut down and took the 2012-2018 team logos with it.
The site had only ever built the image URL and hotlinked it, so nothing was
stored. 27 of the 32 were recovered from one browser's disk cache; five were
not, because that browser re-requested them after the shutdown and cached the
redirect over the top of the image.

Those five may still be sitting in YOUR browser cache, if you looked at the
Chumbo site before NFL.com went away. This script looks for them.

    python3 find-lost-logos.py

It prints what it finds and writes any hits to ./chumbo-logos-found/. Send that
folder to the commissioner and they go back on the site permanently.


WHAT THIS DOES AND DOES NOT DO
------------------------------
It reads browser cache files looking for five specific images, identified by the
32-character id NFL.com gave each one. It opens files read-only, changes
nothing, and sends nothing anywhere — there is no network code in here at all.
The only thing it writes is the folder of logos it found.

It cannot see your history, passwords, cookies or open tabs. It looks for five
known ids and saves the JPEG attached to them, and a file has to contain both
the id and a decodable image to be saved.


IF IT FINDS NOTHING
-------------------
That is the likely outcome and it is not a mistake on your part. A browser cache
holds a few weeks of browsing; these images stopped being requested years ago
for most seasons. Try it on any older machine you still have, and it is worth
running before you clear a cache or retire a laptop.

Usage:
    python3 find-lost-logos.py                 scan the usual browser caches
    python3 find-lost-logos.py --extra DIR     also scan DIR (an old backup, say)
    python3 find-lost-logos.py --self-test     prove the script works (see below)

Needs Python 3.8 or newer and nothing else.
"""

import argparse
import os
import sys
from pathlib import Path

# ---------------------------------------------------------------------------
# What we are looking for.
#
# The id is the filename NFL.com served the image under. Nothing else about the
# URL is needed: the id is long enough to be unique, and it is what appears in a
# cache entry's key.
# ---------------------------------------------------------------------------

WANTED = {
    "1b45c8b45ba4d79fadf18adc5c289e79": ("2014", "Chris", "Suh Suh Sudio"),
    "79fbc6d84a4e46b911e1c8e367948d31": ("2015", "DJKJnr", "Can't Stand The Heat"),
    "e80f78f002bbb6c108ea5568d4a0b506": ("2015", "Euan", "Disciples of Aaron Rodgers"),
    "2dadc677b94be90e49e92c5fda714ece": ("2016", "DontPanic22", "Catch-22"),
    "d76c07912ded8c89ad3c817551aee98f": ("2018", "manzielsunicorn", "The Ghost of Unicorn Past"),
}

# A logo we know was recoverable, used only by --self-test: if the machinery can
# find this one it is working, and "found nothing" means the cache really does
# not have the other five.
SELF_TEST = {
    "23404919a7d9aaa89795804ed5167241": ("2012", "rich45", "Ha Noi Tigers"),
}

# Files bigger than this are not cache entries for a 40x40 image. Skipping them
# keeps a multi-gigabyte cache directory to a couple of minutes.
MAX_FILE_BYTES = 64 * 1024 * 1024
CHUNK = 4 * 1024 * 1024


# ---------------------------------------------------------------------------
# Where browsers keep their caches.
# ---------------------------------------------------------------------------

def cache_roots():
    """Every plausible browser cache directory on this machine."""
    home = Path.home()
    candidates = []

    if sys.platform == "darwin":
        caches = home / "Library" / "Caches"
        candidates += [
            caches / "Google" / "Chrome",
            caches / "Google" / "Chrome Canary",
            caches / "Chromium",
            caches / "Microsoft Edge",
            caches / "BraveSoftware",
            caches / "company.thebrowser.Browser",  # Arc
            caches / "Vivaldi",
            caches / "com.operasoftware.Opera",
            caches / "Firefox",
            caches / "com.apple.Safari",
            home / "Library" / "Containers" / "com.apple.Safari" / "Data"
                 / "Library" / "Caches",
        ]
    elif os.name == "nt":
        local = Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local"))
        roaming = Path(os.environ.get("APPDATA", home / "AppData" / "Roaming"))
        candidates += [
            local / "Google" / "Chrome" / "User Data",
            local / "Chromium" / "User Data",
            local / "Microsoft" / "Edge" / "User Data",
            local / "BraveSoftware" / "Brave-Browser" / "User Data",
            local / "Vivaldi" / "User Data",
            local / "Programs" / "Opera",
            local / "Mozilla" / "Firefox" / "Profiles",
            roaming / "Mozilla" / "Firefox" / "Profiles",
        ]
    else:
        cache = Path(os.environ.get("XDG_CACHE_HOME", home / ".cache"))
        candidates += [
            cache / "google-chrome",
            cache / "chromium",
            cache / "microsoft-edge",
            cache / "BraveSoftware",
            cache / "vivaldi",
            cache / "mozilla",
        ]

    return [p for p in candidates if p.is_dir()]


# ---------------------------------------------------------------------------
# Pulling a JPEG out of a cache entry.
#
# The formats differ per browser, so rather than parse each one this looks for
# the image itself: a JPEG starts FF D8 FF and ends FF D9. That alone would be
# too trusting — a JavaScript bundle can mention the id and contain no image,
# and two unrelated byte sequences can look like a start and an end — so a
# candidate is only accepted if its header parses and its dimensions are what a
# team logo's are.
# ---------------------------------------------------------------------------

SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
               0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}


def jpeg_size(data):
    """(width, height) by walking the JPEG's markers, or None if it is not one."""
    if len(data) < 4 or data[0] != 0xFF or data[1] != 0xD8:
        return None
    i = 2
    while i < len(data) - 9:
        if data[i] != 0xFF:
            i += 1
            continue
        marker = data[i + 1]
        if marker in (0xD8, 0x01) or 0xD0 <= marker <= 0xD7:
            i += 2
            continue
        if marker == 0xD9:
            return None
        length = (data[i + 2] << 8) | data[i + 3]
        if length < 2:
            return None
        if marker in SOF_MARKERS:
            return ((data[i + 7] << 8) | data[i + 8],
                    (data[i + 5] << 8) | data[i + 6])
        i += 2 + length
    return None


def extract_jpeg(data):
    """The largest decodable, logo-shaped JPEG in these bytes, or None.

    The end is the FIRST FF D9 after the start, not the last. Inside a JPEG's
    entropy-coded data a literal FF is stored as FF 00, so FF D9 cannot occur
    there by accident — the first one is the real end of the image, and taking
    the last would swallow whatever the cache stored after it.
    """
    best = None
    start = data.find(b"\xff\xd8\xff")
    while start != -1:
        end = data.find(b"\xff\xd9", start + 3)
        if end != -1:
            candidate = data[start:end + 2]
            size = jpeg_size(candidate)
            # The real ones are 40x40. The bound is generous in case a bigger
            # variant was cached, but rejects anything page-sized.
            if size and 8 <= size[0] <= 512 and 8 <= size[1] <= 512:
                if best is None or len(candidate) > len(best[0]):
                    best = (candidate, size)
        start = data.find(b"\xff\xd8\xff", start + 3)
    return best


def file_mentions(path, needles):
    """Which of `needles` (bytes) appear in this file, read in chunks."""
    hits = set()
    overlap = max(len(n) for n in needles) - 1
    try:
        with open(path, "rb") as handle:
            tail = b""
            while True:
                chunk = handle.read(CHUNK)
                if not chunk:
                    break
                window = tail + chunk
                for needle in needles:
                    if needle in window:
                        hits.add(needle)
                if len(hits) == len(needles):
                    break
                tail = window[-overlap:] if overlap else b""
    except (OSError, PermissionError):
        return set()
    return hits


# ---------------------------------------------------------------------------

def scan(roots, wanted, out_dir):
    needles = {h.encode("ascii"): h for h in wanted}
    found = {}
    scanned = 0

    for root in roots:
        if len(found) == len(wanted):
            break
        print(f"  scanning {root} ...", flush=True)
        for dirpath, _, filenames in os.walk(root, onerror=lambda e: None):
            if len(found) == len(wanted):
                break
            for name in filenames:
                if len(found) == len(wanted):
                    break
                path = os.path.join(dirpath, name)
                try:
                    if os.path.getsize(path) > MAX_FILE_BYTES:
                        continue
                except OSError:
                    continue

                scanned += 1
                if scanned % 20000 == 0:
                    print(f"    ... {scanned:,} files", flush=True)

                remaining = {n for n, h in needles.items() if h not in found}
                hit = file_mentions(path, remaining)
                if not hit:
                    continue

                try:
                    with open(path, "rb") as handle:
                        data = handle.read(MAX_FILE_BYTES)
                except (OSError, PermissionError):
                    continue

                image = extract_jpeg(data)
                if not image:
                    continue  # mentions the id but carries no image (a redirect,
                              # or a script that merely names the URL)
                for needle in hit:
                    h = needles[needle]
                    if h in found:
                        continue
                    found[h] = image
                    season, manager, team = wanted[h]
                    print(f"\n  FOUND  {season}  {manager} — {team}"
                          f"   ({image[1][0]}x{image[1][1]}, "
                          f"{len(image[0]):,} bytes)\n", flush=True)

    if found:
        out_dir.mkdir(parents=True, exist_ok=True)
        lines = []
        for h, (data, size) in found.items():
            (out_dir / f"{h}.jpg").write_bytes(data)
            season, manager, team = wanted[h]
            lines.append(f"{h}.jpg  {season}  {manager} — {team}  "
                         f"{size[0]}x{size[1]}")
        (out_dir / "FOUND.txt").write_text("\n".join(lines) + "\n")

    return found, scanned


def main():
    parser = argparse.ArgumentParser(
        description="Find the five lost Chumbo team logos in a browser cache.")
    parser.add_argument("--extra", action="append", default=[], metavar="DIR",
                        help="also scan this directory (an old backup, say)")
    parser.add_argument("--out", default="chumbo-logos-found", metavar="DIR",
                        help="where to write what it finds")
    parser.add_argument("--self-test", action="store_true",
                        help="look for a logo known to be recoverable, to prove "
                             "the script works on this machine")
    args = parser.parse_args()

    wanted = SELF_TEST if args.self_test else WANTED
    roots = cache_roots() + [Path(d) for d in args.extra if Path(d).is_dir()]

    print(__doc__.strip().split("\n\n")[0])
    print()
    if args.self_test:
        print("SELF TEST: looking for one logo that is known to have survived.")
        print()
    else:
        print("Looking for:")
        for season, manager, team in wanted.values():
            print(f"  {season}  {manager} — {team}")
        print()

    if not roots:
        print("No browser caches found in the usual places.")
        print("If you have an old backup, point at it with --extra DIR.")
        return 1

    out_dir = Path(args.out)
    found, scanned = scan(roots, wanted, out_dir)

    print()
    print(f"Scanned {scanned:,} files.")
    if args.self_test:
        if found:
            print("Self test PASSED — the script can find a logo in this cache.")
        else:
            print("Self test found nothing. That means either this browser never")
            print("visited the Chumbo site, or its cache has since been cleared —")
            print("so a real run finding nothing would not tell us much.")
        return 0

    if not found:
        print("Found none of the five. That is the likely outcome — thank you")
        print("for trying. If you have an older machine or a backup, it is")
        print("worth a run there too (see --extra).")
        return 0

    print(f"Found {len(found)} of {len(wanted)}. They are in: {out_dir.resolve()}")
    print("Send that folder to the commissioner and they go back on the site.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
