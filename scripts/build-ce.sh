#!/usr/bin/env bash
# SPDX-License-Identifier: AGPL-3.0-or-later
# Copyright (C) 2026 CrewForm
#
# build-ce.sh — Build the CrewForm Community Edition distribution.
#
# This script:
#   1. Creates a clean CE build by stripping the ee/ directory
#   2. Sets CREWFORM_EDITION=ce to disable EE feature gates at runtime
#   3. Produces production builds of the frontend and task-runner
#
# Usage:
#   ./scripts/build-ce.sh          # Build CE locally
#   ./scripts/build-ce.sh docker   # Build CE Docker image

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"
BUILD_DIR="$ROOT_DIR/dist-ce"

echo "──────────────────────────────────────────────────"
echo "  CrewForm Community Edition Build"
echo "──────────────────────────────────────────────────"

# ─── Clean ────────────────────────────────────────────────────────────────────
echo "→ Cleaning previous CE build..."
rm -rf "$BUILD_DIR"
mkdir -p "$BUILD_DIR"

# ─── Copy source (excluding ee/) ──────────────────────────────────────────────
echo "→ Copying source files (excluding ee/)..."
rsync -a --exclude='ee/' --exclude='node_modules/' --exclude='dist/' \
    --exclude='dist-ce/' --exclude='.git/' \
    "$ROOT_DIR/" "$BUILD_DIR/"

# ─── Set environment ─────────────────────────────────────────────────────────
echo "→ Setting CREWFORM_EDITION=ce..."
# Ensure .env files have the CE flag
if [ -f "$BUILD_DIR/.env" ]; then
    echo "VITE_CREWFORM_EDITION=ce" >> "$BUILD_DIR/.env"
    echo "CREWFORM_EDITION=ce" >> "$BUILD_DIR/.env"
else
    echo "VITE_CREWFORM_EDITION=ce" > "$BUILD_DIR/.env"
    echo "CREWFORM_EDITION=ce" >> "$BUILD_DIR/.env"
fi

# ─── Docker build (optional) ─────────────────────────────────────────────────
if [ "${1:-}" = "docker" ]; then
    echo "→ Building Docker image: crewform/crewform:ce-latest"
    docker build \
        --build-arg CREWFORM_EDITION=ce \
        -t crewform/crewform:ce-latest \
        "$BUILD_DIR"
    echo "✓ Docker image built: crewform/crewform:ce-latest"
else
    echo ""
    echo "✓ CE distribution ready at: $BUILD_DIR"
    echo ""
    echo "  To build Docker image, run:"
    echo "    ./scripts/build-ce.sh docker"
    echo ""
    echo "  To install and run locally:"
    echo "    cd $BUILD_DIR && npm install && npm run dev"
fi

echo "──────────────────────────────────────────────────"
echo "  Build complete!"
echo "──────────────────────────────────────────────────"
