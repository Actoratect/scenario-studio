@echo off
setlocal EnableExtensions
rem Keep this file ASCII-only so cmd.exe can parse it on every Windows code page.
cd /d "%~dp0"

echo.
echo  Starting Scenario Studio...
echo  If the browser does not open, visit http://127.0.0.1:5173/
echo.

where.exe node >nul 2>&1
if errorlevel 1 goto node_missing

rem Install workspace dependencies on the first launch.
if exist "packages\frontend\node_modules\.bin\vite.cmd" goto deps_ready
where.exe corepack >nul 2>&1
if errorlevel 1 goto corepack_missing
echo  Installing dependencies for the first launch...
echo.
call corepack pnpm install
if errorlevel 1 goto install_failed

:deps_ready
pushd "packages\frontend"
node "node_modules\vite\bin\vite.js" --open
set "launch_result=%errorlevel%"
popd
if not "%launch_result%"=="0" goto launch_failed
if errorlevel 1 goto launch_failed
exit /b 0

:node_missing
echo.
echo  ERROR: Node.js was not found. Install Node.js 20 or newer and try again.
goto failed

:corepack_missing
echo.
echo  ERROR: Corepack was not found. Install a Node.js version that includes Corepack.
goto failed

:install_failed
echo.
echo  ERROR: Dependency installation failed. Check the messages above and try again.
goto failed

:launch_failed
echo.
echo  ERROR: Scenario Studio could not start. Check the messages above.

:failed
echo.
pause
exit /b 1
