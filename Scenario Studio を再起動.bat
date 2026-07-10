@echo off
setlocal
REM Superseded by start-app.bat (P1). This wrapper keeps the "restart"
REM behavior: stop any running vite dev server first, then delegate the
REM actual launch (first-run install + vite --open) to start-app.bat.

REM Kill any existing vite dev server on ports 5173-5180
for /L %%P in (5173,1,5180) do (
  for /f "tokens=5" %%I in ('netstat -ano -p tcp ^| findstr ":%%P " ^| findstr "LISTENING"') do (
    echo killing PID %%I on port %%P
    taskkill /F /PID %%I >nul 2>&1
  )
)

endlocal
call "%~dp0start-app.bat"
