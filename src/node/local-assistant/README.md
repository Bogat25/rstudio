# Local R assistant

Select **Local model (offline)** in Global Options > Assistant or Project
Options > Assistant. This fork defaults to it. Open or hide Chat with
**View > Panes > Toggle Chat**, **Ctrl+Shift+T** on Windows/Linux or
**Cmd+Shift+T** on macOS. Customize the command in Tools > Modify Keyboard
Shortcuts. The shortcut also works in the question box. Hiding or popping out
the pane retains the conversation; New chat clears it. Select **None** to
stop the backend and remove Chat commands. Posit Assistant remains a separate
provider with its existing installation and sign-in behavior.

The first opening offers the model and picture reader download, about 3.4 GB,
once. Download model can resume it later. Stop pauses downloads or cancels an
answer. Files download to `.part`, resume with HTTP Range and receive their
final names only after matching the pinned SHA-256. Free space is checked
first. The model is outside the installation and is never in the installer.

After downloading, questions, course notes and pictures stay on the computer.
Both services bind to `127.0.0.1`. The CPU model port defaults to **18713**,
separate from RGui's 8713. No GPU or additional Node installation is needed.
The local provider bypasses Posit's update and authentication flow.

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

Upgrades preserve data. During an actual uninstall, NSIS removes the two
default downloaded models and partial files, preserving prompt, settings and
course notes. Models in custom directories or another Windows user's profile
need manual removal. Upgrade-triggered uninstall keeps the model cache.

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

The existing NSIS installer supports **Just me** without administrator rights
under `%LOCALAPPDATA%\Programs\RStudio`, and **All users** under Program Files
with elevation. Replacing an existing all-users installation can still ask
for elevation. A ZIP/per-user installation plus a user-installed R avoids
writing to Program Files. The installer type has not changed.

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

## Development on this Windows checkout

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
.\scripts\install-llama.ps1 -Archive 'D:\rgui-build\cache\llama-b11153-bin-win-cpu-x64.zip'
```

From the repository root, close the IDE before linking its DLL:

```powershell
$env:RSTUDIO_TOOLS_ROOT = 'D:\rstudio-tools'
cmd /d /c 'call "src\cpp\tools\windows-dev.cmd" && cmake --build src\build --parallel 8'
```

From `src/gwt`:

```powershell
$env:RSTUDIO_TOOLS_ROOT = 'D:\rstudio-tools'
$env:JAVA_HOME = 'C:\Program Files\Eclipse Adoptium\jdk-17.0.20.101-hotspot'
$env:PATH = 'D:\rstudio-tools\dependencies\common\node\22.22.2;D:\rstudio-tools\apache-ant-1.10.14\bin;' + $env:PATH
ant.bat draft
```

The Windows helper configures MSVC/CMake/Ninja. Dependencies are under
`D:\rstudio-tools`; the i18n helper's Python environment is
`src/gwt/tools/i18n-helpers/VENV`. Incremental GWT builds take about two minutes;
Node tests take a few seconds. From `src/node/desktop`, run
`npm start -- --automation-agent` (omit automation for normal use). The
development configuration is `src/build/conf/rdesktop-dev.conf`.

From `e2e/rstudio`, with an empty file at `$env:PW_ENV_FILE`:

```powershell
$env:RSTUDIO_TOOLS_ROOT = 'D:\rstudio-tools'
$env:R_HOME = 'D:\Program Files\R\R-4.6.1'
$env:RSTUDIO_CPP_BUILD_OUTPUT = (Resolve-Path '..\..\src\build').Path
$env:PW_SANDBOX_NO_SEED_CREDENTIALS = '1'
$env:PW_TRACE = 'off'
$env:PW_RSTUDIO_R_LIBS_SKIP_PREP = '1'
$env:PATH = 'D:\rstudio-tools\dependencies\common\node\24.21.0-installed;' + $env:R_HOME + '\bin\x64;' + $env:PATH
npm run test:desktop-dev -- tests/panes/local-assistant tests/preferences/assistant_provider_switch.test.ts --no-deps --workers=1 --retries=0
```

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
