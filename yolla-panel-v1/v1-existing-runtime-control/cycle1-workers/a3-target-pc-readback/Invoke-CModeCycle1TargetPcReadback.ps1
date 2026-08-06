#requires -Version 5.1
<#
.SYNOPSIS
  Non-destructive target-PC runtime readback for YOLLA C-mode Cycle 1.

.DESCRIPTION
  Reads Windows process, executable, file-version, SHA-256, command-line,
  browser-profile, state-root, release-root, launcher, process-tree, and
  runtime-environment evidence. The script writes nothing to disk, registry,
  browser profile, workspace state, or runtime installation. A JSON receipt is
  emitted only to standard output so the invoking controller can capture it.

  Sensitive command-line values and user-specific path prefixes are redacted.
#>

[CmdletBinding()]
param(
    [string[]]$LauncherPath = @(),
    [string]$ReleaseRoot = "",
    [string]$StateRoot = "",
    [string]$BrowserProfileRoot = "",
    [string[]]$AdditionalProcessName = @()
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-TextSha256 {
    param([AllowNull()][string]$Text)
    if ($null -eq $Text) { $Text = "" }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($Text)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        return ([System.BitConverter]::ToString($sha.ComputeHash($bytes))).Replace("-", "").ToLowerInvariant()
    }
    finally {
        $sha.Dispose()
    }
}

function ConvertTo-ProtectedPath {
    param([AllowNull()][string]$PathValue)
    if ([string]::IsNullOrWhiteSpace($PathValue)) { return $null }

    $result = $PathValue
    $replacements = @(
        @{ Value = $env:USERPROFILE; Token = "<USERPROFILE>" },
        @{ Value = $env:LOCALAPPDATA; Token = "<LOCALAPPDATA>" },
        @{ Value = $env:APPDATA; Token = "<APPDATA>" },
        @{ Value = $env:TEMP; Token = "<TEMP>" },
        @{ Value = $env:TMP; Token = "<TMP>" }
    )

    foreach ($entry in $replacements) {
        if (-not [string]::IsNullOrWhiteSpace($entry.Value)) {
            $escaped = [Regex]::Escape($entry.Value.TrimEnd("\"))
            $result = [Regex]::Replace($result, "^$escaped(?=\\|$)", $entry.Token, [System.Text.RegularExpressions.RegexOptions]::IgnoreCase)
        }
    }

    return $result
}

function ConvertTo-RedactedCommandLine {
    param([AllowNull()][string]$CommandLine)
    if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $null }

    $result = $CommandLine
    $secretNames = "token|secret|api[-_]?key|authorization|cookie|password|passwd|credential|client[-_]?secret|access[-_]?token|refresh[-_]?token"
    $result = [Regex]::Replace(
        $result,
        "(?i)(--?(?:$secretNames)(?:=|\s+))(?:""[^""]*""|'[^']*'|\S+)",
        '$1<REDACTED>'
    )
    $result = [Regex]::Replace($result, "(?i)\bBearer\s+[A-Za-z0-9._~+/\-=]+", "Bearer <REDACTED>")
    $result = [Regex]::Replace($result, "(?i)\b(Basic)\s+[A-Za-z0-9+/=]+", '$1 <REDACTED>')
    $result = [Regex]::Replace($result, "(?i)\b(cookie|authorization)\s*:\s*[^\s;]+", '$1:<REDACTED>')

    return (ConvertTo-ProtectedPath -PathValue $result)
}

function Get-ArgumentValue {
    param(
        [AllowNull()][string]$CommandLine,
        [Parameter(Mandatory = $true)][string]$Name
    )
    if ([string]::IsNullOrWhiteSpace($CommandLine)) { return $null }

    $escaped = [Regex]::Escape($Name)
    $patterns = @(
        "(?i)(?:^|\s)--$escaped=(?:""(?<v>[^""]+)""|'(?<v>[^']+)'|(?<v>\S+))",
        "(?i)(?:^|\s)--$escaped\s+(?:""(?<v>[^""]+)""|'(?<v>[^']+)'|(?<v>\S+))"
    )

    foreach ($pattern in $patterns) {
        $match = [Regex]::Match($CommandLine, $pattern)
        if ($match.Success) {
            return $match.Groups["v"].Value
        }
    }
    return $null
}

function Get-FileIdentity {
    param([AllowNull()][string]$PathValue)

    $identity = [ordered]@{
        path = ConvertTo-ProtectedPath -PathValue $PathValue
        path_sha256 = if ([string]::IsNullOrWhiteSpace($PathValue)) { $null } else { Get-TextSha256 -Text $PathValue }
        exists = $false
        sha256 = $null
        file_version = $null
        product_version = $null
        company_name = $null
        product_name = $null
        size_bytes = $null
        last_write_time_utc = $null
        read_error = $null
    }

    if ([string]::IsNullOrWhiteSpace($PathValue)) { return [pscustomobject]$identity }

    try {
        if (-not (Test-Path -LiteralPath $PathValue -PathType Leaf)) {
            return [pscustomobject]$identity
        }

        $item = Get-Item -LiteralPath $PathValue -ErrorAction Stop
        $hash = Get-FileHash -LiteralPath $PathValue -Algorithm SHA256 -ErrorAction Stop
        $version = $item.VersionInfo

        $identity.exists = $true
        $identity.sha256 = $hash.Hash.ToLowerInvariant()
        $identity.file_version = $version.FileVersion
        $identity.product_version = $version.ProductVersion
        $identity.company_name = $version.CompanyName
        $identity.product_name = $version.ProductName
        $identity.size_bytes = [int64]$item.Length
        $identity.last_write_time_utc = $item.LastWriteTimeUtc.ToString("o")
    }
    catch {
        $identity.read_error = $_.Exception.Message
    }

    return [pscustomobject]$identity
}

function Get-ProcessRole {
    param(
        [AllowNull()][string]$Name,
        [AllowNull()][string]$CommandLine
    )

    $probe = (($Name + " " + $CommandLine)).ToLowerInvariant()
    if ($probe -match "--type=renderer") { return "BROWSER_RENDERER" }
    if ($probe -match "--type=gpu-process") { return "BROWSER_GPU" }
    if ($probe -match "--type=utility") { return "BROWSER_UTILITY" }
    if ($probe -match "--type=") { return "BROWSER_SUBPROCESS" }
    if ($probe -match "yolla|panel") { return "YOLLA_PANEL_OR_LAUNCHER" }
    if ($probe -match "electron|chrome|msedge") { return "BROWSER_MAIN" }
    if ($probe -match "node") { return "NODE_RUNTIME" }
    if ($probe -match "powershell|pwsh") { return "POWERSHELL_RUNTIME" }
    return "OTHER_MATCHED_RUNTIME"
}

function Get-ReleaseRootFromExecutable {
    param([AllowNull()][string]$ExecutablePath)
    if ([string]::IsNullOrWhiteSpace($ExecutablePath)) { return $null }

    try {
        $directory = [System.IO.Path]::GetDirectoryName($ExecutablePath)
        if ([string]::IsNullOrWhiteSpace($directory)) { return $null }

        $current = Get-Item -LiteralPath $directory -ErrorAction Stop
        for ($i = 0; $i -lt 5 -and $null -ne $current; $i++) {
            if ($current.Name -match "^app-[0-9]" -or $current.Name -match "(?i)^releases?$") {
                return $current.FullName
            }
            $current = $current.Parent
        }
        return $directory
    }
    catch {
        return $null
    }
}

$errors = New-Object System.Collections.Generic.List[object]
$warnings = New-Object System.Collections.Generic.List[string]
$processEvidence = New-Object System.Collections.Generic.List[object]
$releaseRootSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$stateRootSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$browserProfileSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
$launcherSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

foreach ($value in $LauncherPath) {
    if (-not [string]::IsNullOrWhiteSpace($value)) { [void]$launcherSet.Add($value) }
}
if (-not [string]::IsNullOrWhiteSpace($ReleaseRoot)) { [void]$releaseRootSet.Add($ReleaseRoot) }
if (-not [string]::IsNullOrWhiteSpace($StateRoot)) { [void]$stateRootSet.Add($StateRoot) }
if (-not [string]::IsNullOrWhiteSpace($BrowserProfileRoot)) { [void]$browserProfileSet.Add($BrowserProfileRoot) }
if (-not [string]::IsNullOrWhiteSpace($env:YOLLA_STATE_ROOT)) { [void]$stateRootSet.Add($env:YOLLA_STATE_ROOT) }
if (-not [string]::IsNullOrWhiteSpace($env:YOLLA_RELEASE_ROOT)) { [void]$releaseRootSet.Add($env:YOLLA_RELEASE_ROOT) }

$defaultNames = @("yolla", "yollapanel", "electron", "chrome", "msedge", "node", "pwsh", "powershell")
$nameSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
foreach ($name in ($defaultNames + $AdditionalProcessName)) {
    if (-not [string]::IsNullOrWhiteSpace($name)) { [void]$nameSet.Add($name.TrimEnd(".exe")) }
}

try {
    $allProcesses = @(Get-CimInstance -ClassName Win32_Process -ErrorAction Stop)
    foreach ($process in $allProcesses) {
        $baseName = [System.IO.Path]::GetFileNameWithoutExtension([string]$process.Name)
        $probeText = (([string]$process.Name) + " " + ([string]$process.ExecutablePath) + " " + ([string]$process.CommandLine))
        $matchesName = $nameSet.Contains($baseName)
        $matchesText = $probeText -match "(?i)yolla|electron|chrome|msedge|node(?:\.exe)?|pwsh|powershell"
        if (-not ($matchesName -or $matchesText)) { continue }

        $exePath = [string]$process.ExecutablePath
        $rawCommandLine = [string]$process.CommandLine
        $userDataDir = Get-ArgumentValue -CommandLine $rawCommandLine -Name "user-data-dir"
        $profileDirectory = Get-ArgumentValue -CommandLine $rawCommandLine -Name "profile-directory"
        $stateRootArg = Get-ArgumentValue -CommandLine $rawCommandLine -Name "state-root"
        $releaseRootArg = Get-ArgumentValue -CommandLine $rawCommandLine -Name "release-root"

        if (-not [string]::IsNullOrWhiteSpace($userDataDir)) { [void]$browserProfileSet.Add($userDataDir) }
        if (-not [string]::IsNullOrWhiteSpace($stateRootArg)) { [void]$stateRootSet.Add($stateRootArg) }
        if (-not [string]::IsNullOrWhiteSpace($releaseRootArg)) { [void]$releaseRootSet.Add($releaseRootArg) }

        $derivedReleaseRoot = Get-ReleaseRootFromExecutable -ExecutablePath $exePath
        if (-not [string]::IsNullOrWhiteSpace($derivedReleaseRoot)) { [void]$releaseRootSet.Add($derivedReleaseRoot) }

        if (($baseName -match "(?i)yolla|launcher|electron") -and -not [string]::IsNullOrWhiteSpace($exePath)) {
            [void]$launcherSet.Add($exePath)
        }

        $processEvidence.Add([pscustomobject][ordered]@{
            process_id = [int]$process.ProcessId
            parent_process_id = [int]$process.ParentProcessId
            name = [string]$process.Name
            role = Get-ProcessRole -Name ([string]$process.Name) -CommandLine $rawCommandLine
            executable = Get-FileIdentity -PathValue $exePath
            command_line_redacted = ConvertTo-RedactedCommandLine -CommandLine $rawCommandLine
            command_line_sha256 = if ([string]::IsNullOrWhiteSpace($rawCommandLine)) { $null } else { Get-TextSha256 -Text $rawCommandLine }
            browser_user_data_dir = ConvertTo-ProtectedPath -PathValue $userDataDir
            browser_user_data_dir_sha256 = if ([string]::IsNullOrWhiteSpace($userDataDir)) { $null } else { Get-TextSha256 -Text $userDataDir }
            browser_profile_directory = $profileDirectory
            creation_date = [string]$process.CreationDate
            session_id = [int]$process.SessionId
        })
    }
}
catch {
    $errors.Add([pscustomobject]@{ stage = "PROCESS_ENUMERATION"; message = $_.Exception.Message })
}

$processEvidence = @($processEvidence | Sort-Object process_id)
$processById = @{}
foreach ($item in $processEvidence) { $processById[[string]$item.process_id] = $item }

$processTree = foreach ($item in $processEvidence) {
    $parentKey = [string]$item.parent_process_id
    [pscustomobject][ordered]@{
        process_id = $item.process_id
        parent_process_id = $item.parent_process_id
        parent_in_receipt = $processById.ContainsKey($parentKey)
        parent_name = if ($processById.ContainsKey($parentKey)) { $processById[$parentKey].name } else { $null }
        role = $item.role
    }
}

$launcherEvidence = foreach ($path in @($launcherSet | Sort-Object)) {
    Get-FileIdentity -PathValue $path
}

$releaseRoots = foreach ($path in @($releaseRootSet | Sort-Object)) {
    [pscustomobject][ordered]@{
        path = ConvertTo-ProtectedPath -PathValue $path
        path_sha256 = Get-TextSha256 -Text $path
        exists = Test-Path -LiteralPath $path -PathType Container
    }
}

$stateRoots = foreach ($path in @($stateRootSet | Sort-Object)) {
    [pscustomobject][ordered]@{
        path = ConvertTo-ProtectedPath -PathValue $path
        path_sha256 = Get-TextSha256 -Text $path
        exists = Test-Path -LiteralPath $path -PathType Container
    }
}

$browserProfiles = foreach ($path in @($browserProfileSet | Sort-Object)) {
    [pscustomobject][ordered]@{
        path = ConvertTo-ProtectedPath -PathValue $path
        path_sha256 = Get-TextSha256 -Text $path
        exists = Test-Path -LiteralPath $path -PathType Container
    }
}

$osEvidence = $null
$computerEvidence = $null
try {
    $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction Stop
    $osEvidence = [pscustomobject][ordered]@{
        caption = [string]$os.Caption
        version = [string]$os.Version
        build_number = [string]$os.BuildNumber
        os_architecture = [string]$os.OSArchitecture
        last_boot_up_time = if ($null -eq $os.LastBootUpTime) { $null } else { ([datetime]$os.LastBootUpTime).ToUniversalTime().ToString("o") }
    }
}
catch {
    $errors.Add([pscustomobject]@{ stage = "OS_READBACK"; message = $_.Exception.Message })
}

try {
    $computer = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction Stop
    $computerEvidence = [pscustomobject][ordered]@{
        manufacturer = [string]$computer.Manufacturer
        model = [string]$computer.Model
        total_physical_memory_bytes = [int64]$computer.TotalPhysicalMemory
        logical_processor_count = [int]$computer.NumberOfLogicalProcessors
        machine_name_sha256 = Get-TextSha256 -Text ([string]$computer.Name)
    }
}
catch {
    $errors.Add([pscustomobject]@{ stage = "COMPUTER_READBACK"; message = $_.Exception.Message })
}

$environmentEvidence = foreach ($entry in @(Get-ChildItem Env: | Where-Object { $_.Name -match "^YOLLA_" } | Sort-Object Name)) {
    [pscustomobject][ordered]@{
        name = $entry.Name
        value_sha256 = Get-TextSha256 -Text ([string]$entry.Value)
        value_length = ([string]$entry.Value).Length
        raw_value_persisted = $false
    }
}

if ($processEvidence.Count -eq 0) {
    $warnings.Add("No matching YOLLA, Electron, browser, Node, or PowerShell runtime process was observed.")
}
if ($launcherEvidence.Count -eq 0) {
    $warnings.Add("No launcher executable was resolved. Supply -LauncherPath when the launcher is not represented by an active process.")
}
if ($browserProfiles.Count -eq 0) {
    $warnings.Add("No browser profile root was resolved. Supply -BrowserProfileRoot or run while the browser command line is visible.")
}
if ($stateRoots.Count -eq 0) {
    $warnings.Add("No state root was resolved. Supply -StateRoot or expose YOLLA_STATE_ROOT.")
}

$status = if ($errors.Count -gt 0) { "PARTIAL" } elseif ($processEvidence.Count -eq 0) { "PARTIAL" } else { "PASS" }

$receipt = [pscustomobject][ordered]@{
    schema_version = "C_MODE_CYCLE1_TARGET_PC_READBACK_RECEIPT_V1"
    receipt_id = "A3-C1-TARGET-PC-" + ([guid]::NewGuid().ToString("N"))
    captured_at_utc = [datetime]::UtcNow.ToString("o")
    status = $status
    target_pc_access = $true
    execution_mode = "WINDOWS_TARGET_PC_NON_DESTRUCTIVE_READ_ONLY"
    non_destructive_read_only = "PASS"
    target_pc_write_count = 0
    browser_profile_modification = $false
    workspace_state_reset = $false
    runtime_installation_change = $false
    machine = [pscustomobject][ordered]@{
        os = $osEvidence
        computer = $computerEvidence
        powershell = [pscustomobject][ordered]@{
            edition = [string]$PSVersionTable.PSEdition
            version = $PSVersionTable.PSVersion.ToString()
            clr_version = if ($null -eq $PSVersionTable.CLRVersion) { $null } else { $PSVersionTable.CLRVersion.ToString() }
            process_architecture = [System.Runtime.InteropServices.RuntimeInformation]::ProcessArchitecture.ToString()
        }
    }
    launcher_candidates = @($launcherEvidence)
    release_roots = @($releaseRoots)
    state_roots = @($stateRoots)
    browser_profiles = @($browserProfiles)
    processes = @($processEvidence)
    process_tree = @($processTree)
    runtime_environment = @($environmentEvidence)
    evidence_counts = [pscustomobject][ordered]@{
        launcher_candidate_count = @($launcherEvidence).Count
        release_root_count = @($releaseRoots).Count
        state_root_count = @($stateRoots).Count
        browser_profile_count = @($browserProfiles).Count
        process_count = @($processEvidence).Count
        process_tree_edge_count = @($processTree).Count
        file_hash_count = @($processEvidence | Where-Object { $null -ne $_.executable.sha256 }).Count + @($launcherEvidence | Where-Object { $null -ne $_.sha256 }).Count
        file_version_count = @($processEvidence | Where-Object { $null -ne $_.executable.file_version }).Count + @($launcherEvidence | Where-Object { $null -ne $_.file_version }).Count
        command_line_count = @($processEvidence | Where-Object { $null -ne $_.command_line_redacted }).Count
        raw_secret_value_count = 0
    }
    warnings = @($warnings)
    errors = @($errors)
    guardrails = [pscustomobject][ordered]@{
        registry_write_count = 0
        file_write_count = 0
        process_start_count = 0
        process_stop_count = 0
        profile_write_count = 0
        state_write_count = 0
        release_write_count = 0
    }
}

$receipt | ConvertTo-Json -Depth 12
