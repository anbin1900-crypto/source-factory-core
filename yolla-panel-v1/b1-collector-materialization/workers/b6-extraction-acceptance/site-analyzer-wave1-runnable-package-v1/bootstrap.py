#!/usr/bin/env python3
from __future__ import annotations
import argparse, base64, hashlib, shutil, subprocess, sys, zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
PACKAGE = "B6_SITE_ANALYZER_WAVE1_RUNNABLE_PACKAGE_V1.zip"
EXPECTED_SHA256 = "d51654c036f2d70745f58a6f4d94af9734b56d3c0d9a89d7c5c5da1c873767ee"
INSTALL_DIR = HERE / ".installed" / "B6_SITE_ANALYZER_WAVE1_RUNNABLE_PACKAGE_V1"

def build_zip() -> Path:
    parts = sorted(HERE.glob(PACKAGE + ".b64.part*"))
    if len(parts) != 7:
        raise SystemExit(f"expected 7 parts, found {len(parts)}")
    raw = base64.b64decode("".join(p.read_text(encoding="ascii").strip() for p in parts), validate=True)
    digest = hashlib.sha256(raw).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit(f"package sha256 mismatch: {digest}")
    out = HERE / PACKAGE
    out.write_bytes(raw)
    return out

def install() -> Path:
    archive = build_zip()
    if INSTALL_DIR.exists():
        shutil.rmtree(INSTALL_DIR)
    INSTALL_DIR.mkdir(parents=True)
    with zipfile.ZipFile(archive) as z:
        z.extractall(INSTALL_DIR)
    return INSTALL_DIR

def run_launcher(*args: str) -> int:
    if not (INSTALL_DIR / "launcher.py").exists():
        install()
    return subprocess.call([sys.executable, str(INSTALL_DIR / "launcher.py"), *args], cwd=INSTALL_DIR)

def main() -> int:
    p=argparse.ArgumentParser(description="B-6 runnable analyzer package bootstrap")
    p.add_argument("action", choices=["install","verify","self-test","run-sample","rollback"])
    ns=p.parse_args()
    if ns.action == "install":
        print(install()); return 0
    if ns.action == "verify": return run_launcher("verify")
    if ns.action == "self-test": return run_launcher("self-test")
    if ns.action == "run-sample": return run_launcher("run","--fixture","sample/sample_input.json")
    if INSTALL_DIR.parent.exists(): shutil.rmtree(INSTALL_DIR.parent)
    archive=HERE/PACKAGE
    if archive.exists(): archive.unlink()
    print("ROLLBACK_COMPLETE"); return 0
if __name__ == "__main__": raise SystemExit(main())
