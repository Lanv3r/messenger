#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-us-east-1}"
STACK_NAME="${STACK_NAME:-messenger-backend-dev}"
UPLOAD_BUCKET_NAME="${UPLOAD_BUCKET_NAME:-my-messenger-dev-uploads}"
S3_PREFIX="${S3_PREFIX:-messenger}"
TEMPLATE_PATH="${ROOT_DIR}/infra/aws/backend-ec2.yaml"

if [[ -x "${HOME}/.local/bin/aws" ]]; then
  AWS_BIN="${HOME}/.local/bin/aws"
else
  AWS_BIN="$(command -v aws)"
fi

if [[ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]]; then
  DOCKER_BIN="/Applications/Docker.app/Contents/Resources/bin/docker"
else
  DOCKER_BIN="$(command -v docker)"
fi

require_command() {
  local command_path="$1"
  local command_name="$2"

  if [[ -z "${command_path}" || ! -x "${command_path}" ]]; then
    echo "${command_name} is required." >&2
    exit 1
  fi
}

stack_output() {
  local output_key="$1"

  "${AWS_BIN}" cloudformation describe-stacks \
    --region "${REGION}" \
    --stack-name "${STACK_NAME}" \
    --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue | [0]" \
    --output text
}

require_command "${AWS_BIN:-}" "AWS CLI"
require_command "${DOCKER_BIN:-}" "Docker"

# Docker Desktop's credential helper lives beside the Docker CLI on macOS.
export PATH="$(dirname "${DOCKER_BIN}"):${PATH}"

if ! "${DOCKER_BIN}" info >/dev/null 2>&1; then
  echo "Docker Desktop must be running before deployment." >&2
  exit 1
fi

"${AWS_BIN}" sts get-caller-identity --region "${REGION}" --output text >/dev/null
"${AWS_BIN}" cloudformation validate-template \
  --region "${REGION}" \
  --template-body "file://${TEMPLATE_PATH}" >/dev/null

"${AWS_BIN}" cloudformation deploy \
  --region "${REGION}" \
  --stack-name "${STACK_NAME}" \
  --template-file "${TEMPLATE_PATH}" \
  --capabilities CAPABILITY_NAMED_IAM \
  --parameter-overrides \
    "UploadBucketName=${UPLOAD_BUCKET_NAME}" \
    "S3Prefix=${S3_PREFIX}" \
  --no-fail-on-empty-changeset

REPOSITORY_URI="$(stack_output RepositoryUri)"
INSTANCE_ID="$(stack_output BackendInstanceId)"
HEALTH_URL="$(stack_output BackendHealthUrl)"
DEPLOY_DOCUMENT_NAME="$(stack_output BackendDeployDocumentName)"
REGISTRY_HOST="${REPOSITORY_URI%%/*}"

"${AWS_BIN}" ecr get-login-password --region "${REGION}" \
  | "${DOCKER_BIN}" login --username AWS --password-stdin "${REGISTRY_HOST}"
"${DOCKER_BIN}" build --platform linux/arm64 --tag "${REPOSITORY_URI}:latest" "${ROOT_DIR}/backend"
"${DOCKER_BIN}" push "${REPOSITORY_URI}:latest"

echo "Waiting for Systems Manager to register the backend instance..."
for _ in {1..30}; do
  managed_instance_id="$("${AWS_BIN}" ssm describe-instance-information \
    --region "${REGION}" \
    --filters "Key=InstanceIds,Values=${INSTANCE_ID}" \
    --query 'InstanceInformationList[0].InstanceId' \
    --output text 2>/dev/null || true)"
  if [[ "${managed_instance_id}" == "${INSTANCE_ID}" ]]; then
    break
  fi
  sleep 10
done

if [[ "${managed_instance_id:-}" != "${INSTANCE_ID}" ]]; then
  echo "The instance did not register with Systems Manager within five minutes." >&2
  exit 1
fi

BOOTSTRAP_COMMAND_ID="$("${AWS_BIN}" ssm send-command \
  --region "${REGION}" \
  --instance-ids "${INSTANCE_ID}" \
  --document-name AWS-RunShellScript \
  --parameters 'commands=["cloud-init status --wait && test -x /usr/local/bin/deploy-messenger"]' \
  --query 'Command.CommandId' \
  --output text)"

echo "Waiting for the instance bootstrap to complete..."
for _ in {1..60}; do
  bootstrap_status="$("${AWS_BIN}" ssm get-command-invocation \
    --region "${REGION}" \
    --command-id "${BOOTSTRAP_COMMAND_ID}" \
    --instance-id "${INSTANCE_ID}" \
    --query Status \
    --output text 2>/dev/null || true)"
  case "${bootstrap_status}" in
    Success)
      break
      ;;
    Failed|Cancelled|TimedOut)
      "${AWS_BIN}" ssm get-command-invocation \
        --region "${REGION}" \
        --command-id "${BOOTSTRAP_COMMAND_ID}" \
        --instance-id "${INSTANCE_ID}" \
        --output json >&2 || true
      exit 1
      ;;
  esac
  sleep 5
done

if [[ "${bootstrap_status:-}" != "Success" ]]; then
  echo "The instance bootstrap did not finish within five minutes." >&2
  exit 1
fi

COMMAND_ID="$("${AWS_BIN}" ssm send-command \
  --region "${REGION}" \
  --instance-ids "${INSTANCE_ID}" \
  --document-name "${DEPLOY_DOCUMENT_NAME}" \
  --query 'Command.CommandId' \
  --output text)"

echo "Starting Redis, PostgreSQL, and the backend containers..."
for _ in {1..30}; do
  command_status="$("${AWS_BIN}" ssm get-command-invocation \
    --region "${REGION}" \
    --command-id "${COMMAND_ID}" \
    --instance-id "${INSTANCE_ID}" \
    --query Status \
    --output text 2>/dev/null || true)"
  case "${command_status}" in
    Success)
      break
      ;;
    Failed|Cancelled|TimedOut)
      "${AWS_BIN}" ssm get-command-invocation \
        --region "${REGION}" \
        --command-id "${COMMAND_ID}" \
        --instance-id "${INSTANCE_ID}" \
        --output json >&2 || true
      exit 1
      ;;
  esac
  sleep 5
done

if [[ "${command_status:-}" != "Success" ]]; then
  echo "The backend deployment did not finish within the expected time." >&2
  exit 1
fi

echo "Waiting for ${HEALTH_URL}..."
for _ in {1..24}; do
  if curl --silent --show-error --fail "${HEALTH_URL}"; then
    printf '\nBackend deployed at %s\n' "${HEALTH_URL%/health}"
    exit 0
  fi
  sleep 5
done

echo "The container started but the health check did not succeed. Inspect it with Systems Manager." >&2
exit 1
