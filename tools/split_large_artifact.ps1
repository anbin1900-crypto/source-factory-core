param(
  [Parameter(Mandatory=$true)][string]$InputPath,
  [int]$PartSizeMB = 95,
  [string]$OutputPrefix = ""
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $InputPath)) {
  throw "InputPath not found: $InputPath"
}

if ([string]::IsNullOrWhiteSpace($OutputPrefix)) {
  $OutputPrefix = $InputPath
}

$partSize = $PartSizeMB * 1024 * 1024
$buffer = New-Object byte[] $partSize
$stream = [System.IO.File]::OpenRead($InputPath)
try {
  $index = 1
  while (($read = $stream.Read($buffer, 0, $buffer.Length)) -gt 0) {
    $partPath = "{0}.{1:D3}" -f $OutputPrefix, $index
    $out = [System.IO.File]::Create($partPath)
    try {
      $out.Write($buffer, 0, $read)
    } finally {
      $out.Close()
    }
    Write-Host "created $partPath bytes=$read"
    $index++
  }
} finally {
  $stream.Close()
}

Get-FileHash -Algorithm SHA256 $InputPath | Format-List
