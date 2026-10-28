#!/usr/bin/env bash

cleanup() {
  echo ""
  echo "==> Stopping all services..."
  kill $BACKEND_PID $FRONTEND_PID 2>/dev/null
  wait $BACKEND_PID $FRONTEND_PID 2>/dev/null
  echo "==> All stopped."
  exit 0
}

trap cleanup SIGINT SIGTERM

echo "==> Starting backend dev server..."
(cd backend && npm run dev) &
BACKEND_PID=$!

echo "==> Starting frontend dev server..."
(cd frontend && npm run dev) &
FRONTEND_PID=$!

echo ""
echo "Backend:  http://localhost:3000"
echo "Frontend: http://localhost:5173"
echo ""
echo "Press Ctrl+C to stop."

wait