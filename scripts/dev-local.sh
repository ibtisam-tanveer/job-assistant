#!/usr/bin/env bash
# Start API + Next.js for local development (MongoDB must already be running).
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if ! nc -z 127.0.0.1 27017 2>/dev/null; then
  echo "MongoDB does not seem to be listening on 127.0.0.1:27017. Start it, then re-run this script."
  exit 1
fi

echo "API:  http://127.0.0.1:8000  (health: /health)"
echo "Web:  http://127.0.0.1:3000"
echo "Press Ctrl+C to stop both."
echo ""

cleanup() {
  kill "$API_PID" "$WEB_PID" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

(
  cd "$ROOT/services/api"
  exec .venv/bin/uvicorn main:app --reload --host 127.0.0.1 --port 8000
) &
API_PID=$!

(
  cd "$ROOT/apps/web"
  exec npm run dev -- --hostname 127.0.0.1 --port 3000
) &
WEB_PID=$!

wait
