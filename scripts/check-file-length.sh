#!/usr/bin/env bash
# check-file-length.sh — Enforce a 500-line maximum per source file.
# Exits 1 if any .js or .css file in backend/ or frontend/src/ exceeds the limit.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LIMIT=500
FAILED=0

check_dir() {
  local dir="$1"
  local pattern="$2"

  if [ ! -d "$dir" ]; then
    return
  fi

  while IFS= read -r file; do
    local lines
    lines=$(wc -l < "$file")
    if [ "$lines" -gt "$LIMIT" ]; then
      echo "  FAIL ($lines lines): ${file#$ROOT/}"
      FAILED=1
    fi
  done < <(find "$dir" -type f -name "$pattern" \
    ! -path "*/node_modules/*" \
    ! -path "*/__mocks__/*" \
    ! -path "*/build/*" \
    ! -path "*/.cache/*")
}

echo "=== File Length Check (limit: $LIMIT lines) ==="
echo ""
echo "Checking backend/ JS files..."
check_dir "$ROOT/backend" "*.js"

echo "Checking frontend/src/ JS/JSX files..."
check_dir "$ROOT/frontend/src" "*.js"
check_dir "$ROOT/frontend/src" "*.jsx"

echo "Checking frontend/src/ CSS files..."
check_dir "$ROOT/frontend/src" "*.css"

echo ""
if [ "$FAILED" -eq 1 ]; then
  echo "ERROR: One or more files exceed the $LIMIT-line limit. Please split them."
  exit 1
else
  echo "All files are within the $LIMIT-line limit."
  exit 0
fi
