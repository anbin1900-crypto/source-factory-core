param([string]$PackageRoot=$PSScriptRoot,[string]$OutputPath='')
$ErrorActionPreference='Stop'

. (Join-Path $PSScriptRoot 'V6.Common.ps1')
$package=[IO.Path]::GetFullPath($PackageRoot)
$failures=New-Object System.Collections.ArrayList
$checks=New-Object System.Collections.ArrayList
function Check([string]$name,[bool]$pass,[string]$detail=''){
  [void]$checks.Add([ordered]@{name=$name;pass=$pass;detail=$detail})
  if(-not$pass){[void]$failures.Add($name)}
}

$required=@('runtime\main.js','runtime\preload.js','runtime\renderer.js','runtime\state_store.cjs','control\v6_mcp_server.cjs','V6.Common.ps1','V6.Executor.ps1','install-v6.ps1','RUN_AI_YOLLA_V6.ps1','RUNTIME_MANIFEST.json','V6_BOUNDARY_MANIFEST.json')
foreach($relative in $required){Check ('REQUIRED_'+$relative) (Test-Path -LiteralPath (Join-Path $package $relative)) $relative}
$textFiles=@(Get-ChildItem -LiteralPath $package -Recurse -File -ErrorAction Stop | Where-Object {$_.Extension -in @('.ps1','.js','.cjs','.json','.html','.txt','.md','.bat')})
$allText=($textFiles | ForEach-Object { Get-Content -Raw -LiteralPath $_.FullName }) -join [Environment]::NewLine
$unsupportedProcessApi='ProcessStartInfo'+[char]46+'ArgumentList'
Check 'NO_UNSUPPORTED_PROCESS_ARGUMENT_API' (-not($allText -match [regex]::Escape($unsupportedProcessApi)))
$oldIpcNamespace='mini'+'mal:'
$oldEnvironmentPattern='(^|[^A-Z_])YOLLA_'+'MINIMAL_'
Check 'NO_MINIMAL_IPC_NAMESPACE' (-not($allText -match [regex]::Escape($oldIpcNamespace)))
Check 'NO_MINIMAL_ENV_NAMESPACE' (-not($allText -match $oldEnvironmentPattern))
Check 'NO_ARBITRARY_SHELL_TOOL' (-not($allText -match 'yolla_v6_(shell|exec|powershell)'))
Check 'V6_ROOT_PRESENT' ($allText -match 'E:\\YOLLA\\panel-v6')
Check 'V6_IPC_PRESENT' ($allText -match 'v6:')
Check 'LEGACY_QUEUE_QUARANTINE_PRESENT' ($allText -match 'QUARANTINE_DO_NOT_REISSUE')

$manifestPath=Join-Path $package 'RUNTIME_MANIFEST.json'
if(Test-Path -LiteralPath $manifestPath){
  $manifest=Get-Content -Raw -LiteralPath $manifestPath | ConvertFrom-Json
  foreach($property in $manifest.files.PSObject.Properties){
    $file=Join-Path $package $property.Name
    $exists=Test-Path -LiteralPath $file
    Check ('MANIFEST_EXISTS_'+$property.Name) $exists
    if($exists){
      $hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $file).Hash.ToLower()
      Check ('MANIFEST_HASH_'+$property.Name) ($hash-eq([string]$property.Value.sha256).ToLower()) $hash
    }
  }
}
$receipt=[ordered]@{
  schema_version='YOLLA_PANEL_V6_VALIDATION_RECEIPT_V1'
  status=if($failures.Count-eq0){'PASS'}else{'FAIL'}
  package_root=$package
  checks=@($checks)
  failure_count=$failures.Count
  failures=@($failures)
  target_pc_executed=$false
  production=$false
  ready=$false
  merge=$false
  observed_at=(Get-Date).ToString('o')
}
if($OutputPath){Write-YollaV6JsonAtomic -Path $OutputPath -Value $receipt}
$receipt | ConvertTo-Json -Depth 20
if($failures.Count-ne0){exit 1}
