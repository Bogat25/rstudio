param([string]$BuildRoot = 'D:\rstudio-build')
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
. (Join-Path $root 'rstudio.ps1') -BuildRoot $BuildRoot
Initialize-Toolchain
Require-BuildTools
$setups = @(Get-ChildItem -LiteralPath $InstallerDir -Filter 'RStudio-*-setup.exe' | Sort-Object LastWriteTimeUtc -Descending)
if (-not $setups.Count) { throw 'Build an installer first with .\rstudio installer.' }
$production = $setups[0]
$versionText = $production.BaseName.Substring('RStudio-'.Length)
$versionText = $versionText.Substring(0,$versionText.Length - '-setup'.Length)
$script:Version = $versionText
$versionInfo = Resolve-Version
$test = Join-Path $BuildRoot ('installer-test-' + [guid]::NewGuid().ToString('N'))
$app = Join-Path $test 'Application with spaces'
$identifier = [guid]::NewGuid().ToString('D')
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{' + $identifier + '}_is1'
New-Item -ItemType Directory -Path $test -Force | Out-Null
$null = Assert-ChildPath $test $BuildRoot
$compiler = Find-Inno
if (-not $compiler) { throw 'Installer checks need Inno Setup.' }
$elevated = [Security.Principal.WindowsPrincipal]::new([Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole(
    [Security.Principal.WindowsBuiltInRole]::Administrator)
Write-Host "Installer test caller elevated: $elevated"
# Use the production payload and packaging source with a separate identity.
# An installed RStudio and its registration are never replaced or removed.
Invoke-Logged $compiler @("/DAppVersion=$versionText","/DNumericVersion=$($versionInfo.Numeric)",
    "/DAppIdValue={{$identifier}","/DAppNameValue=RStudio Test $identifier",
    "/DStageDir=$Stage","/DOutputDir=$test",(Join-Path $root 'package\windows\rstudio-ai.iss')) $root 'installer-fixture'
$setup = Join-Path $test ("RStudio-$versionText-setup.exe")
$passed = 0
function Check([string]$Name, [bool]$Condition) {
    if (-not $Condition) { throw "FAILED $Name" }
    $script:passed++
    Write-Host "PASS $Name"
}
function Run-Setup([string]$Label) {
    $log = Join-Path $test "$Label.log"
    $p = Start-Process -FilePath $setup -WindowStyle Hidden -Wait -PassThru -ArgumentList @(
        '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/NOICONS','/TASKS=',"/DIR=`"$app`"","/LOG=`"$log`"")
    if ($p.ExitCode -ne 0) { throw "$Label failed (exit $($p.ExitCode)); log $log" }
}
try {
    Run-Setup 'install'
    Test-Runtime $app
    Check 'runtime installs into a path containing spaces' $true
    Check 'per-user uninstall registration' (Test-Path -LiteralPath $registry)
    Check 'installed product uses the RStudio name' ((Get-ItemProperty -LiteralPath $registry -Name DisplayName).DisplayName -like 'RStudio Test *')
    Check 'installer product metadata uses the RStudio name' ((Get-Item -LiteralPath $setup).VersionInfo.ProductName -like 'RStudio Test *')
    Check 'desktop executable product metadata uses the RStudio name' ((Get-Item -LiteralPath (Join-Path $app 'RStudio\rstudio.exe')).VersionInfo.ProductName -eq 'RStudio')
    Check 'models excluded from installation' (@(Get-ChildItem -LiteralPath $app -Recurse -File -Filter '*.gguf*').Count -eq 0)
    Invoke-Logged $Node @((Join-Path $root 'package\windows\test-runtime.cjs'),$app,$BuildRoot,'--installed-runtime') $root 'installed-runtime-test'
    Check 'installed launcher opens the IDE, bundled R, usable temp space and offline Chat' $true
    $work = Join-Path $app 'work'
    $prompt = Join-Path $app 'RStudio\resources\app\bin\local-assistant\system_prompt.txt'
    $settings = Join-Path $work 'data\local-assistant\settings.json'
    $notes = Join-Path $work 'data\local-assistant\context\coursework.txt'
    $history = Join-Path $work '.Rhistory'
    foreach ($f in $prompt,$settings,$notes,$history) { Set-Content -LiteralPath $f -Value 'user content' }
    $model = Join-Path $work 'data\local-assistant\models\test.gguf'
    $partial = "$model.part"
    foreach ($f in $model,$partial) { Set-Content -LiteralPath $f -Value 'test download' }
    Run-Setup 'upgrade'
    foreach ($f in $prompt,$settings,$notes,$history,$model,$partial) {
        Check ('upgrade preserves ' + [IO.Path]::GetFileName($f)) (Test-Path -LiteralPath $f)
    }
    Check 'custom prompt contents survive upgrade' ((Get-Content -LiteralPath $prompt -Raw).Trim() -eq 'user content')
    foreach ($f in $settings,$notes,$history) {
        Check ('upgrade preserves contents of ' + [IO.Path]::GetFileName($f)) ((Get-Content -LiteralPath $f -Raw).Trim() -eq 'user content')
    }
    # Prove the bundled R can run without using the machine's R installation.
    $result = & (Join-Path $app 'R\bin\x64\Rscript.exe') --vanilla -e 'cat(as.character(getRversion()))'
    Check 'bundled R executes' ($LASTEXITCODE -eq 0 -and "$result" -match '^\d+\.\d+\.\d+$')
    $uninstall = Join-Path $app 'unins000.exe'
    $p = Start-Process -FilePath $uninstall -WindowStyle Hidden -Wait -PassThru -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'
    Check 'uninstall completes' ($p.ExitCode -eq 0)
    Check 'uninstall removes program' (-not (Test-Path (Join-Path $app 'RStudio\rstudio.exe')))
    Check 'uninstall removes downloaded model and partial file' (-not (Test-Path $model) -and -not (Test-Path $partial))
    foreach ($f in $settings,$notes,$history) { Check ('uninstall preserves ' + [IO.Path]::GetFileName($f)) (Test-Path -LiteralPath $f) }
    Check 'uninstall removes test registration' (-not (Test-Path -LiteralPath $registry))
    Write-Host "$passed installer checks passed."
} finally {
    # Undo only our isolated test installation if a check failed midway.
    $uninstall = Join-Path $app 'unins000.exe'
    if (Test-Path -LiteralPath $uninstall) {
        $p = Start-Process -FilePath $uninstall -WindowStyle Hidden -Wait -PassThru -ArgumentList '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART'
        if ($p.ExitCode -ne 0) { throw "Test uninstall failed; retained $test for inspection." }
    }
    if (Test-Path -LiteralPath $registry) { throw "Test registration remains; retained $test for inspection." }
    Remove-Generated $test
}
