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
        $script:Version = 'v0.2.0-rc.1'
        $v = Resolve-Version
        if ($v.Text -ne '0.2.0-rc.1' -or $v.Suffix -ne '-rc.1' -or $v.Numeric -ne '0.2.0.0') { throw 'Dotted prerelease failed.' }
    }
    Check 'four-part Windows release and prerelease versions' {
        $script:Version = 'v0.1.8.1'
        $v = Resolve-Version
        if ($v.Text -ne '0.1.8.1' -or $v.Numeric -ne '0.1.8.1' -or $v.Revision -ne '1' -or $v.Suffix -ne '') { throw 'Windows revision failed.' }
        $script:Version = '1.2.3.65535-rc.1'
        $v = Resolve-Version
        if ($v.Text -ne '1.2.3.65535-rc.1' -or $v.Numeric -ne '1.2.3.65535' -or $v.Suffix -ne '-rc.1') { throw 'Windows prerelease revision failed.' }
        $script:Version = '1.2.3'
        if ((Resolve-Version).Revision -ne '0') { throw 'Default Windows revision failed.' }
    }
    Check 'infer a four-part version from the checkout tag' {
        $fixtureRepo = Join-Path $BuildRoot 'version-repo'
        & git init --quiet $fixtureRepo
        if ($LASTEXITCODE -ne 0) { throw 'Cannot initialize version fixture.' }
        & git -C $fixtureRepo -c user.name='Version fixture' -c user.email='version-fixture@example.invalid' -c commit.gpgsign=false commit --quiet --allow-empty -m fixture
        if ($LASTEXITCODE -ne 0) { throw 'Cannot commit version fixture.' }
        & git -C $fixtureRepo -c tag.gpgsign=false tag v0.1.8.1
        if ($LASTEXITCODE -ne 0) { throw 'Cannot tag version fixture.' }
        $savedRepo = $script:Repo
        try {
            $script:Repo = $fixtureRepo
            $script:Version = ''
            if ((Resolve-Version).Text -ne '0.1.8.1') { throw 'Checkout tag inference failed.' }
        } finally { $script:Repo = $savedRepo }
    }
    Check 'CMake preserves release, revision and prerelease fields' {
        $versionCheck = Join-Path $BuildRoot 'check-version.cmake'
        @'
include("${VERSION_MODULE}")
foreach(field MAJOR MINOR PATCH REVISION SUFFIX)
   if(NOT "${CPACK_PACKAGE_VERSION_${field}}" STREQUAL "${EXPECTED_${field}}")
      message(FATAL_ERROR "Incorrect ${field}: '${CPACK_PACKAGE_VERSION_${field}}'")
   endif()
endforeach()
if(NOT CPACK_PACKAGE_VERSION STREQUAL RSTUDIO_FORK_VERSION)
   message(FATAL_ERROR "Complete fork version was lost")
endif()
'@ | Set-Content -LiteralPath $versionCheck -Encoding ascii
        foreach ($candidate in '1.2.3','0.2.0-rc1','0.2.0-rc.1','v0.1.8.1','1.2.3.65535-rc.1') {
            $script:Version = $candidate
            $v = Resolve-Version
            $base = '{0}.{1}.{2}' -f $v.Major,$v.Minor,$v.Patch
            & cmake "-DVERSION_MODULE=$root/cmake/fork-version.cmake" "-DRSTUDIO_FORK_VERSION=$($v.Text)" `
                "-DEXPECTED_MAJOR=$($v.Major)" "-DEXPECTED_MINOR=$($v.Minor)" "-DEXPECTED_PATCH=$($v.Patch)" `
                "-DEXPECTED_REVISION=$($v.Revision)" "-DEXPECTED_SUFFIX=$($v.Text.Substring($base.Length))" -P $versionCheck
            if ($LASTEXITCODE -ne 0) { throw "CMake version conversion failed: $candidate" }
        }
        foreach ($candidate in '1.2.3.4.5','1.2.3.65536','1.2.3.4-rc..1') {
            Must-Throw {
                & cmake "-DRSTUDIO_FORK_VERSION=$candidate" -P "$root/cmake/fork-version.cmake" 2>&1 | Out-Null
                if ($LASTEXITCODE -ne 0) { throw "CMake rejected invalid version: $candidate" }
            }
        }
    }
    Check 'reject invalid and oversized versions' {
        foreach ($v in '1.2','1.2.3 & whoami','65536.1.0','1.2.3-rc..1','1.2.3-.rc','1.2.3-rc.',
            '1.2.3.4.5','1.2.3.65536','1.2.3.-1','1.2.3.4-rc..1','1.2.3.4 & whoami','vv1.2.3') {
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
    Check 'bounded child processes report success and failure' {
        Invoke-BoundedProcess 'powershell.exe' @('-NoProfile','-NonInteractive','-Command','exit 0') 10 'successful child'
        Must-Throw { Invoke-BoundedProcess 'powershell.exe' @('-NoProfile','-NonInteractive','-Command','exit 7') 10 'failing child' }
    }
    Check 'bounded processes wait for a detached descendant' {
        $descendant = Join-Path $BuildRoot 'descendant.ps1'
        $launcher = Join-Path $BuildRoot 'launch-descendant.ps1'
        $sentinel = Join-Path $BuildRoot 'descendant-completed.txt'
        [IO.File]::WriteAllText($descendant, 'Start-Sleep -Milliseconds 500; Set-Content -LiteralPath "' + $sentinel + '" -Value done')
        $launch = 'Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(''-NoProfile'',''-NonInteractive'',''-File'',''{0}'') | Out-Null' -f $descendant.Replace("'","''")
        [IO.File]::WriteAllText($launcher, $launch)
        Invoke-BoundedProcess 'powershell.exe' @('-NoProfile','-NonInteractive','-File',$launcher) 10 'detached descendant'
        if (-not (Test-Path -LiteralPath $sentinel)) { throw 'Returned before the descendant finished.' }
    }
    Check 'a stalled descendant is terminated at its deadline' {
        $childScript = Join-Path $BuildRoot 'stalled-child.ps1'
        $launcher = Join-Path $BuildRoot 'launch-stalled-child.ps1'
        $pidFile = Join-Path $BuildRoot 'stalled-child.pid'
        [IO.File]::WriteAllText($childScript, '$PID | Set-Content -LiteralPath "' + $pidFile + '"; Start-Sleep -Seconds 60')
        $launch = 'Start-Process powershell.exe -WindowStyle Hidden -ArgumentList @(''-NoProfile'',''-NonInteractive'',''-File'',''{0}'') | Out-Null' -f $childScript.Replace("'","''")
        [IO.File]::WriteAllText($launcher, $launch)
        $watch = [Diagnostics.Stopwatch]::StartNew()
        $timedOut = $false
        try {
            Invoke-BoundedProcess 'powershell.exe' @('-NoProfile','-NonInteractive','-File',$launcher) 3 'stalled descendant'
        } catch [TimeoutException] { $timedOut = $true }
        if (-not $timedOut -or $watch.Elapsed.TotalSeconds -gt 10) { throw 'Child process deadline failed.' }
        $childId = [int](Get-Content -LiteralPath $pidFile)
        $remaining = Get-Process -Id $childId -ErrorAction SilentlyContinue
        if ($remaining) {
            Stop-Process -Id $childId -Force
            throw 'Timed-out child process was left running.'
        }
    }
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
