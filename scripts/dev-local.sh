#!/usr/bin/env bash
# Start MongoDB (Docker if available), API, and Next.js for local development.
set -e
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

start_mongo() {
  if nc -z 127.0.0.1 27017 2>/dev/null; then
    echo "MongoDB already listening on 127.0.0.1:27017"
    return 0
  fi
  if command -v docker >/dev/null 2>&1; then
    echo "Starting MongoDB via docker compose…"
    (cd "$ROOT" && docker compose up -d)
    for _ in $(seq 1 30); do
      nc -z 127.0.0.1 27017 2>/dev/null && return 0
      sleep 1
    done
  fi
  echo "MongoDB is not running on 127.0.0.1:27017. Start it manually or install Docker."
  exit 1
}

if [[ ! -f "$ROOT/services/api/.env" ]]; then
  echo "Copying services/api/.env.example → services/api/.env"
  cp "$ROOT/services/api/.env.example" "$ROOT/services/api/.env"
fi
if [[ ! -f "$ROOT/apps/web/.env.local" ]]; then
  echo "Copying apps/web/.env.example → apps/web/.env.local"
  cp "$ROOT/apps/web/.env.example" "$ROOT/apps/web/.env.local"
fi

start_mongo

if [[ ! -x "$ROOT/services/api/.venv/bin/uvicorn" ]]; then
  echo "Create the API venv first: cd services/api && python3 -m venv .venv && pip install -r requirements.txt"
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
