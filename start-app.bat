@echo off
rem ============================================================
rem  Scenario Studio 起動用バッチ (開発サーバ)
rem  ダブルクリックで dev サーバを起動し、ブラウザを自動で開く。
rem  初回 (node_modules 不在) は依存インストールも自動で行う。
rem  ※ Chrome / Edge 推奨 (フォルダ書込みに File System Access API を使うため)
rem ============================================================
chcp 65001 >nul
cd /d "%~dp0"

echo.
echo  Scenario Studio を起動します...
echo  (初回は依存解決で少し時間がかかる場合があります)
echo  ブラウザが自動で開かない場合は http://localhost:5173/ を開いてください。
echo.

rem 初回セットアップ: node_modules が無ければ依存をインストールする
if exist "node_modules\" goto deps_ready
echo  初回セットアップ: 依存パッケージをインストールします。数分かかることがあります...
echo.
call corepack pnpm install
if errorlevel 1 goto install_failed
:deps_ready

rem corepack は Node 同梱。packageManager (pnpm) を自動で用意する。
call corepack pnpm -F frontend exec vite --open

echo.
echo  dev サーバが終了しました。
pause
exit /b 0

:install_failed
echo.
echo  依存パッケージのインストールに失敗しました。
echo  Node.js v20 以上が入っているか、ネットワーク接続を確認して再実行してください。
pause
exit /b 1
