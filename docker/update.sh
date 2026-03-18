#!/bin/sh
# ─────────────────────────────────────────────────────────────────────────────
# CrewForm — Self-Hosted Update Script
# Pulls the latest code, rebuilds containers, and restarts services.
# Database migrations run automatically on startup.
#
# Usage:
#   ./docker/update.sh            # update from main branch
#   ./docker/update.sh v1.2.0     # update to a specific tag
# ─────────────────────────────────────────────────────────────────────────────

set -e

BRANCH="${1:-main}"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$PROJECT_DIR"

echo ""
echo "═══════════════════════════════════════════════════"
echo "  CrewForm — Updating Self-Hosted Instance"
echo "═══════════════════════════════════════════════════"
echo ""

# 1. Check for uncommitted local changes
if ! git diff --quiet 2>/dev/null; then
    echo "⚠️  You have local changes. Stashing them..."
    git stash
    STASHED=1
fi

# 2. Pull latest code
echo "📥 Pulling latest code from '$BRANCH'..."
git fetch origin
git checkout "$BRANCH"
git pull origin "$BRANCH"
echo ""

# 3. Stop running containers (keeps volumes intact)
echo "⏹️  Stopping current containers..."
docker compose down
echo ""

# 4. Rebuild images (no cache to ensure fresh dependencies)
echo "🔨 Rebuilding containers..."
docker compose build --no-cache
echo ""

# 5. Start everything (migrations run automatically via migrate service)
echo "🚀 Starting services..."
docker compose up -d
echo ""

# 6. Wait for migrate to finish and show status
echo "⏳ Waiting for migrations..."
docker compose logs -f migrate 2>/dev/null || true
echo ""

echo "═══════════════════════════════════════════════════"
echo "  ✅ Update complete!"
echo ""
echo "  Services:"
docker compose ps --format "  {{.Name}}\t{{.Status}}" 2>/dev/null || docker compose ps
echo ""
echo "  Frontend: http://localhost:${FRONTEND_PORT:-3000}"
echo "═══════════════════════════════════════════════════"
echo ""

# Restore stashed changes if any
if [ "${STASHED:-0}" = "1" ]; then
    echo "📌 Restoring your stashed local changes..."
    git stash pop || echo "⚠️  Could not restore stash automatically. Run 'git stash pop' manually."
fi
