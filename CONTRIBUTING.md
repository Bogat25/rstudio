# Contributing to RStudio

This is an independent hard fork focused on local AI in the RStudio workbench.
Long-term upstream synchronization is not planned. This repository's maintainer
reviews its changes; upstream Posit contribution procedures and support channels
do not govern contributions to this fork.

## Issues and proposals

Use this repository's Issues tab for fork-specific bugs and feature requests.
Include the tag/commit, Windows version, installation type, provider, reproduction
steps, expected/actual behavior, and a minimal synthetic R example. For an image
issue, state whether it came from a file, plot, or clipboard and whether its
thumbnail appeared. Separate model-quality problems from transport/UI failures.

Redact personal paths, project names, notes, datasets, email addresses, tokens,
and session URLs from logs and screenshots. Do not share a real user profile or
Playwright trace without reviewing it. See [SECURITY.md](SECURITY.md).

## Development

Read the [source map](docs/fork/ARCHITECTURE.md),
[Windows build guide](BUILD-WINDOWS.md), and
[assistant guide](src/node/local-assistant/README.md). Keep local and cloud
providers isolated. Preserve authenticated session transport, the local
capability restrictions, responsive streaming/cancellation, Unicode, bounded
context/history, owned-process cleanup, and explicit user-controlled editor actions.

Run assistant typechecking/protocol tests and the native/GWT/GUI/installer checks
appropriate to the change. Use synthetic fixtures and isolated profiles. Record
missing prerequisites, skips, and remaining risks in the validation report; a
fake backend is not evidence of real model inference.

Keep commits focused and describe behavior clearly. Retain copyright and license
notices. Do not commit downloaded models, dependency caches, personal notes,
authentication material, user-state files, logs, or build artifacts.

External contributors may submit a normal GitHub pull request from their fork.
Maintainer publishing decisions are separate; this guide does not authorize
automated pushes, workflow dispatches, or releases.
