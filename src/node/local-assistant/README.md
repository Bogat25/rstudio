# Local R assistant

The `local` Chat provider uses this bundled package. It does not use the
Posit Assistant installation, update service or sign-in flow. The `posit`
and `none` providers remain available in global and project options.

The session accepts only context reads and explicit insertion into the
editor for this provider. Generation cannot execute R or write workspace
files. Model downloads and assistant settings belong in the user's RStudio
data directory, outside the installation.

## Development on this Windows checkout

The fastest package loop is `npm ci`, `npm run typecheck`, `npm test` and
`npm run build` from this directory. Reopen Chat after changing its backend;
reload its iframe after changing the client. The development session resolves
the package from this source directory when a bundled installation is absent.

For C++ changes, close the development IDE before linking `rsession.dll`:

```powershell
$env:RSTUDIO_TOOLS_ROOT = 'D:\rstudio-tools'
cmd /d /c 'call "src\cpp\tools\windows-dev.cmd" && cmake --build src\build --parallel 8'
```

From `src/gwt`, with `JAVA_HOME` pointing at the installed JDK 17 and the
pinned dependency Node directory on `PATH`, run `ant draft`. Incremental
draft builds currently take about two minutes. From `src/node/desktop`, run
`npm start -- --automation-agent`. The configured development session file is
`src/build/conf/rdesktop-dev.conf`.

From `e2e/rstudio`, select the built session and run the provider checks:

```powershell
$env:RSTUDIO_CPP_BUILD_OUTPUT = (Resolve-Path '..\..\src\build').Path
$env:PW_SANDBOX_NO_SEED_CREDENTIALS = '1'
$env:PW_TRACE = 'off'
npm run test:desktop-dev -- tests/panes/local-assistant/provider.test.ts --no-deps --workers=1
```

Use an empty `PW_ENV_FILE` for local checks so the harness does not load
account credentials. Disable tracing when inspecting Chat: the desktop
iframe URL carries a short-lived authentication value.

The first provider checkpoint supplies the authenticated client and protocol
transport. Model supervision, generation and the full conversation interface
are implemented in subsequent checkpoints.
