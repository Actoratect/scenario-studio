@echo off
rem ============================================================
rem  Scenario Studio 起動用バッチ (開発サーバ)
rem  ダブルクリックで dev サーバを起動し、ブラウザを自動で開く。
rem  ※ Chrome / Edge 推奨 (フォルダ書込みに File System Access API を使うため)
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  Scenario Studio を起動します...
echo  (初回は依存解決で少し時間がかかる場合があります)
echo  ブラウザが自動で開かない場合は http://localhost:5173/ を開いてください。
echo.

rem corepack は Node 同梱。packageManager (pnpm) を自動で用意する。
call corepack pnpm -F frontend exec vite --open

echo.
echo  dev サーバが終了しました。
pause
