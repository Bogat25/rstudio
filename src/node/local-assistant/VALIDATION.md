# Windows implementation and validation, 2026-10-03

Documentation review, 2026-10-07: this is a dated implementation record for the
independent RStudio hard fork (formerly packaged as RStudio AI). The primary
release now uses the per-user Inno installer; earlier NSIS limitations below describe that separate inherited route.
See the later **Custom installation path startup correction, 2026-10-06** section
for the launcher correction; **RStudio branding and shortcut-only access,
2026-10-09** records the current build and installer evidence. Machine-specific
diagnostic directories are represented with audit-root placeholders.

Continued the unfinished local Chat provider and the repository handover.
RGui and the ignored handover files were
left unchanged. Work is committed locally on `main`; no GitHub writes were made.

## What was built

- Session: bundled-provider lookup, authenticated transport, provider-aware
  lifecycle and capabilities, an execution/file-mutation whitelist, live
  unsaved editor context, console context and graphics-device PNG export.
- GWT: local/default provider in global/project options, hide/show command and
  configurable shortcut, local settings, retained native Chat pane/pop-out
  behavior, provider-aware toolbar visibility and startup handling.
- Node: CPU server supervision, SSE decoding, cancellation/timeouts, course
  context, conversation history, explicit editor actions, model/reader offers,
  resumable verified downloads and proxy selection.
- Client: safe streaming Markdown, Unicode, selection/scroll preservation,
  drag buffering, editable context, picture normalization/clipboard/viewer,
  code-only copying and new-chat behavior.
- Distribution: CMake bundle/install target, pinned CPU server fetch with all
  DLLs/notices, no models in the installer, default-model uninstall cleanup,
  NEWS and user/developer documentation.

Commits: `5e846d9047 feat(chat): add bundled offline assistant provider` is the
provider foundation. `fae4c8c843 feat(chat): implement offline R conversations`
contains generation, UI, context, downloads and tests. This report accompanies
`build(chat): package and document the offline assistant`.

## Tests run and seen working

| Check | Result |
|---|---|
| Baseline build and isolated IDE launch | Passed; R console executed a readiness probe |
| Final C++ session and bundled Node CMake build | Passed |
| Final GWT draft build and desktop startup/typechecking | Passed |
| Node TypeScript and unit/integration tests | 21 passed; real-model test skips unless opted in |
| Local/Posit chat and assistant C++ tests | 271 tests in 15 suites passed |
| Local native-IDE Playwright suite | All 9 passed, including opt-in real CPU generation |
| Existing code-assistant provider-switch Playwright tests | All 3 passed |
| Real pinned CPU model and F16 reader | Streamed an R answer and an R-plot description |
| Windows process cleanup | Force-stopping only the isolated Electron process removed its model, backend and session |
| CMake assistant installation staging | 43 files, about 45.4 MiB; server/DLLs/notices present; no GGUF or tests |

The complete session unit run had **654 passes, 2 skips and 1 failure** among
657 tests. `SessionRTest.SynchronizeLocaleRepairsAClobberedLocale` also failed
when run alone: this R 4.6.1 installation returned `English_United States.1252`
where the existing test expected `C`. It was recorded and left outside this
feature's scope. All chat/assistant suites passed again on the final C++ build.

## Guide section 2 coverage

| Requirement | Evidence and limits |
|---|---|
| 2.1 Native pane, usable menus/toolbar, no local toolbar button | Native Chat integration; local visibility gating; IDE console used during streaming |
| 2.1 Menu/configurable shortcut, also from inside panel | Commands XML and command menu; Ctrl+Shift+T from question box hid/reopened the same transcript in Playwright. Custom reassignment was not exercised |
| 2.1 Closing hides and retains conversation | Hide/reopen and native pop-out/return passed; backend history also survived a second client connection |
| 2.1 Host usable during loading/download/generation | R ran during generation in the IDE. Startup supervision and downloads run outside R; concurrent R use during real loading/download was not separately measured |
| 2.1 Missing server/model, failure, crash or hang | Supervisor tests covered missing model, startup error with server message, bounded hung startup, restart after exit and child cleanup; request timeout/truncated stream status implemented |
| 2.1 Off setting suppresses backend/menu | Provider test switched to None and checked command invisibility and stop response |
| 2.2 Status, transcript, attachment strip, question/actions/menus | Exercised through native IDE; sender labels, accessible status, Ctrl+Enter, attachment/edit menus and explicit actions are implemented |
| 2.2 Send refusal, Stop cancellation or pause | Backend busy guard; GUI streaming cancellation under one second; resumable download pause test; Stop routes to both controllers |
| 2.2 Copy only fenced blocks; no-code message preserves clipboard | GUI clipboard assertions and backend extraction tests, including multiple/unfinished blocks |
| 2.2 To editor, single undo, new script, no autonomous execution | GUI insertion/undo/new-script checks; R variable remained absent; C++ whitelist rejects execution and arbitrary mutations |
| 2.2 Editable and trimmed script/console/error context | Live unsaved script, command plus error and recent console attached in IDE; trimming implemented; error extraction unit tests passed |
| 2.2 New chat clears transcript/history/pictures | GUI checks and centralized backend history reset |
| 2.3 Accents, Greek, mathematics, Chinese and emoji | Clipboard question, request, Markdown/code display, clipboard copy and editor insertion checked with `ő ű α β ≤ ∑ √ 中文 😀`; UTF-8 byte splitting/surrogate tests passed |
| 2.3 Font fallback | UI/code font stacks include Segoe UI, Symbol and Emoji. Glyph appearance on another Windows installation was not tested |
| 2.4 Streaming Markdown, code/inline/bold/italic/headings/bullets, dropped rules | Parser tests and GUI arithmetic/fence/rule/raw-HTML checks; DOM uses text nodes and retains raw Markdown separately |
| 2.5 Scroll follow, selection and physical drag buffering | Streaming GUI held its scroll and selection, buffered during mouse-down and flushed after mouse-up |
| 2.6 Own plot bitmap; file formats/multi-select/clipboard | Plot export/viewer passed; PNG/JPEG/BMP/GIF/TIFF and real clipboard PNG attachment passed in the IDE. File-manager clipboard file lists were not separately tested |
| 2.6 1600px scaling, EXIF orientation, PNG/JPEG threshold | GUI checked 2000px PNG scaling and orientation-6 JPEG rotation; shared normalization also applies to plots. High-entropy JPEG threshold was not separately asserted |
| 2.6 Empty-question prompt, captions/resizable viewer/Esc | Default picture question and image-first request verified; named thumbnails/viewer and Esc passed; resizing implemented in CSS |
| 2.6 Follow-up pictures, four newest, old-picture note | Request tests checked newest-first ordering, four-picture cap and replacement note; GUI sent five retained thumbnails as four request images |
| 2.6 Missing reader keeps text chat available | Reader-only dialog, decline, text answer and attachment decline passed in IDE |
| 2.7 First offer once, model outside installer | First-run decline persisted across backend restart; CMake staging contained no model |
| 2.7 Background progress, pause/resume/Range, SHA rename, disk/proxy | Local HTTP tests passed pause, Range resume, ignored Range and bad SHA cases. Actual cached assets and their copied user-data files matched all pinned hashes; free-space and proxy paths implemented |
| 2.7 Reader-only download/restart and offline use | Reader-only offer passed; download completion waits for old child exit and reloads with reader. Real model/vision requests worked against loopback without a cloud account |
| 2.8 Portable/per-user, relative paths, CPU/no GPU | Relative-path test passed; real requests used CPU `-ngl 0`; writable data is outside install. USB drive-letter relocation and i5/16GB performance were not measured |
| 2.8 Installer preserves notes/settings and removes model | Existing NSIS type retained; cleanup targets only known default model/partial filenames, preserves other data and skips upgrades. It uses the UAC user-instance callback; installer execution was not tested |
| 2.9 Honest reporting | Passed checks, untested behavior, environment failure and packaging limits are listed separately here |

The full nine-test run is under
`e2e/rstudio/test-results/2026-10-03T19-42-26-374Z`. Subsequent targeted
Unicode/plot and reader-only runs verify the final image-conversion changes.
The final targeted run passed both tests under
`e2e/rstudio/test-results/2026-10-03T19-58-52-480Z`.
Intermediate failures exposed startup timing, stale editor context and a CSP
restriction on fetching data URLs; those were corrected before committing.

## Built but not tested, blocked or skipped

- Full NSIS installer compilation/execution, upgrade/uninstall and UAC flows:
  no `makensis` was installed. Two official SourceForge archive attempts
  returned non-ZIP responses, so the assistant resource stage was verified
  directly instead. The NSIS cleanup change has source review only.
- Windows school-network environment/system proxy behavior, PAC/WPAD,
  integrated proxy authentication, disk-full behavior and a fresh 3.4 GB
  network download. Existing cached assets avoided downloading them twice.
- Live signed-in Posit chat, guardrails and account-dependent chat specs:
  no account secrets were loaded. Existing provider-switch GUI tests and
  Posit installation/selection/update/capability unit regressions passed.
- RStudio Server, Linux/macOS, Windows 10, a USB drive-letter change and
  target i5 memory/performance measurements. Windows desktop was the build target.
- PostgreSQL/ODBC suites were unavailable and unrelated to these tests.
- Custom model directories and other users' model caches need manual removal
  on uninstall; automatic cleanup is restricted to this user's default assets.

## Corrections to the plan

- The installer is already NsisMultiUser, with per-user and all-users modes;
  the plan's statement that it is exclusively per-machine is outdated.
- Source database reads can lag unsaved editor changes. Script attachment
  uses an asynchronous live editor-context event, without saving or R evaluation.
- Pane membership must refresh after preferences are persisted; starting it
  inside an early value-change event raced the session's provider value.
- The provider helper can be created before session information exists when
  used by the toolbar; initialization now waits for session information.
- Model port 18713 keeps this assistant separate from RGui's 8713. Test servers
  use separate ports and authentication; no agent service credentials were reused.
- The bundled output is self-contained, so deployment needs no node_modules.
  Windows session children inherit the existing job object; a new native
  model supervisor was unnecessary and the hard-stop check verified cleanup.
- Steps 3–6 were validated together as one working backend/client change
  because their imports, protocol and UI states are coupled.

## Build, run and administrator rights

See [README.md](README.md) for exact Node, C++, GWT, desktop, Playwright and
real-model commands, proxy settings, writable folders and the optional
hard-stop check. Use `src/build/rstudio-tests.bat --scope rsession` with
`GTEST_FILTER=LocalChat.*:*Chat*:*Assistant*` for the 271 C++ regressions.

The installer defaults to **All users**, requiring elevation for Program Files.
Choose **Just me** for `%LOCALAPPDATA%\Programs\RStudio` without administrator
rights, or use the ZIP and a user-installed R. Replacing an existing all-users
installation may still require elevation to remove it. This conclusion comes
from the current NSIS source; installer/UAC behavior was not exercised here.

## Fork installer and prerelease validation, 2026-10-04

The fork's [Windows build workflow](../../../BUILD-WINDOWS.md) now uses a
separate per-user Inno Setup installer with bundled R. The upstream NSIS
limitations above still apply to that separate packaging path.

The `0.2.0-rc.1` regression build completed in Release mode. Both session
version conversions now produce numeric components that R accepts, including
dotted prerelease suffixes. Validation passed:

- All three `SessionVersionTest.*` C++ regression tests.
- All nine Windows workflow tests, including dotted and malformed version tags.
- All 21 standard assistant protocol tests and TypeScript type checking;
  the optional real-model test was skipped in this run.
- All 21 installer tests covering installation, bundled R, upgrade preservation
  of coursework/settings/history/models, and uninstall cleanup.
- Packaged GUI startup, R execution using bundled R, and offline Chat loading.
- `actionlint` and PowerShell syntax checks for the version-tag workflow.

The new setup EXE and SHA-256 file were built locally. The tag workflow uploads
these files as an Actions artifact after its checks pass; it has not yet been
executed on GitHub. All changes and checks were performed locally.

## Custom installation path startup correction, 2026-10-06

The installed 0.1.5 application reported **R not found** even though its
bundled R files existed. The shipped launcher set TMPDIR, TMP and TEMP to
`work\tmp` under the installation folder. When that path contained spaces
and Windows did not supply a usable short name, R refused to initialize its
temporary directory. RStudio then displayed its generic R discovery error.
This agrees with [R's temporary-directory requirements](https://www.stat.ethz.ch/R-manual/R-devel/library/base/html/tempfile.html).

The exact dialog was reproduced in a private copy of the installed app, with
the original launcher. Instrumentation in that private copy recorded only
query metadata: the executable existed, but both the background and synchronous
R queries exited with status 2 and returned no result marker. Changing only
the temporary-directory location to a writable path without spaces made R
return its version successfully. Neither the installed application binary
nor user settings were instrumented.

The launcher now checks writable temp paths before opening RStudio. It prefers
portable `work\tmp`, using its Windows short path when suitable, and otherwise
selects an `RStudio-AI` subdirectory under a user temp location. All three R temp
variables use the selected path. Preferences, libraries, history and coursework
still stay under `work`; no machine environment settings or elevation are needed.

Release GUI checks now run the shipped launcher after relocation into a path
containing spaces, without supplying R_HOME or RSTUDIO_WHICH_R. They verify
the actual R console, bundled R.home(), creation of a temporary file through
R and offline Chat. The previous check started rstudio.exe with test-supplied
R and temp locations, so it missed the launcher failure.
Installer checks compile the production payload with a unique test ID and
name, allowing them to run alongside an existing installation, and exercise
the actual launcher inside the newly installed custom folder. The tag workflow
installs Playwright's CDP dependencies before these checks.

Validation of the rebuilt 0.1.6 package passed:

- Optimized desktop build and Inno Setup compilation.
- Three SessionVersionTest C++ checks.
- Assistant TypeScript checking and 21 protocol tests; one real-model test skipped.
- Nine Windows workflow checks.
- Four relocated packaged GUI checks, including writable R temp files.
- Twenty-two installer checks plus four installed GUI checks, covering custom-path
  startup, bundled R, offline Chat, upgrade preservation and uninstall cleanup.
  The installer test caller was **not elevated**; registration used HKCU.
- Installer and app manifests request `asInvoker`. Installer file version is
  0.1.6.0, its checksum matches, and staging contains the corrected launcher
  and no diagnostic instrumentation.
- Node syntax, PowerShell syntax, actionlint and Git whitespace checks.

Standalone Rscript emitted C.UTF-8 locale warnings but returned the bundled
version successfully; the earlier locale limitation remains separate.
Real model inference, clipboard images and the full session suite were not
repeated for this launcher correction. No hosted workflow or GitHub write occurred.

The existing 0.1.5 installation's launcher was also repaired after verifying
that it had no custom edits. Its original is retained as
`<installer-audit-root>\installed-launcher-original.cmd`.
The existing installation remained registered after the isolated tests.
Close its old error dialog and reopen through its shortcut to use the repair.

Evidence is under `<installer-audit-root>`: `original-launcher.log`,
`query-probe.jsonl`, `fixed-launcher.log`, `installer-build.log`,
`rebuilt-runtime.log`, `native-version-tests.log` and `installer-tests.log`.
The R query diagnostics contain flags, counts and exit status, without R
stdout/stderr or authentication values. The production installer contains no
diagnostic hooks.

Local installer: `D:\rstudio-build\installer\RStudio-AI-0.1.6-setup.exe`
(710,412,617 bytes), with an adjacent checksum file. SHA-256:
`32203299ea4438fc0b8921a60a470151d3c2ab55af0837abb72fa7cd483f85ef`.


## RStudio branding and shortcut-only access, 2026-10-09

The product is named **RStudio**, with no AI suffix. The installer, Windows
shortcuts, portable archive, deployment folder and tag-workflow artifact/release
names use that spelling. Internal executable/directory names and the existing
fork AppId remain stable so upgrades retain their installation and data.
In-place upgrades remove the old fork's named shortcuts only when its existing
HKCU registration matches the installation directory; a separate test identity
does not touch an existing user installation.

Chat always starts closed, including with saved visible-sidebar or popped-out
state. PaneManager excludes it from tab sets until the keyboard toggle requests
it. Ctrl+Shift+T (Cmd+Shift+T on macOS) opens/closes it, including from the local
client's question box. Conversation history survives hiding/reopening. Assistant
opening entries were removed from menus, toolbars and the command palette;
legacy toolbar preferences cannot restore a button. The presentation change
applies to both chat providers. The local provider's defaults and capabilities
remain available through Assistant preferences.

Local Windows 11 validation:

| Check | Result |
| --- | --- |
| Optimized GWT/C++/Electron desktop and Inno installer | Passed; installer and desktop product metadata are RStudio |
| Assistant TypeScript and protocol suite | 21 passed; optional real-model test skipped |
| Desktop and end-to-end TypeScript checking | Passed |
| Workflow helper checks and actionlint | 9 helper checks passed; workflow syntax passed |
| Actual packaged launcher after relocation | Passed: RStudio title, bundled R execution, writable temp files, initially hidden Chat despite saved layout/pop-out, no toggle buttons, repeated keyboard toggles |
| Native desktop Playwright suites | 11 passed; 1 optional real-model test skipped, covering conversations/images/editor actions, shortcut-only access, command palette and provider switching |
| Isolated install/upgrade/uninstall | 25 checks passed, plus installed GUI checks; custom path with spaces, HKCU registration, metadata, model exclusion, user-file preservation and cleanup |
| Installer checksum, Node/PowerShell syntax, whitespace and documentation links | Passed |

The installer test caller was unelevated. The packaged and installed tests use
the actual launcher without test-supplied R discovery paths. The existing user
installation was not upgraded or uninstalled. Supervisor failure tests now use
owned loopback fixture endpoints and empty model folders so an already-running
IDE or cached model cannot change their result.

Current local artifact: `<BuildRoot>/installer/RStudio-0.1.6-setup.exe`, with an
adjacent SHA-256 file. Earlier artifact names/checksums in this document describe
older builds. No model weights are included.

Real CPU inference, the full native session suite, non-Windows platforms and a
production-AppId upgrade from the old product name were not rerun in this pass.
The isolated upgrade test verifies preservation under a unique test identity;
legacy-name shortcut cleanup remains checked by source review and compilation.
Existing R locale warnings remain separate from IDE startup. No hosted workflow
was triggered and nothing was written to GitHub.

## Build automation and notification repair, 2026-10-10

The hosted [v0.1.8 installer run](https://github.com/Bogat25/rstudio-local-ai-fork/actions/runs/37917705576)
completed the optimized desktop and installer builds. The runner then lost
communication during the combined protocol/installer test step. Its detailed
job log and failure artifacts are unavailable, so the precise infrastructure
cause cannot be established from that run.

Recurring failures also came from inherited upstream schedules. The
[cache sentinel](https://github.com/Bogat25/rstudio-local-ai-fork/actions/runs/38015010429)
failed because this fork has Issues disabled; upstream E2E jobs also reported
service authentication failures and test timeouts. Automatic schedule/push
jobs in all 16 affected inherited workflows now skip outside `rstudio/rstudio`.
Their manual entry points remain available; the Windows tag build is separate.
The inherited stale action was updated to a pinned, supported version.

Installer verification now has separate bounded protocol/workflow, lifecycle,
and runtime steps. Silent install/upgrade/uninstall checks have process-tree
deadlines, including detached children. Compiler chatter remains in log files
without flooding the Actions console. Failed lifecycle tests retain their
isolated installer logs; the workflow uploads logs after successful or failed
checks and saves the installer before verification. The release job still
requires every verification step to succeed.

Local Windows validation:

- Assistant TypeScript and protocol suite: 21 passed; optional real-model test
  skipped.
- Workflow helper suite: 12 passed, including exit-code propagation, waiting
  for detached descendants, and terminating a stalled descendant at its deadline.
- Actionlint passed for all 17 changed workflows. All 29 workflow files parsed;
  guards were checked on 26 jobs, with existing triggers/selection conditions
  preserved and release verification still required.
- Isolated install/upgrade/uninstall suite: 25 passed, plus the installed
  launcher's GUI checks. The final run completed cleanup successfully with an
  unelevated caller, using the existing desktop stage and a unique test identity.

No new full native build, real-model inference, or non-Windows validation was
performed for these automation changes. The lost hosted runner has not been reproduced
locally. No hosted run was started and no GitHub settings, notifications,
workflows, tags, or releases were changed remotely.

## Four-part Windows release versions, 2026-10-10

The [v0.1.8.1 hosted run](https://github.com/Bogat25/rstudio-local-ai-fork/actions/runs/38036967687)
failed before compilation because its four-part tag was rejected by the
three-part PowerShell version validator. CMake also required three components,
so changing only the first validator would have moved the failure to configure.

Explicit versions and tags inferred from HEAD now accept an optional fourth
Windows revision, including prerelease suffixes. The full display version is
preserved, the installer numeric version uses the revision, and CMake passes
the revision through the session suffix for R's numeric version conversion.
Three-part releases retain a zero Windows revision. All numeric fields remain
limited to 65535.

The assistant typecheck and protocol suite passed (21 tests; optional real-model
test skipped). All 15 workflow checks passed, including explicit/inferred
`v0.1.8.1`, revision limits, invalid inputs, and CMake field preservation for
three- and four-part release/prerelease versions.

The optimized GWT/C++/Electron desktop and Inno installer built successfully
with version `0.1.8.1`. All four native `SessionVersionTest` cases passed,
including stable Windows revisions and dotted/compact prerelease numbers.
The desktop and setup executable retain `0.1.8.1` in their numeric and text
Windows version metadata. The setup is available locally at
`D:\rstudio-build\installer\RStudio-0.1.8.1-setup.exe`, with an adjacent checksum.

The isolated installer lifecycle suite passed all 27 checks, plus the installed
GUI checks, with an unelevated caller. This includes the complete registered
display version, numeric Windows revision, bundled R, initially hidden Chat,
keyboard toggles, preserved user content during upgrade, and uninstall cleanup.
The test registration and fixture were removed successfully. The installer
checksum, PowerShell syntax, and whitespace checks also passed. Non-Windows
platforms and real-model inference were not rerun.

Read-only inspection also confirmed that the inherited cache workflows skipped
the owner's latest push to `main`. No hosted workflow was started or changed
remotely. A new tag containing this fix is required; rerunning `v0.1.8.1` still
checks out the old validator.
