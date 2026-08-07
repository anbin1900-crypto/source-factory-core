@echo off
setlocal EnableExtensions EnableDelayedExpansion
set "ROOT=%~dp0"
set "PACKAGE=%~1"
set "APP_HOME=%LOCALAPPDATA%\YollaPanel"
set "EVIDENCE=%~2"
if "%PACKAGE%"=="" exit /b 2
if "%EVIDENCE%"=="" set "EVIDENCE=%TEMP%\yolla-rc3-evidence-%RANDOM%"
mkdir "%EVIDENCE%" 2>nul
for %%D in (Profile RuntimeLogs WorkControl DispatchReceipts State) do if exist "%APP_HOME%\%%D" xcopy "%APP_HOME%\%%D" "%EVIDENCE%\preserved\%%D\" /E /I /H /Y >nul
set "SMOKE_PROFILE=%TEMP%\yolla-rc3-smoke-%RANDOM%"
mkdir "%SMOKE_PROFILE%" 2>nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "Expand-Archive -LiteralPath '%PACKAGE%' -DestinationPath '%EVIDENCE%\candidate' -Force" || goto :rollback
if not exist "%EVIDENCE%\candidate\PAYLOAD_MANIFEST.json" goto :rollback
node "%ROOT%validate_rc3_input_manifest.cjs" "%EVIDENCE%\candidate\INPUT_MANIFEST.json" || goto :rollback
node "%ROOT%candidate_assembler_rc3.cjs" "%EVIDENCE%\candidate\INPUT_MANIFEST.json" "%EVIDENCE%\assembled" || goto :rollback
if exist "%EVIDENCE%\assembled\payload" xcopy "%EVIDENCE%\assembled\payload" "%APP_HOME%\" /E /I /H /Y >nul
if exist "%EVIDENCE%\candidate\ONE_CLICK_ACCEPTANCE.ps1" powershell -NoProfile -ExecutionPolicy Bypass -File "%EVIDENCE%\candidate\ONE_CLICK_ACCEPTANCE.ps1" -EvidenceDir "%EVIDENCE%" -SmokeProfile "%SMOKE_PROFILE%" || goto :rollback
echo {"status":"TARGET_PC_EXECUTED","target_version":"5.10.2.4.2-rc3"}>"%EVIDENCE%\FINAL_RECEIPT.json"
exit /b 0
:rollback
for %%D in (Profile RuntimeLogs WorkControl DispatchReceipts State) do if exist "%EVIDENCE%\preserved\%%D" xcopy "%EVIDENCE%\preserved\%%D" "%APP_HOME%\%%D\" /E /I /H /Y >nul
echo {"status":"ROLLED_BACK","target_version":"5.10.2.4.2-rc3"}>"%EVIDENCE%\FINAL_RECEIPT.json"
exit /b 1
