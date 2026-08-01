Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Invoke-D1OfficialFixtureLayoutCorrectionR5 {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory=$true)][string]$Repository,
        [Parameter(Mandatory=$true)][object]$ExternalAuthority,
        [Parameter(Mandatory=$true)][string]$D1Root,
        [Parameter(Mandatory=$true)][scriptblock]$MaterializeGitBlob,
        [Parameter(Mandatory=$true)][scriptblock]$InvokeGitProcess,
        [Parameter(Mandatory=$true)][scriptblock]$Fail
    )

    $d1Pointer = Join-Path $D1Root 'LATEST_D1_POINTER.json'
    $d1LedgerPath = Join-Path $D1Root 'EXACT_CONTROL_HEAD_PATHS_AND_BLOBS.json'

    & $MaterializeGitBlob `
        $ExternalAuthority.knowledge_db.pointer.commit `
        $ExternalAuthority.knowledge_db.pointer.path `
        $ExternalAuthority.knowledge_db.pointer.blob `
        $d1Pointer

    & $MaterializeGitBlob `
        $ExternalAuthority.knowledge_db.exact_ledger.commit `
        $ExternalAuthority.knowledge_db.exact_ledger.path `
        $ExternalAuthority.knowledge_db.exact_ledger.blob `
        $d1LedgerPath

    $d1Ledger = Get-Content -LiteralPath $d1LedgerPath -Raw | ConvertFrom-Json
    $d1PackageRoot = Join-Path $D1Root 'package'
    $d1PackageLedgerPath = Join-Path $d1PackageRoot 'EXACT_CONTROL_HEAD_PATHS_AND_BLOBS.json'

    # validate_minimum_fixture.py resolves this contract from its CWD.
    & $MaterializeGitBlob `
        $ExternalAuthority.knowledge_db.exact_ledger.commit `
        $ExternalAuthority.knowledge_db.exact_ledger.path `
        $ExternalAuthority.knowledge_db.exact_ledger.blob `
        $d1PackageLedgerPath

    $rootHashResult = & $InvokeGitProcess @(
        '-C', $Repository,
        'hash-object', '--no-filters', '--',
        $d1LedgerPath
    )
    $packageHashResult = & $InvokeGitProcess @(
        '-C', $Repository,
        'hash-object', '--no-filters', '--',
        $d1PackageLedgerPath
    )

    $expectedLedgerBlob = [string]$ExternalAuthority.knowledge_db.exact_ledger.blob
    $rootLedgerBlob = [string]$rootHashResult.stdout
    $packageLedgerBlob = [string]$packageHashResult.stdout

    if (
        $rootHashResult.exit_code -ne 0 -or
        $packageHashResult.exit_code -ne 0 -or
        $rootLedgerBlob.Trim() -ne $expectedLedgerBlob -or
        $packageLedgerBlob.Trim() -ne $expectedLedgerBlob
    ) {
        & $Fail 'SFPADB2_D1_LEDGER_LAYOUT_BLOB_MISMATCH' (
            'expected={0} root={1} package={2}' -f
            $expectedLedgerBlob,
            $rootLedgerBlob.Trim(),
            $packageLedgerBlob.Trim()
        )
    }

    foreach ($property in $d1Ledger.output_ledger.PSObject.Properties) {
        $repoPath = $d1Ledger.package_root + '/' + $property.Name
        & $MaterializeGitBlob `
            $ExternalAuthority.knowledge_db.control_head `
            $repoPath `
            ([string]$property.Value) `
            (Join-Path $d1PackageRoot $property.Name)
    }

    return [pscustomobject][ordered]@{
        status = 'PASS'
        package_root = $d1PackageRoot
        exact_ledger_path = $d1PackageLedgerPath
        exact_ledger_blob = $expectedLedgerBlob
        official_fixture_count = @($d1Ledger.output_ledger.PSObject.Properties).Count
    }
}
