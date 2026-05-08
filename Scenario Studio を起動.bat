@echo off
REM Scenario Studio をダブルクリックで起動するための batch ファイル。
REM 既存の vite (port 5173) を kill してから dev server を起動し、
REM 5 秒後に既定ブラウザで http://localhost:5173/ を開く。
REM
REM 終了するときはこのウィンドウを閉じれば dev server も止まる。

setlocal
cd /d "%~dp0"

echo === Scenario Studio launcher ===
echo project: %CD%
echo.

REM 既存 vite を停止 (port 5173 を listen しているプロセスを kill)
for /f "tokens=5" %%P in ('netstat -ano ^| findstr ":5173" ^| findstr "LISTENING"') do (
  echo [start] killing existing vite PID %%P ...
  taskkill /F /PID %%P >nul 2>&1
)

REM ブラウザを 5 秒後に自動で開く (バックグラウンド)
start "" /b cmd /c "timeout /t 5 /nobreak >nul && start http://localhost:5173/"

REM dev server (front-end) を foreground で起動。Ctrl+C か window 閉じで停止。
echo [start] starting vite dev server...
echo (このウィンドウを閉じると dev server も停止します)
echo.
call npm --prefix packages\frontend run dev

REM サーバが終了した場合は一時停止して結果を見せる
echo.
echo === dev server が終了しました ===
pause
