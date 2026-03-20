#!/bin/bash
# Run this on the server. Path should be: /home/ubuntu/Acknowledge/Acknowledge
# Fixes: Custom Leave Policies not loading, login/API issues in production.
set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Production deploy from $SCRIPT_DIR ==="

# Docker Compose reads .env from project dir (same dir as docker-compose.prod.yml)
if [ ! -f .env ] && [ -f backend/.env ]; then
    echo "Copying backend/.env to .env for Docker Compose..."
    cp backend/.env .env
fi
if [ -f .env ]; then
    set -a
    source .env 2>/dev/null || true
    set +a
fi
export SECRET_KEY="${SECRET_KEY:-change-me-in-production}"

# Rebuild and restart backend (and ensure db is up)
COMPOSE="docker compose"
command -v docker-compose &>/dev/null && COMPOSE="docker-compose"

DOCKER_CMD=""
if command -v docker &>/dev/null 2>&1; then
    if docker info &>/dev/null 2>&1; then
        DOCKER_CMD=""
    else
        DOCKER_CMD="sudo"
    fi
fi

if command -v docker &>/dev/null 2>&1; then
    echo "Using Docker ($DOCKER_CMD)..."
    $DOCKER_CMD $COMPOSE -f docker-compose.prod.yml build backend --no-cache
    $DOCKER_CMD $COMPOSE -f docker-compose.prod.yml up -d db
    sleep 3
    $DOCKER_CMD $COMPOSE -f docker-compose.prod.yml up -d backend
    echo "Waiting for backend..."
    sleep 6
    $DOCKER_CMD $COMPOSE -f docker-compose.prod.yml restart nginx
    echo "Backend and nginx restarted."
else
    echo "Docker not found. On this server run: sudo ./deploy-production.sh"
    echo "Or: cd $SCRIPT_DIR && sudo docker compose -f docker-compose.prod.yml build backend --no-cache && sudo docker compose -f docker-compose.prod.yml up -d db backend && sudo docker compose -f docker-compose.prod.yml restart nginx"
    exit 1
fi

echo ""
echo "=== Done. Test production: ==="
echo "  curl -s https://acknowledge.panscience.ai/api/health"
echo "  Then hard-refresh the app (Ctrl+Shift+R) and click Retry on Leave Approvals."
