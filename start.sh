#!/usr/bin/env bash

set -m

cleanup() {
  trap - SIGINT SIGTERM EXIT
  echo ""
  echo "==> Stopping all services..."
  [ -n "${BACKEND_PID:-}" ] && kill -- -"$BACKEND_PID" 2>/dev/null
  [ -n "${FRONTEND_PID:-}" ] && kill -- -"$FRONTEND_PID" 2>/dev/null
  wait 2>/dev/null
  echo "==> All stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM EXIT

echo "==> Starting backend dev server..."
(cd backend && npm run dev 2>&1 | sed -u 's/^/[backend] /') &
BACKEND_PID=$!

echo "==> Starting frontend dev server..."
(cd frontend && npm run dev 2>&1 | sed -u 's/^/[frontend] /') &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:3000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop."

wait
