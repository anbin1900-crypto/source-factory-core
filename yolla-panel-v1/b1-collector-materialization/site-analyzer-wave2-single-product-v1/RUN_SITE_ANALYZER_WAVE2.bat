@echo off
setlocal
cd /d "%~dp0"
node launcher.cjs auto
exit /b %ERRORLEVEL%
