@echo off
setlocal EnableExtensions
title Source Factory E ONLY SAFE Panel

set "ROOT=%~dp0"
set "SAFE=%ROOT%safe_panel_v10"
set "ELECTRON_CMD=%ROOT%node_modules\.bin\electron.cmd"
set "LOGROOT=%ROOT%_STAGE4_LOGS"
set "LOG=%LOGROOT%\RUN_E_SF4_SAFE_PANEL_E_ONLY_LAST.log"

if not exist "%LOGROOT%" mkdir "%LOGROOT%"

echo ================================================== > "%LOG%"
echo RUN E ONLY SAFE PANEL >> "%LOG%"
echo ROOT=%ROOT% >> "%LOG%"
echo SAFE=%SAFE% >> "%LOG%"
echo ELECTRON_CMD=%ELECTRON_CMD% >> "%LOG%"
echo ================================================== >> "%LOG%"

if not exist "%ELECTRON_CMD%" (
  echo [ERROR] electron.cmd not found: %ELECTRON_CMD% >> "%LOG%"
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

echo [INFO] Starting E-only Electron... >> "%LOG%"
echo [INFO] Command: "%ELECTRON_CMD%" "%SAFE%\safe_panel_main.js" >> "%LOG%"

cd /d "%ROOT%"
call "%ELECTRON_CMD%" "%SAFE%\safe_panel_main.js" >> "%LOG%" 2>&1

set "EXIT_CODE=%ERRORLEVEL%"
echo EXIT_CODE=%EXIT_CODE% >> "%LOG%"

notepad "%LOG%"
pause
exit /b %EXIT_CODE%
