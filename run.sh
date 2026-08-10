#!/usr/bin/env bash
# One-command launcher: builds the frontend, then starts the backend, which
# serves the built site AND the API on the same port (http://localhost:4000).
set -e

cd "$(dirname "$0")"

echo "Installing & building frontend..."
cd frontend
npm install
npm run build
cd ..

echo ""
echo "Starting server on http://localhost:4000 ..."
cd backend
npm install
npm start
