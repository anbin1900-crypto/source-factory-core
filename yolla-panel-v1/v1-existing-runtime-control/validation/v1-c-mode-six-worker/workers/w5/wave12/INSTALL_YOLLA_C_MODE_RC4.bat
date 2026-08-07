@echo off
setlocal EnableExtensions
set "VERSION=5.10.2.4.2-rc4"
set "ROOT=%~dp0rc4-package"
set "RELEASE=%LOCALAPPDATA%\Yolla\releases\%VERSION%"
set "BASELINE=%LOCALAPPDATA%\Yolla\releases\5.10.2.4.0"
set "LAUNCHER=%LOCALAPPDATA%\Yolla\launcher.json"
if not exist "%ROOT%\automation-c-v1\c_mode_runtime.cjs" exit /b 10
if not exist "%ROOT%\automation-c-v1\c_mode_wave_pointer.cjs" exit /b 11
if not exist "%ROOT%\automation-c-v1\result_watcher\runtime_result_adapter.cjs" exit /b 12
if not exist "%ROOT%\ui\candidate_ui_truth_bridge.cjs" exit /b 13
if not exist "%ROOT%\automation-c-v1\actual_candidate_bridge_binding.cjs" exit /b 14
if not exist "%ROOT%\automation-c-v1\background_browser_dispatch.cjs" exit /b 15
if not exist "%ROOT%\automation-c-v1\work_control_event_log.cjs" exit /b 16
mkdir "%RELEASE%" >nul 2>nul
if errorlevel 1 exit /b 20
xcopy "%ROOT%\*" "%RELEASE%\" /E /I /Y >nul
if errorlevel 1 goto rollback
node "%RELEASE%\automation-c-v1\tests\rc4_isolated_smoke.cjs"
if errorlevel 1 goto rollback
node -e "require('%RELEASE:\=/%/automation-c-v1/rc4_launcher_switch.cjs').switchLauncher({launcherFile:'%LAUNCHER:\=/%',releaseDir:'%RELEASE:\=/%',version:'%VERSION%',smokeReceipt:{status:'PASS'}})"
if errorlevel 1 goto rollback
echo {"version":"%VERSION%","runtime_present":true,"smoke":"PASS","launcher_switched":true} > "%RELEASE%\INSTALL_RECEIPT.json"
exit /b 0
:rollback
node -e "require('%RELEASE:\=/%/automation-c-v1/rc4_rollback_runtime.cjs').rollback({releaseDir:'%RELEASE:\=/%',backupDir:'%BASELINE:\=/%',launcherFile:'%LAUNCHER:\=/%'})"
exit /b 30
