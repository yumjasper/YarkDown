@echo off
setlocal EnableExtensions DisableDelayedExpansion
pushd "%~dp0"
if errorlevel 1 exit /b 1
node scripts\release.mjs %*
set "RELEASE_EXIT=%ERRORLEVEL%"
popd
if "%~1"=="" pause
exit /b %RELEASE_EXIT%
