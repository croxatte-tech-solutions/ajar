#!/usr/bin/env python3
"""End-to-end QR verification: does a camera read the right URL?

Every other check in this repo asks whether the code ran. This asks the
only question that matters for a QR: point a real detector at the image
the app produces and see whether the string that comes back is the one
the app meant to encode.

The pipeline, and why each part is what it is:

  1. scripts/qr_render.js loads index.html in a Node vm and uses the app's
     OWN qrcode library to build PNGs. Not a re-implementation — a second
     encoder could agree with itself while both were wrong.

  2. scripts/qrdecode.swift decodes with Apple's Vision framework, which
     is the detector behind the iPhone camera. That makes this a test of
     scannability, not of round-tripping our own maths.

  3. This script compares, and reports.

No pip install, no browser, no image library. Node's zlib writes the PNG
and macOS ships Vision, so the test is about the QR rather than about
keeping a toolchain alive.

Usage:
    python3 scripts/qr_verify.py [--count 12] [--keep]

Exit code is 0 only if every code decoded to exactly its expected link.
"""

import argparse
import json
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
RENDER = REPO / "scripts" / "qr_render.js"
DECODER_SRC = REPO / "scripts" / "qrdecode.swift"


def fail(msg):
    print(f"  FAIL  {msg}")
    return False


def build_decoder(workdir: Path) -> Path:
    """Compile the Swift decoder. Cached by mtime so repeat runs are fast."""
    if not DECODER_SRC.exists():
        sys.exit(f"missing {DECODER_SRC} — the Vision decoder is half the test")
    binary = workdir / "qrdecode"
    proc = subprocess.run(
        ["swiftc", "-O", "-o", str(binary), str(DECODER_SRC)],
        capture_output=True, text=True,
    )
    if proc.returncode != 0:
        sys.exit("swiftc failed:\n" + proc.stderr)
    return binary


def render(count: int, outdir: Path) -> list:
    proc = subprocess.run(
        ["node", str(RENDER), str(REPO / "index.html"), str(outdir), str(count)],
        capture_output=True, text=True, cwd=REPO,
    )
    if proc.returncode != 0:
        sys.exit("render failed:\n" + proc.stdout + proc.stderr)
    return json.loads((outdir / "manifest.json").read_text())


def decode(binary: Path, outdir: Path) -> dict:
    """Returns {filename: [payloads]}. A file with no payload is a code no
    camera could read, which is the failure a student actually meets."""
    pngs = sorted(outdir.glob("*.png"))
    proc = subprocess.run(
        [str(binary)] + [str(p) for p in pngs],
        capture_output=True, text=True,
    )
    found = {}
    for line in proc.stdout.splitlines():
        if "\t" not in line:
            continue
        path, payload = line.split("\t", 1)
        found.setdefault(Path(path).name, []).append(payload)
    return found


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=12,
                    help="how many exercises to render (default 12: one per task type)")
    ap.add_argument("--keep", action="store_true", help="leave the PNGs on disk")
    args = ap.parse_args()

    workdir = Path(tempfile.mkdtemp(prefix="ajar-qr-"))
    ok = True
    try:
        print(f"QR verification — {args.count} codes, decoded with Apple Vision\n")
        binary = build_decoder(workdir)
        manifest = render(args.count, workdir)
        decoded = decode(binary, workdir)

        links = [row["link"] for row in manifest]
        if len(set(links)) != len(links):
            ok = fail(f"links are not unique: {len(set(links))} distinct out of {len(links)}")
        else:
            print(f"  ok    all {len(links)} links are distinct")

        for row in manifest:
            name, expected = row["file"], row["link"]
            payloads = decoded.get(name, [])
            if not payloads:
                ok = fail(f"{name}: nothing decoded — no camera would read this")
            elif len(payloads) > 1:
                ok = fail(f"{name}: {len(payloads)} codes found in one image")
            elif payloads[0] != expected:
                ok = fail(f"{name}: decoded the wrong URL\n"
                          f"          expected {expected}\n"
                          f"          got      {payloads[0]}")
            else:
                print(f"  ok    {row['type']:<16} {row['modules']}x{row['modules']} modules  ->  {expected}")

        # A QR carrying the wrong school sends a student into another
        # school's material, so check the parts, not just the whole string.
        for row in manifest:
            if f"ex={row['id']}" not in row["link"]:
                ok = fail(f"{row['file']}: link does not carry its own exercise id")
            if "school=" not in row["link"]:
                ok = fail(f"{row['file']}: link carries no school")

        print()
        print("  ALL CHECKS PASS" if ok else "  FAILURES ABOVE")
        if args.keep:
            print(f"  images kept in {workdir}")
    finally:
        if not args.keep:
            shutil.rmtree(workdir, ignore_errors=True)

    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
