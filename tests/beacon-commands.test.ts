import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  env,
  LanguageModelError,
  LanguageModelTextPart,
  lm,
  window,
  workspace,
} from 'vscode'
import type * as Vscode from 'vscode'
import { useBeaconCommands } from '../src/composables/use-beacon-commands'
import type { BeaconLeafTreeElement } from '../src/core/explorer/tree-data-provider'
import { formatBeaconIssue } from '../src/core/issues/format'
import { annotationStore } from '../src/core/store/annotation-store'
import { commands } from '../src/meta'
import type { BeaconAnnotation } from '../src/types/annotation'
import { seedAnnotationStore } from './fixtures/annotation-store'

const {
  cancellationToken,
  chatMessageUser,
  commandHandlers,
  configState,
  createOutputChannel,
  outputChannel,
  outputText,
  summaryOutputChannel,
  summaryOutputText,
  rangeInstances,
  selectChatModels,
  textPart,
  uriParse,
  useDisposable,
  vscodeState,
  workspaceEdits,
  applyEdit,
  withProgress,
} = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const channelText: string[] = []
  const channel = {
    append: vi.fn<(value: string) => void>(value => {
      channelText.push(value)
    }),
    clear: vi.fn<() => void>(() => {
      channelText.length = 0
    }),
    dispose: vi.fn<() => void>(),
    show: vi.fn<(preserveFocus?: boolean) => void>(),
  }
  const summaryChannelText: string[] = []
  const summaryChannel = {
    append: vi.fn<(value: string) => void>(value => {
      summaryChannelText.push(value)
    }),
    clear: vi.fn<() => void>(() => {
      summaryChannelText.length = 0
    }),
    dispose: vi.fn<() => void>(),
    show: vi.fn<(preserveFocus?: boolean) => void>(),
  }
  const token = { isCancellationRequested: false }
  const ranges: { end: unknown; start: unknown }[] = []
  const edits: {
    replacements: {
      metadata: unknown
      newText: string
      range: unknown
      uri: unknown
    }[]
  }[] = []

  return {
    cancellationToken: token,
    chatMessageUser: vi.fn<(content: string) => unknown>(content => ({
      content,
      role: 'user',
    })),
    commandHandlers: handlers,
    configState: { aiEnabled: true },
    createOutputChannel: vi.fn<(name: string) => typeof channel>(name =>
      name === 'Code Beacon Workspace Summary' ? summaryChannel : channel,
    ),
    outputChannel: channel,
    outputText: channelText,
    rangeInstances: ranges,
    selectChatModels: vi.fn<() => Promise<Vscode.LanguageModelChat[]>>(() =>
      Promise.resolve([]),
    ),
    summaryOutputChannel: summaryChannel,
    summaryOutputText: summaryChannelText,
    textPart: vi.fn<(value: string) => void>(),
    uriParse: vi.fn<(value: string) => unknown>(value => ({ value })),
    useDisposable: vi.fn<(value: unknown) => unknown>(value => value),
    vscodeState: {
      documentLanguageId: 'typescript',
      documentText: 'const parser = deprecatedParser\n',
    },
    workspaceEdits: edits,
    applyEdit: vi.fn<() => Promise<boolean>>(() => Promise.resolve(true)),
    withProgress: vi.fn<
      (
        options: Vscode.ProgressOptions,
        task: (
          progress: Vscode.Progress<{ increment?: number; message?: string }>,
          token: Vscode.CancellationToken,
        ) => Thenable<unknown>,
      ) => Thenable<unknown>
    >((_options, task) =>
      task(
        {
          report:
            vi.fn<(value: { increment?: number; message?: string }) => void>(),
        },
        token as Vscode.CancellationToken,
      ),
    ),
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
        ai: {
          get enabled() {
            return configState.aiEnabled
          },
        },
        enable: true,
        update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      },
    }) as unknown as Record<string, unknown>,
)

vi.mock(import('vscode'), () => {
  class MockLanguageModelTextPart {
    public readonly value: string

    public constructor(value: string) {
      this.value = value
      textPart(value)
    }
  }

  class MockLanguageModelError extends Error {
    public override name = 'MockLanguageModelError'

    public static NoPermissions(message?: string) {
      return new MockLanguageModelError(message)
    }
  }

  class MockRange {
    public readonly end: unknown
    public readonly start: unknown

    public constructor(start: unknown, end: unknown) {
      this.start = start
      this.end = end
      rangeInstances.push(this)
    }
  }

  class MockWorkspaceEdit {
    public readonly replacements: {
      metadata: unknown
      newText: string
      range: unknown
      uri: unknown
    }[] = []

    public constructor() {
      workspaceEdits.push(this)
    }

    public replace(
      uri: unknown,
      range: unknown,
      newText: string,
      metadata?: unknown,
    ) {
      this.replacements.push({ metadata, newText, range, uri })
    }
  }

  return {
    ConfigurationTarget: { Global: true },
    LanguageModelChatMessage: {
      User: chatMessageUser,
    },
    LanguageModelError: MockLanguageModelError,
    LanguageModelTextPart: MockLanguageModelTextPart,
    Range: MockRange,
    ProgressLocation: { Notification: 15 },
    Uri: { parse: uriParse },
    WorkspaceEdit: MockWorkspaceEdit,
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
    lm: { selectChatModels },
    window: {
      createOutputChannel,
      showInformationMessage: vi.fn<() => Promise<void>>(() =>
        Promise.resolve(),
      ),
      showWarningMessage: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      showTextDocument: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      withProgress,
    },
    workspace: {
      applyEdit,
      openTextDocument: vi.fn<() => Promise<unknown>>(() =>
        Promise.resolve({
          getText: () => vscodeState.documentText,
          languageId: vscodeState.documentLanguageId,
          positionAt: (offset: number) => {
            const prefix = vscodeState.documentText.slice(0, offset)
            const lines = prefix.split(/\r\n?|\n/u)

            return {
              character: lines.at(-1)?.length ?? 0,
              line: lines.length - 1,
            }
          },
        }),
      ),
    },
  } as unknown as Partial<typeof Vscode>
})

const createLanguageModelError = LanguageModelError.NoPermissions

async function* responseStream() {
  yield new LanguageModelTextPart('First response chunk.')
  yield { value: 'Ignore this non-text part.' }
  yield new LanguageModelTextPart(' Second response chunk.')
}

async function* emptyTextStream() {}

async function* textResponseStream(...values: readonly string[]) {
  for (const value of values) {
    yield new LanguageModelTextPart(value)
  }
}

function deferred() {
  const deferredPromise = Promise.withResolvers<null>()

  return {
    promise: deferredPromise.promise,
    resolve() {
      deferredPromise.resolve(null)
    },
  }
}

function deferredValue<Value>() {
  return Promise.withResolvers<Value>()
}

interface DeferredUpdate {
  readonly state: unknown
  reject: (reason?: unknown) => void
  resolve: () => void
}

function tick() {
  return Promise.resolve()
}

function flushPromises() {
  const deferredPromise = Promise.withResolvers<null>()
  setImmediate(() => deferredPromise.resolve(null))
  return deferredPromise.promise
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

function createGenerateFixAnnotation(
  overrides: Partial<BeaconAnnotation> = {},
): BeaconAnnotation {
  return createAnnotation({
    keywordRange: {
      end: { character: 8, line: 0 },
      start: { character: 3, line: 0 },
    },
    line: 0,
    range: {
      end: { character: 31, line: 0 },
      start: { character: 0, line: 0 },
    },
    ...overrides,
  })
}

function generatedFixResponse(proposal: {
  original: string
  reason: string
  replacement: string
}): Vscode.LanguageModelChat {
  return {
    sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
      Promise.resolve({
        stream: (async function* stream() {
          yield new LanguageModelTextPart(JSON.stringify(proposal))
        })(),
        text: emptyTextStream(),
      }),
    ),
  } as unknown as Vscode.LanguageModelChat
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

async function expectInvalidExplainAnnotation(value: unknown) {
  useBeaconCommands({
    get: <T>() => undefined as T | undefined,
    update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
  } as unknown as Vscode.Memento)

  await registeredCommand('code-beacon.explain')(value)

  expect(window.showWarningMessage).toHaveBeenCalledWith(
    'Select a beacon in the Explorer to explain it.',
  )
  expect(workspace.openTextDocument).not.toHaveBeenCalled()
  expect(lm.selectChatModels).not.toHaveBeenCalled()
  expect(createOutputChannel).not.toHaveBeenCalled()
}

describe('beacon command persistence', () => {
  beforeEach(() => {
    annotationStore.clear()
    commandHandlers.clear()
    cancellationToken.isCancellationRequested = false
    configState.aiEnabled = true
    vscodeState.documentLanguageId = 'typescript'
    vscodeState.documentText = 'const parser = deprecatedParser\n'
    chatMessageUser.mockClear()
    createOutputChannel.mockClear()
    outputChannel.append.mockClear()
    outputChannel.clear.mockClear()
    outputChannel.dispose.mockClear()
    outputChannel.show.mockClear()
    outputText.length = 0
    summaryOutputChannel.append.mockClear()
    summaryOutputChannel.clear.mockClear()
    summaryOutputChannel.dispose.mockClear()
    summaryOutputChannel.show.mockClear()
    summaryOutputText.length = 0
    selectChatModels.mockReset()
    selectChatModels.mockResolvedValue([])
    textPart.mockClear()
    uriParse.mockClear()
    rangeInstances.length = 0
    useDisposable.mockClear()
    withProgress.mockClear()
    vi.mocked(env.clipboard.writeText).mockClear()
    vi.mocked(window.showInformationMessage).mockClear()
    vi.mocked(window.showWarningMessage).mockClear()
    vi.mocked(window.showTextDocument).mockClear()
    vi.mocked(workspace.openTextDocument).mockClear()
    workspaceEdits.length = 0
    applyEdit.mockReset()
    applyEdit.mockResolvedValue(true)
  })

  it('warns when explaining without a selected beacon', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')()

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Select a beacon in the Explorer to explain it.',
    )
    expect(workspace.openTextDocument).not.toHaveBeenCalled()
    expect(lm.selectChatModels).not.toHaveBeenCalled()
  })

  it('does not access a document or model while AI explanations are disabled', async () => {
    configState.aiEnabled = false
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(createAnnotation())

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Enable code-beacon.ai.enabled to explain annotations.',
    )
    expect(workspace.openTextDocument).not.toHaveBeenCalled()
    expect(lm.selectChatModels).not.toHaveBeenCalled()
  })

  it('rejects malformed due and expiry dates before Explain accesses VS Code data', async () => {
    expect.hasAssertions()

    await expectInvalidExplainAnnotation({
      ...createAnnotation(),
      dueDate: 1,
    })
    await expectInvalidExplainAnnotation({
      ...createAnnotation(),
      expiresDate: 1,
    })
  })

  it('reports document failures without selecting a model', async () => {
    vi.mocked(workspace.openTextDocument).mockRejectedValueOnce(
      new Error('Document unavailable'),
    )
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)
    const annotation = createAnnotation()

    await registeredCommand('code-beacon.explain')(annotation)

    expect(uriParse).toHaveBeenCalledWith(annotation.uri)
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Unable to open the annotation document to explain it.',
    )
    expect(lm.selectChatModels).not.toHaveBeenCalled()
  })

  it('reports when no Copilot model is available', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(createAnnotation())

    expect(lm.selectChatModels).toHaveBeenCalledWith({ vendor: 'copilot' })
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'No Copilot language model is available to explain this annotation.',
    )
    expect(createOutputChannel).not.toHaveBeenCalled()
  })

  it('clears stale output before a document-open failure without adding a heading', async () => {
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: responseStream(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(createAnnotation())
    vi.mocked(workspace.openTextDocument).mockRejectedValueOnce(
      new Error('Document unavailable'),
    )

    await registeredCommand('code-beacon.explain')(
      createAnnotation({ uri: 'file:///workspace/src/missing.ts' }),
    )

    expect(outputChannel.clear).toHaveBeenCalledTimes(2)
    expect(outputText).toHaveLength(0)
  })

  it('clears stale output before a model-selection failure without adding a heading', async () => {
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: responseStream(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(createAnnotation())
    selectChatModels.mockRejectedValueOnce(new Error('Model unavailable'))

    await registeredCommand('code-beacon.explain')(
      createAnnotation({ uri: 'file:///workspace/src/selection-failure.ts' }),
    )

    expect(outputChannel.clear).toHaveBeenCalledTimes(2)
    expect(outputText).toHaveLength(0)
  })

  it('clears stale output before reporting no model without adding a heading', async () => {
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: responseStream(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(createAnnotation())

    await registeredCommand('code-beacon.explain')(
      createAnnotation({ uri: 'file:///workspace/src/no-model.ts' }),
    )

    expect(outputChannel.clear).toHaveBeenCalledTimes(2)
    expect(outputText).toHaveLength(0)
  })

  it('streams text chunks to a lazy output channel without mutating the annotation state', async () => {
    const annotation = createAnnotation({ languageId: 'javascript' })
    const initialState = annotationStore.getState()
    vscodeState.documentLanguageId = 'typescriptreact'
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: responseStream(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(annotation)

    expect(withProgress).toHaveBeenCalledWith(
      {
        cancellable: true,
        location: 15,
        title: 'Explaining Code Beacon annotation',
      },
      expect.any(Function),
    )
    expect(chatMessageUser).toHaveBeenCalledTimes(2)
    expect(chatMessageUser).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Language: typescriptreact'),
    )
    expect(chatMessageUser).not.toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('Language: javascript'),
    )
    expect(model.sendRequest).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      cancellationToken,
    )
    expect(createOutputChannel).toHaveBeenCalledWith('Code Beacon AI')
    expect(outputChannel.clear).toHaveBeenCalledTimes(1)
    expect(outputChannel.append).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(annotation.uri),
    )
    expect(outputChannel.append).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('line 12, column 3'),
    )
    expect(outputChannel.append).toHaveBeenNthCalledWith(
      2,
      'First response chunk.',
    )
    expect(outputChannel.append).toHaveBeenNthCalledWith(
      3,
      ' Second response chunk.',
    )
    expect(outputChannel.show).toHaveBeenCalledExactlyOnceWith(true)
    expect(annotationStore.getState()).toStrictEqual(initialState)
    expect(env.clipboard.writeText).not.toHaveBeenCalled()
    expect(window.showTextDocument).not.toHaveBeenCalled()
  })

  it('reports model failures without retrying', async () => {
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.reject(createLanguageModelError('Denied')),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(createAnnotation())

    expect(model.sendRequest).toHaveBeenCalledTimes(1)
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Unable to explain this annotation.',
    )
  })

  it('replaces previous output with the new heading before a model failure', async () => {
    const firstAnnotation = createAnnotation()
    const failedAnnotation = createAnnotation({
      line: 23,
      uri: 'file:///workspace/src/failed-parser.ts',
    })
    const successfulModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: responseStream(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    const failedModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.reject(createLanguageModelError('Denied')),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels
      .mockResolvedValueOnce([successfulModel])
      .mockResolvedValueOnce([failedModel])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(firstAnnotation)
    await registeredCommand('code-beacon.explain')(failedAnnotation)

    expect(outputChannel.clear).toHaveBeenCalledTimes(3)
    expect(outputText).toHaveLength(1)
    expect(outputText[0]).toContain(failedAnnotation.uri)
    expect(outputText[0]).toContain('line 24, column 3')
    expect(outputText.join('')).not.toContain('First response chunk.')
  })

  it('ignores stale response chunks after a newer invocation replaces the output', async () => {
    const firstStreamCanYield = deferred()
    const firstStreamWaiting = deferred()
    const firstAnnotation = createAnnotation()
    const newerAnnotation = createAnnotation({
      line: 23,
      uri: 'file:///workspace/src/newer-parser.ts',
    })
    const firstModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            firstStreamWaiting.resolve()
            await firstStreamCanYield.promise
            yield new LanguageModelTextPart('Stale response chunk.')
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    const newerModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: emptyTextStream(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels
      .mockResolvedValueOnce([firstModel])
      .mockResolvedValueOnce([newerModel])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    const firstInvocation = registeredCommand('code-beacon.explain')(
      firstAnnotation,
    )
    await firstStreamWaiting.promise
    await registeredCommand('code-beacon.explain')(newerAnnotation)
    firstStreamCanYield.resolve()
    await firstInvocation

    expect(outputText).toHaveLength(1)
    expect(outputText[0]).toContain(newerAnnotation.uri)
    expect(outputText.join('')).not.toContain('Stale response chunk.')
    expect(outputChannel.show).not.toHaveBeenCalled()
  })

  it('suppresses a superseded document preflight after a newer invocation completes', async () => {
    const firstDocument = deferredValue<Vscode.TextDocument>()
    const firstAnnotation = createAnnotation()
    const newerAnnotation = createAnnotation({
      line: 23,
      uri: 'file:///workspace/src/newer-parser.ts',
    })
    const newerModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: textResponseStream('Newest response chunk.'),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    vi.mocked(workspace.openTextDocument).mockReturnValueOnce(
      firstDocument.promise,
    )
    selectChatModels
      .mockResolvedValueOnce([newerModel])
      .mockResolvedValueOnce([])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    const firstInvocation = registeredCommand('code-beacon.explain')(
      firstAnnotation,
    )
    await tick()
    await registeredCommand('code-beacon.explain')(newerAnnotation)
    firstDocument.resolve({
      getText: () => vscodeState.documentText,
    } as Vscode.TextDocument)
    await firstInvocation

    expect(outputText).toHaveLength(2)
    expect(outputText[0]).toContain(newerAnnotation.uri)
    expect(outputText[1]).toBe('Newest response chunk.')
    expect(window.showInformationMessage).not.toHaveBeenCalled()
    expect(window.showWarningMessage).not.toHaveBeenCalled()
  })

  it('stops appending response text when progress is cancelled between chunks', async () => {
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            yield new LanguageModelTextPart('First response chunk.')
            cancellationToken.isCancellationRequested = true
            yield new LanguageModelTextPart('Cancelled response chunk.')
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(createAnnotation())

    expect(outputText.join('')).toContain('First response chunk.')
    expect(outputText.join('')).not.toContain('Cancelled response chunk.')
    expect(outputChannel.show).toHaveBeenCalledExactlyOnceWith(true)
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Explanation cancelled.',
    )
  })

  it('disposes the lazy output channel with the command lifecycle', async () => {
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: emptyTextStream(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(createAnnotation())

    for (const [disposable] of useDisposable.mock.calls) {
      const dispose = (disposable as { dispose?: unknown }).dispose

      if (typeof dispose === 'function') {
        dispose()
      }
    }

    expect(outputChannel.dispose).toHaveBeenCalledTimes(1)
  })

  it('prevents a deferred stream from writing after lifecycle disposal', async () => {
    const streamCanYield = deferred()
    const streamWaiting = deferred()
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            streamWaiting.resolve()
            await streamCanYield.promise
            yield new LanguageModelTextPart('Disposed response chunk.')
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    const invocation = registeredCommand('code-beacon.explain')(
      createAnnotation(),
    )
    await streamWaiting.promise

    for (const [disposable] of useDisposable.mock.calls) {
      const dispose = (disposable as { dispose?: unknown }).dispose

      if (typeof dispose === 'function') {
        dispose()
      }
    }

    streamCanYield.resolve()
    await invocation

    expect(outputChannel.dispose).toHaveBeenCalledTimes(1)
    expect(outputText).toHaveLength(1)
    expect(outputText.join('')).not.toContain('Disposed response chunk.')
    expect(outputChannel.show).not.toHaveBeenCalled()
  })

  it('reports cancellation without exposing a model error', async () => {
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(
        () => {
          cancellationToken.isCancellationRequested = true
          return Promise.reject(createLanguageModelError('Cancelled'))
        },
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(createAnnotation())

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Explanation cancelled.',
    )
    expect(window.showWarningMessage).not.toHaveBeenCalled()
  })

  it('does not select a model, create output, or access a document for an empty workspace summary', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'No unresolved, non-ignored Code Beacon annotations are currently indexed to summarize.',
    )
    expect(lm.selectChatModels).not.toHaveBeenCalled()
    expect(createOutputChannel).not.toHaveBeenCalled()
    expect(workspace.openTextDocument).not.toHaveBeenCalled()
    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()
  })

  it('does not summarize or access VS Code document APIs while AI is disabled', async () => {
    configState.aiEnabled = false
    seedAnnotationStore(annotationStore, 'file:///workspace/src/parser.ts', [
      createAnnotation(),
    ])
    const initialState = annotationStore.getState()
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Enable code-beacon.ai.enabled to summarize workspace annotations.',
    )
    expect(lm.selectChatModels).not.toHaveBeenCalled()
    expect(createOutputChannel).not.toHaveBeenCalled()
    expect(workspace.openTextDocument).not.toHaveBeenCalled()
    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()
    expect(env.clipboard.writeText).not.toHaveBeenCalled()
    expect(annotationStore.getState()).toStrictEqual(initialState)
  })

  it('reports unavailable models and selection failures without reading documents or creating edits', async () => {
    seedAnnotationStore(annotationStore, 'file:///workspace/src/parser.ts', [
      createAnnotation(),
    ])
    selectChatModels.mockRejectedValueOnce(new Error('Model unavailable'))
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Unable to select a Copilot language model to summarize workspace annotations.',
    )
    expect(workspace.openTextDocument).not.toHaveBeenCalled()
    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()

    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'No Copilot language model is available to summarize workspace annotations.',
    )
    expect(workspace.openTextDocument).not.toHaveBeenCalled()
    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()
  })

  it('streams only text summary chunks from a bounded store snapshot without workspace mutations', async () => {
    const annotations = Array.from({ length: 101 }, (_, index) =>
      createAnnotation({
        id: `annotation-${index}`,
        line: index,
        message: `Annotation ${index}: ${'x'.repeat(200)}`,
        uri: `file:///workspace/src/${index.toString().padStart(3, '0')}.ts`,
      }),
    )
    seedAnnotationStore(
      annotationStore,
      'file:///workspace/src/annotations.ts',
      annotations,
    )
    const initialState = annotationStore.getState()
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: responseStream(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(lm.selectChatModels).toHaveBeenCalledWith({ vendor: 'copilot' })
    expect(withProgress).toHaveBeenCalledWith(
      {
        cancellable: true,
        location: 15,
        title: 'Summarizing Code Beacon workspace annotations',
      },
      expect.any(Function),
    )
    expect(chatMessageUser).toHaveBeenCalledTimes(1)
    const prompt = chatMessageUser.mock.calls[0]?.[0] ?? ''
    expect(prompt).toContain('<untrusted-workspace-annotations>')
    expect(prompt).toContain('"total":101')
    expect(prompt).toContain('"returned":100')
    expect(prompt).toContain('"truncated":true')
    expect(prompt.length).toBeLessThanOrEqual(13_000)
    expect(model.sendRequest).toHaveBeenCalledWith(
      expect.any(Array),
      undefined,
      cancellationToken,
    )
    expect(createOutputChannel).toHaveBeenCalledWith(
      'Code Beacon Workspace Summary',
    )
    expect(summaryOutputChannel.append).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('total: 101; returned: 100; sent:'),
    )
    expect(summaryOutputChannel.append).toHaveBeenNthCalledWith(
      2,
      'First response chunk.',
    )
    expect(summaryOutputChannel.append).toHaveBeenNthCalledWith(
      3,
      ' Second response chunk.',
    )
    expect(summaryOutputText.join('')).not.toContain(
      'Ignore this non-text part.',
    )
    expect(summaryOutputChannel.show).toHaveBeenCalledExactlyOnceWith(true)
    expect(workspace.openTextDocument).not.toHaveBeenCalled()
    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()
    expect(env.clipboard.writeText).not.toHaveBeenCalled()
    expect(annotationStore.getState()).toStrictEqual(initialState)
  })

  it('reports summary request failures without retrying or mutating the workspace', async () => {
    seedAnnotationStore(annotationStore, 'file:///workspace/src/parser.ts', [
      createAnnotation(),
    ])
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.reject(createLanguageModelError('Denied')),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(model.sendRequest).toHaveBeenCalledTimes(1)
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Unable to summarize workspace annotations.',
    )
    expect(workspace.openTextDocument).not.toHaveBeenCalled()
    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()
  })

  it('stops a Summary stream when progress is cancelled', async () => {
    seedAnnotationStore(annotationStore, 'file:///workspace/src/parser.ts', [
      createAnnotation(),
    ])
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            yield new LanguageModelTextPart('First summary chunk.')
            cancellationToken.isCancellationRequested = true
            yield new LanguageModelTextPart('Cancelled summary chunk.')
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(summaryOutputText.join('')).toContain('First summary chunk.')
    expect(summaryOutputText.join('')).not.toContain('Cancelled summary chunk.')
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Workspace summary cancelled.',
    )
    expect(workspace.openTextDocument).not.toHaveBeenCalled()
    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()
  })

  it('stops a Summary stream when superseded or disposed', async () => {
    const streamCanYield = deferred()
    const streamWaiting = deferred()
    seedAnnotationStore(annotationStore, 'file:///workspace/src/parser.ts', [
      createAnnotation(),
    ])
    const delayedModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            streamWaiting.resolve()
            await streamCanYield.promise
            yield new LanguageModelTextPart('Stale summary chunk.')
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    const newerModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({ stream: emptyTextStream(), text: emptyTextStream() }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels
      .mockResolvedValueOnce([delayedModel])
      .mockResolvedValueOnce([newerModel])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    const first = registeredCommand('code-beacon.summarizeWorkspace')()
    await streamWaiting.promise
    await registeredCommand('code-beacon.summarizeWorkspace')()
    streamCanYield.resolve()
    await first

    expect(summaryOutputText.join('')).not.toContain('Stale summary chunk.')
    expect(summaryOutputChannel.show).not.toHaveBeenCalled()

    const disposeStreamCanYield = deferred()
    const disposeStreamWaiting = deferred()
    const disposalModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            disposeStreamWaiting.resolve()
            await disposeStreamCanYield.promise
            yield new LanguageModelTextPart('Disposed summary chunk.')
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([disposalModel])

    const disposed = registeredCommand('code-beacon.summarizeWorkspace')()
    await disposeStreamWaiting.promise
    for (const [disposable] of useDisposable.mock.calls) {
      const dispose = (disposable as { dispose?: unknown }).dispose

      if (typeof dispose === 'function') {
        dispose()
      }
    }
    disposeStreamCanYield.resolve()
    await disposed

    expect(summaryOutputText.join('')).not.toContain('Disposed summary chunk.')
    expect(summaryOutputChannel.dispose).toHaveBeenCalledTimes(1)
  })

  it('keeps overlapping Explain and Summary output in their dedicated channels', async () => {
    const summaryStreamCanYield = deferred()
    const summaryStreamWaiting = deferred()
    seedAnnotationStore(annotationStore, 'file:///workspace/src/parser.ts', [
      createAnnotation(),
    ])
    const delayedSummaryModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            summaryStreamWaiting.resolve()
            await summaryStreamCanYield.promise
            yield new LanguageModelTextPart('Summary-only chunk.')
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    const explainModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: textResponseStream('Explain-only chunk.'),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels
      .mockResolvedValueOnce([delayedSummaryModel])
      .mockResolvedValueOnce([explainModel])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    const summary = registeredCommand('code-beacon.summarizeWorkspace')()
    await summaryStreamWaiting.promise
    await registeredCommand('code-beacon.explain')(createAnnotation())
    summaryStreamCanYield.resolve()
    await summary

    expect(outputText.join('')).toContain('# Code Beacon explanation')
    expect(outputText.join('')).toContain('Explain-only chunk.')
    expect(outputText.join('')).not.toContain('# Code Beacon workspace summary')
    expect(outputText.join('')).not.toContain('Summary-only chunk.')
    expect(summaryOutputText.join('')).toContain(
      '# Code Beacon workspace summary',
    )
    expect(summaryOutputText.join('')).toContain('Summary-only chunk.')
    expect(summaryOutputText.join('')).not.toContain(
      '# Code Beacon explanation',
    )
    expect(summaryOutputText.join('')).not.toContain('Explain-only chunk.')
  })

  it('preserves existing Explain output when Summary model selection fails or has no model', async () => {
    seedAnnotationStore(annotationStore, 'file:///workspace/src/parser.ts', [
      createAnnotation(),
    ])
    const explainModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: textResponseStream('Explanation remains visible.'),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels
      .mockResolvedValueOnce([explainModel])
      .mockRejectedValueOnce(new Error('Model unavailable'))
      .mockResolvedValueOnce([explainModel])
      .mockResolvedValueOnce([])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(createAnnotation())
    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(outputText.join('')).toContain('# Code Beacon explanation')
    expect(outputText.join('')).toContain('Explanation remains visible.')
    expect(summaryOutputText).toHaveLength(0)

    await registeredCommand('code-beacon.explain')(createAnnotation())
    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(outputText.join('')).toContain('# Code Beacon explanation')
    expect(outputText.join('')).toContain('Explanation remains visible.')
    expect(summaryOutputText).toHaveLength(0)
    expect(createOutputChannel).toHaveBeenCalledTimes(1)
  })

  it('preserves Explain output and does not append or show Summary output when a Summary request fails', async () => {
    seedAnnotationStore(annotationStore, 'file:///workspace/src/parser.ts', [
      createAnnotation(),
    ])
    const explainModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: textResponseStream('Explanation remains visible.'),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    const rejectedSummaryModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.reject(createLanguageModelError('Denied')),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels
      .mockResolvedValueOnce([explainModel])
      .mockResolvedValueOnce([rejectedSummaryModel])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.explain')(createAnnotation())
    const explanationOutput = [...outputText]
    const explainAppendCount = outputChannel.append.mock.calls.length
    const explainClearCount = outputChannel.clear.mock.calls.length
    const explainShowCount = outputChannel.show.mock.calls.length

    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(outputText).toStrictEqual(explanationOutput)
    expect(outputText.join('')).toContain('# Code Beacon explanation')
    expect(outputText.join('')).toContain('Explanation remains visible.')
    expect(outputChannel.append).toHaveBeenCalledTimes(explainAppendCount)
    expect(outputChannel.clear).toHaveBeenCalledTimes(explainClearCount)
    expect(outputChannel.show).toHaveBeenCalledTimes(explainShowCount)
    expect(summaryOutputChannel.append).not.toHaveBeenCalled()
    expect(summaryOutputChannel.show).not.toHaveBeenCalled()
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Unable to summarize workspace annotations.',
    )
  })

  it('keeps prior Summary output unchanged when selection or request failures occur', async () => {
    seedAnnotationStore(annotationStore, 'file:///workspace/src/parser.ts', [
      createAnnotation(),
    ])
    const successfulSummaryModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: textResponseStream('Prior summary remains visible.'),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    const rejectedSummaryModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.reject(createLanguageModelError('Denied')),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels
      .mockResolvedValueOnce([successfulSummaryModel])
      .mockRejectedValueOnce(new Error('Model unavailable'))
      .mockResolvedValueOnce([successfulSummaryModel])
      .mockResolvedValueOnce([rejectedSummaryModel])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.summarizeWorkspace')()
    const selectionFailureOutput = [...summaryOutputText]
    const selectionFailureClearCount =
      summaryOutputChannel.clear.mock.calls.length
    const selectionFailureAppendCount =
      summaryOutputChannel.append.mock.calls.length
    const selectionFailureShowCount =
      summaryOutputChannel.show.mock.calls.length

    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(summaryOutputText).toStrictEqual(selectionFailureOutput)
    expect(summaryOutputChannel.clear).toHaveBeenCalledTimes(
      selectionFailureClearCount,
    )
    expect(summaryOutputChannel.append).toHaveBeenCalledTimes(
      selectionFailureAppendCount,
    )
    expect(summaryOutputChannel.show).toHaveBeenCalledTimes(
      selectionFailureShowCount,
    )

    await registeredCommand('code-beacon.summarizeWorkspace')()
    const requestFailureOutput = [...summaryOutputText]
    const requestFailureClearCount =
      summaryOutputChannel.clear.mock.calls.length
    const requestFailureAppendCount =
      summaryOutputChannel.append.mock.calls.length
    const requestFailureShowCount = summaryOutputChannel.show.mock.calls.length

    await registeredCommand('code-beacon.summarizeWorkspace')()

    expect(summaryOutputText).toStrictEqual(requestFailureOutput)
    expect(summaryOutputChannel.clear).toHaveBeenCalledTimes(
      requestFailureClearCount,
    )
    expect(summaryOutputChannel.append).toHaveBeenCalledTimes(
      requestFailureAppendCount,
    )
    expect(summaryOutputChannel.show).toHaveBeenCalledTimes(
      requestFailureShowCount,
    )
  })

  it('keeps Summary current while Explain and Generate Fix requests run', async () => {
    const summaryStreamCanYield = deferred()
    const summaryStreamWaiting = deferred()
    const original = '// TODO: replace deprecated parser'
    seedAnnotationStore(annotationStore, 'file:///workspace/src/parser.ts', [
      createGenerateFixAnnotation(),
    ])
    vscodeState.documentText = `${original}\n`
    const delayedSummaryModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            summaryStreamWaiting.resolve()
            await summaryStreamCanYield.promise
            yield new LanguageModelTextPart('Summary remains current.')
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    const explainModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({ stream: emptyTextStream(), text: emptyTextStream() }),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels
      .mockResolvedValueOnce([delayedSummaryModel])
      .mockResolvedValueOnce([explainModel])
      .mockResolvedValueOnce([
        generatedFixResponse({
          original,
          reason: 'Use supported code.',
          replacement: '// TODO: use a maintained parser',
        }),
      ])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    const summary = registeredCommand('code-beacon.summarizeWorkspace')()
    await summaryStreamWaiting.promise
    await registeredCommand('code-beacon.explain')(
      createGenerateFixAnnotation(),
    )
    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )
    summaryStreamCanYield.resolve()
    await summary

    expect(summaryOutputText.join('')).toContain('Summary remains current.')
    expect(applyEdit).toHaveBeenCalledTimes(1)
  })

  it('does not access VS Code data or create edits without a selected beacon or AI opt-in', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.generateFix')()
    configState.aiEnabled = false
    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )

    expect(workspace.openTextDocument).not.toHaveBeenCalled()
    expect(lm.selectChatModels).not.toHaveBeenCalled()
    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()
  })

  it('leaves text unchanged when the document or model cannot be opened', async () => {
    const snapshot = vscodeState.documentText
    vi.mocked(workspace.openTextDocument).mockRejectedValueOnce(
      new Error('Document unavailable'),
    )
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )

    const failedModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.reject(new Error('Model unavailable')),
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([failedModel])
    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )

    expect(vscodeState.documentText).toBe(snapshot)
    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()
  })

  it('reports model selection rejection without creating or applying an edit', async () => {
    const snapshot = vscodeState.documentText
    selectChatModels.mockRejectedValueOnce(new Error('Model unavailable'))
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )

    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Unable to select a Copilot language model to generate a fix.',
    )
    expect(vscodeState.documentText).toBe(snapshot)
    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()
  })

  it('reports when no Copilot model is available without creating an edit', async () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'No Copilot language model is available to generate a fix.',
    )
    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()
  })

  it.each([
    '{"original":"// TODO: replace deprecated parser","replacement":"// TODO: use a maintained parser","reason":"updated"',
    '{"original":"// TODO: replace deprecated parser","replacement":"// TODO: use a maintained parser","reason":"updated","extra":"reject"}',
    '{"original":"TODO:","replacement":"done","reason":"ambiguous"}',
  ])(
    'does not create edits for an invalid generated proposal: %s',
    async text => {
      const model = {
        sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(
          () =>
            Promise.resolve({
              stream: (async function* stream() {
                yield new LanguageModelTextPart(text)
              })(),
              text: emptyTextStream(),
            }),
        ),
      } as unknown as Vscode.LanguageModelChat
      selectChatModels.mockResolvedValueOnce([model])
      vscodeState.documentText =
        '// TODO: replace deprecated parser\n// TODO: second annotation\n'
      useBeaconCommands({
        get: <T>() => undefined as T | undefined,
        update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      } as unknown as Vscode.Memento)

      await registeredCommand('code-beacon.generateFix')(
        createGenerateFixAnnotation(),
      )

      expect(workspaceEdits).toHaveLength(0)
      expect(applyEdit).not.toHaveBeenCalled()
    },
  )

  it('creates one same-document replacement and asks VS Code for confirmation', async () => {
    const original = '// TODO: replace deprecated parser'
    const replacement = '// TODO: use a maintained parser'
    vscodeState.documentText = `${original}\nconst parser = deprecatedParser\n`
    const annotation = createGenerateFixAnnotation()
    selectChatModels.mockResolvedValueOnce([
      generatedFixResponse({
        original,
        reason: 'Uses supported code.',
        replacement,
      }),
    ])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.generateFix')(annotation)

    expect(workspaceEdits).toHaveLength(1)
    expect(workspaceEdits[0]?.replacements).toStrictEqual([
      {
        metadata: {
          label: 'Apply Code Beacon generated fix',
          needsConfirmation: true,
        },
        newText: replacement,
        range: rangeInstances[0],
        uri: { value: annotation.uri },
      },
    ])
    expect(rangeInstances).toHaveLength(1)
    expect(rangeInstances[0]).toMatchObject({
      end: { character: original.length, line: 0 },
      start: { character: 0, line: 0 },
    })
    expect(applyEdit).toHaveBeenCalledExactlyOnceWith(workspaceEdits[0])
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Generated fix applied.',
    )
  })

  it('reports rejected and failed confirmations without claiming success', async () => {
    const original = '// TODO: replace deprecated parser'
    vscodeState.documentText = `${original}\n`
    const proposal = {
      original,
      reason: 'Uses supported code.',
      replacement: '// TODO: use a maintained parser',
    }
    selectChatModels
      .mockResolvedValueOnce([generatedFixResponse(proposal)])
      .mockResolvedValueOnce([generatedFixResponse(proposal)])
    applyEdit
      .mockResolvedValueOnce(false)
      .mockRejectedValueOnce(new Error('No'))
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )
    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )

    expect(applyEdit).toHaveBeenCalledTimes(2)
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Generated fix was not applied.',
    )
    expect(window.showWarningMessage).toHaveBeenCalledWith(
      'Unable to apply the generated fix.',
    )
    expect(window.showInformationMessage).not.toHaveBeenCalledWith(
      'Generated fix applied.',
    )
  })

  it('does not create an edit when the document drifts after generation', async () => {
    const original = '// TODO: replace deprecated parser'
    const snapshot = `${original}\n`
    const document = {
      getText: vi
        .fn<() => string>()
        .mockReturnValueOnce(snapshot)
        .mockReturnValue('// TODO: changed while waiting\n'),
      languageId: 'typescript',
      positionAt: vi.fn<(offset: number) => Vscode.Position>(),
    } as unknown as Vscode.TextDocument
    vi.mocked(workspace.openTextDocument).mockResolvedValueOnce(document)
    selectChatModels.mockResolvedValueOnce([
      generatedFixResponse({
        original,
        reason: 'Uses supported code.',
        replacement: '// TODO: use a maintained parser',
      }),
    ])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )

    expect(workspaceEdits).toHaveLength(0)
    expect(applyEdit).not.toHaveBeenCalled()
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'The annotation document changed; generated fix was not applied.',
    )
  })

  it('does not apply a Generate Fix response after progress cancellation', async () => {
    const original = '// TODO: replace deprecated parser'
    const streamCanYield = deferred()
    const streamWaiting = deferred()
    const delayedModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            streamWaiting.resolve()
            await streamCanYield.promise
            yield new LanguageModelTextPart(
              JSON.stringify({
                original,
                reason: 'Uses supported code.',
                replacement: '// TODO: use a maintained parser',
              }),
            )
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    vscodeState.documentText = `${original}\n`
    selectChatModels.mockResolvedValueOnce([delayedModel])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    const first = registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )
    await streamWaiting.promise
    cancellationToken.isCancellationRequested = true
    streamCanYield.resolve()
    await first

    expect(applyEdit).not.toHaveBeenCalled()
    expect(workspaceEdits).toHaveLength(0)
    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Generated fix cancelled.',
    )
  })

  it('reports a cancelled model request without exposing a generation error', async () => {
    const model = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(
        () => {
          cancellationToken.isCancellationRequested = true
          return Promise.reject(new Error('Cancelled'))
        },
      ),
    } as unknown as Vscode.LanguageModelChat
    selectChatModels.mockResolvedValueOnce([model])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )

    expect(window.showInformationMessage).toHaveBeenCalledWith(
      'Generated fix cancelled.',
    )
    expect(window.showWarningMessage).not.toHaveBeenCalledWith(
      'Unable to generate a fix.',
    )
    expect(applyEdit).not.toHaveBeenCalled()
  })

  it('does not apply a superseded Generate Fix response', async () => {
    const original = '// TODO: replace deprecated parser'
    const streamCanYield = deferred()
    const streamWaiting = deferred()
    const delayedModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            streamWaiting.resolve()
            await streamCanYield.promise
            yield new LanguageModelTextPart(
              JSON.stringify({
                original,
                reason: 'Stale request',
                replacement: '// TODO: stale replacement',
              }),
            )
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    vscodeState.documentText = `${original}\n`
    selectChatModels
      .mockResolvedValueOnce([delayedModel])
      .mockResolvedValueOnce([
        generatedFixResponse({
          original,
          reason: 'Newer request',
          replacement: '// TODO: use a maintained parser',
        }),
      ])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    const first = registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )
    await streamWaiting.promise
    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )
    streamCanYield.resolve()
    await first

    expect(applyEdit).toHaveBeenCalledTimes(1)
    expect(workspaceEdits).toHaveLength(1)
  })

  it('does not apply an in-flight Generate Fix response after lifecycle disposal', async () => {
    const original = '// TODO: replace deprecated parser'
    const streamCanYield = deferred()
    const streamWaiting = deferred()
    const delayedModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            streamWaiting.resolve()
            await streamCanYield.promise
            yield new LanguageModelTextPart(
              JSON.stringify({
                original,
                reason: 'Disposed request',
                replacement: '// TODO: use a maintained parser',
              }),
            )
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    vscodeState.documentText = `${original}\n`
    selectChatModels.mockResolvedValueOnce([delayedModel])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    const invocation = registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )
    await streamWaiting.promise
    for (const [disposable] of useDisposable.mock.calls) {
      const dispose = (disposable as { dispose?: unknown }).dispose

      if (typeof dispose === 'function') {
        dispose()
      }
    }
    streamCanYield.resolve()
    await invocation

    expect(applyEdit).not.toHaveBeenCalled()
    expect(workspaceEdits).toHaveLength(0)
  })

  it('does not supersede an Explain request when generating a fix', async () => {
    const explainStreamCanYield = deferred()
    const explainStreamWaiting = deferred()
    const original = '// TODO: replace deprecated parser'
    const delayedExplainModel = {
      sendRequest: vi.fn<() => Promise<Vscode.LanguageModelChatResponse>>(() =>
        Promise.resolve({
          stream: (async function* stream() {
            explainStreamWaiting.resolve()
            await explainStreamCanYield.promise
            yield new LanguageModelTextPart('Explanation remains current.')
          })(),
          text: emptyTextStream(),
        }),
      ),
    } as unknown as Vscode.LanguageModelChat
    vscodeState.documentText = `${original}\n`
    selectChatModels
      .mockResolvedValueOnce([delayedExplainModel])
      .mockResolvedValueOnce([
        generatedFixResponse({
          original,
          reason: 'Use supported code.',
          replacement: '// TODO: use a maintained parser',
        }),
      ])
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    const explain = registeredCommand('code-beacon.explain')(
      createGenerateFixAnnotation(),
    )
    await explainStreamWaiting.promise
    await registeredCommand('code-beacon.generateFix')(
      createGenerateFixAnnotation(),
    )
    explainStreamCanYield.resolve()
    await explain

    expect(outputText.join('')).toContain('Explanation remains current.')
    expect(applyEdit).toHaveBeenCalledTimes(1)
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

  it('updates annotation state when invoked from Explorer beacon leaves', () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)
    const annotation = createAnnotation()
    annotationStore.setForSourceUri('visibleEditor', annotation.uri, [
      annotation,
    ])
    const leaf = createLeaf(annotation)

    registeredCommand(commands.resolve)(leaf)
    registeredCommand(commands.ignore)(leaf)

    expect(annotationStore.getForUri(annotation.uri)[0]).toMatchObject({
      ignored: true,
      resolved: true,
    })

    registeredCommand(commands.unresolve)(leaf)
    registeredCommand(commands.unignore)(leaf)

    expect(annotationStore.getForUri(annotation.uri)[0]).toMatchObject({
      ignored: false,
      resolved: false,
    })
  })

  it('ignores invalid annotation targets for state commands', () => {
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    } as unknown as Vscode.Memento)

    for (const command of [
      commands.resolve,
      commands.unresolve,
      commands.ignore,
      commands.unignore,
    ]) {
      expect(() => registeredCommand(command)()).not.toThrow()
      expect(() => registeredCommand(command)({ type: 'beacon' })).not.toThrow()
    }

    expect(annotationStore.getState()).toStrictEqual({
      ignoredIds: [],
      resolvedIds: [],
    })
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
      async update(_key: string, state: unknown) {
        const deferredUpdate = Promise.withResolvers<null>()
        pendingUpdates.push({
          reject: deferredUpdate.reject,
          resolve: () => deferredUpdate.resolve(null),
          state,
        })
        await deferredUpdate.promise
        persistedState = state
      },
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
      async update(_key: string, state: unknown) {
        const deferredUpdate = Promise.withResolvers<null>()
        pendingUpdates.push({
          reject: deferredUpdate.reject,
          resolve: () => deferredUpdate.resolve(null),
          state,
        })
        await deferredUpdate.promise
        persistedState = state
      },
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
