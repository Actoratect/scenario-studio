#!/usr/bin/env bash
set -euo pipefail

echo "→ Installing dependencies…"
pnpm install

echo "→ Running typecheck…"
pnpm typecheck

echo "→ Running tests…"
pnpm test

echo
echo "✓ Setup OK."
echo "  Next: open Documentation/ScenarioEditor/13_roadmap.md and pick a PoC."
