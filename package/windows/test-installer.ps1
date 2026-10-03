param([string]$BuildRoot = 'D:\rstudio-build')
Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
. (Join-Path $root 'rstudio.ps1') -BuildRoot $BuildRoot
$setups = @(Get-ChildItem -LiteralPath $InstallerDir -Filter 'RStudio-AI-*-setup.exe' | Sort-Object LastWriteTimeUtc -Descending)
if (-not $setups.Count) { throw 'Build an installer first with .\rstudio installer.' }
$setup = $setups[0].FullName
$test = Join-Path $BuildRoot ('installer-test-' + [guid]::NewGuid().ToString('N'))
$app = Join-Path $test 'Application with spaces'
$registry = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\{3F51F797-68EC-44F4-9366-F3D5F22B306D}_is1'
if (Test-Path -LiteralPath $registry) { throw 'RStudio AI is already installed; installer isolation test will not replace it.' }
New-Item -ItemType Directory -Path $test -Force | Out-Null
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
    Check 'models excluded from installation' (@(Get-ChildItem -LiteralPath $app -Recurse -File -Filter '*.gguf*').Count -eq 0)
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
