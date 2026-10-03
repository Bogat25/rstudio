param([string]$BuildRoot = 'D:\rstudio-build')
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$testRoot = Join-Path $BuildRoot ('workflow-test-' + [guid]::NewGuid().ToString('N'))
. (Join-Path $root 'rstudio.ps1') -BuildRoot $testRoot
$passed = 0
function Check([string]$Name, [scriptblock]$Test) {
    & $Test
    $script:passed++
    Write-Host "PASS $Name"
}
function Must-Throw([scriptblock]$Test) {
    $threw = $false
    try { & $Test | Out-Null } catch { $threw = $true }
    if (-not $threw) { throw 'Expected rejection.' }
}
try {
    New-Item -ItemType Directory -Path $testRoot -Force | Out-Null
    Check 'version suffix and numeric fields' {
        $script:Version = 'v1.2.3-rc1'
        $v = Resolve-Version
        if ($v.Text -ne '1.2.3-rc1' -or $v.Numeric -ne '1.2.3.0') { throw 'Version conversion failed.' }
        $script:Version = '1.2.3'
        if ((Resolve-Version).Suffix -ne '') { throw 'Release suffix failed.' }
    }
    Check 'reject invalid and oversized versions' {
        foreach ($v in '1.2','1.2.3 & whoami','65536.1.0') {
            $script:Version = $v
            Must-Throw { Resolve-Version }
        }
    }
    Check 'reject deletion outside the build root and the root itself' {
        Must-Throw { Remove-Generated $BuildRoot }
        Must-Throw { Remove-Generated (Join-Path $BuildRoot '..\unrelated') }
        Must-Throw { Remove-Generated $Repo }
    }
    Check 'remove only the requested generated child' {
        $cacheSentinel = Join-Path $Cache 'keep.txt'
        $workSentinel = Join-Path $Dist 'work\notes.txt'
        foreach ($f in $cacheSentinel,$workSentinel) {
            New-Item -ItemType Directory -Path (Split-Path -Parent $f) -Force | Out-Null
            Set-Content -LiteralPath $f -Value 'keep'
        }
        New-Item -ItemType Directory -Path $Tree -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $Tree 'generated.txt') -Value 'remove'
        Remove-Generated $Tree
        if ((Test-Path $Tree) -or -not (Test-Path $cacheSentinel) -or -not (Test-Path $workSentinel)) { throw 'Deletion isolation failed.' }
    }
    Check 'ZIP checksum uses a single LF line' {
        $file = Join-Path $BuildRoot 'artifact with spaces.zip'
        [IO.File]::WriteAllText($file,'payload')
        Write-Checksum $file
        $text = [IO.File]::ReadAllText("$file.sha256")
        $expected = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash.ToLowerInvariant()
        if ($text -ne "$expected  artifact with spaces.zip`n") { throw 'Checksum format failed.' }
    }
    Check 'cleanup never follows a directory junction' {
        $outside = Join-Path $BuildRoot 'outside'
        New-Item -ItemType Directory -Path $outside,$Tree -Force | Out-Null
        Set-Content -LiteralPath (Join-Path $outside 'keep.txt') -Value 'keep'
        $link = Join-Path $Tree 'linked'
        New-Item -ItemType Junction -Path $link -Target $outside | Out-Null
        Must-Throw { Remove-Generated (Join-Path $link 'keep.txt') }
        Remove-Generated $Tree
        if (-not (Test-Path (Join-Path $outside 'keep.txt'))) { throw 'Cleanup followed a junction.' }
    }
    Check 'invalid cached download fails before using it' {
        Set-Content -LiteralPath (Join-Path $Cache 'bad.zip') -Value 'not a ZIP'
        Must-Throw { Get-VerifiedDownload '' 'bad.zip' ('0' * 64) }
    }
    Check 'reject incomplete runtime' { Must-Throw { Test-Runtime $BuildRoot } }
    Check 'cmd quoting accepts spaces and rejects expansions' {
        if ((Cmd-Quote 'D:\Program Files\R') -ne '"D:\Program Files\R"') { throw 'Quoting failed.' }
        Must-Throw { Cmd-Quote '%PATH%' }
        Must-Throw { Cmd-Quote 'bad"argument' }
    }
    Write-Host "$passed workflow checks passed."
} finally {
    # This uniquely named test tree is the only thing removed here.
    $resolved = [IO.Path]::GetFullPath($testRoot)
    $outer = [IO.Path]::GetFullPath((Split-Path -Parent $testRoot)).TrimEnd('\') + '\'
    if (-not $resolved.StartsWith($outer,[StringComparison]::OrdinalIgnoreCase) -or
        [IO.Path]::GetFileName($resolved) -notlike 'workflow-test-*') { throw 'Unexpected test cleanup path.' }
    Remove-Item -LiteralPath $resolved -Recurse -Force
}
