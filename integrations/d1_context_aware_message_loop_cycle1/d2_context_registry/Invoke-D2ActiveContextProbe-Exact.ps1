param(
  [string]$RoleId = 'D-2_CONTEXT_REGISTRY_AND_ACTIVE_WORKER_OWNER',
  [string]$CycleId = 'D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE1-20260807-001',
  [string]$CommandId = 'D1-CYCLE1-D2-ACTIVE-CONTEXT-IDENTIFICATION-20260807-001',
  [string]$StartedAt = '2026-08-07T23:40:00+09:00',
  [string]$ReceiptPath = 'E:\YOLLA\server\yolla-data-ledger-v1\state\d2-context-registry\D2_ACTIVE_CONTEXT_LIVE_RECEIPT_CYCLE1.json'
)
$ErrorActionPreference='Stop'
$nodeScript='E:\YOLLA\server\approved-ops\D2_ACTIVE_CONTEXT_PROBE_CYCLE1_EXACT.js'
$expected='69c37594a9ffbdca75d489bc2ab607ac704ec3a008a3939d0035b43ee85d35a5'
if(-not (Test-Path -LiteralPath $nodeScript)){throw 'D2_PROBE_SOURCE_MISSING'}
$actual=(Get-FileHash -Algorithm SHA256 -LiteralPath $nodeScript).Hash.ToLowerInvariant()
if($actual -ne $expected){throw ('D2_PROBE_SOURCE_SHA256_MISMATCH actual='+$actual)}
$node=(Get-Command node.exe -ErrorAction SilentlyContinue)
if(-not $node){$node=(Get-Command node -ErrorAction Stop)}
& $node.Source $nodeScript --role-id $RoleId --cycle-id $CycleId --command-id $CommandId --role-marker 'ROLE=D-2_CONTEXT_REGISTRY_AND_ACTIVE_WORKER_OWNER' --cycle-marker 'D1-CONTEXT-AWARE-MESSAGE-LOOP-CYCLE1-20260807-001' --started-at $StartedAt --receipt-path $ReceiptPath
if($LASTEXITCODE -ne 0){throw ('D2_ACTIVE_CONTEXT_PROBE_FAILED exit='+$LASTEXITCODE)}
exit 0
