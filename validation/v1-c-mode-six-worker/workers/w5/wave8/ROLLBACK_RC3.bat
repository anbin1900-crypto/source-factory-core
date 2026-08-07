@echo off
setlocal EnableExtensions
set EVIDENCE=%~dp0evidence\5.10.2.4.2-rc3
if exist "%LOCALAPPDATA%\YollaPanel\candidate-5.10.2.4.2-rc3" rmdir /s /q "%LOCALAPPDATA%\YollaPanel\candidate-5.10.2.4.2-rc3"
if exist "%EVIDENCE%\login-profile-before" xcopy /e /i /h /y "%EVIDENCE%\login-profile-before" "%LOCALAPPDATA%\YollaPanel\User Data" >nul
if exist "%EVIDENCE%\runtime-before.log" copy /y "%EVIDENCE%\runtime-before.log" "%LOCALAPPDATA%\YollaPanel\runtime.log" >nul
if exist "%EVIDENCE%\work-control-before.jsonl" copy /y "%EVIDENCE%\work-control-before.jsonl" "%LOCALAPPDATA%\YollaPanel\work-control.jsonl" >nul
exit /b 0
