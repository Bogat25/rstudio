<#
.SYNOPSIS
Build, run and package the Windows RStudio fork with its offline assistant.
.DESCRIPTION
Like rgui.ps1, keeps builds, downloads and logs outside the checkout.
  .\rstudio doctor                  check prerequisites
  .\rstudio fetch -NoModel          fetch pinned CPU server and Inno Setup
  .\rstudio full                    build a complete desktop application
  .\rstudio quick                   rebuild with the faster GWT draft compiler
  .\rstudio dev                     quick, stage, then run
  .\rstudio package                 stage a portable app, R and optional models
  .\rstudio run                     start the staged app
  .\rstudio installer -Version 0.1.0  create a per-user setup EXE and checksum
  .\rstudio test                    assistant typecheck and protocol tests
  .\rstudio test -Installer         also install, upgrade and uninstall in isolation
  .\rstudio deploy -Drive E:        update a portable copy, preserving work
  .\rstudio clean                   remove generated builds; retain downloads/work

Requires the repository's Windows build dependencies, MSVC 14.5 and JDK 17.
R is copied from -RHome (or an installed R), including its license notices.
The installer never contains models; the assistant offers its first-run download.
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('doctor','fetch','full','quick','run','dev','test','package','installer','deploy','clean')]
    [string]$Command = 'doctor',
    [string]$BuildRoot = '',
    [string]$ToolsRoot = '',
    [string]$RHome = '',
    [ValidateRange(0,256)][int]$Jobs = 0,
    [string]$Version = '',
    [string]$InnoSetup = '',
    [switch]$NoModel,
    [switch]$Real,
    [switch]$Gui,
    [switch]$Installer,
    [string]$Drive = ''
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$Repo = $PSScriptRoot
if (-not $BuildRoot) {
    $BuildRoot = if (Test-Path 'D:\') { 'D:\rstudio-build' } else { Join-Path $env:SystemDrive 'rstudio-build' }
}
$BuildRoot = [IO.Path]::GetFullPath($BuildRoot).TrimEnd('\')
if ($BuildRoot -match '[\s"%!&|<>^]' -or $BuildRoot -eq [IO.Path]::GetPathRoot($BuildRoot).TrimEnd('\')) {
    throw 'BuildRoot must be a dedicated folder without spaces or cmd metacharacters.'
}
if ($Repo.StartsWith($BuildRoot + '\', [StringComparison]::OrdinalIgnoreCase) -or
    $BuildRoot.StartsWith($Repo + '\', [StringComparison]::OrdinalIgnoreCase) -or $BuildRoot -ieq $Repo) {
    throw 'BuildRoot must be outside the source checkout.'
}
$Tree = Join-Path $BuildRoot 'tree'
$Build = Join-Path $BuildRoot 'build'
$Cache = Join-Path $BuildRoot 'cache'
$Logs = Join-Path $BuildRoot 'logs'
$Dist = Join-Path $BuildRoot 'dist'
$Stage = Join-Path $BuildRoot 'stage'
$InstallerDir = Join-Path $BuildRoot 'installer'
$script:LastLog = ''
if ($Jobs -eq 0) { $Jobs = [Math]::Min(8, [Environment]::ProcessorCount) }

$LlamaFile = 'llama-b11153-bin-win-cpu-x64.zip'
$LlamaUrl = 'https://github.com/ggml-org/llama.cpp/releases/download/b11153/' + $LlamaFile
$LlamaSha = '569d19826f3fb00a3fc2df7bd68ab9ad33e5c0d6d69ce022b24372700cee7931'
$InnoFile = 'innosetup-7.1.0-x64.exe'
$InnoUrl = 'https://github.com/jrsoftware/issrc/releases/download/is-7_1_0/' + $InnoFile
$InnoSha = '0362a383ed217d4c4239b5933866dd96d3eb2102737da92f80f6057a4b40df2f'
$Models = @(
    @{ Name='Qwen3.5-4B-Q4_K_M.gguf'; Remote='Qwen3.5-4B-Q4_K_M.gguf'; Size=2740937888L; Sha='00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4' },
    @{ Name='Qwen3.5-4B-mmproj-F16.gguf'; Remote='mmproj-F16.gguf'; Size=672423616L; Sha='cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864' }
)

function Say([string]$Message) { Write-Host "==> $Message" -ForegroundColor Cyan }

function Assert-ChildPath([string]$Path, [string]$Root) {
    $full = [IO.Path]::GetFullPath($Path)
    $prefix = [IO.Path]::GetFullPath($Root).TrimEnd('\') + '\'
    if (-not $full.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        throw "Refusing an operation outside $Root."
    }
    $ancestor = [IO.Path]::GetFullPath($Root).TrimEnd('\')
    while ($ancestor) {
        if ((Test-Path -LiteralPath $ancestor) -and
            ((Get-Item -LiteralPath $ancestor -Force).Attributes -band [IO.FileAttributes]::ReparsePoint)) {
            throw "Refusing an operation through a reparse point: $ancestor"
        }
        $ancestor = Split-Path -Parent $ancestor
    }
    # A junction inside a generated tree must not redirect removal into user files.
    $parent = $full
    while ($parent -and $parent.StartsWith($prefix, [StringComparison]::OrdinalIgnoreCase)) {
        if (Test-Path -LiteralPath $parent) {
            if ((Get-Item -LiteralPath $parent -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) {
                throw "Refusing an operation through a reparse point: $parent"
            }
        }
        $parent = Split-Path -Parent $parent
    }
    return $full
}

function Remove-Generated([string]$Path) {
    $full = Assert-ChildPath $Path $BuildRoot
    if (Test-Path -LiteralPath $full) {
        Remove-DirectoryContents $full
    }
}

function Remove-DirectoryContents([string]$Path) {
    # Do not follow npm/Yarn workspace links. Directory.Delete without recursive
    # removes a junction itself, including one pointing outside the build root.
    foreach ($item in Get-ChildItem -LiteralPath $Path -Force) {
        if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
            if ($item.PSIsContainer) { [IO.Directory]::Delete($item.FullName) }
            else { [IO.File]::Delete($item.FullName) }
        } elseif ($item.PSIsContainer) {
            Remove-DirectoryContents $item.FullName
        } else {
            Remove-Item -LiteralPath $item.FullName -Force
        }
    }
    [IO.Directory]::Delete($Path)
}

function Invoke-Logged([string]$Exe, [string[]]$Arguments, [string]$Directory, [string]$Label) {
    New-Item -ItemType Directory -Path $Logs -Force | Out-Null
    $script:LastLog = Join-Path $Logs ("$Label-" + (Get-Date -Format 'yyyyMMdd-HHmmss-fff') + '.log')
    $writer = New-Object IO.StreamWriter($script:LastLog, $false, (New-Object Text.UTF8Encoding($false)))
    $writer.AutoFlush = $true
    Push-Location $Directory
    try {
        # Native tools use stderr for progress and warnings even on success.
        $ErrorActionPreference = 'Continue'
        # Do not dump the caller's environment or authentication configuration.
        & $Exe @Arguments 2>&1 | ForEach-Object {
            $raw = if ($_ -is [Management.Automation.ErrorRecord]) { $_.Exception.Message } else { "$_" }
            $line = $raw -replace '(?i)(authToken(?:=|%3D))[^\s&"<>]+', '$1[redacted]'
            $writer.WriteLine($line)
            $verboseStage = $Label -eq 'stage' -and $line -match '^-- (Installing|Up-to-date):'
            $verboseInstaller = $Label -in @('installer','installer-fixture') -and $line -match '^\s+(Compressing|Creating directory|Extracting):'
            if (-not ($verboseStage -or $verboseInstaller)) { Write-Host $line }
        }
        $code = $LASTEXITCODE
        if ($code -ne 0) { throw "$Label failed (exit $code). Log: $script:LastLog" }
    } finally { $writer.Dispose(); Pop-Location }
}

function Invoke-BoundedProcess([string]$Exe, [string[]]$Arguments,
    [ValidateRange(1,1800)][int]$TimeoutSeconds, [string]$Label) {
    # Start-Process -Wait tracks descendants, unlike Process.WaitForExit.
    # Run that wait in a child shell so the whole tree also has a deadline.
    $waitScript = Join-Path $Repo 'package\windows\wait-process.ps1'
    $encodedArguments = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes(
        (ConvertTo-Json -InputObject $Arguments -Compress)))
    $shell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    New-Item -ItemType Directory -Path $Logs -Force | Out-Null
    $waitLog = Join-Path $Logs ('process-wait-' + [guid]::NewGuid().ToString('N') + '.log')
    $process = Start-Process -FilePath $shell -ArgumentList @(
        '-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',"`"$waitScript`"",
        '-Exe',"`"$Exe`"",'-EncodedArguments',$encodedArguments) -WindowStyle Hidden -PassThru -RedirectStandardError $waitLog
    $null = $process.Handle # Retain the exit code when using Windows PowerShell redirection.
    try {
        if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
            # Only terminate the process tree started by this invocation.
            $savedPreference = $ErrorActionPreference
            try {
                $ErrorActionPreference = 'Continue'
                & taskkill.exe /PID $process.Id /T /F 2>&1 | Out-Null
            } finally { $ErrorActionPreference = $savedPreference }
            throw [TimeoutException]::new("$Label timed out after $TimeoutSeconds seconds.")
        }
        if ($process.ExitCode -ne 0) { throw "$Label failed (exit $($process.ExitCode)); wrapper log $waitLog" }
    } finally { $process.Dispose() }
}

function Cmd-Quote([string]$Value) {
    if ($Value -match '["%!\r\n]') { throw 'A cmd argument contains an unsupported character.' }
    return '"' + $Value + '"'
}

function Invoke-DeveloperCommand([string[]]$Arguments, [string]$Label) {
    New-Item -ItemType Directory -Path $Logs -Force | Out-Null
    $batch = Join-Path $Logs ("$Label-" + [guid]::NewGuid().ToString('N') + '.cmd')
    $helper = Join-Path $Tree 'src\cpp\tools\windows-dev.cmd'
    $line = ($Arguments | ForEach-Object { Cmd-Quote $_ }) -join ' '
    [IO.File]::WriteAllText($batch, "@echo off`r`ncall $(Cmd-Quote $helper) || exit /b 1`r`n$line`r`nexit /b %ERRORLEVEL%`r`n")
    # Keep Rtools off the PATH, as make-package.bat does: its CMake 3.31 would
    # shadow Visual Studio's (appended last) and report VS 2026 as toolset 143.
    $savedPath = $env:PATH
    $env:PATH = (($env:PATH -split ';') | Where-Object { $_ -and $_ -notmatch '(^|\\)rtools[^\\]*(\\|$)' }) -join ';'
    try { Invoke-Logged 'cmd.exe' @('/d','/c',$batch) $Tree $Label }
    finally { $env:PATH = $savedPath }
}

function Copy-Directory([string]$Source, [string]$Target, [string[]]$Extra = @()) {
    New-Item -ItemType Directory -Path $Target -Force | Out-Null
    & robocopy.exe $Source $Target /E /COPY:DAT /DCOPY:T /NFL /NDL /NJH /NJS /NP /R:1 /W:1 @Extra | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copy failed: $Source to $Target (robocopy $LASTEXITCODE)." }
}

function Sync-Tree {
    Say 'syncing tracked sources to the build tree'
    New-Item -ItemType Directory -Path $Tree -Force | Out-Null
    $null = Assert-ChildPath (Join-Path $Tree '.sync-check') $Tree
    $script:SourceChanges = New-Object 'System.Collections.Generic.List[string]'
    $files = @(& git -C $Repo -c core.quotepath=false ls-files)
    if ($LASTEXITCODE -ne 0) { throw 'git ls-files failed.' }
    $manifest = Join-Path $BuildRoot 'sources.txt'
    if (Test-Path -LiteralPath $manifest) {
        $present = @{}
        foreach ($file in $files) { $present[$file] = $true }
        foreach ($old in Get-Content -LiteralPath $manifest) {
            if (-not $present.ContainsKey($old)) {
                $target = Assert-ChildPath (Join-Path $Tree $old) $Tree
                if (Test-Path -LiteralPath $target -PathType Leaf) {
                    Remove-Item -LiteralPath $target -Force
                    $script:SourceChanges.Add($old)
                }
            }
        }
    }
    foreach ($file in $files) {
        $source = Join-Path $Repo $file
        $target = [IO.Path]::GetFullPath((Join-Path $Tree $file))
        if (-not $target.StartsWith($Tree + '\',[StringComparison]::OrdinalIgnoreCase)) { throw 'Invalid tracked source path.' }
        if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
            if (Test-Path -LiteralPath $target -PathType Leaf) {
                $null = Assert-ChildPath $target $Tree
                Remove-Item -LiteralPath $target -Force
                $script:SourceChanges.Add($file)
            }
            continue
        }
        $item = Get-Item -LiteralPath $source
        $changed = -not (Test-Path -LiteralPath $target)
        if (-not $changed) {
            $other = Get-Item -LiteralPath $target
            $changed = $item.Length -ne $other.Length -or $item.LastWriteTimeUtc -ne $other.LastWriteTimeUtc
        }
        if ($changed) {
            $null = Assert-ChildPath $target $Tree
            New-Item -ItemType Directory -Path (Split-Path -Parent $target) -Force | Out-Null
            Copy-Item -LiteralPath $source -Destination $target -Force
            $script:SourceChanges.Add($file)
        }
    }
    [IO.File]::WriteAllLines($manifest, [string[]]$files)
    # Tests also synchronize sources. Persist invalidation so a test between an
    # edit and a build cannot make the next build reuse stale interface assets.
    $gwtStamp = Join-Path $BuildRoot 'gwt-mode.txt'
    if (@($script:SourceChanges | Where-Object { $_ -like 'src/gwt/*' }).Count -and (Test-Path $gwtStamp)) {
        Remove-Item -LiteralPath $gwtStamp -Force
    }
    if (@($script:SourceChanges | Where-Object { $_ -like 'src/node/desktop/*' }).Count) {
        Set-Content -LiteralPath (Join-Path $BuildRoot 'desktop-dirty.txt') -Value 'rebuild' -Encoding ascii
    }
    # Dependency-generated web assets are needed in addition to tracked sources.
    # Never copy node_modules, .env files, agent state or the checkout's C++ build.
    Copy-Directory (Join-Path $Repo 'src\gwt\www') (Join-Path $Tree 'src\gwt\www') @('/XO','/XD','rstudio','WEB-INF','/XF','*.map')
    $panmirror = 'src\gwt\lib\quarto'
    if (Test-Path -LiteralPath (Join-Path $Repo $panmirror)) {
        Copy-Directory (Join-Path $Repo $panmirror) (Join-Path $Tree $panmirror) @('/XD','node_modules','.git','.github','.vscode','.zed','dist-rstudio','/XF','.env*')
    }
    $venv = 'src\gwt\tools\i18n-helpers\VENV'
    if (Test-Path -LiteralPath (Join-Path $Repo $venv)) {
        Copy-Directory (Join-Path $Repo $venv) (Join-Path $Tree $venv)
    }
}

function Find-R {
    if ($RHome) { return [IO.Path]::GetFullPath($RHome) }
    if (Test-Path Env:R_HOME) {
        if (Test-Path -LiteralPath (Join-Path $env:R_HOME 'bin\x64\R.exe')) { return $env:R_HOME }
    }
    foreach ($key in 'HKCU:\Software\R-core\R64','HKLM:\Software\R-core\R64','HKLM:\Software\R-core\R') {
        $entry = Get-ItemProperty -LiteralPath $key -Name InstallPath -ErrorAction SilentlyContinue
        if ($entry -and (Test-Path -LiteralPath (Join-Path $entry.InstallPath 'bin\x64\R.exe'))) { return $entry.InstallPath }
    }
    return ''
}

function Initialize-Toolchain {
    if (-not $ToolsRoot) {
        if (Test-Path Env:RSTUDIO_TOOLS_ROOT) { $script:ToolsRoot = $env:RSTUDIO_TOOLS_ROOT }
        elseif (Test-Path 'D:\rstudio-tools') { $script:ToolsRoot = 'D:\rstudio-tools' }
        else { $script:ToolsRoot = Join-Path $env:SystemDrive 'rstudio-tools' }
    }
    $script:RHome = Find-R
    $script:NodeDir = Join-Path $ToolsRoot 'dependencies\common\node\22.22.2'
    $script:Node = Join-Path $NodeDir 'node.exe'
    $script:NpmCli = Join-Path $NodeDir 'node_modules\npm\bin\npm-cli.js'
    $script:AntDir = Join-Path $ToolsRoot 'apache-ant-1.10.14\bin'
    $script:JavaDir = ''
    if ((Test-Path Env:JAVA_HOME) -and (Test-Path -LiteralPath (Join-Path $env:JAVA_HOME 'bin\javac.exe'))) {
        $script:JavaDir = $env:JAVA_HOME
    } else {
        $jdks = @(Get-ChildItem -LiteralPath (Join-Path $env:ProgramFiles 'Eclipse Adoptium') -Directory -Filter 'jdk-17*' -ErrorAction SilentlyContinue | Sort-Object Name -Descending)
        if ($jdks.Count) { $script:JavaDir = $jdks[0].FullName }
    }
    $script:VsWhere = Join-Path ${env:ProgramFiles(x86)} 'Microsoft Visual Studio\Installer\vswhere.exe'
}

function Require-BuildTools {
    if (-not $RHome) { throw 'R was not found. Install 64-bit R or pass -RHome <directory>.' }
    foreach ($path in $Node,$NpmCli,(Join-Path $AntDir 'ant.bat'),$VsWhere,(Join-Path $RHome 'bin\x64\R.exe')) {
        if (-not (Test-Path -LiteralPath $path)) { throw "Missing prerequisite: $path. Run .\rstudio doctor; see BUILD-WINDOWS.md." }
    }
    if (-not $JavaDir) { throw 'JDK 17 is required; set JAVA_HOME to its installation.' }
    $env:RSTUDIO_TOOLS_ROOT = $ToolsRoot
    $env:JAVA_HOME = $JavaDir
    $env:PATH = "$NodeDir;$AntDir;$JavaDir\bin;" + $env:PATH
    $env:GWT_MAIN_MODULE = 'RStudioDesktop'
    $env:GIT_COMMIT = (& git -C $Repo rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0) { throw 'Cannot read source revision.' }
    Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
}

function Get-VerifiedDownload([string]$Url, [string]$Name, [string]$Sha, [long]$Size = 0) {
    New-Item -ItemType Directory -Path $Cache -Force | Out-Null
    $dest = Join-Path $Cache $Name
    if (-not (Test-Path -LiteralPath $dest)) {
        Say "downloading $Name (resumable)"
        Invoke-Logged 'curl.exe' @('--fail','--location','--retry','3','--continue-at','-','--output',"$dest.part",$Url) $Cache 'fetch'
        $part = Assert-ChildPath "$dest.part" $Cache
        if (($Size -and (Get-Item -LiteralPath $part).Length -ne $Size) -or
            (Get-FileHash -LiteralPath $part -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha) {
            Remove-Item -LiteralPath $part -Force
            throw "Downloaded $Name failed verification. Run fetch again."
        }
        Move-Item -LiteralPath $part -Destination $dest -Force
    }
    if (($Size -and (Get-Item -LiteralPath $dest).Length -ne $Size) -or
        (Get-FileHash -LiteralPath $dest -Algorithm SHA256).Hash.ToLowerInvariant() -ne $Sha) {
        throw "Cached $Name failed verification; remove that file and run fetch again."
    }
    return $dest
}

function Find-Inno {
    if ($InnoSetup) { return $InnoSetup }
    foreach ($p in (Join-Path $BuildRoot 'tools\innosetup\ISCC.exe'),
        (Join-Path $env:LOCALAPPDATA 'Programs\Inno Setup 7\ISCC.exe'),
        (Join-Path $env:ProgramFiles 'Inno Setup 7\ISCC.exe')) {
        if (Test-Path -LiteralPath $p) { return $p }
    }
    return ''
}

function Install-Inno {
    $existing = Find-Inno
    if ($existing) { return $existing }
    $exe = Get-VerifiedDownload $InnoUrl $InnoFile $InnoSha
    $target = Join-Path $BuildRoot 'tools\innosetup'
    Say 'installing pinned Inno Setup for the current user'
    $p = Start-Process -FilePath $exe -WindowStyle Hidden -Wait -PassThru -ArgumentList @(
        '/VERYSILENT','/SUPPRESSMSGBOXES','/NORESTART','/CURRENTUSER','/NOICONS',"/DIR=$target")
    $iscc = Join-Path $target 'ISCC.exe'
    if ($p.ExitCode -ne 0 -or -not (Test-Path -LiteralPath $iscc)) { throw 'Inno Setup bootstrap failed.' }
    return $iscc
}

function Invoke-Fetch {
    $null = Get-VerifiedDownload $LlamaUrl $LlamaFile $LlamaSha
    $null = Install-Inno
    if (-not $NoModel) {
        foreach ($model in $Models) {
            $null = Get-VerifiedDownload ('https://huggingface.co/unsloth/Qwen3.5-4B-GGUF/resolve/main/' + $model.Remote) $model.Name $model.Sha $model.Size
        }
    }
    Say "downloads verified in $Cache"
}

function Stop-BuildProcesses {
    # Limit automatic shutdown to executables inside this workflow's own outputs.
    $prefixes = @($Tree,$Build,$Dist,$Stage) | ForEach-Object { $_.TrimEnd('\') + '\' }
    foreach ($p in Get-CimInstance Win32_Process -ErrorAction SilentlyContinue) {
        if (-not $p.ExecutablePath -or $p.ProcessId -eq $PID) { continue }
        foreach ($prefix in $prefixes) {
            if ($p.ExecutablePath.StartsWith($prefix,[StringComparison]::OrdinalIgnoreCase)) {
                Stop-Process -Id $p.ProcessId -Force -ErrorAction SilentlyContinue
                break
            }
        }
    }
}

function Resolve-Version {
    $pattern = '^v?(?<Major>[0-9]+)\.(?<Minor>[0-9]+)\.(?<Patch>[0-9]+)(?:\.(?<Revision>[0-9]+))?(?<Suffix>-[0-9A-Za-z]+(?:\.[0-9A-Za-z]+)*)?$'
    $v = $Version
    if (-not $v) {
        $tags = @(& git -C $Repo tag --points-at HEAD)
        $v = $tags | Where-Object { $_ -match $pattern } | Select-Object -First 1
        if (-not $v) { $v = '0.0.0-dev' }
    }
    if ($v -notmatch $pattern) { throw 'Version must look like 0.1.0, 0.1.8.1, 0.2.0-rc1 or 0.2.0-rc.1.' }
    $v = $v -replace '^v',''
    $revision = if ($Matches.ContainsKey('Revision')) { $Matches.Revision } else { '0' }
    $parts = @($Matches.Major,$Matches.Minor,$Matches.Patch,$revision)
    foreach ($part in $parts) {
        if ([long]$part -gt 65535) { throw 'Numeric version components must fit Windows version fields.' }
    }
    $suffix = if ($Matches.ContainsKey('Suffix')) { $Matches.Suffix } else { '' }
    return @{ Text=$v; Numeric=($parts -join '.'); Major=$parts[0]; Minor=$parts[1]; Patch=$parts[2]; Revision=$revision; Suffix=$suffix }
}

function Invoke-Build([switch]$Draft) {
    Require-BuildTools
    Stop-BuildProcesses
    Sync-Tree
    $server = Join-Path $Tree 'src\node\local-assistant\llama\llama-server.exe'
    if (-not (Test-Path -LiteralPath $server)) {
        $zip = Get-VerifiedDownload $LlamaUrl $LlamaFile $LlamaSha
        Invoke-Logged 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $Tree 'src\node\local-assistant\scripts\install-llama.ps1'),'-Archive',$zip) $Tree 'llama'
    }
    $ver = Resolve-Version
    $env:RSTUDIO_VERSION_MAJOR = $ver.Major
    $env:RSTUDIO_VERSION_MINOR = $ver.Minor
    $env:RSTUDIO_VERSION_PATCH = $ver.Patch
    $env:RSTUDIO_VERSION_SUFFIX = $ver.Suffix
    $gwtArgs = if ($Draft) { @('draft') } else { @('-Dgwt.main.module=org.rstudio.studio.RStudioDesktop','build') }
    $modeFile = Join-Path $BuildRoot 'gwt-mode.txt'
    $mode = if ($Draft) { 'draft' } else { 'release' }
    $gwtChanged = @($script:SourceChanges | Where-Object { $_ -like 'src/gwt/*' }).Count -gt 0
    if ($gwtChanged -or -not (Test-Path $modeFile) -or (Get-Content $modeFile -Raw).Trim() -ne $mode) {
        Say 'building the IDE interface'
        if (Test-Path $modeFile) { Remove-Item -LiteralPath $modeFile -Force }
        Invoke-Logged (Join-Path $AntDir 'ant.bat') $gwtArgs (Join-Path $Tree 'src\gwt') 'gwt'
        Set-Content -LiteralPath $modeFile -Value $mode -Encoding ascii
    } else { Say 'IDE interface is current' }
    # Avoid configuring on every quick build: Electron's CMake configure copies
    # its sources afresh. Ninja observes synchronized changes itself.
    $configuration = "windows-workflow-2|$($ver.Text)|$ToolsRoot|$RHome|$env:GIT_COMMIT"
    $configFile = Join-Path $BuildRoot 'configuration.txt'
    if (-not (Test-Path (Join-Path $Build 'build.ninja')) -or
        -not (Test-Path $configFile) -or (Get-Content $configFile -Raw).Trim() -ne $configuration) {
        Say 'configuring MSVC, Ninja and the packaged desktop'
        $cmakeTools = $ToolsRoot.Replace('\','/')
        $cmakeR = $RHome.Replace('\','/')
        Invoke-DeveloperCommand @('cmake','-S',$Tree,'-B',$Build,'-G','Ninja','-DCMAKE_BUILD_TYPE=Release',
            '-DCMAKE_C_COMPILER=cl.exe','-DCMAKE_CXX_COMPILER=cl.exe','-DRSTUDIO_TARGET=Electron',
            '-DRSTUDIO_PACKAGE_BUILD=1','-DGWT_BUILD=OFF','-DGWT_COPY=ON',"-DRSTUDIO_TOOLS_ROOT:PATH=$cmakeTools","-DLIBR_HOME:PATH=$cmakeR", "-DRSTUDIO_FORK_VERSION=$($ver.Text)","-DRSTUDIO_GIT_REVISION_HASH=$env:GIT_COMMIT") 'configure'
        Set-Content -LiteralPath $configFile -Value $configuration -Encoding utf8
    }
    $electronPath = Select-String -LiteralPath (Join-Path $Build 'CMakeCache.txt') -Pattern '^ELECTRON_BINARY_DIR:INTERNAL=' | Select-Object -First 1
    if (-not $electronPath) { throw 'CMake did not configure an Electron desktop output.' }
    $desktop = $electronPath.Line.Substring($electronPath.Line.IndexOf('=') + 1)
    Copy-Directory (Join-Path $Tree 'src\node\desktop') $desktop @('/XO','/XD','node_modules','.webpack','out','/XF','build-info.ts','splash.html')
    # CMake's desktop dependency list covers TypeScript. Also invalidate the
    # package for native addons, styles, icons and webpack configuration edits.
    $desktopDirty = Join-Path $BuildRoot 'desktop-dirty.txt'
    if (Test-Path $desktopDirty) {
        Remove-Generated (Join-Path $desktop 'out')
    }
    # CMake's npx json command precedes npm run package on a fresh tree.
    # Install its tools first; use a lockfile stamp to avoid doing this on quick.
    $lock = (Get-FileHash -LiteralPath (Join-Path $desktop 'package-lock.json')).Hash
    $npmStamp = Join-Path $desktop 'node_modules\.workflow-lock'
    if (-not (Test-Path $npmStamp) -or (Get-Content $npmStamp -Raw).Trim() -ne $lock) {
        Invoke-Logged $Node @($NpmCli,'ci','--no-audit','--no-fund') $desktop 'desktop-dependencies'
        Set-Content -LiteralPath $npmStamp -Value $lock -Encoding ascii
    }
    Say "building the desktop and assistant ($Jobs parallel jobs)"
    Invoke-DeveloperCommand @('cmake','--build',$Build,'--parallel',"$Jobs") 'build'
    Set-Content -LiteralPath $npmStamp -Value $lock -Encoding ascii
    if (Test-Path $desktopDirty) { Remove-Item -LiteralPath $desktopDirty -Force }
}

function Require-Built {
    if (-not (Test-Path -LiteralPath (Join-Path $Build 'build.ninja'))) { throw 'Run .\rstudio full first.' }
}

function Copy-Runtime([string]$Root, [switch]$WithoutModel) {
    Require-Built
    Require-BuildTools
    $null = Assert-ChildPath $Root $BuildRoot
    foreach ($program in 'RStudio','R') {
        $programPath = Join-Path $Root $program
        if ($RHome -ieq $programPath -or $RHome.StartsWith($programPath + '\',[StringComparison]::OrdinalIgnoreCase)) {
            throw 'RHome must be outside the runtime directories being replaced.'
        }
    }
    Stop-BuildProcesses
    # Only replace the program subtree. User data is outside it.
    $app = Join-Path $Root 'RStudio'
    Remove-Generated $app
    Invoke-DeveloperCommand @('cmake','--install',$Build,'--prefix',$app) 'stage'
    $r = Join-Path $Root 'R'
    Remove-Generated $r
    Copy-Directory $RHome $r @('/XF','unins*','/XD','tests')
    Copy-Item -LiteralPath (Join-Path $Repo 'package\windows\Start-RStudio.cmd') -Destination (Join-Path $Root 'Start-RStudio.cmd') -Force
    New-Item -ItemType Directory -Path (Join-Path $Root 'work\data\local-assistant\models'),(Join-Path $Root 'work\data\local-assistant\context') -Force | Out-Null
    $revision = (& git -C $Repo rev-parse HEAD).Trim()
    Set-Content -LiteralPath (Join-Path $app 'resources\app\SOURCE') -Value "Local RStudio fork. Source revision: $revision. Build instructions and licenses are included in this checkout." -Encoding utf8
    if (-not $WithoutModel) {
        foreach ($model in $Models) {
            $source = Join-Path $Cache $model.Name
            if (-not (Test-Path -LiteralPath $source)) { throw 'Model cache missing. Run fetch, or package -NoModel.' }
            $null = Get-VerifiedDownload '' $model.Name $model.Sha $model.Size
            Copy-Item -LiteralPath $source -Destination (Join-Path $Root ("work\data\local-assistant\models\" + $model.Name)) -Force
        }
    }
    Test-Runtime $Root
}

function Test-Runtime([string]$Root) {
    foreach ($file in 'Start-RStudio.cmd','R\bin\x64\R.exe','R\COPYING','RStudio\rstudio.exe',
        'RStudio\resources\app\COPYING','RStudio\resources\app\bin\rsession.exe',
        'RStudio\resources\app\bin\node\node.exe','RStudio\resources\app\bin\local-assistant\dist\server\main.js',
        'RStudio\resources\app\bin\local-assistant\dist\client\main.js','RStudio\resources\app\bin\local-assistant\llama\llama-server.exe',
        'RStudio\resources\app\www\rstudio\rstudio.nocache.js') {
        if (-not (Test-Path -LiteralPath (Join-Path $Root $file))) { throw "Incomplete runtime: $file is missing." }
    }
}

function Invoke-Package {
    Copy-Runtime $Dist -WithoutModel:$NoModel
    $zip = Join-Path $BuildRoot 'RStudio-portable.zip'
    # ZIP contains the program only for -NoModel; never stale models from an
    # earlier model-inclusive package. Work in dist remains untouched.
    $scratch = Join-Path $BuildRoot 'zip-stage'
    Remove-Generated $scratch
    New-Item -ItemType Directory -Path $scratch -Force | Out-Null
    foreach ($name in 'RStudio','R','Start-RStudio.cmd') {
        Copy-Item -LiteralPath (Join-Path $Dist $name) -Destination $scratch -Recurse -Force
    }
    if (-not $NoModel) {
        $modelRoot = Join-Path $scratch 'work\data\local-assistant\models'
        New-Item -ItemType Directory -Path $modelRoot -Force | Out-Null
        foreach ($model in $Models) {
            Copy-Item -LiteralPath (Join-Path $Dist ("work\data\local-assistant\models\" + $model.Name)) -Destination $modelRoot
        }
    }
    Invoke-Logged (Join-Path $env:SystemRoot 'System32\tar.exe') @('-a','-cf',$zip,'-C',$scratch,'.') $BuildRoot 'zip'
    Write-Checksum $zip
    Remove-Generated $scratch
    Say "portable app: $Dist; ZIP: $zip"
}

function Write-Checksum([string]$File) {
    $sha = (Get-FileHash -LiteralPath $File -Algorithm SHA256).Hash.ToLowerInvariant()
    [IO.File]::WriteAllText("$File.sha256", "$sha  $([IO.Path]::GetFileName($File))`n")
}

function Invoke-Installer {
    Require-Built
    # Installers must use the optimized desktop build, even after quick/dev.
    Invoke-Build
    $iscc = Install-Inno
    $ver = Resolve-Version
    Remove-Generated $Stage
    Copy-Runtime $Stage -WithoutModel
    $ggufs = @(Get-ChildItem -LiteralPath $Stage -Recurse -File -Filter '*.gguf*')
    if ($ggufs.Count) { throw 'Installer staging unexpectedly contains model files.' }
    New-Item -ItemType Directory -Path $InstallerDir -Force | Out-Null
    Invoke-Logged $iscc @("/DAppVersion=$($ver.Text)","/DNumericVersion=$($ver.Numeric)","/DStageDir=$Stage","/DOutputDir=$InstallerDir",(Join-Path $Repo 'package\windows\rstudio-ai.iss')) $Repo 'installer'
    $exe = Join-Path $InstallerDir ("RStudio-$($ver.Text)-setup.exe")
    if (-not (Test-Path -LiteralPath $exe)) { throw 'Installer compiler returned success but produced no setup EXE.' }
    Write-Checksum $exe
    Say "installer: $exe; checksum: $exe.sha256"
}

function Start-App {
    Test-Runtime $Dist
    $p = Start-Process -FilePath (Join-Path $Dist 'Start-RStudio.cmd') -WorkingDirectory $Dist -WindowStyle Hidden -PassThru
    Say "RStudio started (launcher PID $($p.Id)). Open Chat with Ctrl+Shift+T."
}

function Invoke-Test {
    Require-BuildTools
    Sync-Tree
    $assistant = Join-Path $Tree 'src\node\local-assistant'
    if ($Real) {
        foreach ($model in $Models) { $null = Get-VerifiedDownload '' $model.Name $model.Sha $model.Size }
        $env:RSTUDIO_TEST_REAL_MODEL_DIR = $Cache
    }
    Invoke-Logged $Node @($NpmCli,'ci','--no-audit','--no-fund') $assistant 'test-dependencies'
    Invoke-Logged $Node @($NpmCli,'run','typecheck') $assistant 'typecheck'
    Invoke-Logged $Node @($NpmCli,'test') $assistant 'test'
    Invoke-Logged 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $Repo 'package\windows\test-workflow.ps1'),'-BuildRoot',$BuildRoot) $Repo 'workflow-test'
    if ($Gui) {
        Test-Runtime $Dist
        Invoke-Logged $Node @((Join-Path $Repo 'package\windows\test-runtime.cjs'),$Dist,$BuildRoot) $Repo 'runtime-test'
    }
    if ($Installer) {
        Invoke-Logged 'powershell.exe' @('-NoProfile','-ExecutionPolicy','Bypass','-File',(Join-Path $Repo 'package\windows\test-installer.ps1'),'-BuildRoot',$BuildRoot) $Repo 'installer-test'
    }
}

function Invoke-Deploy {
    if ($Drive -notmatch '^[A-Za-z]:\\?$') { throw 'Use deploy -Drive E: (a drive letter).' }
    $root = $Drive.Substring(0,1).ToUpperInvariant() + ':\'
    if ($root -ieq [IO.Path]::GetPathRoot($env:SystemRoot)) { throw 'Cannot deploy to the Windows system drive.' }
    if (-not (Test-Path -LiteralPath $root)) { throw 'Target drive is not mounted.' }
    Test-Runtime $Dist
    $target = Join-Path $root 'RStudio'
    $marker = Join-Path $target '.rstudio-deploy'
    if ((Test-Path -LiteralPath $target) -and -not (Test-Path -LiteralPath $marker)) { throw 'Target exists and was not created by this workflow.' }
    $null = Assert-ChildPath $target $root
    New-Item -ItemType Directory -Path $target -Force | Out-Null
    foreach ($name in 'RStudio','R') {
        $dest = Assert-ChildPath (Join-Path $target $name) $target
        # Check nested links before mirroring removes old runtime files.
        if (Test-Path $dest) {
            if (@(Get-ChildItem -LiteralPath $dest -Recurse -Force | Where-Object { $_.Attributes -band [IO.FileAttributes]::ReparsePoint }).Count) { throw 'Deployment contains reparse points.' }
        }
        if ($name -eq 'RStudio') {
            $context = 'resources\app\bin\local-assistant\context'
            Copy-Directory (Join-Path $Dist $name) $dest @('/MIR','/XD',(Join-Path (Join-Path $Dist $name) $context),(Join-Path $dest $context),'/XF','system_prompt.txt')
            $prompt = 'resources\app\bin\local-assistant\system_prompt.txt'
            if (-not (Test-Path (Join-Path $dest $prompt))) { Copy-Item -LiteralPath (Join-Path (Join-Path $Dist $name) $prompt) -Destination (Join-Path $dest $prompt) }
            Copy-Directory (Join-Path (Join-Path $Dist $name) $context) (Join-Path $dest $context) @('/XC','/XN','/XO')
        } else {
            Copy-Directory (Join-Path $Dist $name) $dest @('/MIR')
        }
    }
    Copy-Item -LiteralPath (Join-Path $Dist 'Start-RStudio.cmd') -Destination $target -Force
    # Only seed missing model files; never copy a developer's preferences/history.
    $models = Join-Path $target 'work\data\local-assistant\models'
    New-Item -ItemType Directory -Path $models -Force | Out-Null
    foreach ($model in $Models) {
        $source = Join-Path $Dist ("work\data\local-assistant\models\" + $model.Name)
        if ((Test-Path $source) -and -not (Test-Path (Join-Path $models $model.Name))) { Copy-Item -LiteralPath $source -Destination $models }
    }
    Set-Content -LiteralPath $marker -Value 'RStudio portable workflow' -Encoding ascii
    Say "portable copy: $target\Start-RStudio.cmd"
}

function Invoke-Doctor {
    foreach ($entry in @(@('Build root',$BuildRoot),@('Dependencies',$ToolsRoot),@('R',$RHome),@('JDK 17',$JavaDir),@('Node build',$Node),@('Ant',(Join-Path $AntDir 'ant.bat')),@('Visual Studio locator',$VsWhere),@('Inno compiler',(Find-Inno)))) {
        $state = if ($entry[1] -and (Test-Path -LiteralPath $entry[1])) { $entry[1] } else { 'missing' }
        Write-Host ('{0,-22} {1}' -f $entry[0],$state)
    }
    if (Test-Path $VsWhere) {
        & $VsWhere -latest -products '*' -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath | Write-Host
    }
    Write-Host "Parallel jobs: $Jobs"
    Write-Host "Portable output: $Dist"
    Write-Host "Installer output: $InstallerDir"
    Write-Host "Logs: $Logs"
}

# Dot-source for focused safety/version tests without launching the workflow.
if ($MyInvocation.InvocationName -eq '.') { return }
try {
    Initialize-Toolchain
    switch ($Command) {
        'doctor' { Invoke-Doctor }
        'fetch' { Invoke-Fetch }
        'full' { Invoke-Build }
        'quick' { Invoke-Build -Draft }
        'package' { Invoke-Package }
        'installer' { Invoke-Installer }
        'run' { Start-App }
        'dev' {
            Invoke-Build -Draft
            $cachedModels = @($Models | Where-Object { Test-Path -LiteralPath (Join-Path $Cache $_.Name) }).Count -eq $Models.Count
            Copy-Runtime $Dist -WithoutModel:($NoModel -or -not $cachedModels)
            Start-App
        }
        'test' { Invoke-Test }
        'deploy' { Invoke-Deploy }
        'clean' {
            Stop-BuildProcesses
            foreach ($path in $Tree,$Build,$Stage,(Join-Path $BuildRoot 'zip-stage')) { Remove-Generated $path }
            Say 'generated builds removed; cache, tools, portable work and installer outputs retained'
        }
    }
} catch {
    Write-Host "FAILED: $($_.Exception.Message)" -ForegroundColor Red
    if ($script:LastLog) { Write-Host "Last log: $script:LastLog" }
    exit 1
}
