#!/usr/bin/env bash
set -euo pipefail

BASE_BRANCH="${1:-codex/dev}"
VARIANT_BRANCH="${2:-codex/design-pixnovel/code}"

REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "${REPO_ROOT}"

if ! git rev-parse --verify --quiet "${BASE_BRANCH}" >/dev/null; then
  echo "[scope-check] Missing base branch: ${BASE_BRANCH}" >&2
  exit 2
fi

if ! git rev-parse --verify --quiet "${VARIANT_BRANCH}" >/dev/null; then
  echo "[scope-check] Missing variant branch: ${VARIANT_BRANCH}" >&2
  exit 2
fi

allowed_path() {
  local path="$1"
  case "${path}" in
    frontend/*) return 0 ;;
    cdk/lib/static-web-aws-ai-stack.ts) return 0 ;;
    cdk/scripts/idea-env.js) return 0 ;;
    *) return 1 ;;
  esac
}

changed_files=()
while IFS= read -r line; do
  [ -z "${line}" ] && continue
  changed_files+=("${line}")
done < <(git diff --name-only "${BASE_BRANCH}..${VARIANT_BRANCH}")

if [ "${#changed_files[@]}" -eq 0 ]; then
  echo "[scope-check] No differences between ${BASE_BRANCH} and ${VARIANT_BRANCH}."
  exit 0
fi

disallowed_files=()
for changed in "${changed_files[@]}"; do
  if ! allowed_path "${changed}"; then
    disallowed_files+=("${changed}")
  fi
done

if [ "${#disallowed_files[@]}" -gt 0 ]; then
  echo "[scope-check] Disallowed variant changes detected for ${VARIANT_BRANCH}:"
  for disallowed in "${disallowed_files[@]}"; do
    echo "  - ${disallowed}"
  done
  exit 1
fi

echo "[scope-check] PASS: ${VARIANT_BRANCH} is limited to allowed UI variant paths."
