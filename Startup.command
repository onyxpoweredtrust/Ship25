#!/bin/bash
# Ship25 @ Onyx Labs
#
# Startup — double-click (or run from a terminal) to bring a machine fully
# up: install workspace dependencies, build every Core module, link `ship`
# onto PATH, walk through vars if none are set yet, and report which apps
# are (or aren't) already running as background services. This is the one
# entry point that's meant to auto-run everything — ship boot on its own
# still exists and does the same first three steps, if that's all you need.
#
# Mac-focused: this is a double-clickable .command file, and Ship's daemon
# support is most complete on macOS (LaunchAgents). It still runs fine on
# Linux from a terminal — just invoke it with `bash Startup.command`.
#
# Double-clicking in Finder runs this from the directory it's saved in, so
# it always finds the real repo root without guessing.

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

npx tsx Works/Cores/CLI/Subworks/Bin/Startup.ts "$(pwd)"

echo ""
read -n 1 -s -r -p "Press any key to close..."
echo ""
