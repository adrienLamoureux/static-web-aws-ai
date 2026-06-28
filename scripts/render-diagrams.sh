#!/usr/bin/env bash
# Render docs/*.mmd architecture diagrams to crisp SVG (vector) + high-res PNG (3x)
# via mermaid-cli. SVG is the sharp-at-any-zoom source; PNG is for previews that
# can't render SVG. Re-run after editing any .mmd source.
#
#   Usage: bash scripts/render-diagrams.sh
set -euo pipefail
cd "$(dirname "$0")/.."

DIAGRAMS=(
  docs/architecture-current
  docs/agent-turn-loop
)

for base in "${DIAGRAMS[@]}"; do
  echo "Rendering ${base}.mmd ..."
  npx -y @mermaid-js/mermaid-cli@latest -i "${base}.mmd" -o "${base}.svg" -b white
  npx -y @mermaid-js/mermaid-cli@latest -i "${base}.mmd" -o "${base}.png" -b white -s 3
done

echo "Done. Outputs:"
for base in "${DIAGRAMS[@]}"; do
  echo "  ${base}.svg  ${base}.png"
done
