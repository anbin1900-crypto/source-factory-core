$ErrorActionPreference='Stop'
$Root=$PSScriptRoot
$Out=Join-Path $Root 'RUNTIME_MEMBER_MANIFEST.generated.json'
$Files=Get-ChildItem -LiteralPath $Root -Recurse -File | Where-Object {$_.FullName -ne $Out} | Sort-Object FullName
$Rows=@($Files | ForEach-Object {[ordered]@{path=$_.FullName.Substring($Root.Length+1).Replace('\','/');size_bytes=$_.Length;sha256=(Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash.ToLowerInvariant()}})
$Canonical=($Rows|ConvertTo-Json -Depth 5 -Compress)
$BundleSha=[Convert]::ToHexString([Security.Cryptography.SHA256]::HashData([Text.Encoding]::UTF8.GetBytes($Canonical))).ToLowerInvariant()
[ordered]@{schema_version='RC7_RUNTIME_MEMBER_MANIFEST_V1';target_version='5.10.2.4.2-rc7';member_count=$Rows.Count;total_uncompressed_size_bytes=($Rows|Measure-Object size_bytes -Sum).Sum;canonical_member_manifest_sha256=$BundleSha;files=$Rows}|ConvertTo-Json -Depth 8|Set-Content -LiteralPath $Out -Encoding UTF8
Write-Host "PASS BUNDLE_MEMBER_COUNT=$($Rows.Count) MANIFEST_SHA256=$BundleSha"
