#!/usr/bin/env bash
set -euo pipefail

for tool_dir in /usr/local/bin /Applications/Docker.app/Contents/Resources/bin; do
  if [[ -d "${tool_dir}" ]]; then
    PATH="${tool_dir}:${PATH}"
  fi
done
export PATH

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_DIR="${ROOT_DIR}/backend"
FRONTEND_DIR="${ROOT_DIR}/frontend"
PYTHON_BIN="${PYTHON_BIN:-${BACKEND_DIR}/.venv/bin/python}"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql+psycopg://messenger_test:messenger_test@127.0.0.1:54329/messenger_test}"
TEST_SECRET_KEY="test-secret-key-with-at-least-32-bytes"
SMOKE_BACKEND_PORT="${SMOKE_BACKEND_PORT:-8001}"
SMOKE_BACKEND_URL="http://localhost:${SMOKE_BACKEND_PORT}"
SMOKE_FRONTEND_PORT="${SMOKE_FRONTEND_PORT:-5174}"
SMOKE_FRONTEND_URL="http://localhost:${SMOKE_FRONTEND_PORT}"
BACKEND_LOG="$(mktemp -t messenger-smoke.XXXXXX)"
BACKEND_PID=""

cleanup() {
  if [[ -n "${BACKEND_PID}" ]] && kill -0 "${BACKEND_PID}" 2>/dev/null; then
    kill "${BACKEND_PID}"
    wait "${BACKEND_PID}" 2>/dev/null || true
  fi
}

wait_for_backend() {
  for _ in {1..30}; do
    if curl --silent --fail "${SMOKE_BACKEND_URL}/health" >/dev/null; then
      return 0
    fi
    sleep 1
  done

  cat "${BACKEND_LOG}" >&2
  return 1
}

port_is_in_use() {
  "${PYTHON_BIN}" -c '
import socket
import sys

with socket.socket() as connection:
    sys.exit(0 if connection.connect_ex(("127.0.0.1", int(sys.argv[1]))) == 0 else 1)
' "$1"
}

trap cleanup EXIT INT TERM

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is required to run smoke tests." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed, but its daemon is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "npm is required to run smoke tests." >&2
  exit 1
fi

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Python executable not found: ${PYTHON_BIN}" >&2
  exit 1
fi
PYTHON_BIN="$(command -v "${PYTHON_BIN}")"

if port_is_in_use "${SMOKE_BACKEND_PORT}"; then
  echo "A process is already listening on port ${SMOKE_BACKEND_PORT}. Stop it or set SMOKE_BACKEND_PORT." >&2
  exit 1
fi

if port_is_in_use "${SMOKE_FRONTEND_PORT}"; then
  echo "A process is already listening on port ${SMOKE_FRONTEND_PORT}. Stop it or set SMOKE_FRONTEND_PORT." >&2
  exit 1
fi

docker compose -f "${ROOT_DIR}/compose.test.yaml" up -d --wait postgres-test

(
  cd "${BACKEND_DIR}"
  DATABASE_URL="${TEST_DATABASE_URL}" \
    SECRET_KEY="${TEST_SECRET_KEY}" \
    CORS_ORIGINS="${SMOKE_FRONTEND_URL}" \
    "${PYTHON_BIN}" -m alembic upgrade head
  exec env \
    DATABASE_URL="${TEST_DATABASE_URL}" \
    SECRET_KEY="${TEST_SECRET_KEY}" \
    CORS_ORIGINS="${SMOKE_FRONTEND_URL}" \
    "${PYTHON_BIN}" -m uvicorn app.main:app --host 127.0.0.1 --port "${SMOKE_BACKEND_PORT}"
) >"${BACKEND_LOG}" 2>&1 &
BACKEND_PID="$!"

wait_for_backend

(
  cd "${FRONTEND_DIR}"
  E2E_API_URL="${SMOKE_BACKEND_URL}" \
    E2E_BASE_URL="${SMOKE_FRONTEND_URL}" \
    E2E_PORT="${SMOKE_FRONTEND_PORT}" \
    VITE_API_URL="${SMOKE_BACKEND_URL}" \
    E2E_REUSE_EXISTING_SERVER="false" \
    npm run test:smoke
)
