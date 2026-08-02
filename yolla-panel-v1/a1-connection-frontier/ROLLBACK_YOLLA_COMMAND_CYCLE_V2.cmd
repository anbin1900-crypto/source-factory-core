@echo off
setlocal EnableExtensions
chcp 65001 >nul
set "SCRIPT=%~dp0INSTALL_YOLLA_COMMAND_CYCLE_V2.ps1"
if not exist "%SCRIPT%" (
  echo [FAIL] Installer not found: %SCRIPT%
  pause
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -NoExit -File "%SCRIPT%" -Rollback
