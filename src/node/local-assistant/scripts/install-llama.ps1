param(
    [string]$Archive = '',
    [string]$Destination = (Join-Path $PSScriptRoot '..\llama')
)
$ErrorActionPreference = 'Stop'
$expected = '569d19826f3fb00a3fc2df7bd68ab9ad33e5c0d6d69ce022b24372700cee7931'
if (-not $Archive) {
    $Archive = Join-Path $env:TEMP 'llama-b11153-bin-win-cpu-x64.zip'
    if (-not (Test-Path -LiteralPath $Archive)) {
        Invoke-WebRequest -Uri 'https://github.com/ggml-org/llama.cpp/releases/download/b11153/llama-b11153-bin-win-cpu-x64.zip' -OutFile $Archive
    }
}
if ((Get-FileHash -LiteralPath $Archive -Algorithm SHA256).Hash.ToLowerInvariant() -ne $expected) {
    throw 'llama-server archive SHA-256 does not match the pinned build.'
}
$Destination = [IO.Path]::GetFullPath($Destination)
New-Item -ItemType Directory -Path $Destination -Force | Out-Null
$staging = Join-Path $env:TEMP ('rstudio-llama-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $staging | Out-Null
Expand-Archive -LiteralPath $Archive -DestinationPath $staging
Get-ChildItem -LiteralPath $staging -Recurse -File | Where-Object {
    $_.Extension -eq '.dll' -or $_.Name -eq 'llama-server.exe' -or $_.Name -like 'LICENSE*'
} | ForEach-Object { Copy-Item -LiteralPath $_.FullName -Destination (Join-Path $Destination $_.Name) -Force }
if (-not (Test-Path -LiteralPath (Join-Path $Destination 'llama-server.exe'))) { throw 'The archive has no llama-server executable.' }
Invoke-WebRequest -Uri 'https://raw.githubusercontent.com/ggml-org/llama.cpp/b11153/LICENSE' -OutFile (Join-Path $Destination 'LICENSE-llama.cpp')
Set-Content -LiteralPath (Join-Path $Destination '.llama-build') -Value "b11153 CPU x64`n$expected" -Encoding ascii
# Only the uniquely created temporary staging directory is removed.
$resolvedStaging = [IO.Path]::GetFullPath($staging)
$tempRoot = [IO.Path]::GetFullPath($env:TEMP).TrimEnd('\') + '\'
if (-not $resolvedStaging.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) { throw 'Unexpected staging directory.' }
Remove-Item -LiteralPath $resolvedStaging -Recurse -Force
Write-Output 'Pinned CPU llama-server installed and verified.'
