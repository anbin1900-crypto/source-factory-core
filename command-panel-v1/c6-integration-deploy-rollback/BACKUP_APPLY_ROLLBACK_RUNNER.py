from __future__ import annotations
import argparse
import hashlib
import json
import shutil
import subprocess
from pathlib import Path


def git_blob(data: bytes) -> str:
    return hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()


def read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def apply_patch(text: str, item: dict) -> str:
    anchor = item["anchor"]
    content = item["content"]
    if item["operation"] == "append":
        if content.strip() in text:
            return text
        return text.rstrip() + "\n" + content
    if anchor not in text:
        raise RuntimeError(f"ANCHOR_NOT_FOUND:{item['path']}")
    if content.strip() in text:
        return text
    if item["operation"] == "insert_after":
        return text.replace(anchor, anchor + content, 1)
    raise RuntimeError(f"UNSUPPORTED_OPERATION:{item['operation']}")


def run(root: Path, manifest: dict, backup: Path, candidate: Path, rollback: bool = False):
    backup.mkdir(parents=True, exist_ok=True)
    candidate.mkdir(parents=True, exist_ok=True)
    receipt = {
        "schema_version": "C6_BACKUP_APPLY_ROLLBACK_RECEIPT_V1",
        "mode": "rollback" if rollback else "apply",
        "files": [],
    }
    for item in manifest["target_files"]:
        src = root / item["path"]
        bak = backup / item["path"]
        out = candidate / item["path"]
        bak.parent.mkdir(parents=True, exist_ok=True)
        out.parent.mkdir(parents=True, exist_ok=True)
        if rollback:
            if not bak.exists():
                raise RuntimeError(f"BACKUP_MISSING:{item['path']}")
            shutil.copy2(bak, src)
            observed = git_blob(src.read_bytes())
            if observed != item["base_git_blob"]:
                raise RuntimeError(f"ROLLBACK_BLOB_MISMATCH:{item['path']}:{observed}")
            receipt["files"].append({"path": item["path"], "rollback_blob": observed, "status": "PASS"})
            continue
        data = src.read_bytes()
        observed = git_blob(data)
        if observed != item["base_git_blob"]:
            raise RuntimeError(f"BASE_BLOB_MISMATCH:{item['path']}:{observed}")
        shutil.copy2(src, bak)
        patched = apply_patch(data.decode("utf-8"), item)
        out.write_text(patched, encoding="utf-8", newline="\n")
        shutil.copy2(out, src)
        receipt["files"].append({
            "path": item["path"],
            "base_blob": observed,
            "candidate_blob": git_blob(out.read_bytes()),
            "status": "PASS",
        })
    return receipt


def syntax(root: Path):
    js = root / "safe_panel_renderer.js"
    result = subprocess.run(["node", "--check", str(js)], capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("NODE_SYNTAX_FAIL:" + result.stderr)
    return "PASS"


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True)
    parser.add_argument("--manifest", required=True)
    parser.add_argument("--backup", required=True)
    parser.add_argument("--candidate", required=True)
    parser.add_argument("--rollback", action="store_true")
    parser.add_argument("--receipt", required=True)
    args = parser.parse_args()
    root = Path(args.root)
    manifest = read_json(Path(args.manifest))
    receipt = run(root, manifest, Path(args.backup), Path(args.candidate), args.rollback)
    if not args.rollback:
        receipt["node_syntax"] = syntax(root)
    Path(args.receipt).write_text(json.dumps(receipt, indent=2, sort_keys=True), encoding="utf-8")


if __name__ == "__main__":
    main()
