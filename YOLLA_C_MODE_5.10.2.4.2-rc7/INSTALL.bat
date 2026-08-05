@echo off
setlocal EnableExtensions
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-Yolla-C-Mode-5.10.2.4.2-rc7.ps1" %*
exit /b %errorlevel%
