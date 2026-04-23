#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
MODE="${1:-incremental}"

if [[ "$MODE" != "full" && "$MODE" != "incremental" ]]; then
  echo "Usage: ./scripts/run-brain-ui.sh [full|incremental]"
  exit 1
fi

echo "==> Rebuilding brain data (${MODE})"
cd "$ROOT_DIR"
npx tsx src/brain/run.ts "$MODE"

echo "==> Regenerating graph files"
npx tsx src/brain/visualize.ts

echo "==> Installing/refreshing UI dependencies"
cd "$ROOT_DIR/brain-ui"
npm install

echo "==> Starting React UI (Vite)"
npm run dev
