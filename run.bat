@echo off
REM One-command launcher for Windows: builds the frontend, then starts the
REM backend, which serves the built site AND the API on the same port.
REM (This window stays open on error/exit so double-clicking works too.)

where node >nul 2>nul
if errorlevel 1 (
  echo ERROR: Node.js was not found on your PATH.
  echo Install it from https://nodejs.org ^(version 22.5.0 or newer^) and try again.
  pause
  exit /b 1
)

echo Node version:
node -v
echo.

cd frontend
call npm install
if errorlevel 1 (
  echo.
  echo ERROR: "npm install" failed in the frontend folder. See the message above.
  pause
  exit /b 1
)

call npm run build
if errorlevel 1 (
  echo.
  echo ERROR: "npm run build" failed in the frontend folder. See the message above.
  pause
  exit /b 1
)
cd ..

echo.
echo Starting server on http://localhost:4000 ...
cd backend
call npm install
if errorlevel 1 (
  echo.
  echo ERROR: "npm install" failed in the backend folder. See the message above.
  pause
  exit /b 1
)
call npm start
if errorlevel 1 (
  echo.
  echo ERROR: the backend failed to start. See the message above.
  echo A common cause: DATABASE_URL is missing or wrong in backend\.env ^(see SUPABASE_SETUP.md^).
)
pause
