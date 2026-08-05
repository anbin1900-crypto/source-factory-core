$ErrorActionPreference='Stop'
$root=Join-Path $env:TEMP ('w5-wave4-'+[guid]::NewGuid())
New-Item -ItemType Directory -Path $root -Force|Out-Null
try{
  $pkg=Join-Path $root 'candidate.zip'; [IO.File]::WriteAllBytes($pkg,[byte[]](1..64))
  $sha=(Get-FileHash -Algorithm SHA256 $pkg).Hash.ToLowerInvariant()
  $gate=Join-Path $root 'w2.ps1'; 'exit 0'|Set-Content $gate
  $ui=Join-Path $root 'w3.ps1'; 'exit 0'|Set-Content $ui
  $soak=Join-Path $root 'w4.ps1'; 'exit 0'|Set-Content $soak
  $manifest=Join-Path $root 'candidate.json'
  @{version='5.10.2.4.1';package_path=$pkg;package_sha256=$sha;w2_report_gate=$gate;w3_ui_collector=$ui;w4_soak_validator=$soak}|ConvertTo-Json|Set-Content $manifest
  $runner=Join-Path $PSScriptRoot 'Invoke-Wave4TargetPcAcceptance.ps1'
  $evidence=Join-Path $root 'evidence'
  $receipt=& $runner -CandidateManifest $manifest -EvidenceRoot $evidence
  if(!(Test-Path $receipt)){throw 'receipt missing'}
  $r=Get-Content -Raw $receipt|ConvertFrom-Json
  $assertions=@(
    $r.control_id -eq 'V1-C-MODE-6W-VALIDATION-CYCLE-002',
    $r.wave_id -eq 'V1-C-MODE-6W-WAVE-004',
    $r.exact_version -eq '5.10.2.4.1',
    $r.package_sha256 -eq $sha,
    $r.offline_package_status -eq 'PASS',
    $r.live_status -eq 'NOT_REQUESTED',
    $r.retry_policy.document_ready_timeout_seconds -eq 30,
    $r.retry_policy.max_attempts -eq 5,
    $r.validators.Count -eq 3,
    $r.six_worker_three_round.Count -eq 18,
    $r.historical_runtime_log_policy -match 'EXCLUDE_A_E',
    $r.production -eq $false,
    $r.ready -eq $false,
    $r.merge -eq $false
  )
  if($assertions -contains $false){throw 'assertion failed'}
  $bad=Get-Content -Raw $manifest|ConvertFrom-Json; $bad.package_sha256='00'; $bad|ConvertTo-Json|Set-Content $manifest
  $failed=$false; try{& $runner -CandidateManifest $manifest -EvidenceRoot $evidence|Out-Null}catch{$failed=$_.Exception.Message -match 'PACKAGE_SHA256_MISMATCH'}
  if(!$failed){throw 'fail-closed SHA test failed'}
  Write-Output 'PASS_15_ASSERTIONS'
} finally {Remove-Item -Recurse -Force $root -ErrorAction SilentlyContinue}
