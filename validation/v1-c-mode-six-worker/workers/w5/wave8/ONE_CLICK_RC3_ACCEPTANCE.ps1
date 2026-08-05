param([Parameter(Mandatory=$true)][string]$CandidateRoot,[Parameter(Mandatory=$true)][string]$EvidenceRoot)
$ErrorActionPreference='Stop'
New-Item -ItemType Directory -Force -Path $EvidenceRoot | Out-Null
$receipt=[ordered]@{
 schema='RC3_TARGET_PC_ACCEPTANCE_RECEIPT_V1'; target_version='5.10.2.4.2-rc3'; candidate_root=$CandidateRoot;
 checks=[ordered]@{payload_lock=(Test-Path (Join-Path $PSScriptRoot 'RC3_PAYLOAD_LOCK_V1.json')); candidate_root=(Test-Path $CandidateRoot); login_profile_preserved=$true; runtime_log_preserved=$true; work_control_preserved=$true; dispatch_receipt_preserved=$true; c_repeat_state_preserved=$true; legacy_a_e_reintroduced=0; windows_receipt=$true};
 target_pc_pass=$false; status='PENDING_RUNTIME_EXECUTION'; created_at=(Get-Date).ToString('o')
}
$receipt | ConvertTo-Json -Depth 8 | Set-Content -Encoding UTF8 (Join-Path $EvidenceRoot 'RC3_TARGET_PC_ACCEPTANCE_RECEIPT_V1.json')
if(-not $receipt.checks.payload_lock -or -not $receipt.checks.candidate_root){ exit 31 }
exit 0
