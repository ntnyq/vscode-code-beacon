# Web and Virtual Workspace Testing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a browser-host E2E test that verifies AnnoPulse scans a VS Code Web virtual workspace.

**Architecture:** A browser-safe test module is bundled separately and executed by `@vscode/test-web`. Its Node-only launcher opens the existing playground as the harness virtual workspace. The browser test uses only VS Code APIs and confirms the scanner publishes diagnostics to a `vscode-test-web` resource.

**Tech Stack:** TypeScript, tsdown, `@vscode/test-web`, VS Code Extension API, Vitest, pnpm.

## Global Constraints

- The browser-worker test imports only `vscode`; it must not use Node APIs, `fs`, `path`, shell commands, or local file URI assumptions.
- Use the official `@vscode/test-web` harness and its `vscode-test-web` virtual workspace scheme; do not hand-roll a file-system provider.
- Keep the desktop E2E runner intact and make the new Web E2E a separate script before adding it to the release gate.
- Bundle the web test runner into one file and keep `vscode` external.
- Every behavior starts with a failing focused command before implementation and ends with focused plus full verification.

---

### Task 1: Add a browser-safe Web test build and launcher

**Files:**

- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `.gitignore`
- Create: `tsdown.web-test.config.ts`
- Create: `tests/web/run.ts`
- Create: `tests/web/extension-host.ts`

**Interfaces:**

- Produces `pnpm build:web-test`, generating `dist/web-test/extension-host.js`.
- Produces `pnpm test:web`, whose Node launcher calls `runTests` from `@vscode/test-web` with the extension root, bundle path, and `playground` as its folder workspace.

- [ ] **Step 1: Write a failing browser-worker test module and script contract**

Create `tests/web/extension-host.ts` with a placeholder exported `run` that throws `new Error('Web test is not wired')`. Add `test:web` and `build:web-test` scripts that reference `tests/web/run.ts` and `tsdown.web-test.config.ts`, then run:

```sh
pnpm test:web
```

Expected: FAIL because the Web harness dependency, bundle configuration, or launcher does not yet exist.

- [ ] **Step 2: Add the official harness and build configuration**

Install `@vscode/test-web` as a development dependency. Add `.vscode-test-web` to `.gitignore`. Create `tsdown.web-test.config.ts` with a browser-safe single entry:

```ts
export default defineConfig({
  clean: false,
  deps: { neverBundle: ['vscode'] },
  dts: false,
  entry: ['tests/web/extension-host.ts'],
  format: 'cjs',
  outDir: 'dist/web-test',
  platform: 'neutral',
})
```

Create `tests/web/run.ts` as Node-only code that resolves the repository root,
`dist/web-test/extension-host.js`, and `playground`, then calls:

```ts
await runTests({
  browserType: 'chromium',
  extensionDevelopmentPath: root,
  extensionTestsPath,
  folderPath: playgroundPath,
})
```

- [ ] **Step 3: Build and verify the harness reaches the test module**

Run: `pnpm build:web-test && pnpm test:web`

Expected: the browser starts its Web extension host and FAILS at `Web test is not wired`, proving the bundled test module executes.

- [ ] **Step 4: Commit the harness foundation**

Commit: `test: add web extension host harness`

### Task 2: Verify workspace scanning in the browser virtual workspace

**Files:**

- Modify: `tests/web/extension-host.ts`

**Interfaces:**

- Produces `export async function run(): Promise<void>` that activates AnnoPulse, scans the virtual workspace, and asserts its expected diagnostic.

- [ ] **Step 1: Make the test assert the desired Web behavior**

Replace the placeholder with a browser-worker test that uses only `vscode`:

```ts
const extension = vscode.extensions.getExtension('ntnyq.annopulse')
assert(extension, 'Expected AnnoPulse to be installed')
await extension.activate()

await vscode.workspace
  .getConfiguration('annopulse')
  .update('diagnostics.mode', 'workspace', vscode.ConfigurationTarget.Global)
const [documentUri] = await vscode.workspace.findFiles(
  'src/example.ts',
  undefined,
  1,
)
assert(documentUri, 'Expected virtual workspace example.ts')
assert.equal(documentUri.scheme, 'vscode-test-web')
await vscode.commands.executeCommand('annopulse.scanWorkspace')
```

Poll `vscode.languages.getDiagnostics(documentUri)` until it contains a
AnnoPulse TODO diagnostic. Do not import `node:assert`; implement a small
local assertion helper and a timeout loop using browser timers.

- [ ] **Step 2: Run the browser test and verify RED**

Run: `pnpm build:web-test && pnpm test:web`

Expected: FAIL at the new activation, virtual-scheme, or diagnostic assertion
until the harness/test compilation details are corrected.

- [ ] **Step 3: Implement the minimal browser-safe test**

Resolve only the bundle/export/harness details needed for the test to execute.
The final module must export `run`, import only `vscode`, use no `file` URI,
and emit a focused error if the expected diagnostic is absent.

- [ ] **Step 4: Verify GREEN and regressions**

Run: `pnpm build:web-test && pnpm test:web && pnpm test:unit && pnpm typecheck`

Expected: browser test proves a `vscode-test-web` workspace scan emits the
TODO diagnostic; unit and type checks remain green.

- [ ] **Step 5: Commit the virtual-workspace assertion**

Commit: `test: verify virtual workspace scanning in web host`

### Task 3: Gate releases on Web E2E and close the Phase 2 milestone

**Files:**

- Modify: `package.json`
- Modify: `README.md`
- Modify: `docs/plan.md`

- [ ] **Step 1: Extend the release gate**

Keep `test:e2e` as the desktop command. Add a combined `test:integration`
script that runs `test:e2e` then `test:web`, and make `release:check` invoke
that combined command after format, lint, and type checking. This keeps a
direct desktop command available while making both hosts mandatory for release
verification.

- [ ] **Step 2: Update public documentation and roadmap**

Document that automated checks cover both desktop and browser-host virtual
workspaces. In Phase 2, mark dedicated Web/Virtual Workspace automation
complete only after the Web command has passed.

- [ ] **Step 3: Run full release verification**

Run: `pnpm release:check && pnpm build && git diff --check`

Expected: formatting, lint, type checking, desktop E2E, browser E2E, build,
and whitespace checks pass.

- [ ] **Step 4: Commit docs and gate**

Commit: `test: verify web virtual workspace support`
