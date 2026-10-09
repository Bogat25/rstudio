# Local assistant architecture

The product name is **RStudio**. Internal executable names, directories, session
protocols, and preference keys retain their RStudio names for compatibility.
Assistant visibility is session-only: PaneManager excludes Chat from every tab
set until the toggle shortcut requests it, and removes it again when closed.
Saved sidebar visibility and satellite state cannot reopen it on startup. The
toggle command remains enabled for keyboard dispatch but has no menu, toolbar,
or command-palette control. This behavior applies to both chat providers.

## Request flow

The existing RStudio Chat surface hosts a bundled local provider. The R session
selects its provider and brokers authenticated communication with the bundled
Node backend. The client renders streaming replies inside the existing Chat
pane. llama.cpp runs as a separate CPU inference process.

```text
Global/project Assistant preference
  -> GWT Chat pane + explicit script/console/error/plot/image attachments
  -> authenticated R session bridge
  -> local Node backend: prompt + note selection + bounded history
  -> llama-server on 127.0.0.1:18713 -> local model and projector
  <- SSE stream -> safe Markdown client
  -> Copy code / To editor -> explicit user review and R execution
```

The local provider bypasses Posit's installation, update, and sign-in flow.
The inherited Posit provider retains its separate lifecycle. Switching providers
must update UI capabilities and stop owned local work appropriately. A local
backend request cannot use the cloud provider's broader execution or arbitrary
file-mutation capabilities.

## Source map

| Area | Responsibility |
| --- | --- |
| [SessionChat.cpp](../../src/cpp/session/modules/SessionChat.cpp) and related session code | Provider selection, bundled resource lookup, transport, lifecycle and capability restrictions |
| [ChatPresenter.java](../../src/gwt/src/org/rstudio/studio/client/workbench/views/chat/ChatPresenter.java) and Chat UI | Pane commands, attachments, live editor context, editor insertion |
| [User preference schema](../../src/cpp/session/resources/schema/user-prefs-schema.json) and Assistant preference panes | Global/project provider and model/context settings |
| [server/main.ts](../../src/node/local-assistant/src/server/main.ts), [protocol.ts](../../src/node/local-assistant/src/server/protocol.ts) | Backend entry point and message protocol |
| [server/assistant.ts](../../src/node/local-assistant/src/server/assistant.ts), [config.ts](../../src/node/local-assistant/src/server/config.ts) | Conversations, reference selection, configuration and prompt loading |
| [server/model.ts](../../src/node/local-assistant/src/server/model.ts), [stream.ts](../../src/node/local-assistant/src/server/stream.ts) | Owned server supervision, inference, streamed response parsing and cancellation |
| [server/download.ts](../../src/node/local-assistant/src/server/download.ts) | Resumable model/projector downloads, space and integrity checks, proxy selection |
| [client](../../src/node/local-assistant/src/client) | Streaming Markdown, conversation state, Unicode, image normalization, thumbnails and viewer |
| [local-assistant scripts](../../src/node/local-assistant/scripts), [CMakeLists.txt](../../src/node/local-assistant/CMakeLists.txt) | Pinned CPU runtime and bundled resource staging |
| [package/windows](../../package/windows), [rstudio.ps1](../../rstudio.ps1) | Relocatable launcher, portable package, Inno installer and lifecycle checks |
| [e2e/rstudio](../../e2e/rstudio) | Actual IDE and provider-switch regression coverage |

## Data and lifecycle

Context is bounded keyword-ranked text, read for each question from an explicit
directory or project/user context. It does not train the model or browse the
web. Pictures are normalized and a maximum of four recent images is included per
request. Text context is editable before sending; copying/inserting code never
implicitly evaluates it.

Both services bind to loopback by default. Healthy existing model servers may be
reused without claiming ownership. Owned children inherit the desktop session's
Windows kill-on-close job. Normal shutdown, provider changes, cancellation, and
hard-stop tests must respect that distinction.

The packaged launcher supplies bundled R and separate `work` configuration/data.
R requires a writable temp path without spaces; the launcher prefers portable
storage or a valid Windows short path and falls back to user temp when necessary.
Installed and relocated startup checks exercise this exact launcher.

## Related applications and fork policy

RGui AI uses native C/GraphApp; GUSEK AI uses native C++/SciTE with MathProg and
solver attachments. They share the local-model approach but use separate data,
processes, and default model ports (8713, 18713, and 28713).

This hard fork receives no automatic upstream fixes. Review inherited workflows
and cloud-service assumptions before enabling them. Dependency updates need
deliberate review, retained notices, and protocol/GUI/real-model validation.
Do not print authenticated iframe URLs or session tokens in diagnostics.
