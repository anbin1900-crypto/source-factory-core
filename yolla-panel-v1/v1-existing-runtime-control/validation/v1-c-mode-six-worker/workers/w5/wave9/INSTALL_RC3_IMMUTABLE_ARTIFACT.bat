@echo off
setlocal EnableExtensions
set SCRIPT_DIR=%~dp0
set OUT_DIR=%SCRIPT_DIR%out
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%Build-RC3ImmutableArtifact.ps1" -OutputRoot "%OUT_DIR%"
if errorlevel 1 (
  echo RC3_BUILD_FAILED
  exit /b 1
)
echo RC3_ARTIFACT_READY_TARGET_PC_PENDING
exit /b 0
