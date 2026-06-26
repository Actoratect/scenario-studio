@echo off
chcp 65001 >nul
setlocal
cd /d "%~dp0"

echo === Scenario Studio restart ===

for /L %%P in (5173,1,5180) do (
  for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr ":%%P " ^| findstr "LISTENING"') do (
    echo killing PID %%I on port %%P
    taskkill /F /PID %%I >nul 2>&1
  )
)

start "" /b cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:5173/"

echo Starting vite dev server...
call npm --prefix packages\frontend run dev

echo.
echo === dev server stopped ===
pause
