# Windows installer releases

## What the workflow does

The fork's package version is independent of the bundled R version and inherited
RStudio versioning. Use one consistent fork version for the tag and installer.

[windows-installer.yml](../../.github/workflows/windows-installer.yml) runs on
pushed version tags such as `v0.1.0`, `0.1.0`, `v0.1.8.1`, or `v0.2.0-rc.1`. It does not
currently expose a manual dispatch entry point. A local tag alone does not start
a hosted build; the workflow must exist in the tagged commit pushed by the owner.

Versions may have three numeric components or a fourth Windows revision, with
an optional prerelease suffix. Each numeric component must be at most 65535.
The complete version is retained in desktop/session metadata and installer
names; Windows installer numeric metadata uses the fourth component, or zero
when omitted. For example, `v0.1.8.1` produces version `0.1.8.1`, while
`v0.2.0-rc.1` produces display version `0.2.0-rc.1` and numeric version `0.2.0.0`.

The Windows job installs the selected MSVC/RStudio dependencies, builds the
optimized C++/Electron/GWT desktop, checks versions and assistant behavior,
creates the Inno installer, and verifies packaged startup and the installed
launch/upgrade/uninstall lifecycle. Playwright dependencies are installed before
the launcher tests. Models are excluded; the workflow does not run real-model
inference by default. Protocol/workflow, installer lifecycle, and packaged
runtime checks run as separate steps with 10-, 20-, and 5-minute deadlines.
Silent setup and upgrade processes also have 10-minute deadlines; uninstall
and cleanup have 2-minute deadlines and stop only their own process trees.

A separate release job publishes `RStudio-<version>-setup.exe` and its
`.sha256` file. Versions with a suffix are prereleases. Actions also retains
the installer artifact for 90 days, subject to repository policy. It is uploaded
before verification so it remains available after a later runner failure;
check that the complete installer job passed before treating it as verified.
Build/test logs and screenshots are retained for 14 days after successful or
failed runs when the runner remains available. Failed isolated installer tests
retain their setup/upgrade/uninstall logs for the artifact upload.
The workflow uses GitHub's job token rather
than a custom personal access token.

Inherited `os-*` maintenance, cache-seeding, and test workflows skip automatic
schedule and push runs outside `rstudio/rstudio`. Their manual entry points
remain available. The fork's Windows installer tag workflow is independent of
these upstream services and schedules.

## Prepare a release

1. Commit the intended source, launcher, documentation, and workflow changes.
2. Build with the intended version and run the relevant checks in
   [BUILD-WINDOWS.md](../../BUILD-WINDOWS.md).
3. Exercise the shipped launcher in a custom path containing spaces, with
   bundled R, writable temp files, and offline Chat. Test install, upgrade,
   preservation, and uninstall without elevation using the isolated test identity.
4. Run real text/vision and native IDE regressions for assistant changes, and
   record skips or known issues in the [validation report](../../src/node/local-assistant/VALIDATION.md).
5. Review payload contents, original licenses, model exclusions, private data,
   version metadata, and checksums. The owner can then publish a unique version tag.

Rerunning a failed workflow uses that tag's original source. A fix committed later
needs a new version tag. Do not silently move published tags or assume re-running
publishing is safe when a release with the same tag already exists. The current
publisher uses `gh release create`, not an update-in-place release command.

## Package contents and verification

The installer contains the desktop, bundled R, bundled Node, local assistant,
CPU runtime, and notices. The launcher keeps writable preferences, packages,
history, reference material, and model data under `work`. No model weights are
included in the installer. The installer requests `PrivilegesRequired=lowest`.

To compare a downloaded installer against its adjacent checksum file:

```powershell
Get-FileHash -Algorithm SHA256 .\RStudio-0.1.0-setup.exe
Get-Content .\RStudio-0.1.0-setup.exe.sha256
```

Checksums detect a mismatch; they do not replace code signing or trusted release
provenance. Packages are currently unsigned. The inherited NSIS build is a
separate packaging route and is not the per-user Inno release described here.

Local results document local evidence. Inspect the actual hosted run and assets
before claiming a particular public release succeeded.
