import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { env, window } from 'vscode'
import type * as Vscode from 'vscode'
import { useBeaconCommands } from '../src/composables/use-beacon-commands'
import type { BeaconLeafTreeElement } from '../src/core/explorer/tree-data-provider'
import { formatBeaconIssue } from '../src/core/issues/format'
import { annotationStore } from '../src/core/store/annotation-store'
import { commands } from '../src/meta'
import type { BeaconAnnotation } from '../src/types/annotation'

const { commandHandlers, useDisposable } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()

  return {
    commandHandlers: handlers,
    useDisposable: vi.fn<(value: unknown) => unknown>(value => value),
  }
})

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      useDisposable,
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('../src/config'),
  () =>
    ({
      config: {
        enable: true,
        update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      },
    }) as unknown as Record<string, unknown>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      ConfigurationTarget: { Global: true },
      commands: {
        executeCommand: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        registerCommand: (
          command: string,
          handler: (...args: unknown[]) => unknown,
        ) => {
          commandHandlers.set(command, handler)
          return { dispose: vi.fn<() => void>() }
        },
      },
      env: {
        clipboard: {
          writeText: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        },
      },
      window: {
        showInformationMessage: vi.fn<() => Promise<void>>(() =>
          Promise.resolve(),
        ),
        showWarningMessage: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        showTextDocument: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      },
      workspace: {
        openTextDocument: vi.fn<() => Promise<{ uri: unknown }>>(() =>
          Promise.resolve({ uri: undefined }),
        ),
      },
    }) as unknown as Partial<typeof Vscode>,
)

interface DeferredUpdate {
  readonly state: unknown
  reject: (reason?: unknown) => void
  resolve: () => void
}

function tick() {
  return Promise.resolve()
}

function flushPromises() {
  return new Promise<void>(resolve => setImmediate(resolve))
}

function registeredCommand(command: string): (...args: unknown[]) => unknown {
  const handler = commandHandlers.get(command)

  if (!handler) {
    throw new Error(`Expected ${command} to be registered`)
  }

  return handler
}

function createAnnotation(
  overrides: Partial<BeaconAnnotation> = {},
): BeaconAnnotation {
  return {
    category: 'todo',
    column: 2,
    id: 'annotation-1',
    keyword: 'TODO:',
    keywordRange: {
      end: { character: 5, line: 11 },
      start: { character: 0, line: 11 },
    },
    languageId: 'typescript',
    line: 11,
    message: 'Replace deprecated parser',
    range: {
      end: { character: 30, line: 11 },
      start: { character: 0, line: 11 },
    },
    ruleId: 'todo',
    severity: 'information',
    source: 'visibleEditor',
    uri: 'file:///workspace/src/parser.ts',
    ...overrides,
  }
}

function createLeaf(annotation: BeaconAnnotation): BeaconLeafTreeElement {
  return {
    annotation,
    type: 'beacon',
  }
}

function createScannerAnnotation(): BeaconAnnotation {
  return {
    ...createAnnotation(),
    diagnostics: undefined,
    messageRange: {
      end: { character: 30, line: 11 },
      start: { character: 5, line: 11 },
    },
    owner: undefined,
    style: {
      backgroundColor: '#6f42c1',
      border: '1px solid transparent',
      borderRadius: '3px',
      color: '#ffffff',
      marker: 'keyword',
      overviewRulerColor: '#6f42c1',
    },
  }
}

async function expectInvalidIssueAnnotation(value: unknown) {
  useBeaconCommands({
    get: <T>() => undefined as T | undefined,
    update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  } as unknown as Vscode.Memento)

  await expect(
    registeredCommand(commands.createIssue)(value),
  ).resolves.toBeUndefined()

  expect(env.clipboard.writeText).not.toHaveBeenCalled()
  expect(window.showWarningMessage).toHaveBeenCalledWith(
    'Select a beacon in the Explorer to create an issue body.',
  )
}

describe('beacon command persistence', () => {
  beforeEach(() => {
    annotationStore.clear()
    commandHandlers.clear()
    useDisposable.mockClear()
    vi.mocked(env.clipboard.writeText).mockClear()
    vi.mocked(window.showInformationMessage).mockClear()
    vi.mocked(window.showWarningMessage).mockClear()
  })

  it('copies one formatted issue body and confirms success', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)
    const annotation = createAnnotation()

    await registeredCommand(commands.createIssue)(annotation)

    expect(env.clipboard.writeText).toHaveBeenCalledWith(
      formatBeaconIssue(annotation).body,
    )
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Issue body copied to clipboard.',
    )
  })

  it('copies the issue body when invoked from an Explorer beacon leaf', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)
    const annotation = createAnnotation()

    await registeredCommand(commands.createIssue)(createLeaf(annotation))

    expect(env.clipboard.writeText).toHaveBeenCalledWith(
      formatBeaconIssue(annotation).body,
    )
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Issue body copied to clipboard.',
    )
  })

  it('copies a scanner-shaped annotation with undefined optional fields', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)
    const annotation = createScannerAnnotation()

    await registeredCommand(commands.createIssue)(annotation)

    expect(env.clipboard.writeText).toHaveBeenCalledWith(
      formatBeaconIssue(annotation).body,
    )
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Issue body copied to clipboard.',
    )
  })

  it('copies a scanner-shaped Explorer leaf with undefined optional fields', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)
    const annotation = createScannerAnnotation()

    await registeredCommand(commands.createIssue)(createLeaf(annotation))

    expect(env.clipboard.writeText).toHaveBeenCalledWith(
      formatBeaconIssue(annotation).body,
    )
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Issue body copied to clipboard.',
    )
  })

  it('warns without changing the clipboard when no beacon is selected', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand(commands.createIssue)()

    expect(env.clipboard.writeText).not.toHaveBeenCalled()
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Select a beacon in the Explorer to create an issue body.',
    )
  })

  it('warns without changing the clipboard for an invalid Explorer item', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand(commands.createIssue)({ type: 'beacon' })

    expect(env.clipboard.writeText).not.toHaveBeenCalled()
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Select a beacon in the Explorer to create an issue body.',
    )
  })

  it('warns without changing the clipboard for a non-string owner', async () => {
    expect.hasAssertions()

    await expectInvalidIssueAnnotation({
      ...createAnnotation(),
      owner: 1,
    })
  })

  it('warns without changing the clipboard for a missing keyword range', async () => {
    expect.hasAssertions()

    const { keywordRange: _keywordRange, ...annotation } = createAnnotation()

    await expectInvalidIssueAnnotation(annotation)
  })

  it('warns without changing the clipboard for a missing source', async () => {
    expect.hasAssertions()

    const { source: _source, ...annotation } = createAnnotation()

    await expectInvalidIssueAnnotation(annotation)
  })

  it('propagates clipboard failures without showing success', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)
    const annotation = createAnnotation()
    const clipboardError = new Error('Clipboard unavailable')
    vi.mocked(env.clipboard.writeText).mockRejectedValueOnce(clipboardError)

    await expect(
      registeredCommand(commands.createIssue)(annotation),
    ).rejects.toThrow(clipboardError)

    expect(window.showInformationMessage).not.toHaveBeenCalled()
  })

  it('persists a clear-cache snapshot after the preceding save settles', async () => {
    const pendingUpdates: DeferredUpdate[] = []
    let persistedState: unknown
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: (_key: string, state: unknown) =>
        new Promise<void>((resolve, reject) => {
          pendingUpdates.push({ reject, resolve, state })
        }).then(() => {
          persistedState = state
        }),
    } as unknown as Vscode.Memento)

    annotationStore.markResolved('resolved', true)
    await tick()
    registeredCommand(commands.clearCache)()
    await tick()

    expect(pendingUpdates).toHaveLength(1)
    expect(pendingUpdates[0]?.state).toStrictEqual({
      ignoredIds: [],
      resolvedIds: ['resolved'],
    })

    pendingUpdates[0]?.resolve()
    await flushPromises()

    expect(pendingUpdates).toHaveLength(2)
    expect(pendingUpdates[1]?.state).toStrictEqual({
      ignoredIds: [],
      resolvedIds: [],
    })

    pendingUpdates[1]?.resolve()
    await flushPromises()

    expect(persistedState).toStrictEqual({
      ignoredIds: [],
      resolvedIds: [],
    })
  })

  it('continues persisting later snapshots after a failed save', async () => {
    const pendingUpdates: DeferredUpdate[] = []
    let persistedState: unknown
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: (_key: string, state: unknown) =>
        new Promise<void>((resolve, reject) => {
          pendingUpdates.push({ reject, resolve, state })
        }).then(() => {
          persistedState = state
        }),
    } as unknown as Vscode.Memento)

    annotationStore.markResolved('first', true)
    await tick()
    registeredCommand(commands.clearCache)()
    await tick()

    pendingUpdates[0]?.reject(new Error('Memento write failed'))
    await flushPromises()

    expect(pendingUpdates).toHaveLength(2)

    pendingUpdates[1]?.resolve()
    await flushPromises()

    expect(persistedState).toStrictEqual({
      ignoredIds: [],
      resolvedIds: [],
    })
  })
})
