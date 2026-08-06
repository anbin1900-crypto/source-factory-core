@echo off
setlocal EnableExtensions
set "ROOT=%~dp0"
set "EVIDENCE=%ROOT%evidence"
set "SCHEMA=%ROOT%target_pc_expected_receipt_schema.json"
set "OUTPUT=%ROOT%TARGET_PC_ACCEPTANCE_RECEIPT.json"
where node >nul 2>nul || exit /b 10
if not exist "%EVIDENCE%\pre_evidence.json" exit /b 20
if not exist "%EVIDENCE%\post_evidence.json" exit /b 21
if not exist "%EVIDENCE%\runtime_receipts.json" exit /b 22
if not exist "%EVIDENCE%\rollback_receipt.json" exit /b 23
node "%ROOT%target_pc_acceptance_runner_v2.cjs" "%EVIDENCE%" "%SCHEMA%" "%OUTPUT%"
if errorlevel 1 exit /b 30
exit /b 0
