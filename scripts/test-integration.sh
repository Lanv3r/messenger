#!/usr/bin/env bash
set -euo pipefail

for tool_dir in /usr/local/bin /Applications/Docker.app/Contents/Resources/bin; do
  if [[ -d "${tool_dir}" ]]; then
    PATH="${tool_dir}:${PATH}"
  fi
done
export PATH

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PYTHON_BIN="${PYTHON_BIN:-${ROOT_DIR}/backend/.venv/bin/python}"
TEST_DATABASE_URL="${TEST_DATABASE_URL:-postgresql+psycopg://messenger_test:messenger_test@127.0.0.1:54329/messenger_test}"
TEST_REDIS_URL="${TEST_REDIS_URL:-redis://127.0.0.1:56379/0}"

if ! command -v docker >/dev/null 2>&1 || ! docker compose version >/dev/null 2>&1; then
  echo "Docker Compose is required to run integration tests." >&2
  exit 1
fi

if ! docker info >/dev/null 2>&1; then
  echo "Docker is installed, but its daemon is not running. Start Docker Desktop and retry." >&2
  exit 1
fi

if ! command -v "${PYTHON_BIN}" >/dev/null 2>&1; then
  echo "Python executable not found: ${PYTHON_BIN}" >&2
  exit 1
fi
PYTHON_BIN="$(command -v "${PYTHON_BIN}")"

docker compose -f "${ROOT_DIR}/compose.test.yaml" up -d --wait postgres-test redis-test

S3_BUCKET=messenger-test-uploads \
  S3_REGION=us-east-1 \
  REDIS_URL="${TEST_REDIS_URL}" \
  TEST_DATABASE_URL="${TEST_DATABASE_URL}" \
  "${PYTHON_BIN}" -m unittest discover -s "${ROOT_DIR}/backend/tests" -p "test_*.py"
