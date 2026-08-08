#!/usr/bin/env python3
"""Verify, extract, test, or run the A-2 Wave 2 analyzer package."""
from __future__ import annotations

import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import zipfile

EXPECTED_SHA256 = "ce584baef74fe0fac0b16b5317e20c2160fe59e9e58deb4c4d8a85796d823be4"
ARCHIVE_NAME = "A2_SITE_ANALYZER_WAVE2_RUNTIME_PACKAGE.zip"


def sha256(path: Path) -> str:
    h = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()


def safe_extract(archive: Path, destination: Path) -> None:
    destination = destination.resolve()
    with zipfile.ZipFile(archive) as bundle:
        for member in bundle.infolist():
            target = (destination / member.filename).resolve()
            if os.path.commonpath([destination, target]) != str(destination):
                raise RuntimeError(f"unsafe archive member: {member.filename}")
        bundle.extractall(destination)


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", default="A2_SITE_ANALYZER_WAVE2_RUNTIME")
    parser.add_argument("--test", action="store_true")
    parser.add_argument("--run", action="store_true")
    args = parser.parse_args()

    root = Path(__file__).resolve().parent
    archive = root / ARCHIVE_NAME
    actual = sha256(archive)
    if actual != EXPECTED_SHA256:
        raise RuntimeError(f"SHA256 mismatch: {actual}")

    destination = (root / args.destination).resolve()
    destination.mkdir(parents=True, exist_ok=True)
    safe_extract(archive, destination)
    print(f"EXTRACTED={destination}")
    print(f"SHA256={actual}")

    if args.test:
        return subprocess.call(["node", "--test", "tests/*.test.mjs"], cwd=destination, shell=True)
    if args.run:
        if os.name == "nt":
            return subprocess.call([str(destination / "RUN_SITE_ANALYZER_WAVE2.bat")], cwd=destination, shell=True)
        return subprocess.call(["node", "src/launcher.mjs", "--mode", "smoke"], cwd=destination)
    return 0


if __name__ == "__main__":
    sys.exit(main())
