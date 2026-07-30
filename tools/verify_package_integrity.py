#!/usr/bin/env python3
import argparse
import hashlib
import json
import os
import zipfile
from pathlib import Path


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with path.open('rb') as f:
        for chunk in iter(lambda: f.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def verify_zip(path: Path) -> dict:
    try:
        with zipfile.ZipFile(path, 'r') as z:
            bad = z.testzip()
            names = z.namelist()
        return {
            'zip_integrity_pass': bad is None,
            'bad_entry': bad,
            'entry_count': len(names),
            'entries_preview': names[:50],
        }
    except Exception as exc:
        return {
            'zip_integrity_pass': False,
            'error': str(exc),
        }


def main() -> int:
    parser = argparse.ArgumentParser(description='Verify file size, SHA256 and ZIP integrity.')
    parser.add_argument('path')
    parser.add_argument('--expected-sha256', default='')
    parser.add_argument('--expected-size', type=int, default=None)
    args = parser.parse_args()

    path = Path(args.path)
    result = {
        'path': str(path),
        'exists': path.exists(),
    }
    if not path.exists():
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 2

    size = path.stat().st_size
    sha = sha256_file(path)
    result.update({
        'size_bytes': size,
        'sha256': sha,
        'expected_size': args.expected_size,
        'size_match': None if args.expected_size is None else size == args.expected_size,
        'expected_sha256': args.expected_sha256,
        'sha256_match': None if not args.expected_sha256 else sha.lower() == args.expected_sha256.lower(),
    })

    if path.suffix.lower() == '.zip':
        result.update(verify_zip(path))

    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
