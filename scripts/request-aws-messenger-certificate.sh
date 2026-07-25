#!/usr/bin/env bash
set -Eeuo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-us-east-1}"
CERTIFICATE_STACK_NAME="${CERTIFICATE_STACK_NAME:-messenger-domain-certificate-dev}"
FRONTEND_DOMAIN="${FRONTEND_DOMAIN:-messenger.anver.net}"
API_DOMAIN="${API_DOMAIN:-api.messenger.anver.net}"
TEMPLATE_PATH="${ROOT_DIR}/infra/aws/messenger-domain-certificate.yaml"

if [[ -x "${HOME}/.local/bin/aws" ]]; then
  AWS_BIN="${HOME}/.local/bin/aws"
else
  AWS_BIN="$(command -v aws || true)"
fi

if [[ -z "${AWS_BIN}" || ! -x "${AWS_BIN}" ]]; then
  echo "AWS CLI v2 is required." >&2
  exit 1
fi

if [[ ! "${FRONTEND_DOMAIN}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]] || \
  [[ ! "${API_DOMAIN}" =~ ^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$ ]]; then
  echo "Frontend and API domains must be lowercase DNS names." >&2
  exit 1
fi

"${AWS_BIN}" sts get-caller-identity --region "${REGION}" --output text >/dev/null
"${AWS_BIN}" cloudformation validate-template \
  --region "${REGION}" \
  --template-body "file://${TEMPLATE_PATH}" >/dev/null

stack_status="$("${AWS_BIN}" cloudformation describe-stacks \
  --region "${REGION}" \
  --stack-name "${CERTIFICATE_STACK_NAME}" \
  --query 'Stacks[0].StackStatus' \
  --output text 2>/dev/null || true)"

if [[ -z "${stack_status}" || "${stack_status}" == "None" ]]; then
  "${AWS_BIN}" cloudformation create-stack \
    --region "${REGION}" \
    --stack-name "${CERTIFICATE_STACK_NAME}" \
    --template-body "file://${TEMPLATE_PATH}" \
    --parameters \
      "ParameterKey=FrontendDomainName,ParameterValue=${FRONTEND_DOMAIN}" \
      "ParameterKey=ApiDomainName,ParameterValue=${API_DOMAIN}" >/dev/null
  echo "Requested a certificate through CloudFormation."
elif [[ "${stack_status}" == "CREATE_IN_PROGRESS" || "${stack_status}" == "CREATE_COMPLETE" ]]; then
  echo "Reusing certificate stack ${CERTIFICATE_STACK_NAME} (${stack_status})."
else
  echo "Certificate stack ${CERTIFICATE_STACK_NAME} is ${stack_status}. Resolve or delete that stack before requesting a new certificate." >&2
  exit 1
fi

certificate_arn=""
for _ in {1..24}; do
  certificate_arn="$("${AWS_BIN}" cloudformation list-stack-resources \
    --region "${REGION}" \
    --stack-name "${CERTIFICATE_STACK_NAME}" \
    --query "StackResourceSummaries[?LogicalResourceId=='MessengerDomainCertificate'].PhysicalResourceId | [0]" \
    --output text 2>/dev/null || true)"
  if [[ "${certificate_arn}" == arn:* ]]; then
    break
  fi
  sleep 5
done

if [[ "${certificate_arn}" != arn:* ]]; then
  echo "The certificate request was not ready. Run this script again in a minute." >&2
  exit 1
fi

validation_records_ready="false"
for _ in {1..24}; do
  missing_record_count="$("${AWS_BIN}" acm describe-certificate \
    --region "${REGION}" \
    --certificate-arn "${certificate_arn}" \
    --query 'length(Certificate.DomainValidationOptions[?ResourceRecord.Name == null])' \
    --output text)"
  if [[ "${missing_record_count}" == "0" ]]; then
    validation_records_ready="true"
    break
  fi
  sleep 5
done

if [[ "${validation_records_ready}" != "true" ]]; then
  echo "ACM has not generated the validation CNAME records yet. Run this script again in a minute." >&2
  exit 1
fi

echo
echo "Add the following CNAME validation records in Squarespace DNS, then wait for ACM to issue the certificate:"
"${AWS_BIN}" acm describe-certificate \
  --region "${REGION}" \
  --certificate-arn "${certificate_arn}" \
  --query 'Certificate.DomainValidationOptions[].{Domain:DomainName,Name:ResourceRecord.Name,Type:ResourceRecord.Type,Value:ResourceRecord.Value}' \
  --output table
echo
echo "Certificate ARN: ${certificate_arn}"
echo "After the certificate status is ISSUED, run scripts/deploy-aws-messenger-frontend.sh."
