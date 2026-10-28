#!/usr/bin/env bash
set -e

echo "==> Installing backend dependencies..."
(cd backend && npm install)

echo "==> Installing frontend dependencies..."
(cd frontend && npm install)

echo "==> Done!"