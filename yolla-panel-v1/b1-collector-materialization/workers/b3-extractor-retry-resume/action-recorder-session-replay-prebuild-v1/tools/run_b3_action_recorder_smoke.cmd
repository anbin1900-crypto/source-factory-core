@echo off
setlocal
set ROOT=%~dp0..
python "%ROOT%\tools\b3_action_recorder_smoke.py" --fixture "%ROOT%\fixtures\record_replay_smoke_v1.json" --state "%ROOT%\generated\B3_ACTION_RECORDER_STATE_V1.json" --receipt "%ROOT%\generated\B3_RECORD_REPLAY_SMOKE_RECEIPT_V1.json"
exit /b %ERRORLEVEL%
