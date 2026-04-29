#!/usr/bin/env bash
# scripts/deploy.sh — Deploy Journal Buddy to Firebase Hosting
#
# Usage:
#   bash scripts/deploy.sh            # Full deploy
#   bash scripts/deploy.sh --hosting  # Hosting only (skip Firestore rules)
#
# Prerequisites: firebase-tools installed globally (npm install -g firebase-tools)
# and you must be logged in (firebase login).

set -euo pipefail

# ── Checks ─────────────────────────────────────────────────────────────────────
if ! command -v firebase &> /dev/null; then
  echo "Error: firebase-tools not found."
  echo "Install it with: npm install -g firebase-tools"
  exit 1
fi

# Must run from project root
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

if [ ! -f ".firebaserc" ]; then
  echo "Error: .firebaserc not found. Run 'firebase use --add' to configure the project."
  exit 1
fi

# ── Build ───────────────────────────────────────────────────────────────────────
echo "Building..."
npm run build

# ── Deploy ──────────────────────────────────────────────────────────────────────
if [[ "${1:-}" == "--hosting" ]]; then
  echo "Deploying hosting only..."
  firebase deploy --only hosting
else
  echo "Deploying..."
  firebase deploy
fi

echo "Done."
