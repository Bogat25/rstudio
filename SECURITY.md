# Security and private data

This fork's maintained focus is Windows Desktop with the local AI provider.
Old tags and inherited upstream services/platforms have no separate support
promise from this fork.

## Reporting

Use this repository's **Security > Report a vulnerability** if enabled. Otherwise,
open a minimal issue asking for a private contact route without including exploit
details, credentials, or personal data. No public security contact email is
configured here. Fork-specific reports should go to this repository.

Revoke or rotate any credential already exposed. Deleting a file does not remove
older commits, forks, cached pages, workflow artifacts, or downloaded releases.
History cleanup needs a separate coordinated action.

## Local provider boundary

The local provider uses loopback services and locally stored model files.
Dependency/model downloads contact their configured hosts. Inherited cloud AI
providers, publishing, packages, plugins, and user code have separate network
behavior. Select **Local model (offline)** and keep server hosts on loopback for
the intended local inference flow. The model endpoint is not a public
authenticated service.

Notes, attachments, clipboard images, prompts, generated code, R history, and
server logs can contain sensitive material. They are ordinary local data,
without application encryption. Review attachments and untrusted reference text;
generated suggestions need user review before execution.

Never publish real user profiles, `.Renviron`, `.Rhistory`, `.RData`, raw process
command lines, session/iframe URLs, memory dumps, or unreviewed Playwright traces.
The desktop iframe URL carries temporary authentication data. Prefer synthetic
fixtures and redact personal text and visible screenshot content.

See the dated [privacy audit](docs/fork/PRIVACY-AUDIT.md) for the repository scan's
scope and limits.
