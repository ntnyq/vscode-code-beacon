# Create Issue Body Generator Design

## Goal

Turn one explicit Code Beacon annotation into a concise, GitHub-compatible issue title and Markdown body that the user can review and paste into any issue tracker, without authenticating to or writing to an external service.

## Scope

- Add the `code-beacon.createIssue` command and an Explorer context-menu entry for a selected beacon.
- Generate a deterministic title and Markdown body from a single annotation.
- Copy the body to the VS Code clipboard and show a success or actionable-selection message.
- Include optional Git metadata when a caller supplies it; the first command release does not trigger Git lookups.
- Document the command and mark only the Create Issue body generator item complete in Phase 3.

Out of scope: provider APIs, authentication, creating a remote issue, opening browser URLs, batch issue generation, AI-generated prose, or automatic Git resolution.

## Alternatives Considered

### 1. Call a GitHub, GitLab, or Azure DevOps API

This would create real issues but requires credentials, provider selection, network failure handling, and an irreversible external write. It is not appropriate for the first collaboration increment.

### 2. Open an untitled Markdown editor

This keeps the body editable but forces another manual copy step and makes command success less clear. It remains a useful future command variant.

### 3. Recommended: generate and copy a portable issue body

The command has a single, reversible effect: it writes formatted text to the local clipboard. The user can inspect, edit, and paste it into GitHub or any compatible tracker. A pure formatter makes exact output and escaping independently testable.

## Command Behavior

`code-beacon.createIssue` accepts a `BeaconAnnotation` from an Explorer item. It never guesses an annotation from the entire store.

- With an annotation, it writes the generated Markdown body to `env.clipboard` and displays `Issue body copied to clipboard.`
- Without a valid annotation, it does not alter the clipboard and displays `Select a beacon in the Explorer to create an issue body.`
- Clipboard write failures propagate through the command promise so VS Code can surface the failure; the extension does not claim success.

The command is contributed to the Command Palette and the Code Beacon Explorer beacon-item context menu. No provider URL is opened and no network API is used.

## Generated Content

The formatter returns:

```text
title: "TODO: Replace deprecated parser"

## Code Beacon

- **Category:** `todo`
- **Severity:** `information`
- **Rule:** `todo`
- **Location:** `file:///workspace/src/parser.ts:12:3`
- **Owner:** `alice`              # emitted only for an explicit nonempty owner

## Annotation

Replace deprecated parser

## Git

- **Author:** Ada Lovelace        # emitted only with supplied metadata
- **Date:** `2026-07-12T04:00:00.000Z`
- **Commit:** `a1b2c3d`
- **Summary:** Replace parser
```

The title is the keyword plus the first nonempty message line; if the message is empty it is the keyword alone. Dynamic values are normalized to one line where required and escaped for inline Markdown code spans. The annotation message and optional commit summary are rendered as plain body paragraphs after normalizing line endings, so no generated section can be broken by a value containing a Markdown fence or heading.

The location remains a one-based `uri:line:column` value, consistent with existing export and copy-link behavior. Git metadata is optional and deliberately supplied as a value rather than resolved inside the formatter or command.

## Architecture

```text
BeaconAnnotation (+ optional BeaconGitMetadata)
                 |
                 v
  core/issues/format.ts (pure title/body formatter)
                 |
                 v
useBeaconCommands command -> VS Code clipboard -> user paste
                 ^
                 |
Explorer context menu passes selected BeaconAnnotation
```

`src/core/issues/format.ts` has no VS Code import. `useBeaconCommands()` owns clipboard interaction and user-facing messages. The Explorer continues to validate its tree item before passing the annotation to the command, following the existing reveal/copy-link pattern.

## Testing

- Pure formatter tests cover a complete annotation, message-less annotation, explicit/whitespace owner, one-based location, special Markdown characters, multiline messages, and optional Git block omission/inclusion.
- Command tests cover registration, exact copied body, success notification, absent/invalid annotation warning, and no clipboard write on selection failure.
- Explorer tests cover contribution wiring from a beacon tree item to the command argument.
- Package metadata tests cover command and Explorer menu contributions; `src/meta.ts` is regenerated through `pnpm generate:meta`.
- Documentation tests remain covered by generation/format checks; release verification runs unit, desktop, Web, build, generator idempotence, and diff checks.

## Safety and Compatibility

No runtime dependencies, Node APIs, shell commands, web requests, or external writes are introduced. The feature works in desktop, Web, virtual, and untrusted workspaces because it relies only on a user-invoked VS Code command and clipboard API. Existing Markdown export output and Git-hover behavior remain unchanged.
