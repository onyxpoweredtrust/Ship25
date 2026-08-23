#!/bin/bash
# Ship25 @ Onyx Ship
#
# Ignition — double-click (or run from a terminal) to trigger Dynamic Boot,
# Ship's first-time machine setup: find this checkout, install workspace
# dependencies, build every Core module, and link `ship` onto PATH globally.
#
# Double-clicking in Finder runs this from the directory it's saved in, so
# Dynamic Boot always finds the real repo root without guessing.

set -e
cd "$(dirname "$0")"

if ! command -v pnpm >/dev/null 2>&1; then
  echo "pnpm is required and wasn't found on PATH. Install it first: https://pnpm.io/installation"
  read -n 1 -s -r -p "Press any key to close..."
  exit 1
fi

if [ ! -d "Works/Cores/CLI/node_modules" ]; then
  pnpm install
fi

npx tsx Works/Cores/CLI/Subworks/Bin/Boot.ts "$(pwd)"

echo ""
read -n 1 -s -r -p "Press any key to close..."
echo ""
