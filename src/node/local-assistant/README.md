# Local R assistant

This is the assistant guide for the independent **RStudio hard fork**.
Local AI is the fork's main goal; long-term upstream synchronization is not
planned. See the [repository README](../../../README.md),
[documentation index](../../../docs/fork/README.md), and
[validation report](VALIDATION.md) for installation, implementation status,
and known limits. The primary release target is Windows x64 desktop.

Select **Local model (offline)** in Global Options > Assistant or Project
Options > Assistant. This fork defaults to it. Open or hide Chat with
**Ctrl+Shift+T** on Windows/Linux or
**Cmd+Shift+T** on macOS. Customize the command in Tools > Modify Keyboard
Shortcuts. The shortcut also works in the question box. Chat starts hidden on
every launch, even if it was open or popped out in a previous version. No
toolbar button, menu entry, or command-palette action opens it. Hiding the pane
retains the conversation; New chat clears it. Select **None** to
stop the backend and remove Chat commands. Posit Assistant remains a separate
provider with its existing installation and sign-in behavior.

The first opening offers the model and picture reader download, about 3.4 GB,
once. Download model can resume it later. Stop pauses downloads or cancels an
answer. Files download to `.part`, resume with HTTP Range and receive their
final names only after matching the pinned SHA-256. Free space is checked
first. Models live in the selected writable data directory and are never included
in the installer. With the packaged launcher, that data directory is under `work`.

After downloading, questions, course notes and pictures stay on the computer.
Both services bind to `127.0.0.1`. The CPU model port defaults to **18713**,
separate from RGui's 8713. No GPU or additional Node installation is needed.
The local provider bypasses Posit's update and authentication flow.

This describes the local provider's inference traffic. Model/dependency downloads,
inherited cloud providers, R packages, and user code have separate network
behavior. Local files and logs are not encrypted by the application. Review
attachments before sending and redact logs/screenshots before sharing.

## Conversation and attachments

Enter adds a newline; Ctrl+Enter sends. Answers render Markdown while they
stream. Scroll up or select text without losing your place. Copy code copies
only fenced blocks from the last answer. To editor inserts them at the cursor
as one undoable action, or opens an R script if no editor is open. Neither
button runs code. The session rejects execution and arbitrary file mutation
requests from the local backend.

Attach offers the current unsaved script, recent console output, the last
error with its command, the current plot, picture files and clipboard images.
Text enters the question box for review and editing. Long scripts retain the
start; console attachments retain the end. The plot comes from the R graphics
device's bitmap export. PNG, JPEG, BMP, GIF and TIFF files support multiple
selection. Pictures are oriented, scaled to at most 1600 pixels and encoded
as PNG or JPEG. Click a thumbnail for a fitted, resizable viewer; Esc closes
it. Requests include at most four pictures, newest first; the transcript
retains the original attachments. A missing reader has a separate download
offer; declining keeps text chat available. Copy/Paste/Select all are also
in the panel's Edit menu.

## Data, settings and course material

Default writable data is `%LOCALAPPDATA%\RStudio\local-assistant` on Windows
(RStudio's user data directory elsewhere):

That is the direct-launch default. The fork's packaged `Start-RStudio.cmd`
selects `work\data\local-assistant` beside the launcher and keeps configuration
under `work\config`. Use the launcher for bundled R and portable data paths.

```text
models/Qwen3.5-4B-Q4_K_M.gguf
models/Qwen3.5-4B-mmproj-F16.gguf
system_prompt.txt
context/README.txt
settings.json
```

Global Options > Assistant exposes model/context directories, CPU threads,
picture token budget, thinking and history length. Empty directories use
defaults. Threads 0 lets llama.cpp choose; picture tokens default to 256,
thinking to off and history to 12 messages. Every request reads current
preferences, prompt and course files again.

The project's **`.ai-context/`** folder is used when it exists; otherwise the
user's **`context/`** folder is used. An explicit context directory takes
precedence. Accepted top-level files are `.txt`, `.md`, `.R`, `.Rmd` and `.csv`;
README files are excluded. Use descriptive names and one topic per file.
At most 12,000 characters are included, ranking shared words of four or more
characters first. The supplied student/statistics prompt is copied only when
absent, and remains editable across upgrades.

This is bounded lexical lookup of local files, without embeddings, model training,
web search, or automatic PDF extraction. Convert a relevant PDF excerpt to text
or attach a page image. Chat state is in memory rather than a persistent archive.

Advanced `settings.json` keys include `serverExe`, `port`, `startupTimeout`
(240 seconds), `requestTimeout` (120), `ctxSize` (8192), `maxTokens` (1024),
`temperature` (0.3), `topP` (0.9) and `contextMaxChars` (12000). Global Options
values override corresponding JSON keys. Relative paths in JSON and directory
preferences resolve against RStudio's resource home, `<install>/resources/app`
on Windows, rather than the working directory. Leave `serverExe` unset to
use the bundled server after a USB drive-letter change. For portable data,
set `RSTUDIO_DATA_HOME` at launch to a folder on the stick, and
`RSTUDIO_CONFIG_HOME` there too for preferences. Use relative model/context
preferences, for example `../../../assistant-data/models`.

The primary fork release uses the per-user Inno installer, described in
[BUILD-WINDOWS.md](../../../BUILD-WINDOWS.md). Upgrades preserve writable `work`
data. Uninstall removes model/partial and scratch files according to
[rstudio-ai.iss](../../../package/windows/rstudio-ai.iss), while preserving
coursework, preferences, and R history. Keep backups of custom material.
Models in an external custom directory need manual removal.

The inherited NSIS route is separate: its cleanup targets the two default model
filenames and skips upgrade-triggered removal. Its installer lifecycle has not
received the same execution coverage as the Inno release; see VALIDATION.md.

## Proxy and failures

Downloads honor `HTTP_PROXY`/`HTTPS_PROXY`, including lowercase forms, and
`NO_PROXY`. If neither is set on Windows, the backend reads the user's HKCU
Internet Settings `ProxyEnable`, `ProxyServer` and `ProxyOverride`. Loopback
traffic bypasses proxying. Static HTTP proxies are supported; automatic
PAC/WPAD and integrated proxy authentication have not been tested.

The model warms when Chat opens. Existing healthy servers on the configured
port are reused and are not killed by the assistant. Owned children run
hidden with the binary directory as their working directory and inherit the
session's Windows kill-on-close job. Missing files, early exits, truncated
streams and timeouts appear in the status line. Server stdout/stderr is in
`%TEMP%\rstudio-local-assistant\llama-<backend-pid>.log`; startup failures
include the last error/failed line and the log path.

The fork's Inno installer includes R and installs for the current user without
requesting elevation. Choose a writable folder and launch through its shortcut.
The inherited NSIS installer has separate per-user/all-users modes and may
request elevation for all-users installation. It is not the primary fork package.

## Pinned assets and licenses

CPU server: llama.cpp **b11153**, `llama-b11153-bin-win-cpu-x64.zip`, SHA-256
`569d19826f3fb00a3fc2df7bd68ab9ad33e5c0d6d69ce022b24372700cee7931`.
`scripts/install-llama.ps1` verifies it and places the executable, all DLLs
and license notices in `llama/`. CMake fetches it if absent.

Model URLs, sizes and hashes are in `src/server/download.ts`. Qwen3.5-4B
Q4_K_M: 2,740,937,888 bytes, SHA-256
`00fe7986ff5f6b463e62455821146049db6f9313603938a70800d1fb69ef11a4`.
F16 projector: 672,423,616 bytes, SHA-256
`cd88edcf8d031894960bb0c9c5b9b7e1fea6ebee02b9f7ce925a00d12891f864`.
This package follows RStudio's AGPL license. Runtime MIT notices for ws,
undici, UTIF and pako are in `dist/THIRD-PARTY-NOTICES.txt`; the CPU bundle
retains llama.cpp and LLVM OpenMP notices.

## Component development on Windows

The repository root now has the same build/portable/Inno Setup workflow as the
RGui fork. Use `.\rstudio doctor`, `.\rstudio full`, `.\rstudio dev` and
`.\rstudio installer -Version 0.1.0`. See [BUILD-WINDOWS.md](../../../BUILD-WINDOWS.md)
for prerequisites, outputs, USB deployment and installer checks. The commands
below remain useful for working on individual components in the source checkout.

From this directory:

```powershell
npm ci
npm run typecheck
npm test
npm run build
```

Switch the provider off/on after backend edits; reload the iframe after client
edits. The development session falls back to this source package. CMake builds
with the pinned build Node and stages bundled output without tests,
node_modules, source maps or GGUF files. Install the server from a cached ZIP:

```powershell
.\scripts\install-llama.ps1 -Archive 'C:\rstudio-build\cache\llama-b11153-bin-win-cpu-x64.zip'
```

From the repository root, close the IDE before linking its DLL:

```powershell
$env:RSTUDIO_TOOLS_ROOT = 'C:\rstudio-tools'
cmd /d /c 'call "src\cpp\tools\windows-dev.cmd" && cmake --build src\build --parallel 8'
```

From `src/gwt`:

```powershell
$env:RSTUDIO_TOOLS_ROOT = 'C:\rstudio-tools'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$env:PATH = 'C:\rstudio-tools\dependencies\common\node\22.22.2;C:\rstudio-tools\apache-ant-1.10.14\bin;' + $env:PATH
ant.bat draft
```

The Windows helper configures MSVC/CMake/Ninja. The dependency paths below are
examples; choose your own ToolsRoot. The i18n helper's Python environment is
`src/gwt/tools/i18n-helpers/VENV`. Incremental GWT builds take about two minutes;
Node tests take a few seconds. From `src/node/desktop`, run
`npm start -- --automation-agent` (omit automation for normal use). The
development configuration is `src/build/conf/rdesktop-dev.conf`.

From `e2e/rstudio`, with an empty file at `$env:PW_ENV_FILE`:

```powershell
$env:RSTUDIO_TOOLS_ROOT = 'C:\rstudio-tools'
$env:R_HOME = 'C:\Program Files\R\R-4.6.1'
$env:RSTUDIO_CPP_BUILD_OUTPUT = (Resolve-Path '..\..\src\build').Path
$env:PW_SANDBOX_NO_SEED_CREDENTIALS = '1'
$env:PW_TRACE = 'off'
$env:PW_RSTUDIO_R_LIBS_SKIP_PREP = '1'
$env:PATH = 'C:\rstudio-tools\dependencies\common\node\24.21.0-installed;' + $env:R_HOME + '\bin\x64;' + $env:PATH
npm run test:desktop-dev -- tests/panes/local-assistant tests/preferences/assistant_provider_switch.test.ts --no-deps --workers=1 --retries=0
```

To exercise an existing staged package instead of a development server, set
`PW_RSTUDIO_BIN` to `<build-root>\stage\RStudio\rstudio.exe` and `R_HOME` to
`<build-root>\stage\R`, then use `npm run test:desktop` with the same test
arguments. Keep the isolated-profile and tracing settings above. The executable
override avoids replacing or testing a user's installed IDE.

From this package, opt into a real CPU check, or set the same variable before
Playwright for its real-model IDE test:

```powershell
$env:RSTUDIO_TEST_REAL_MODEL_DIR = "$env:LOCALAPPDATA\RStudio\local-assistant\models"
node --test dist/test/real-model.test.js
```

An optional `RSTUDIO_TEST_REAL_PICTURE` path adds a real vision request. Keep
tracing off and avoid diagnostics that print iframe URLs: they carry the
desktop session's temporary authentication value. No account credentials
are needed for local tests.

Windows job cleanup can be checked with `npx tsx scripts/local-assistant-hard-stop.ts`
from `e2e/rstudio`, using the same R/build/model environment and
`PW_RSTUDIO_DEV=1`, `PW_CDP_PORT=9428`. This creates its own isolated profile,
validates process ancestry, force-stops only that Electron process and checks
that its model/backend/session disappear. It does not kill another IDE or RGui.
