@echo off
setlocal EnableExtensions
title Source Factory E Active Core SAFE Panel

set "ROOT=E:\SOURCE FACTORY\source-factory-active-core\SF_ACTIVE_CORE_20260801_172038"
set "ELECTRON_HOME=D:\SOURCE FACTORY\assembled\20260703_STAGE4_SLIM_PANEL_RUNTIME_CANDIDATE"
set "SAFE=%ROOT%\safe_panel_v10"
set "LOGROOT=%ROOT%\_STAGE4_LOGS"
set "LOG=%LOGROOT%\RUN_E_SF4_SAFE_PANEL_ACTIVE_CORE_LAST.log"

if not exist "%LOGROOT%" mkdir "%LOGROOT%"

echo ================================================== > "%LOG%"
echo RUN E SAFE PANEL ACTIVE CORE >> "%LOG%"
echo ROOT=%ROOT% >> "%LOG%"
echo ELECTRON_HOME=%ELECTRON_HOME% >> "%LOG%"
echo SAFE=%SAFE% >> "%LOG%"
echo ================================================== >> "%LOG%"

if not exist "%ELECTRON_HOME%\node_modules\.bin\electron.cmd" (
  echo [ERROR] electron.cmd not found: %ELECTRON_HOME%\node_modules\.bin\electron.cmd >> "%LOG%"
  notepad "%LOG%"
  pause
  exit /b 10
)

if not exist "%SAFE%\safe_panel_main.js" (
  echo [ERROR] safe_panel_main.js not found: %SAFE%\safe_panel_main.js >> "%LOG%"
  notepad "%LOG%"
  pause
  exit /b 11
)

taskkill /F /IM electron.exe /T >> "%LOG%" 2>&1
timeout /t 1 /nobreak >nul

cd /d "%ELECTRON_HOME%"
call "%ELECTRON_HOME%\node_modules\.bin\electron.cmd" "%SAFE%\safe_panel_main.js" >> "%LOG%" 2>&1

set "EXIT_CODE=%ERRORLEVEL%"
echo EXIT_CODE=%EXIT_CODE% >> "%LOG%"
notepad "%LOG%"
pause
exit /b %EXIT_CODE%
