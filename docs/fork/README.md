# RStudio AI documentation

These guides describe the independently maintained local-AI hard fork. Routine
synchronization with upstream RStudio is not planned. The release target covered
by the build and validation work is Windows x64 desktop.

## Users

- [Install and quick start](../../README.md).
- [Complete local assistant guide](../../src/node/local-assistant/README.md):
  chat, file/clipboard/plot attachments, note lookup, preferences, privacy, and errors.
- [Portable layout, installation, upgrade and uninstall](../../BUILD-WINDOWS.md).
- [Underlying IDE guide](../user/rstudio): inherited documentation, with upstream
  service/platform details that may not apply to this fork.

## Developers and maintainers

- [Architecture and source map](ARCHITECTURE.md).
- [Windows build and tests](../../BUILD-WINDOWS.md).
- [Tag releases and checksums](RELEASING.md).
- [Dated validation report](../../src/node/local-assistant/VALIDATION.md).
- [Privacy audit](PRIVACY-AUDIT.md), [security](../../SECURITY.md), and
  [contributions](../../CONTRIBUTING.md).

Examples use generic build/tool directories. Multi-GB models, test screenshots,
diagnostics, and user data belong outside this repository. Local validation is
distinct from the result of a hosted build for a particular release tag.
