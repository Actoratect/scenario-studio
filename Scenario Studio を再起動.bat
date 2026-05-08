@echo off
REM 既存 dev server を kill し、起動し直す。「dev 再起動」用の楽ボタン。
setlocal
cd /d "%~dp0"

echo === Scenario Studio restart ===

for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  echo [restart] killing PID %%P ...
  taskkill /F /PID %%P >nul 2>&1
)

start "" /b cmd /c "timeout /t 4 /nobreak >nul && start http://localhost:5173/"

echo [restart] starting vite dev server...
call npm --prefix packages\frontend run dev

echo.
echo === dev server が終了しました ===
pause
