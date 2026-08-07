@echo off
setlocal EnableExtensions EnableDelayedExpansion
set TARGET_VERSION=5.10.2.4.2-rc3
set BASELINE_VERSION=5.10.2.4.0
set EVIDENCE=%~dp0evidence\%TARGET_VERSION%
if not exist "%EVIDENCE%" mkdir "%EVIDENCE%"
if not exist "%~dp0RC3_PAYLOAD_LOCK_V1.json" exit /b 21
copy /y "%~dp0RC3_PAYLOAD_LOCK_V1.json" "%EVIDENCE%\payload-lock.json" >nul || exit /b 22
if exist "%LOCALAPPDATA%\YollaPanel\User Data" xcopy /e /i /h /y "%LOCALAPPDATA%\YollaPanel\User Data" "%EVIDENCE%\login-profile-before" >nul
if exist "%LOCALAPPDATA%\YollaPanel\runtime.log" copy /y "%LOCALAPPDATA%\YollaPanel\runtime.log" "%EVIDENCE%\runtime-before.log" >nul
if exist "%LOCALAPPDATA%\YollaPanel\work-control.jsonl" copy /y "%LOCALAPPDATA%\YollaPanel\work-control.jsonl" "%EVIDENCE%\work-control-before.jsonl" >nul
if not exist "%~dp0payload" exit /b 23
xcopy /e /i /h /y "%~dp0payload" "%LOCALAPPDATA%\YollaPanel\candidate-%TARGET_VERSION%" >nul || exit /b 24
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0ONE_CLICK_RC3_ACCEPTANCE.ps1" -CandidateRoot "%LOCALAPPDATA%\YollaPanel\candidate-%TARGET_VERSION%" -EvidenceRoot "%EVIDENCE%"
if errorlevel 1 call "%~dp0ROLLBACK_RC3.bat" & exit /b 25
exit /b 0
