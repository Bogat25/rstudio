# Windows build and installer

This guide covers the independent local-AI hard fork. Long-term synchronization
with upstream RStudio is not planned. See the [README](README.md),
[documentation index](docs/fork/README.md), and
[release guide](docs/fork/RELEASING.md) for the fork's scope and release process.

The fork uses the same command workflow as RGui. Open PowerShell in this
checkout and use `rstudio.cmd` (or `rstudio.ps1`). Source files are synchronized
to a separate directory without spaces; compilation does not alter your checkout.
The default build root is `D:\rstudio-build`, or `C:\rstudio-build` without D:.

```powershell
.\rstudio doctor
.\rstudio fetch -NoModel
.\rstudio full
.\rstudio package -NoModel
.\rstudio run
.\rstudio installer -Version 0.1.0
```

For everyday editing, `./rstudio dev` rebuilds with GWT's draft compiler,
stages the app, then starts it. It reuses verified cached models when available,
and creates no ZIP. `quick` just rebuilds.
`full` and `installer` use the optimized desktop GWT module. `installer`
rebuilds before staging, so it includes the current source edits.

## Prerequisites

The dependency versions come from the existing RStudio Windows build:
Visual Studio 2026 with MSVC 14.5 and the Windows SDK, its CMake/Ninja tools,
JDK 17, Ant 1.10.14, build Node 22.22.2 and bundled Node 24.21.0.
Install the RStudio dependencies using `dependencies/windows/install-dependencies.cmd`
if needed. `fetch` installs the pinned CPU llama.cpp server and Inno Setup 7.1.0;
it does not install Visual Studio, Java or the base RStudio dependencies.
Those downloads are resumable and checked against SHA-256 before use.

Choose a dedicated dependency directory, such as `C:\rstudio-tools`. The script
finds installed R in the registry and JDK 17 under Eclipse Adoptium. Paths in
the following command are examples; use your installed R location:

```powershell
.\rstudio.cmd full -BuildRoot C:\rstudio-build -ToolsRoot C:\rstudio-tools `
  -RHome 'C:\Program Files\R\R-4.6.1' -Jobs 8
```

The default job limit is eight. The first complete C++/Electron/GWT build takes
longer than incremental builds. Output and errors are recorded under `logs`.
Only processes belonging to this build root are stopped before relinking.

## Output and portable use

| Command | Result under the build root |
| --- | --- |
| `full`, `quick` | `build` and synchronized `tree` |
| `fetch` | verified `cache`, per-user compiler in `tools` |
| `package` | `dist`, `RStudio-portable.zip` and `.sha256` |
| `installer -Version 0.1.0` | `installer\RStudio-0.1.0-setup.exe` and `.sha256` |
| `test` | test output under `logs` |

The portable layout contains `RStudio`, a copied `R` runtime with its licenses,
and `Start-RStudio.cmd`. Always use the launcher: it selects the bundled R and
keeps preferences, session data, R packages and coursework
under `work` beside the launcher. Paths follow the launcher when the drive
letter changes. R's temporary directory must have a path without spaces.
The launcher uses `work\tmp` or its Windows short path when suitable; otherwise
it uses an `RStudio` folder under a writable user temp location. This also
supports custom installation folders on drives without 8.3 short names.
Open Chat with **Ctrl+Shift+T**.
Course reference files go in `work\data\local-assistant\context`; the editable
assistant prompt is `work\data\local-assistant\system_prompt.txt` after first use.

`fetch` without `-NoModel` also downloads the pinned model and picture reader
(about 3.4 GB). `package` includes these verified files for an offline USB copy;
`package -NoModel` omits them from the ZIP. The app offers its normal first-run
model download when needed. An installer always excludes GGUF files.

```powershell
.\rstudio fetch
.\rstudio package
.\rstudio deploy -Drive E:
```

Deployment creates `E:\RStudio` and updates only its program directories.
It preserves existing work, preferences, prompts and downloads. It refuses the
Windows system drive or an existing target lacking its deployment marker.

## Installation and upgrades

The Inno installer uses [`PrivilegesRequired=lowest`](https://jrsoftware.org/ishelp/topic_setup_privilegesrequired.htm): it installs for the current
user without requesting elevation. Its default location is the user's Programs
directory; you can choose another writable directory, including a USB stick.
Its application ID is distinct from upstream RStudio and RGui AI.

Upgrades preserve `work`, customized assistant prompts and bundled context.
Uninstall removes program files, the default downloaded `*.gguf`/`*.gguf.part`
files and scratch files. It preserves coursework, preferences and R history.
Models in a custom external directory remain the user's responsibility.
The existing upstream NSIS packaging remains available separately.

## Installers from version tags

[Windows installer](.github/workflows/windows-installer.yml) builds on pushed
tags such as `v0.1.1`, `v0.1.8.1`, `v0.2.0-rc.1` or `0.1.1`. It validates the version,
installs the Windows build dependencies, builds the optimized desktop, and
checks version conversion, assistant protocols, packaged startup and installer
installation, upgrades and removal. The installer includes R 4.6.1 and excludes
the model downloads.

Open **Actions > Windows installer > the successful tag run > Artifacts** and
download `RStudio-<version>-windows-x64`. Extract the ZIP to get the setup
EXE and its SHA-256 file. Artifacts are retained for 90 days, subject to the
repository's retention policy. A separate job creates a GitHub release with
the setup EXE and checksum; suffix versions are prereleases. The workflow uses
GitHub's job token and requires no custom personal access token. See the
[release guide](docs/fork/RELEASING.md) for tag requirements and publishing limits.

## Checks and cleanup

```powershell
.\rstudio test
.\rstudio test -Gui
.\rstudio test -Installer
.\rstudio clean
```

`test` runs the assistant's typecheck, protocol tests and workflow safety checks.
`test -Real` also exercises the verified model files in the download cache.
`test -Gui` starts the packaged app in isolation and verifies its R console,
bundled R and offline Chat resources when the packaged schema enables the local
provider. It reports Chat as skipped when the source disables it.
It uses the existing `e2e/rstudio` Playwright
dependencies; install those with `npm ci` first if needed. Its screenshot is
saved under `logs`. It uses Chromium CDP because the packaged Electron fuses
disable the Node inspector.
`test -Installer` additionally installs into a temporary folder containing
spaces, starts its shipped launcher, checks bundled R and temp-file creation,
upgrades, verifies preservation, then uninstalls. It compiles the same payload
with a unique test application ID and name, so an existing RStudio is left
in place. GUI checks use the existing Playwright dependencies mentioned above.
`clean` removes generated build and staging trees but keeps
downloads, compiler tools, installers and portable work.
