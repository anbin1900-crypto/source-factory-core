@echo off
setlocal EnableExtensions
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0VERIFY_BUNDLE.ps1"
if errorlevel 1 exit /b 41
call "%~dp0INSTALL.bat" %*
if errorlevel 1 exit /b %errorlevel%
powershell.exe -NoProfile -Command "$r=Get-Content -Raw '%~dp0RC7_INSTALL_RECEIPT.json'|ConvertFrom-Json;if($r.status-ne'PASS'-or$r.smoke-ne'PASS'-or-not$r.resolver_consumed-or-not$r.ui_hook_applied){exit 42};Write-Host 'RC7_TARGET_PC_ACCEPTANCE_PASS'"
exit /b %errorlevel%
