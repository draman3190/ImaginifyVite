#!/bin/bash
# Launches both backend and frontend for local development
# Usage: ./dev.sh [stage]  (default: beta)

set -e

STAGE="${1:-beta}"
PROJECT_ROOT="$(cd "$(dirname "$0")" && pwd)"

# Stage-specific resource names
TABLE_NAME="imaginify-books-${STAGE}"
BUCKET_NAME="imaginify-images-${STAGE}-115417277634"
SECRET_ID="imaginify/api-keys-${STAGE}"

echo "Starting Imaginify development environment (stage: ${STAGE})"
echo "=============================================="

# Track background processes for cleanup
BACKEND_PID=""

cleanup() {
    echo ""
    echo "Shutting down..."
    if [ -n "$BACKEND_PID" ]; then
        kill "$BACKEND_PID" 2>/dev/null || true
        wait "$BACKEND_PID" 2>/dev/null || true
    fi
    exit 0
}

trap cleanup SIGINT SIGTERM

# Start backend
echo "Starting backend on port 8080..."
cd "$PROJECT_ROOT/backend"
./gradlew bootRun --args="--aws.dynamodb.table-name=${TABLE_NAME} --aws.s3.bucket-name=${BUCKET_NAME} --aws.secrets-manager.api-key-secret-id=${SECRET_ID}" &
BACKEND_PID=$!

# Wait for backend to be healthy
echo "Waiting for backend to start..."
MAX_WAIT=60
WAITED=0
until curl -s http://localhost:8080/actuator/health | grep -q '"status":"UP"' 2>/dev/null; do
    if [ $WAITED -ge $MAX_WAIT ]; then
        echo "Backend failed to start within ${MAX_WAIT}s"
        cleanup
        exit 1
    fi
    if ! kill -0 "$BACKEND_PID" 2>/dev/null; then
        echo "Backend process died unexpectedly"
        exit 1
    fi
    sleep 1
    WAITED=$((WAITED + 1))
done
echo "Backend is healthy"

# Start frontend (foreground)
echo "Starting frontend on port 5173..."
echo "=============================================="
echo "Backend:  http://localhost:8080"
echo "Frontend: http://localhost:5173"
echo "=============================================="
cd "$PROJECT_ROOT/frontend"
npm run dev

# If frontend exits, clean up backend
cleanup