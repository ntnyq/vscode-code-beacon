# AI Action Telemetry Design

## Goal

Provide optional, privacy-preserving telemetry for Code Beacon AI actions only after both the extension-specific opt-in and VS Code global telemetry consent allow it.

## Required External Configuration

This feature requires a project-owned telemetry destination and credentials (for example, an Application Insights connection string) plus a retention/privacy policy. No endpoint or credential is configured in this repository, so implementation must not create network traffic or claim telemetry is active until those inputs are supplied.

## Proposed Contract

- Add `code-beacon.ai.telemetry.enabled`, default `false`, tagged `telemetry` and `usesOnlineServices`.
- Respect the setting **and** VS Code's `env.isTelemetryEnabled` / change event. A global opt-out always wins.
- Use VS Code's telemetry logger rather than calling a sender directly. Configure it to avoid unhandled-error collection and to send only allowlisted action outcomes.
- Emit only: action (`explain`, `generateFix`, `summarizeWorkspace`), outcome (`applied`, `cancelled`, `invalidProposal`, `rejected`, `failed`, `completed`), and a coarse integer duration bucket. Never emit URI/path, annotation IDs, text, source, prompt, model response, model identifier, user/machine/session identifiers, counts tied to a workspace, error text, or stack trace.
- The sender must be created only after required build/runtime configuration is present; dispose it with the extension lifecycle. Missing/invalid configuration is a silent no-op, not a fallback endpoint.
- Include `telemetry.json` documenting every event and property before release.

## Verification

Tests must prove that disabled extension telemetry, globally disabled VS Code telemetry, missing destination configuration, and configuration changes emit no network/send calls. Tests must also prove each emitted event contains only the allowlisted enum and duration bucket. A real telemetry destination is verified in a project-owned non-production environment, not by unit tests.
