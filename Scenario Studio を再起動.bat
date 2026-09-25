@echo off
setlocal
REM Superseded by start-app.bat (P1). This wrapper keeps the "restart"
REM behavior: stop any running vite dev server first, then delegate the
REM actual launch (first-run install + vite --open) to start-app.bat.

REM Only stop Vite belonging to this workspace; never kill arbitrary port users.
node "%~dp0scripts\restart-dev.mjs" --stop-only
if errorlevel 1 (
  pause
  exit /b 1
)

endlocal
call "%~dp0start-app.bat"
