[CmdletBinding()]
param(
    [string]$HostName = 'fin.land.naver.com',
    [int]$RequiredConsecutivePasses = 2,
    [int]$MaxAttempts = 2,
    [int]$IntervalSeconds = 1,
    [string]$OutputPath = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

if ($RequiredConsecutivePasses -lt 1 -or $MaxAttempts -lt $RequiredConsecutivePasses) {
    throw 'INVALID_PASS_OR_ATTEMPT_COUNT'
}

function Get-UtcTimestamp {
    return [DateTimeOffset]::UtcNow.ToString('o')
}

function Get-ResolverSummary {
    $records = @()
    try {
        if (Get-Command Get-DnsClientServerAddress -ErrorAction SilentlyContinue) {
            $records = @(Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction Stop |
                Where-Object { $_.ServerAddresses } |
                ForEach-Object {
                    [pscustomobject]@{
                        interface_alias = [string]$_.InterfaceAlias
                        server_addresses = @($_.ServerAddresses)
                    }
                })
        }
    }
    catch {
        $records = @([pscustomobject]@{
            interface_alias = 'UNAVAILABLE'
            server_addresses = @()
            error = $_.Exception.Message
        })
    }
    return $records
}

$attempts = @()
$consecutivePasses = 0
for ($attemptNumber = 1; $attemptNumber -le $MaxAttempts; $attemptNumber++) {
    $startedAt = Get-UtcTimestamp
    try {
        $addresses = @()
        if (Get-Command Resolve-DnsName -ErrorAction SilentlyContinue) {
            $addresses = @(Resolve-DnsName -Name $HostName -Type A -DnsOnly -ErrorAction Stop |
                Where-Object { $_.IPAddress } |
                ForEach-Object { [string]$_.IPAddress } |
                Sort-Object -Unique)
            $commandType = 'POWERSHELL_RESOLVE_DNSNAME_DNSONLY'
        }
        else {
            $addresses = @([System.Net.Dns]::GetHostAddresses($HostName) |
                ForEach-Object { $_.IPAddressToString } |
                Sort-Object -Unique)
            $commandType = 'DOTNET_DNS_GETHOSTADDRESSES'
        }
        if ($addresses.Count -eq 0) {
            throw 'NO_ADDRESS_RECORD_RETURNED'
        }
        $attempts += [pscustomobject]@{
            attempt = $attemptNumber
            started_at_utc = $startedAt
            command_type = $commandType
            status = 'PASS'
            ip_addresses = $addresses
            error_type = $null
            error = $null
        }
        $consecutivePasses++
    }
    catch {
        $attempts += [pscustomobject]@{
            attempt = $attemptNumber
            started_at_utc = $startedAt
            command_type = 'POWERSHELL_DNS_RESOLUTION'
            status = 'FAIL'
            ip_addresses = @()
            error_type = $_.Exception.GetType().FullName
            error = $_.Exception.Message
        }
        $consecutivePasses = 0
    }

    if ($consecutivePasses -ge $RequiredConsecutivePasses) {
        break
    }
    if ($attemptNumber -lt $MaxAttempts) {
        Start-Sleep -Seconds $IntervalSeconds
    }
}

$runtimeId = '{0}-{1}-{2}' -f $env:COMPUTERNAME, $PSVersionTable.PSEdition, $PSVersionTable.PSVersion
$receipt = [ordered]@{
    schema_version = 'DNS_RESOLUTION_READINESS_PROBE_RESULT_V1'
    host = $HostName
    runtime = [ordered]@{
        runtime_id = $runtimeId
        computer_name = $env:COMPUTERNAME
        operating_system = [Environment]::OSVersion.VersionString
        powershell_edition = [string]$PSVersionTable.PSEdition
        powershell_version = [string]$PSVersionTable.PSVersion
        resolver = @(Get-ResolverSummary)
    }
    required_consecutive_passes = $RequiredConsecutivePasses
    observed_consecutive_passes = $consecutivePasses
    attempts = $attempts
    status = $(if ($consecutivePasses -ge $RequiredConsecutivePasses) { 'PASS' } else { 'FAIL' })
    http_request_sent_count = 0
    remote_server_http_contact_count = 0
    capture_execution_count = 0
    browser_automation_count = 0
    completed_at_utc = Get-UtcTimestamp
}

$json = $receipt | ConvertTo-Json -Depth 12
if ($OutputPath) {
    $parent = Split-Path -Parent $OutputPath
    if ($parent -and -not (Test-Path -LiteralPath $parent)) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [IO.File]::WriteAllText($OutputPath, $json + [Environment]::NewLine, (New-Object Text.UTF8Encoding($false)))
}
$json

if ($receipt.status -eq 'PASS') { exit 0 }
exit 2
