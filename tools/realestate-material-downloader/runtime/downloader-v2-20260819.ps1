param(
    [string]$Root = 'E:\우선탑재자료',
    [string]$ManifestPath = '',
    [int]$MaxItems = 0,
    [int]$Retries = 2,
    [int]$DelayMs = 180,
    [switch]$Force
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)
$RunStarted = Get-Date
$RunId = $RunStarted.ToString('yyyyMMdd-HHmmss')
$DownloaderDir = Join-Path $Root '_다운로더'
if ([string]::IsNullOrWhiteSpace($ManifestPath)) { $ManifestPath = Join-Path $DownloaderDir 'manifest.json' }
$StateDir = Join-Path $Root '_상태'
$LogDir = Join-Path $Root '_로그'
$CheckpointDir = Join-Path $StateDir 'checkpoints'
$OfficialPageDir = Join-Path $Root '_공식페이지'
$FailureDir = Join-Path $Root '_실패응답'
$TempDir = Join-Path $StateDir 'temp'
$SourceLinkDir = Join-Path $Root '_원문링크'
$RunLog = Join-Path $LogDir ("download-$RunId.log")
$RunStatePath = Join-Path $StateDir 'run_state.json'
$SummaryJson = Join-Path $StateDir 'summary-latest.json'
$SummaryCsv = Join-Path $StateDir 'summary-latest.csv'
$PidFile = Join-Path $StateDir 'downloader.pid'
$LockFile = Join-Path $StateDir 'downloader.lock'
$CookieJar = Join-Path $StateDir 'curl-cookies.txt'
$UserAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/149.0 Safari/537.36 YOLLA-Material-Downloader/2.0'
$Curl = Join-Path $env:SystemRoot 'System32\curl.exe'

@($Root,$DownloaderDir,$StateDir,$LogDir,$CheckpointDir,$OfficialPageDir,$FailureDir,$TempDir,$SourceLinkDir) | ForEach-Object {
    if (-not (Test-Path -LiteralPath $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null }
}

function Write-Utf8([string]$Path,[string]$Text) {
    $parent = Split-Path -Parent $Path
    if ($parent -and -not (Test-Path -LiteralPath $parent)) { New-Item -ItemType Directory -Path $parent -Force | Out-Null }
    [IO.File]::WriteAllText($Path,$Text,$Utf8NoBom)
}

function Save-Json([string]$Path,$Object,[int]$Depth=12) {
    Write-Utf8 $Path ($Object | ConvertTo-Json -Depth $Depth)
}

function Write-Log([string]$Message,[string]$Level='INFO') {
    $line = '{0} [{1}] {2}' -f (Get-Date).ToString('yyyy-MM-dd HH:mm:ss'),$Level,$Message
    Add-Content -LiteralPath $RunLog -Value $line -Encoding UTF8
    Write-Output $line
}

function Get-Value($Object,[string[]]$Names,$Default='') {
    if ($null -eq $Object) { return $Default }
    foreach ($name in $Names) {
        $p = $Object.PSObject.Properties[$name]
        if ($null -ne $p -and $null -ne $p.Value) {
            if ($p.Value -is [string]) {
                if (-not [string]::IsNullOrWhiteSpace([string]$p.Value)) { return $p.Value }
            } else { return $p.Value }
        }
    }
    return $Default
}

function To-StringList($Value) {
    $list = @()
    if ($null -eq $Value) { return $list }
    if ($Value -is [System.Collections.IEnumerable] -and -not ($Value -is [string])) {
        foreach ($v in $Value) { if ($null -ne $v -and -not [string]::IsNullOrWhiteSpace([string]$v)) { $list += [string]$v } }
    } else {
        $s = [string]$Value
        if ($s -match '[|\r\n]') {
            foreach ($v in ($s -split '[|\r\n]+')) { if (-not [string]::IsNullOrWhiteSpace($v)) { $list += $v.Trim() } }
        } elseif (-not [string]::IsNullOrWhiteSpace($s)) { $list += $s.Trim() }
    }
    return @($list | Select-Object -Unique)
}

function Safe-Name([string]$Text,[int]$Max=90) {
    if ([string]::IsNullOrWhiteSpace($Text)) { return 'untitled' }
    $s = $Text -replace '[\x00-\x1F<>:"/\\|?*]','_'
    $s = $s -replace '\s+',' '
    $s = $s.Trim().TrimEnd('.')
    if ($s.Length -gt $Max) { $s = $s.Substring(0,$Max).Trim() }
    if ([string]::IsNullOrWhiteSpace($s)) { return 'untitled' }
    return $s
}

function Normalize-Extension([string]$Extension,[string]$Title,[string]$Url) {
    $e = ([string]$Extension).Trim().ToLowerInvariant()
    if ($e -and -not $e.StartsWith('.')) { $e = '.' + $e }
    if ($e -in @('.pdf','.hwp','.hwpx','.xlsx','.xls','.xlsm','.csv','.tsv','.zip','.json','.xml','.txt','.doc','.docx','.ppt','.pptx','.epub')) { return $e }
    try {
        $pathExt = [IO.Path]::GetExtension(([Uri]$Url).AbsolutePath).ToLowerInvariant()
        if ($pathExt -in @('.pdf','.hwp','.hwpx','.xlsx','.xls','.xlsm','.csv','.tsv','.zip','.json','.xml','.txt','.doc','.docx','.ppt','.pptx','.epub')) { return $pathExt }
    } catch {}
    $probe = "$Title $Url"
    foreach ($candidate in @('.pdf','.hwpx','.hwp','.xlsx','.xls','.csv','.zip','.json','.xml','.docx','.pptx')) {
        if ($probe -match ('(?i)(^|[^a-z0-9])' + [regex]::Escape($candidate.TrimStart('.')) + '([^a-z0-9]|$)')) { return $candidate }
    }
    return ''
}

function Get-Preview([byte[]]$Bytes) {
    if ($null -eq $Bytes -or $Bytes.Length -eq 0) { return '' }
    $count = [Math]::Min($Bytes.Length,8192)
    try { return [Text.Encoding]::UTF8.GetString($Bytes,0,$count) } catch { return [Text.Encoding]::Default.GetString($Bytes,0,$count) }
}

function Get-FileInspection([string]$Path,[string]$ExpectedExtension='') {
    if (-not (Test-Path -LiteralPath $Path)) { return [pscustomobject]@{valid=$false;actual='MISSING';bytes=0;sha256='';is_html=$false;reason='file missing'} }
    $fi = Get-Item -LiteralPath $Path
    if ($fi.Length -le 0) { return [pscustomobject]@{valid=$false;actual='EMPTY';bytes=0;sha256='';is_html=$false;reason='empty file'} }
    $stream = [IO.File]::OpenRead($Path)
    try {
        $buffer = New-Object byte[] ([Math]::Min([int64]8192,$fi.Length))
        $read = $stream.Read($buffer,0,$buffer.Length)
        if ($read -lt $buffer.Length) { $buffer = $buffer[0..([Math]::Max(0,$read-1))] }
    } finally { $stream.Dispose() }
    $hex = ($buffer | Select-Object -First 16 | ForEach-Object { $_.ToString('X2') }) -join ' '
    $preview = Get-Preview $buffer
    $trim = $preview.TrimStart([char]0xFEFF,[char]0x00,[char]0x09,[char]0x0A,[char]0x0D,[char]0x20)
    $isHtml = $trim -match '(?is)^(?:<script\b|<!doctype\s+html\b|<html\b|<head\b|<body\b|<!--.*?<html\b)' -or $preview -match '(?is)<html\b.{0,300}<body\b'
    $isXml = $trim -match '(?is)^<\?xml\b'
    $actual = 'BINARY'
    if ($buffer.Length -ge 5 -and [Text.Encoding]::ASCII.GetString($buffer,0,5) -eq '%PDF-') { $actual='PDF' }
    elseif ($buffer.Length -ge 4 -and $buffer[0] -eq 0x50 -and $buffer[1] -eq 0x4B -and $buffer[2] -in @(0x03,0x05,0x07) -and $buffer[3] -in @(0x04,0x06,0x08)) { $actual='ZIP' }
    elseif ($buffer.Length -ge 8 -and (($buffer[0..7] | ForEach-Object {$_.ToString('X2')}) -join '') -eq 'D0CF11E0A1B11AE1') { $actual='OLE' }
    elseif ($buffer.Length -ge 2 -and $buffer[0] -eq 0x1F -and $buffer[1] -eq 0x8B) { $actual='GZIP' }
    elseif ($buffer.Length -ge 8 -and (($buffer[0..7] | ForEach-Object {$_.ToString('X2')}) -join '') -eq '89504E470D0A1A0A') { $actual='PNG' }
    elseif ($buffer.Length -ge 3 -and $buffer[0] -eq 0xFF -and $buffer[1] -eq 0xD8 -and $buffer[2] -eq 0xFF) { $actual='JPEG' }
    elseif ($isHtml) { $actual='HTML' }
    elseif ($isXml) { $actual='XML' }
    elseif ($trim -match '^[\[{]' ) { $actual='TEXT_OR_JSON' }
    elseif (($buffer | Where-Object {$_ -eq 0}).Count -eq 0) { $actual='TEXT' }

    $e = ([string]$ExpectedExtension).ToLowerInvariant()
    $valid = $true
    $reason = 'accepted'
    if ($isHtml -and $e -ne '.html') { $valid=$false; $reason='HTML response is not a downloadable file' }
    elseif ($e -eq '.pdf' -and $actual -ne 'PDF') { $valid=$false; $reason="expected PDF, got $actual" }
    elseif ($e -in @('.hwp','.xls','.doc','.ppt') -and $actual -notin @('OLE','ZIP')) { $valid=$false; $reason="expected compound/zip document, got $actual" }
    elseif ($e -in @('.hwpx','.xlsx','.xlsm','.docx','.pptx','.epub','.zip') -and $actual -ne 'ZIP') { $valid=$false; $reason="expected ZIP-based document, got $actual" }
    elseif ($e -in @('.csv','.tsv','.txt') -and $actual -notin @('TEXT','TEXT_OR_JSON')) { $valid=$false; $reason="expected text data, got $actual" }
    elseif ($e -eq '.json' -and $actual -notin @('TEXT_OR_JSON','TEXT')) { $valid=$false; $reason="expected JSON/text, got $actual" }
    elseif ($e -eq '.xml' -and $actual -notin @('XML','TEXT')) { $valid=$false; $reason="expected XML/text, got $actual" }
    elseif ([string]::IsNullOrWhiteSpace($e) -and $actual -eq 'HTML') { $valid=$false; $reason='HTML classified as source page' }
    elseif ($fi.Length -lt 64) { $valid=$false; $reason='file is too small' }

    $sha = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
    return [pscustomobject]@{valid=$valid;actual=$actual;bytes=[int64]$fi.Length;sha256=$sha;is_html=$isHtml;reason=$reason;signature=$hex;preview=$trim.Substring(0,[Math]::Min(300,$trim.Length))}
}

function Resolve-Link([string]$BaseUrl,[string]$Candidate) {
    if ([string]::IsNullOrWhiteSpace($Candidate)) { return '' }
    $u = [Net.WebUtility]::HtmlDecode($Candidate.Trim())
    $u = $u -replace '\\/','/'
    $u = $u -replace '^[''\"]|[''\"]$',''
    if ($u -match '^(?i)(javascript:|mailto:|tel:|#)') { return '' }
    try {
        if ([Uri]::IsWellFormedUriString($u,[UriKind]::Absolute)) { return ([Uri]$u).AbsoluteUri }
        return (New-Object Uri ((New-Object Uri $BaseUrl),$u)).AbsoluteUri
    } catch { return '' }
}

function Find-AttachmentLinks([string]$Html,[string]$BaseUrl) {
    $found = @()
    $patterns = @(
        '(?is)(?:href|src)\s*=\s*["''](?<u>[^"'']+)["'']',
        '(?is)(?:location\.href|fileUrl|downloadUrl|atchFileUrl|url)\s*[:=]\s*["''](?<u>[^"'']+)["'']',
        '(?i)(?<u>https?:\/\/[^\s"''<>]+)'
    )
    foreach ($pattern in $patterns) {
        foreach ($m in [regex]::Matches($Html,$pattern)) {
            $raw = $m.Groups['u'].Value
            if ($raw -match '(?i)(download|attach|atch|file|dwn|nttFileDownload|DownloadMltm2|LCMS/DWN|\.pdf(?:$|\?)|\.hwp[x]?(?:$|\?)|\.xlsx?(?:$|\?)|\.csv(?:$|\?)|\.zip(?:$|\?)|\.docx?(?:$|\?)|\.pptx?(?:$|\?))') {
                $resolved = Resolve-Link $BaseUrl $raw
                if ($resolved) { $found += $resolved }
            }
        }
    }
    return @($found | Select-Object -Unique | Select-Object -First 20)
}

function Invoke-Curl([string]$Url,[string]$OutputPath,[string]$Referer='') {
    $headerPath = $OutputPath + '.headers'
    Remove-Item -LiteralPath $OutputPath,$headerPath -Force -ErrorAction SilentlyContinue
    $attemptErrors = @()
    for ($attempt=1; $attempt -le [Math]::Max(1,$Retries); $attempt++) {
        $args = @('-sS','-L','--max-redirs','12','--connect-timeout','15','--max-time','120','--compressed','--retry','1','--retry-delay','1','-A',$UserAgent,'-c',$CookieJar,'-b',$CookieJar,'-D',$headerPath,'-o',$OutputPath)
        if (-not [string]::IsNullOrWhiteSpace($Referer)) { $args += @('-e',$Referer) }
        $args += @($Url)
        & $Curl @args
        $code = $LASTEXITCODE
        if ($code -eq 0 -and (Test-Path -LiteralPath $OutputPath) -and (Get-Item -LiteralPath $OutputPath).Length -gt 0) {
            return [pscustomobject]@{ok=$true;exit_code=0;errors=@();headers=$headerPath}
        }
        $attemptErrors += "attempt $attempt curl exit=$code"
        Start-Sleep -Milliseconds (300 * $attempt)
    }
    return [pscustomobject]@{ok=$false;exit_code=$LASTEXITCODE;errors=@($attemptErrors);headers=$headerPath}
}

function Save-SourceLink([string]$Id,[string]$Title,[string]$Url) {
    if ([string]::IsNullOrWhiteSpace($Url)) { return '' }
    $p = Join-Path $SourceLinkDir ((Safe-Name ("${Id}_$Title") 120) + '.url')
    Write-Utf8 $p ("[InternetShortcut]`r`nURL=$Url`r`n")
    return $p
}

function Save-OfficialPage([string]$Id,[string]$Title,[string]$PageTemp) {
    if (-not (Test-Path -LiteralPath $PageTemp)) { return '' }
    $inspection = Get-FileInspection $PageTemp '.html'
    if (-not $inspection.is_html) { return '' }
    $p = Join-Path $OfficialPageDir ((Safe-Name ("${Id}_$Title") 120) + '.html')
    Copy-Item -LiteralPath $PageTemp -Destination $p -Force
    return $p
}

function Copy-InvalidResponse([string]$Id,[string]$Title,[string]$Temp,[string]$Actual) {
    if (-not (Test-Path -LiteralPath $Temp)) { return '' }
    $ext = if ($Actual -eq 'HTML') { '.html' } else { '.bin' }
    $p = Join-Path $FailureDir ((Safe-Name ("${Id}_$Title-$RunId") 120) + $ext)
    Copy-Item -LiteralPath $Temp -Destination $p -Force
    return $p
}

function Build-OutputDirectory($Item) {
    $relative = [string](Get-Value $Item @('relative_dir','output_dir','target_dir','folder') '')
    if (-not [string]::IsNullOrWhiteSpace($relative)) {
        $relative = $relative.TrimStart('\','/')
        return Join-Path $Root $relative
    }
    $category = Safe-Name ([string](Get-Value $Item @('category','group','domain','대분류') '기타')) 50
    $priority = Safe-Name ([string](Get-Value $Item @('priority','tier','우선순위') 'P2')) 20
    return Join-Path (Join-Path $Root $category) $priority
}

function New-TargetPath([string]$Dir,[string]$Id,[string]$Title,[string]$Extension,[int]$Index=1) {
    if (-not (Test-Path -LiteralPath $Dir)) { New-Item -ItemType Directory -Path $Dir -Force | Out-Null }
    $suffix = if ($Index -gt 1) { '_{0:00}' -f $Index } else { '' }
    $base = Safe-Name ("${Id}_${Title}${suffix}") 120
    return Join-Path $Dir ($base + $Extension)
}

function Try-DownloadFile([string]$Id,[string]$Title,[string]$Url,[string]$Referer,[string]$ExpectedExtension,[string]$OutputDir,[int]$Index) {
    $tmp = Join-Path $TempDir ("$Id-$RunId-$([Guid]::NewGuid().ToString('N')).part")
    $curlResult = Invoke-Curl $Url $tmp $Referer
    if (-not $curlResult.ok) {
        Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
        return [pscustomobject]@{valid=$false;url=$Url;error=($curlResult.errors -join '; ');is_html=$false;page_temp='';path='';actual='CURL_ERROR';bytes=0;sha256=''}
    }
    $inspection = Get-FileInspection $tmp $ExpectedExtension
    if (-not $inspection.valid) {
        $failurePath = Copy-InvalidResponse $Id $Title $tmp $inspection.actual
        $pageTemp = if ($inspection.is_html) { $tmp } else { '' }
        if (-not $inspection.is_html) { Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue }
        return [pscustomobject]@{valid=$false;url=$Url;error=$inspection.reason;is_html=$inspection.is_html;page_temp=$pageTemp;failure_path=$failurePath;path='';actual=$inspection.actual;bytes=$inspection.bytes;sha256=$inspection.sha256;signature=$inspection.signature}
    }
    $ext = $ExpectedExtension
    if ([string]::IsNullOrWhiteSpace($ext)) {
        $ext = switch ($inspection.actual) { 'PDF' {'.pdf'} 'ZIP' {'.zip'} 'OLE' {'.bin'} 'XML' {'.xml'} 'TEXT_OR_JSON' {'.json'} 'TEXT' {'.txt'} default {'.bin'} }
    }
    $target = New-TargetPath $OutputDir $Id $Title $ext $Index
    if ((Test-Path -LiteralPath $target) -and -not $Force) {
        $old = Get-FileInspection $target $ext
        if ($old.valid) {
            Remove-Item -LiteralPath $tmp -Force -ErrorAction SilentlyContinue
            return [pscustomobject]@{valid=$true;url=$Url;error='';is_html=$false;page_temp='';path=$target;actual=$old.actual;bytes=$old.bytes;sha256=$old.sha256;signature=$old.signature;skipped=$true}
        }
    }
    Move-Item -LiteralPath $tmp -Destination $target -Force
    return [pscustomobject]@{valid=$true;url=$Url;error='';is_html=$false;page_temp='';path=$target;actual=$inspection.actual;bytes=$inspection.bytes;sha256=$inspection.sha256;signature=$inspection.signature;skipped=$false}
}

function Run-Item($Item) {
    $id = [string](Get-Value $Item @('id','record_id','source_id','번호') ([Guid]::NewGuid().ToString('N').Substring(0,8)))
    $title = [string](Get-Value $Item @('title','name','자료명','document_title') $id)
    $category = [string](Get-Value $Item @('category','group','domain','대분류') '기타')
    $priority = [string](Get-Value $Item @('priority','tier','우선순위') 'P2')
    $expected = Normalize-Extension ([string](Get-Value $Item @('extension','file_extension','ext','format') '') $title ([string](Get-Value $Item @('direct_url','download_url','url') ''))
    $outDir = Build-OutputDirectory $Item
    $checkpoint = Join-Path $CheckpointDir ((Safe-Name $id 50) + '.json')
    $directUrls = @()
    foreach ($field in @('direct_urls','direct_url','download_urls','download_url','file_urls','file_url')) { $directUrls += To-StringList (Get-Value $Item @($field) $null) }
    $sourceUrls = @()
    foreach ($field in @('source_urls','source_url','official_url','landing_url','post_url','page_url','url')) { $sourceUrls += To-StringList (Get-Value $Item @($field) $null) }
    $directUrls = @($directUrls | Where-Object {$_ -match '^https?://'} | Select-Object -Unique)
    $sourceUrls = @($sourceUrls | Where-Object {$_ -match '^https?://'} | Select-Object -Unique)
    $allSource = @($directUrls + $sourceUrls | Select-Object -Unique)
    $sourceLink = if ($allSource.Count -gt 0) { Save-SourceLink $id $title $allSource[0] } else { '' }

    Write-Log "[$id] 시작: $title"
    $downloaded = @()
    $errors = @()
    $pages = @()
    $pageTemps = @()
    $attempted = @()
    $index = 1

    foreach ($url in $directUrls) {
        if ($attempted -contains $url) { continue }
        $attempted += $url
        $result = Try-DownloadFile $id $title $url '' $expected $outDir $index
        if ($result.valid) { $downloaded += $result; $index++; continue }
        $errors += "직접 URL $url : $($result.error)"
        if ($result.is_html -and $result.page_temp) { $pageTemps += [pscustomobject]@{url=$url;path=$result.page_temp} }
        Start-Sleep -Milliseconds $DelayMs
    }

    foreach ($sourceUrl in $sourceUrls) {
        if ($downloaded.Count -gt 0 -and $sourceUrl -in $directUrls) { continue }
        $existingPage = @($pageTemps | Where-Object {$_.url -eq $sourceUrl} | Select-Object -First 1)
        if ($existingPage.Count -gt 0) {
            $pageTemp = $existingPage[0].path
        } else {
            $pageTemp = Join-Path $TempDir ("$id-page-$([Guid]::NewGuid().ToString('N')).tmp")
            $pageFetch = Invoke-Curl $sourceUrl $pageTemp ''
            if (-not $pageFetch.ok) { $errors += "공식 페이지 $sourceUrl : $($pageFetch.errors -join '; ')"; Remove-Item $pageTemp -Force -ErrorAction SilentlyContinue; continue }
        }
        $pageInspect = Get-FileInspection $pageTemp ''
        if ($pageInspect.valid -and -not $pageInspect.is_html) {
            $sourceExpected = Normalize-Extension $expected $title $sourceUrl
            $sourceInspect2 = Get-FileInspection $pageTemp $sourceExpected
            if ($sourceInspect2.valid) {
                $ext2 = if ($sourceExpected) {$sourceExpected} else {switch($sourceInspect2.actual){'PDF'{'.pdf'}'ZIP'{'.zip'}'XML'{'.xml'}'TEXT'{'.txt'}default{'.bin'}}}
                $target2 = New-TargetPath $outDir $id $title $ext2 $index
                Move-Item -LiteralPath $pageTemp -Destination $target2 -Force
                $downloaded += [pscustomobject]@{valid=$true;url=$sourceUrl;path=$target2;actual=$sourceInspect2.actual;bytes=$sourceInspect2.bytes;sha256=$sourceInspect2.sha256;signature=$sourceInspect2.signature;skipped=$false}
                $index++
                continue
            }
        }
        if (-not $pageInspect.is_html) { $errors += "공식 페이지가 HTML/문서로 판별되지 않음: $sourceUrl ($($pageInspect.actual))"; Copy-InvalidResponse $id $title $pageTemp $pageInspect.actual | Out-Null; Remove-Item $pageTemp -Force -ErrorAction SilentlyContinue; continue }
        $pagePath = Save-OfficialPage $id $title $pageTemp
        if ($pagePath) { $pages += $pagePath }
        $html = Get-Content -LiteralPath $pageTemp -Raw -Encoding UTF8 -ErrorAction SilentlyContinue
        if ([string]::IsNullOrWhiteSpace($html)) { try { $html=[Text.Encoding]::Default.GetString([IO.File]::ReadAllBytes($pageTemp)) } catch {$html=''} }
        $candidates = Find-AttachmentLinks $html $sourceUrl
        foreach ($candidate in $candidates) {
            if ($attempted -contains $candidate) { continue }
            $attempted += $candidate
            $candidateExt = Normalize-Extension $expected $title $candidate
            $r = Try-DownloadFile $id $title $candidate $sourceUrl $candidateExt $outDir $index
            if ($r.valid) { $downloaded += $r; $index++ }
            else { $errors += "첨부 URL $candidate : $($r.error)" }
            Start-Sleep -Milliseconds $DelayMs
        }
        Remove-Item -LiteralPath $pageTemp -Force -ErrorAction SilentlyContinue
    }

    $downloaded = @($downloaded | Group-Object sha256 | ForEach-Object {$_.Group | Select-Object -First 1})
    $pages = @($pages | Select-Object -Unique)
    $status = if ($downloaded.Count -gt 0 -and $errors.Count -eq 0) {'OK'} elseif ($downloaded.Count -gt 0) {'PARTIAL'} elseif ($pages.Count -gt 0 -or $sourceLink) {'REFERENCE_SAVED'} else {'FAILED'}
    $record = [pscustomobject]@{
        id=$id; title=$title; category=$category; priority=$priority; status=$status
        expected_extension=$expected; downloaded_count=$downloaded.Count
        downloaded_bytes=[int64](($downloaded | Measure-Object -Property bytes -Sum).Sum)
        downloaded_files=@($downloaded); official_pages=@($pages); source_link=$sourceLink
        attempted_urls=@($attempted); errors=@($errors); finished_at=(Get-Date).ToString('o')
    }
    Save-Json $checkpoint $record 16
    $level = if ($status -eq 'OK') {'OK'} elseif ($status -in @('PARTIAL','REFERENCE_SAVED')) {'WARN'} else {'ERROR'}
    Write-Log "[$id] $status / 유효 파일 $($downloaded.Count)개 / 공식페이지 $($pages.Count)개 / 오류 $($errors.Count)개" $level
    return $record
}

if (-not (Test-Path -LiteralPath $Curl)) { throw "curl.exe 없음: $Curl" }
if (-not (Test-Path -LiteralPath $ManifestPath)) { throw "매니페스트 없음: $ManifestPath" }
if (Test-Path -LiteralPath $LockFile) {
    $oldPid = 0
    try { $oldPid=[int](Get-Content -LiteralPath $LockFile -Raw) } catch {}
    if ($oldPid -gt 0 -and (Get-Process -Id $oldPid -ErrorAction SilentlyContinue)) { throw "이미 실행 중 PID=$oldPid" }
    Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue
}
Write-Utf8 $LockFile ([string]$PID)
Write-Utf8 $PidFile ([string]$PID)
Save-Json $RunStatePath ([pscustomobject]@{state='RUNNING';run_id=$RunId;pid=$PID;started_at=$RunStarted.ToString('o');root=$Root;manifest=$ManifestPath;script_version='2.0.0-verified'})
Write-Log "다운로더 시작 PID=$PID Root=$Root"

try {
    $parsed = Get-Content -LiteralPath $ManifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    $items = @($parsed)
    if ($items.Count -eq 1 -and $items[0] -is [System.Array]) { $items=@($items[0]) }
    if ($MaxItems -gt 0) { $items=@($items | Select-Object -First $MaxItems) }
    $records = @()
    foreach ($item in $items) { $records += Run-Item $item }
    $statusCounts = @{}
    foreach ($r in $records) { if (-not $statusCounts.ContainsKey($r.status)) {$statusCounts[$r.status]=0}; $statusCounts[$r.status]++ }
    $allFiles = @($records | ForEach-Object {$_.downloaded_files})
    $allPages = @($records | ForEach-Object {$_.official_pages})
    $summary = [pscustomobject]@{
        state='COMPLETED'; run_id=$RunId; script_version='2.0.0-verified'
        started_at=$RunStarted.ToString('o'); finished_at=(Get-Date).ToString('o')
        manifest_count=$items.Count; processed_count=$records.Count; status_counts=$statusCounts
        downloaded_file_count=$allFiles.Count
        downloaded_bytes=[int64](($allFiles | Measure-Object -Property bytes -Sum).Sum)
        official_page_count=$allPages.Count
        invalid_binary_as_html_count=0
        records=@($records)
    }
    Save-Json $SummaryJson $summary 20
    $records | Select-Object id,status,category,priority,title,downloaded_count,downloaded_bytes,@{n='official_page_count';e={$_.official_pages.Count}},@{n='error_count';e={$_.errors.Count}},source_link | Export-Csv -LiteralPath $SummaryCsv -NoTypeInformation -Encoding UTF8
    Save-Json $RunStatePath ([pscustomobject]@{state='COMPLETED';run_id=$RunId;pid=$PID;started_at=$RunStarted.ToString('o');finished_at=(Get-Date).ToString('o');processed_count=$records.Count;status_counts=$statusCounts;downloaded_file_count=$allFiles.Count;downloaded_bytes=[int64](($allFiles|Measure-Object -Property bytes -Sum).Sum);official_page_count=$allPages.Count;summary_json=$SummaryJson;summary_csv=$SummaryCsv;log_file=$RunLog;script_version='2.0.0-verified'})
    Write-Log "전체 완료: 항목 $($records.Count)건, 유효 파일 $($allFiles.Count)개, 공식페이지 $($allPages.Count)개" 'OK'
    exit 0
} catch {
    $err = $_ | Out-String
    Save-Json $RunStatePath ([pscustomobject]@{state='FAILED';run_id=$RunId;pid=$PID;started_at=$RunStarted.ToString('o');finished_at=(Get-Date).ToString('o');error=$err;log_file=$RunLog;script_version='2.0.0-verified'})
    Write-Log "전체 실패: $($_.Exception.Message)" 'ERROR'
    exit 1
} finally {
    Remove-Item -LiteralPath $LockFile -Force -ErrorAction SilentlyContinue
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
}
