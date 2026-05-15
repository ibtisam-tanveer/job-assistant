#!/usr/bin/env python3
"""Placeholder discovery CLI — extend with RSS/ATS connectors."""

from __future__ import annotations

import argparse
import sys


def main() -> int:
    parser = argparse.ArgumentParser(description="Job Assistant discovery (stub)")
    parser.add_argument("--source", default="rss", help="Connector name (not implemented yet)")
    args = parser.parse_args()
    print(
        f"Discovery connector '{args.source}' is not configured yet. "
        "Add feeds under services/api/discovery/ and POST to /ingest/job.",
        file=sys.stderr,
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
