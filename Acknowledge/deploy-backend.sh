#!/bin/bash
# Rebuild and restart the backend so Custom Leave Policies work.
# Run from repo root: ./Acknowledge/deploy-backend.sh
# Or from Acknowledge/: ./deploy-backend.sh

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== Deploying backend from $SCRIPT_DIR ==="

if command -v docker &>/dev/null && docker info &>/dev/null 2>&1; then
    echo "Using Docker..."
    docker compose -f docker-compose.prod.yml build backend --no-cache
    docker compose -f docker-compose.prod.yml up -d backend
    echo "Backend container restarted. Waiting 5s..."
    sleep 5
    if curl -sf http://localhost:8000/health | grep -q custom_policies_list; then
        echo "OK: Backend health check passed (custom_policies_list present)."
    else
        echo "Note: Health check may need to hit the backend via nginx (e.g. curl https://acknowledge.panscience.ai/api/health)."
    fi
else
    echo "Docker not available or not running. Restarting local uvicorn..."
    cd backend
    pkill -f "uvicorn app.main:app" 2>/dev/null || true
    sleep 2
    if [ -f .venv/bin/python ]; then
        .venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
    else
        python3 -m uvicorn app.main:app --host 0.0.0.0 --port 8000 &
    fi
    sleep 3
    if curl -sf http://127.0.0.1:8000/health | grep -q custom_policies_list; then
        echo "OK: Backend is up with custom_policies_list."
    else
        echo "Backend started in background. Check http://127.0.0.1:8000/health"
    fi
fi

echo "=== Done. Hard-refresh the app and click Retry on Leave Approvals if needed. ==="
