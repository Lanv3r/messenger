#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-us-east-1}"
BACKEND_STACK_NAME="${BACKEND_STACK_NAME:-messenger-backend-dev}"
CERTIFICATE_STACK_NAME="${CERTIFICATE_STACK_NAME:-messenger-domain-certificate-dev}"
EDGE_STACK_NAME="${EDGE_STACK_NAME:-messenger-edge-dev}"
FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-messenger.anver.net}"
API_DOMAIN="${API_DOMAIN:-api.messenger.anver.net}"
TEMPLATE_PATH="${ROOT_DIR}/infra/aws/messenger-edge.yaml"

if [[ -x "${HOME}/.local/bin/aws" ]]; then
  AWS_BIN="${HOME}/.local/bin/aws"
else
  AWS_BIN="$(command -v aws || true)"
fi

if [[ -x "/Applications/Docker.app/Contents/Resources/bin/docker" ]]; then
  DOCKER_BIN="/Applications/Docker.app/Contents/Resources/bin/docker"
else
  DOCKER_BIN="$(command -v docker || true)"
fi

stack_output() {
  local stack_name="$1"
  local output_key="$2"

  "${AWS_BIN}" cloudformation describe-stacks \
    --region "${REGION}" \
    --stack-name "${stack_name}" \
    --query "Stacks[0].Outputs[?OutputKey=='${output_key}'].OutputValue | [0]" \
    --output text
}

wait_for_ssm_command() {
  local command_id="$1"
  local instance_id="$2"
  local status=""

  for _ in {1..48}; do
    status="$("${AWS_BIN}" ssm get-command-invocation \
      --region "${REGION}" \
      --command-id "${command_id}" \
      --instance-id "${instance_id}" \
      --query Status \
      --output text 2>/dev/null || true)"
    case "${status}" in
      Success)
        return 0
        ;;
      Failed|Cancelled|TimedOut)
        "${AWS_BIN}" ssm get-command-invocation \
          --region "${REGION}" \
          --command-id "${command_id}" \
          --instance-id "${instance_id}" \
          --output json >&2 || true
        return 1
        ;;
    esac
    sleep 5
  done

  echo "Timed out waiting for the Systems Manager command." >&2
  return 1
}

if [[ -z "${AWS_BIN}" || ! -x "${AWS_BIN}" ]]; then
  echo "AWS CLI v2 is required." >&2
  exit 1
fi

if [[ -z "${DOCKER_BIN}" || ! -x "${DOCKER_BIN}" ]]; then
  echo "Docker is required to build the frontend." >&2
  exit 1
fi

if [[ ! "${FRONTEND_DOMAIN}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || \
  [[ ! "${API_DOMAIN}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]]; then
  echo "Frontend and API domains must be lowercase DNS names." >&2
  exit 1
fi

export PATH="$(dirname "${DOCKER_BIN}"):${PATH}"

if ! "${DOCKER_BIN}" info >/dev/null 2>&1; then
  echo "Docker Desktop must be running before deployment." >&2
  exit 1
fi

"${AWS_BIN}" sts get-caller-identity --region "${REGION}" --output text >/dev/null
"${AWS_BIN}" cloudformation validate-template \
  --region "${REGION}" \
  --template-body "file://${TEMPLATE_PATH}" >/dev/null

certificate_status="$("${AWS_BIN}" cloudformation describe-stacks \
  --region "${REGION}" \
  --stack-name "${CERTIFICATE_STACK_NAME}" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || true)"

if [[ "${certificate_status}" != "CREATE_COMPLETE" ]]; then
  echo "The certificate stack must be CREATE_COMPLETE. Run scripts/request-aws-messenger-certificate.sh and add its Squarespace CNAME records first." >&2
  exit 1
fi

certificate_arn="$(stack_output "${CERTIFICATE_STACK_NAME}" CertificateArn)"
certificate_state="$("${AWS_BIN}" acm describe-certificate \
  --region "${REGION}" \
  --certificate-arn "${certificate_arn}" \
  --query 'Certificate.Status' \
  --output text)"

if [[ "${certificate_state}" != "ISSUED" ]]; then
  echo "The certificate is ${certificate_state}, not ISSUED yet." >&2
  exit 1
fi

backend_base_url="$(stack_output "${BACKEND_STACK_NAME}" BackendBaseUrl)"
backend_origin="${backend_base_url#http://}"
backend_instance_id="$(stack_output "${BACKEND_STACK_NAME}" BackendInstanceId)"

"${AWS_BIN}" cloudformation deploy \
  --region "${REGION}" \
  --stack-name "${EDGE_STACK_NAME}" \
  --template-file "${TEMPLATE_PATH}" \
  --parameter-overrides \
    "FrontendDomainName=${FRONTEND_DOMAIN}" \
    "ApiDomainName=${API_DOMAIN}" \
    "CertificateArn=${certificate_arn}" \
    "BackendOriginDomainName=${backend_origin}" \
  --no-fail-on-empty-changeset

frontend_bucket="$(stack_output "${EDGE_STACK_NAME}" FrontendBucketName)"
frontend_distribution_domain="$(stack_output "${EDGE_STACK_NAME}" FrontendDistributionDomainName)"
api_distribution_domain="$(stack_output "${EDGE_STACK_NAME}" ApiDistributionDomainName)"

"${DOCKER_BIN}" run --rm \
  --user "$(id -u):$(id -g)" \
  --env HOME=/tmp \
  --env npm_config_cache=/tmp/npm \
  --env "VITE_API_URL=https://${API_DOMAIN}" \
  --volume "${ROOT_DIR}/frontend:/app" \
  --workdir /app \
  node:22-bookworm \
  sh -lc 'npm ci && npm run build'

"${AWS_BIN}" s3 sync "${ROOT_DIR}/frontend/dist/" "s3://${frontend_bucket}/" \
  --delete \
  --exclude index.html \
  --cache-control 'public, max-age=31536000, immutable' \
  --only-show-errors
"${AWS_BIN}" s3 cp "${ROOT_DIR}/frontend/dist/index.html" "s3://${frontend_bucket}/index.html" \
  --cache-control 'no-cache, no-store, must-revalidate' \
  --content-type text/html \
  --only-show-errors

ssm_parameters_file="$(mktemp)"
trap 'rm -f "${ssm_parameters_file}"' EXIT
printf '%s\n' \
  '{"commands":[' \
  '"set -Eeuo pipefail",' \
  "\"sed -i -e 's/^COOKIE_SECURE=.*/COOKIE_SECURE=true/' -e 's|^CORS_ORIGINS=.*|CORS_ORIGINS=https://${FRONTEND_DOMAIN}|' /opt/messenger/backend.env\"," \
  '"/usr/local/bin/deploy-messenger"' \
  ']}' >"${ssm_parameters_file}"

ssm_command_id="$("${AWS_BIN}" ssm send-command \
  --region "${REGION}" \
  --instance-ids "${backend_instance_id}" \
  --document-name AWS-RunShellScript \
  --parameters "file://${ssm_parameters_file}" \
  --query 'Command.CommandId' \
  --output text)"

echo "Configuring the backend for secure cookies and ${FRONTEND_DOMAIN} CORS..."
wait_for_ssm_command "${ssm_command_id}" "${backend_instance_id}"

for _ in {1..36}; do
  if curl --silent --show-error --fail "https://${api_distribution_domain}/health" >/dev/null; then
    break
  fi
  sleep 5
done

if ! curl --silent --show-error --fail "https://${api_distribution_domain}/health" >/dev/null; then
  echo "The API CloudFront distribution did not pass its health check." >&2
  exit 1
fi

echo
echo "Add these CNAME records in Squarespace DNS:"
echo "  ${FRONTEND_DOMAIN} -> ${frontend_distribution_domain}"
echo "  ${API_DOMAIN} -> ${api_distribution_domain}"
echo
echo "After DNS propagates, open https://${FRONTEND_DOMAIN}."
