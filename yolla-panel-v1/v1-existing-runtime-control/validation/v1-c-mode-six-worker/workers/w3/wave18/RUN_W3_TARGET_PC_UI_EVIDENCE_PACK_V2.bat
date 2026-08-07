@echo off
setlocal
if "%~1"=="" (
  echo USAGE: %~nx0 ^<config.json^>
  exit /b 2
)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Collect-W3TargetPcUiEvidencePackV2.ps1" -ConfigPath "%~f1"
exit /b %ERRORLEVEL%
