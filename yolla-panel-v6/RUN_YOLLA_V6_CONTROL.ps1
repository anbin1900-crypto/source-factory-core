$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot 'V6.Common.ps1')
$paths=Initialize-YollaV6Directories
if(-not$env:YOLLA_V6_RUNTIME_API_KEY){throw 'YOLLA_V6_RUNTIME_API_KEY_REQUIRED'}
if(-not(Test-Path -LiteralPath $paths.Electron)){throw 'V6_ELECTRON_NOT_INSTALLED'}
$server=Join-Path $paths.Control 'v6_mcp_server.cjs'
if(-not(Test-Path -LiteralPath $server)){throw 'V6_CONTROL_SERVER_NOT_INSTALLED'}
$existing=@(Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {$_.Name-eq'electron.exe' -and $_.CommandLine-like('*'+$server+'*')})
if($existing.Count-gt0){Write-Output ('YOLLA_V6_CONTROL_ALREADY_RUNNING PID='+$existing[0].ProcessId);exit 0}
$environment=@{
  ELECTRON_RUN_AS_NODE='1'
  YOLLA_V6_ROOT=$paths.Root
  YOLLA_V6_RUNTIME_API_KEY=$env:YOLLA_V6_RUNTIME_API_KEY
  YOLLA_V6_MCP_PORT=if($env:YOLLA_V6_MCP_PORT){$env:YOLLA_V6_MCP_PORT}else{'8610'}
}
$psi=New-YollaV6ProcessStartInfo -FileName $paths.Electron -WorkingDirectory $paths.Control -Arguments ('"{0}"' -f $server) -EnvironmentVariables $environment
$psi.CreateNoWindow=$true
$process=[System.Diagnostics.Process]::Start($psi)
$receipt=[ordered]@{schema_version='YOLLA_PANEL_V6_CONTROL_START_RECEIPT_V1';status='STARTED';pid=$process.Id;endpoint='http://127.0.0.1:8610/mcp';api_key_persisted_to_file=false;legacy_write_count=0;started_at=(Get-Date).ToString('o')}
Write-YollaV6JsonAtomic -Path (Join-Path $paths.Receipts 'LATEST_CONTROL_START_RECEIPT.json') -Value $receipt
Write-Output ('YOLLA_V6_CONTROL_STARTED PID='+$process.Id)
