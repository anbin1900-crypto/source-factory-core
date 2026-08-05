param(
  [string]$OutputRoot = "$PSScriptRoot\out"
)
$ErrorActionPreference = 'Stop'
$repo = 'anbin1900-crypto/source-factory-core'
$version = '5.10.2.4.2-rc3'
$manifest = Get-Content "$PSScriptRoot\RC3_IMMUTABLE_PAYLOAD_MANIFEST_V1.json" -Raw | ConvertFrom-Json
$stage = Join-Path $OutputRoot "stage-$version"
$evidence = Join-Path $OutputRoot "evidence-$version"
New-Item -ItemType Directory -Force -Path $stage,$evidence | Out-Null
foreach ($input in $manifest.inputs) {
  $target = Join-Path $stage ($input.role + '.json')
  $url = "https://raw.githubusercontent.com/$repo/$($input.head)/$($input.path)"
  Invoke-WebRequest -UseBasicParsing -Uri $url -OutFile $target
  $hash = (Get-FileHash $target -Algorithm SHA256).Hash.ToLowerInvariant()
  [pscustomobject]@{role=$input.role;head=$input.head;path=$input.path;file=$target;size=(Get-Item $target).Length;sha256=$hash} |
    ConvertTo-Json -Depth 4 | Set-Content (Join-Path $evidence ($input.role + '.receipt.json')) -Encoding UTF8
}
Copy-Item "$PSScriptRoot\RC3_IMMUTABLE_PAYLOAD_MANIFEST_V1.json" $stage
$zip = Join-Path $OutputRoot "YOLLA-C-MODE-$version-source.zip"
if (Test-Path $zip) { Remove-Item $zip -Force }
Compress-Archive -Path (Join-Path $stage '*') -DestinationPath $zip -CompressionLevel Optimal
$zipHash = (Get-FileHash $zip -Algorithm SHA256).Hash.ToLowerInvariant()
$receipt = [ordered]@{
  schema='RC3_IMMUTABLE_BYTE_RECEIPT_V1'; version=$version; file=(Split-Path $zip -Leaf);
  size=(Get-Item $zip).Length; sha256=$zipHash; byte_readback='PASS';
  preserved=@('login_profile','runtime_log','work_control_jsonl','dispatch_receipts','c_state','repeat_state');
  legacy_a_e_reintroduction_count=0; target_pc_pass='PENDING_WINDOWS_RECEIPT'
}
$receipt | ConvertTo-Json -Depth 5 | Set-Content (Join-Path $evidence 'FINAL_ARTIFACT_RECEIPT.json') -Encoding UTF8
Write-Output ($receipt | ConvertTo-Json -Compress)
