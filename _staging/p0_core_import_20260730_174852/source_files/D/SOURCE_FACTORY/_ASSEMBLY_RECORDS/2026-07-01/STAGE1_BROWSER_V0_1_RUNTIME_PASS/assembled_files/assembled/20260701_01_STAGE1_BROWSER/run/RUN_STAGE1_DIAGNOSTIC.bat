@echo off
setlocal

set "SCRIPT_DIR=%~dp0"
for %%I in ("%SCRIPT_DIR%..") do set "PROJECT_ROOT=%%~fI"

if "%SOURCE_FACTORY_ROOT%"=="" (
set "SOURCE_FACTORY_ROOT=%PROJECT_ROOT%"
)

echo.
echo Source Factory Stage 1 Diagnostic
echo Project root: %PROJECT_ROOT%
echo SOURCE_FACTORY_ROOT: %SOURCE_FACTORY_ROOT%
echo.

cd /d "%PROJECT_ROOT%"
if errorlevel 1 (
echo ERROR: Failed to enter project root.
exit /b 1
)

where node >nul 2>nul
if errorlevel 1 (
echo ERROR: Node.js was not found in PATH.
echo Install Node.js, then run this file again.
exit /b 1
)

if not exist "%PROJECT_ROOT%\src\core\stage1SelfCheck.js" (
echo ERROR: src\core\stage1SelfCheck.js was not found.
echo Stage 1 source files must be materialized before diagnostic startup.
exit /b 1
)

node "%PROJECT_ROOT%\src\core\stage1SelfCheck.js"
set "DIAG_EXIT=%ERRORLEVEL%"

echo.
if not "%DIAG_EXIT%"=="0" (
echo Diagnostic found blocking failures.
exit /b %DIAG_EXIT%
)

echo Diagnostic finished without blocking failures.
echo Manual ORANGE warnings may still require user review.
exit /b 0