# Web and Virtual Workspace Testing Design

## Goal

Add a repeatable browser-host integration test that proves AnnoPulse can
activate and scan a workspace exposed through VS Code for the Web's virtual
file system.

## Scope

- Run the existing extension bundle in a real Web extension host using
  `@vscode/test-web`.
- Open the existing playground as the harness-provided `vscode-test-web`
  virtual workspace.
- From a browser-worker test module, activate AnnoPulse, configure workspace
  diagnostics, invoke the workspace scan command, and assert a TODO diagnostic
  is published for a virtual-scheme document.
- Keep the browser-worker test bundle free of Node APIs; only the outer Node
  runner may use paths and process APIs to start the harness.
- Provide package scripts, a separate test bundle, and ignored harness output
  so the test can run locally and in CI.

## Alternatives

1. Mock `FileSystemProvider` in Vitest or desktop Extension Host tests. This
   validates individual API calls but cannot prove Web-worker compatibility or
   the actual virtual-workspace host behavior. Rejected.
2. Sideload into vscode.dev. This is valuable manual acceptance testing but
   requires an externally hosted extension and is unsuitable as a repeatable
   automated gate. Rejected.
3. Use `@vscode/test-web` with its local browser server and virtual workspace.
   This is the recommended, official browser automation path and exercises
   both Web extension loading and virtual URI handling.

## Architecture

`tests/web/extension-host.ts` is a self-contained browser-worker test module.
It imports only `vscode`, activates `ntnyq.annopulse`, and uses
workspace-relative URI discovery rather than file paths. The assertion obtains
a `vscode-test-web` resource through `workspace.findFiles`, executes
`annopulse.scanWorkspace`, and waits until its AnnoPulse diagnostics
contain the expected TODO signal.

`tsdown.web-test.config.ts` bundles that module into one browser-safe output
under `dist/web-test/`, keeping `vscode` external. `tests/web/run.ts` is a
Node-only launcher that calls `@vscode/test-web` with the extension root, test
bundle, and playground folder. The harness supplies the virtual URI scheme;
the test must assert that scheme rather than assuming `file`.

Package scripts build and run this test separately from the desktop E2E suite.
The release check runs both E2E targets so a browser-host regression blocks the
same quality gate as a desktop-host regression. `.vscode-test-web` is ignored
because it is a downloaded harness cache.

## Error Handling and Test Isolation

- The browser worker uses polling only for eventual diagnostic publication and
  fails with a focused message if the extension, virtual workspace, resource,
  or diagnostic is unavailable.
- The Node launcher is responsible for the browser process and web-server
  lifecycle through the official harness; no test creates a runtime file
  system provider or depends on local disk URIs inside the extension host.
- Existing desktop E2E remains unchanged and continues to cover Notebook,
  CodeLens, and export behavior.

## Verification

The implementation must first demonstrate the new test command fails before
the harness/test bundle exists, then pass after the harness is wired. It must
also pass `pnpm test:unit`, `pnpm typecheck`, formatting, the desktop E2E, and
the new Web E2E. The roadmap can mark dedicated Web/Virtual Workspace
automation complete only after the browser-host test succeeds.

## References

VS Code documents `@vscode/test-web` as the browser-host test harness and
states that its folder workspace is exposed through a virtual file system.
[Web Extensions guide](https://code.visualstudio.com/api/extension-guides/web-extensions)
