@echo off
setlocal
set ROOT=%~dp0..
python "%~dp0b3_durable_replay_smoke_v2.py" --fixture "%ROOT%\fixtures\record_restart_replay_smoke_v2.json" --out-dir "%ROOT%\generated"
exit /b %ERRORLEVEL%
