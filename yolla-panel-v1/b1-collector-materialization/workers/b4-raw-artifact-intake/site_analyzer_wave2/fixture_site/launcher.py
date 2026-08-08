from __future__ import annotations

import argparse
import json
from pathlib import Path

from server import create_server


def main() -> int:
    parser = argparse.ArgumentParser(description="Launch the YOLLA common HTTP fixture site")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=43127)
    parser.add_argument("--ready-file")
    args = parser.parse_args()

    server = create_server(args.host, args.port)
    base_url = f"http://{args.host}:{server.server_address[1]}"
    receipt = {"status": "READY", "base_url": base_url, "record_count": 10}
    if args.ready_file:
        Path(args.ready_file).write_text(json.dumps(receipt, indent=2), encoding="utf-8")
    print(json.dumps(receipt), flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        return 0
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
