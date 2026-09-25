@echo off
REM Superseded by start-app.bat (P1). Kept as a thin wrapper so existing
REM double-click shortcuts keep working. All launch logic (first-run
REM "corepack pnpm install", vite --open) lives in start-app.bat.
call "%~dp0start-app.bat"
