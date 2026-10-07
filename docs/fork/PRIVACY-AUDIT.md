# Repository privacy review

Review date: **2026-10-07**. This report uses redacted finding categories and
repository-relative locations, without personal email addresses, credential
values, token fragments, or user data.

## Scope

The initial tracked inventory contained 8,423 files. The review checked tracked
working-tree bytes, including binary bytes, staged documentation changes, Git
author/committer metadata, and commit messages. The local repository includes
substantial inherited upstream history: **45,660 reachable commits** and
**159,727 unique blob versions** (5,076,148,975 bytes) were scanned before this
documentation commit. Common token/private-key/credential patterns,
maintainer-email matches, home/workspace paths, and selected UTF-16 encodings
were included.

## Current-tree findings and changes

- No live credential or personal mailbox belonging to the local maintainer was
  identified in the current tracked content.
- `src/cpp/core/system/CryptoTests.cpp` contains inherited cryptographic test
  fixtures, including private-key markers. These are test data, not newly
  identified maintainer credentials; fixture bytes are not repeated here.
- The credential-shaped match in `RemoteServer.java` is an RPC method-name
  constant, not an API credential.
- Other home-path matches are inherited templates, test fixtures, source
  comments, CI paths, or upstream documentation. Existing attribution/contact
  addresses were retained.
- Machine-specific audit directories in validation notes were generalized.
  Public usage/build examples no longer describe the maintainer's workstation.
- Added ignore rules for private profiles/reference folders, R state,
  environment files, model weights/partials, credential containers, and dumps.
- Replaced upstream support/CLA instructions with fork contribution guidance.
  Issue templates now request synthetic redacted reproductions and do not
  route fork requests into an upstream project board or support forum.

## History and limitations

**The inherited history is not certified clean.** One historical version of
`src/node/desktop/forge.config.js`, associated with upstream commit `d7af5eb60cc2`
(2022-01-06), contains a literal macOS signing-password candidate and an account
identifier. It predates this fork, was authored by someone else, and is absent
from the current tree. It did not match the known placeholder literals used in
the check. Its validity was **not tested** and the value is not reproduced here.
Treat it as an unresolved historical credential candidate, not a confirmed live
credential or a leak of the current maintainer's account. A separate older Forge
candidate is an explicit placeholder.

Other historical token-shaped findings occur in the upstream secret-scanner's
documented example fixtures (`git_hooks/secrets/test/README.md`). Private-key
markers also occur in cryptographic tests and header-detection/examples; RPC
method-name constants produced assignment-pattern false positives. These were
classified without printing their values. Environment-file candidates are the
inherited E2E example and 1Password-reference templates, not a newly committed
maintainer profile.

The configured Git identity and HEAD author's historical identities use public
no-reply mailboxes; no personal mailbox matched those maintainer identities.
Upstream contributor addresses were not classified as the fork maintainer's data.

No public history was rewritten, and no GitHub write was performed. Git author
and committer identity remains public, including no-reply identities; changing
a current file does not change old commit metadata.

Pattern scanning is not a guarantee of absence. It does not OCR all inherited
screenshots, inspect every compressed PDF or encrypted file, identify arbitrary
custom-format secrets, or establish that every contributor identity is private.
The scope is locally reachable refs, excluding unreachable/remote-only objects,
forks/caches, Actions logs/artifacts, and published binaries. Ignored local files
are outside the tracked public-tree inventory.

Before publishing, inspect staged content and Git identity privately, review
screenshots and release payloads, and keep real notes/user profiles outside Git.
Do not print authenticated iframe URLs, process command lines, or unreviewed
Playwright traces. If a real secret is found, follow [SECURITY.md](../../SECURITY.md).
