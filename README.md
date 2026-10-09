# RStudio

**An RStudio Desktop fork with a local assistant for R, statistics, plots, and your own reference notes.**

This repository is an independent **hard fork** of RStudio. Local AI is the main
development goal. Long-term synchronization with the original repository is not
planned; this fork maintains its own features, fixes, dependencies, and releases.
It is not an official Posit product or distribution. Original notices and licenses
are preserved.

## Local AI in the workbench

- Stream answers in the native Chat pane while the editor and R console remain
  available. Press **Ctrl+Shift+T** to show or hide it without losing the conversation.
  It starts hidden on every launch and has no toolbar button or menu entry.
- Ask about your current unsaved script, console output, the last error, a plot,
  picture files, or clipboard images through explicit attachments.
- Search local course/reference notes using bounded keyword-ranked excerpts.
  This is local document lookup, not web search or model training.
- Read formatted Unicode answers, preview pictures, and ask image follow-ups.
- Copy code or insert it into the editor as an undoable action. You review and
  execute it yourself; the local backend cannot run R or arbitrarily mutate files.
- Install for the current user, with bundled R, or use a portable layout.

The default **Local model (offline)** provider runs **Qwen3.5-4B Q4_K_M** and its
multimodal projector through the bundled **llama.cpp CPU runtime**. It requires
no cloud AI account, API key, GPU, or separately installed Node. Initial downloads
need Internet access; normal local inference works offline afterward. Inherited
cloud integrations remain separate optional providers with their own data flows.

## Install and start

1. Choose `RStudio-<version>-setup.exe` and its SHA-256 file from a successful
   version-tag release in this repository, when available.
2. Run the installer and choose a writable destination. It installs for the
   current user without requesting administrator permissions. Packages are unsigned.
3. Launch **RStudio** through its shortcut. Portable copies use
   `Start-RStudio.cmd` beside the `RStudio` and `R` directories. Use this launcher
   to select bundled R and the intended data folders.
4. Open or close Chat with **Ctrl+Shift+T**. In
   **Global Options > Assistant**, select **Local model (offline)** if needed.
5. Accept the initial base-model and picture-reader download (about **3.4 GB**).
   Ask a question with **Send** or **Ctrl+Enter**.

The product name is **RStudio**, without an AI suffix. Existing installations keep
their upgrade identity and data; internal `RStudio` directories and
`Start-RStudio.cmd` remain compatible. Assistant access is through the keyboard
shortcut only (Cmd+Shift+T on macOS), including while the question box has focus.

Windows 11 x64 is the validated packaging target. The inherited source tree also
contains Linux, macOS, and Server code; those configurations have not been
validated for this fork's installer/local-assistant release. See
[validation status](src/node/local-assistant/VALIDATION.md) for measured checks
and remaining limitations.

## Reference notes and data

In the packaged launcher layout, editable assistant data lives under
`work/data/local-assistant`: `system_prompt.txt`, `context`, settings, and models.
A project's `.ai-context` directory can supply its own reference material. UTF-8
`.txt`, `.md`, `.R`, `.Rmd`, and `.csv` files are supported; excerpts are selected
for each question without an indexing step. Keep real notes and chat data outside
the repository. See the [assistant guide](src/node/local-assistant/README.md).

## Build from source

Install the MSVC, Java, Ant, R, and RStudio dependencies described in the build
guide, then run from this checkout:

```powershell
.\rstudio.cmd doctor -BuildRoot C:\rstudio-build -ToolsRoot C:\rstudio-tools
.\rstudio.cmd fetch -NoModel -BuildRoot C:\rstudio-build -ToolsRoot C:\rstudio-tools
.\rstudio.cmd full -BuildRoot C:\rstudio-build -ToolsRoot C:\rstudio-tools
.\rstudio.cmd test -BuildRoot C:\rstudio-build -ToolsRoot C:\rstudio-tools
.\rstudio.cmd installer -Version 0.1.0 -BuildRoot C:\rstudio-build -ToolsRoot C:\rstudio-tools
```

`0.1.0` is an example fork version. BuildRoot must be outside the source checkout
and contain no spaces or shell metacharacters. The installer rebuilds optimized
desktop resources, includes R, and excludes model weights. The app downloads
models on first use. A model-inclusive portable copy is available through the
build helper.

## Documentation

| Guide | Contents |
| --- | --- |
| [Documentation index](docs/fork/README.md) | Entry points for users and maintainers |
| [Local assistant guide](src/node/local-assistant/README.md) | Chat, attachments, context, configuration, data, component development |
| [Windows build and installer](BUILD-WINDOWS.md) | Prerequisites, commands, portable use, updates, tests |
| [Architecture](docs/fork/ARCHITECTURE.md) | Session/GWT/Node integration, source map, process boundaries |
| [Releases](docs/fork/RELEASING.md) | Tag workflow, downloadable installer, checksums, release gates |
| [Validation report](src/node/local-assistant/VALIDATION.md) | Checks actually run, skipped suites, known issues |
| [Privacy audit](docs/fork/PRIVACY-AUDIT.md) | Redacted repository review and its limitations |
| [Contributing](CONTRIBUTING.md) / [Security](SECURITY.md) | Bug reports, development, sensitive data |

The inherited [IDE user-guide sources](docs/user/rstudio),
[installation notes](INSTALL), and [reference documentation](docs/reference)
remain useful for the underlying workbench. They may describe upstream services
or platforms beyond this fork's supported release scope. Send fork-specific
issues to this repository rather than upstream support channels.

## License and origins

The fork is distributed under **AGPLv3**; see [COPYING](COPYING). Additional
software retains its own terms in [NOTICE](NOTICE) and component notices. Bundled
R, llama.cpp, and downloaded models have separate licenses. The original project
is [RStudio](https://github.com/rstudio/rstudio), maintained upstream by Posit.
