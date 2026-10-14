@echo off
setlocal EnableExtensions
pushd "%~dp0"
set "NO_PAUSE=0"
if /i "%~1"=="--no-pause" (
  set "NO_PAUSE=1"
  shift
)
set "ARGS="
:collect
if "%~1"=="" goto run
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
  echo [done] Artifacts are in "%~dp0Released".
) else (
  echo [error] Packaging failed with exit code %EXITCODE%.
)
:finish
popd
if "%NO_PAUSE%"=="0" pause
exit /b %EXITCODE%
