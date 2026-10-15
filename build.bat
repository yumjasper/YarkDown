@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0"
set "NO_PAUSE=0"
if /i "%~1"=="--no-pause" (
  set "NO_PAUSE=1"
  shift
)
set "ARGS="
set "CHECK_ONLY=0"
:collect
if "%~1"=="" goto run
if /i "%~1"=="--check" set "CHECK_ONLY=1"
set ARGS=%ARGS% "%~1"
shift
goto collect
:run
where node >nul 2>nul
if errorlevel 1 (
  echo [error] Node.js was not found on PATH.
  set "EXITCODE=1"
  goto finish
)
node "%~dp0scripts\pack.mjs" %ARGS%
set "EXITCODE=%ERRORLEVEL%"
if "%EXITCODE%"=="0" (
  if "%CHECK_ONLY%"=="1" (
    echo [ready] Packaging configuration checked. No files were built.
  ) else (
    echo [done] Versioned artifacts are in "%~dp0Released".
  )
) else (
  echo [error] Packaging failed with exit code %EXITCODE%.
)
:finish
popd
if "%NO_PAUSE%"=="0" pause
exit /b %EXITCODE%
