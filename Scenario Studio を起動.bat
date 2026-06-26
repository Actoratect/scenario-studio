@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo === Scenario Studio launcher ===
echo project: %CD%
echo.

REM Kill any existing vite dev server on ports 5173-5180
for /L %%P in (5173,1,5180) do (
  for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr ":%%P " ^| findstr "LISTENING"') do (
    echo killing PID %%I on port %%P
    taskkill /F /PID %%I >nul 2>&1
  )
)

REM Open default browser after 5 seconds in background
start "" /b cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:5173/"

echo Starting vite dev server...
echo (Close this window to stop the server)
echo.

call npm --prefix packages\frontend run dev

echo.
echo === dev server stopped ===
pause
