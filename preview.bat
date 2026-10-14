@echo off
setlocal EnableExtensions DisableDelayedExpansion
title YarkText - Development Preview

pushd "%~dp0"
if errorlevel 1 (
  echo [error] Cannot open the project directory.
  pause
  exit /b 1
)

where node.exe >nul 2>nul
if errorlevel 1 (
  echo [error] Node.js was not found. Install Node.js and reopen this file.
  goto failed
)
where pnpm.cmd >nul 2>nul
if errorlevel 1 (
  echo [error] pnpm was not found. Run: npm install -g pnpm@10.33.4
  goto failed
)

if /i "%~1"=="--check" (
  echo [ready] Node.js and pnpm are available.
  echo [ready] Project: "%CD%"
  popd
  exit /b 0
)

set "ELECTRON_RUN_AS_NODE="
if exist "packages\desktop\node_modules\electron-vite\package.json" goto launch
echo [setup] Installing workspace dependencies for the first launch...
call pnpm.cmd install
if errorlevel 1 goto failed

:launch
echo.
echo Starting YarkText preview without packaging...
echo Keep this window open while previewing.
echo UI and style changes usually reload automatically.
echo After main-process changes, stop with Ctrl+C and run this file again.
echo.
call pnpm.cmd dev
set "PREVIEW_EXITCODE=%ERRORLEVEL%"
if not "%PREVIEW_EXITCODE%"=="0" echo [error] Preview stopped with exit code %PREVIEW_EXITCODE%.
goto finish

:failed
set "PREVIEW_EXITCODE=1"

:finish
popd
echo.
pause
exit /b %PREVIEW_EXITCODE%
