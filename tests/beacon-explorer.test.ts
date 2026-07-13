import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import { useBeaconExplorer } from '../src/composables/use-beacon-explorer'
import { config } from '../src/config'
import type * as CodeBeaconConfig from '../src/config'
import {
  BeaconTreeDataProvider,
  type BeaconLeafTreeElement,
} from '../src/core/explorer/tree-data-provider'
import { annotationStore } from '../src/core/store/annotation-store'
import { commands } from '../src/meta'
import type { BeaconAnnotation } from '../src/types/annotation'

const {
  clipboardWriteText,
  commandHandlers,
  createTreeView,
  editorState,
  executeCommand,
  activeEditorListeners,
  configurationListeners,
  openTextDocument,
  revealRange,
  showTextDocument,
  treeDataProviders,
  visibleEditorsListeners,
} = vi.hoisted(() => {
  const activeEditorListenerCallbacks: unknown[] = []
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const configurationListenerCallbacks: unknown[] = []
  const explorerEditorState: {
    activeTextEditor:
      | { document: { uri: { toString: () => string } } }
      | undefined
    visibleTextEditors: { document: { uri: { toString: () => string } } }[]
  } = {
    activeTextEditor: undefined,
    visibleTextEditors: [],
  }
  const revealRangeMock = vi.fn<() => void>()
  const capturedTreeDataProviders: unknown[] = []
  const visibleEditorsListenerCallbacks: unknown[] = []

  return {
    activeEditorListeners: activeEditorListenerCallbacks,
    clipboardWriteText: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    commandHandlers: handlers,
    configurationListeners: configurationListenerCallbacks,
    createTreeView: vi.fn<
      (
        viewId: unknown,
        options: { treeDataProvider: unknown },
      ) => { dispose: () => void }
    >((_viewId: unknown, options: { treeDataProvider: unknown }) => {
      capturedTreeDataProviders.push(options.treeDataProvider)

      return { dispose: vi.fn<() => void>() }
    }),
    editorState: explorerEditorState,
    executeCommand: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    openTextDocument: vi.fn<(uri: unknown) => Promise<{ uri: unknown }>>(uri =>
      Promise.resolve({ uri }),
    ),
    revealRange: revealRangeMock,
    showTextDocument: vi.fn<
      () => Promise<{ revealRange: () => void; selection?: unknown }>
    >(() =>
      Promise.resolve({
        revealRange: revealRangeMock,
      }),
    ),
    treeDataProviders: capturedTreeDataProviders,
    visibleEditorsListeners: visibleEditorsListenerCallbacks,
  }
})

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      useDisposable: vi.fn<(value: unknown) => unknown>(value => value),
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('../src/config'),
  () =>
    ({
      config: {
        explorer: {
          categories: [],
          groupBy: 'file',
          includeIgnored: false,
          includeResolved: false,
          owners: [],
          query: '',
          scope: 'workspace',
          severities: [],
        },
      },
    }) as unknown as Partial<typeof CodeBeaconConfig>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      EventEmitter: class EventEmitter {
        public readonly event = vi.fn<() => void>()
        public readonly fire = vi.fn<() => void>()
      },
      Range: class Range {
        public readonly start: unknown
        public readonly end: unknown

        public constructor(
          startLine: number,
          startCharacter: number,
          endLine: number,
          endCharacter: number,
        ) {
          this.start = { character: startCharacter, line: startLine }
          this.end = { character: endCharacter, line: endLine }
        }
      },
      Selection: class Selection {
        public readonly start: unknown
        public readonly end: unknown

        public constructor(start: unknown, end: unknown) {
          this.start = start
          this.end = end
        }
      },
      ThemeIcon: class ThemeIcon {
        public readonly id: string

        public constructor(id: string) {
          this.id = id
        }
      },
      TreeItem: class TreeItem {
        public readonly label: string
        public readonly collapsibleState: number

        public constructor(label: string, collapsibleState: number) {
          this.label = label
          this.collapsibleState = collapsibleState
        }
      },
      TreeItemCollapsibleState: {
        Collapsed: 1,
        None: 0,
      },
      Uri: {
        parse: (value: string) => ({ value }),
      },
      commands: {
        executeCommand,
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
          writeText: clipboardWriteText,
        },
      },
      window: {
        createTreeView,
        get activeTextEditor() {
          return editorState.activeTextEditor
        },
        onDidChangeActiveTextEditor: (listener: unknown) => {
          activeEditorListeners.push(listener)

          return { dispose: vi.fn<() => void>() }
        },
        get visibleTextEditors() {
          return editorState.visibleTextEditors
        },
        onDidChangeVisibleTextEditors: (listener: unknown) => {
          visibleEditorsListeners.push(listener)

          return { dispose: vi.fn<() => void>() }
        },
        showTextDocument,
      },
      workspace: {
        onDidChangeConfiguration: (listener: unknown) => {
          configurationListeners.push(listener)

          return { dispose: vi.fn<() => void>() }
        },
        openTextDocument,
      },
    }) as unknown as Partial<typeof Vscode>,
)

function createAnnotation(
  overrides: Partial<BeaconAnnotation> = {},
): BeaconAnnotation {
  return {
    category: 'todo',
    column: 3,
    id: 'a',
    keyword: 'TODO:',
    keywordRange: {
      end: { character: 8, line: 1 },
      start: { character: 3, line: 1 },
    },
    languageId: 'typescript',
    line: 1,
    message: 'ship it',
    range: {
      end: { character: 8, line: 1 },
      start: { character: 3, line: 1 },
    },
    ruleId: 'todo',
    severity: 'information',
    source: 'visibleEditor',
    uri: 'file:///workspace/src/a.ts',
    ...overrides,
  }
}

function createEditor(uri: string) {
  return {
    document: {
      uri: {
        toString: () => uri,
      },
    },
  }
}

function createdProvider(): BeaconTreeDataProvider {
  const provider = treeDataProviders.at(-1)

  if (!(provider instanceof BeaconTreeDataProvider)) {
    throw new Error('Expected the Explorer TreeView provider to be registered')
  }

  return provider
}

function providerAnnotationIds(provider: BeaconTreeDataProvider): string[] {
  const roots = provider.getChildren()

  if (!Array.isArray(roots)) {
    throw new TypeError('Expected synchronous Explorer TreeView roots')
  }

  return roots.flatMap(root =>
    root.type === 'group'
      ? root.annotations.map(annotation => annotation.id)
      : [root.annotation.id],
  )
}

function latestListener<T extends (...args: never[]) => unknown>(
  listeners: readonly unknown[],
): T {
  const listener = listeners.at(-1)

  if (typeof listener !== 'function') {
    throw new TypeError('Expected an Explorer listener to be registered')
  }

  return listener as T
}

function resetExplorerConfig() {
  Object.assign(config.explorer, {
    categories: [],
    groupBy: 'file',
    includeIgnored: false,
    includeResolved: false,
    owners: [],
    query: '',
    scope: 'workspace',
    severities: [],
  })
}

function createLeaf(annotation: BeaconAnnotation): BeaconLeafTreeElement {
  return {
    annotation,
    type: 'beacon',
  }
}

function registeredCommand(command: string): (...args: unknown[]) => unknown {
  const handler = commandHandlers.get(command)

  if (!handler) {
    throw new Error(`Expected ${command} to be registered`)
  }

  return handler
}

describe('beacon explorer commands', () => {
  beforeEach(() => {
    annotationStore.clear()
    activeEditorListeners.length = 0
    clipboardWriteText.mockClear()
    commandHandlers.clear()
    configurationListeners.length = 0
    createTreeView.mockClear()
    editorState.activeTextEditor = undefined
    editorState.visibleTextEditors = []
    executeCommand.mockClear()
    openTextDocument.mockClear()
    resetExplorerConfig()
    revealRange.mockClear()
    showTextDocument.mockClear()
    treeDataProviders.length = 0
    visibleEditorsListeners.length = 0
  })

  it('filters the composed Explorer provider by scope and refreshes from VS Code listeners', () => {
    const active = createAnnotation({
      id: 'active',
      uri: 'file:///workspace/src/active.ts',
    })
    const notebook = createAnnotation({
      id: 'notebook',
      source: 'notebook',
      uri: 'file:///workspace/src/notebook.ts',
    })
    const open = createAnnotation({
      id: 'open',
      source: 'openEditor',
      uri: 'file:///workspace/src/open.ts',
    })
    const workspace = createAnnotation({
      id: 'workspace',
      source: 'workspace',
      uri: 'file:///workspace/src/workspace.ts',
    })
    annotationStore.setForUri(active.uri, [active])
    annotationStore.setForUri(notebook.uri, [notebook])
    annotationStore.setForUri(open.uri, [open])
    annotationStore.setForUri(workspace.uri, [workspace])

    useBeaconExplorer()
    const provider = createdProvider()
    const refresh = vi.spyOn(provider, 'refresh')

    expect(providerAnnotationIds(provider)).toStrictEqual([
      'active',
      'notebook',
      'open',
      'workspace',
    ])

    Object.assign(config.explorer, { scope: 'activeFile' })
    editorState.activeTextEditor = createEditor(active.uri)
    latestListener<(editor: unknown) => void>(activeEditorListeners)(undefined)

    expect(providerAnnotationIds(provider)).toStrictEqual(['active'])
    expect(refresh).toHaveBeenCalledExactlyOnceWith()

    Object.assign(config.explorer, { scope: 'openEditors' })
    editorState.visibleTextEditors = [createEditor(open.uri)]
    latestListener<() => void>(visibleEditorsListeners)()

    expect(providerAnnotationIds(provider)).toStrictEqual(['open'])
    expect(refresh).toHaveBeenCalledTimes(2)

    Object.assign(config.explorer, { scope: 'workspace' })
    latestListener<
      (event: { affectsConfiguration: (section: string) => boolean }) => void
    >(configurationListeners)({
      affectsConfiguration: section => section === 'code-beacon',
    })

    expect(providerAnnotationIds(provider)).toStrictEqual([
      'active',
      'notebook',
      'open',
      'workspace',
    ])
    expect(refresh).toHaveBeenCalledTimes(3)
  })

  it('copies a beacon link when invoked from a tree context menu item', async () => {
    const annotation = createAnnotation()
    useBeaconExplorer()

    await registeredCommand(commands.copyLink)(createLeaf(annotation))

    expect(clipboardWriteText).toHaveBeenCalledExactlyOnceWith(
      'file:///workspace/src/a.ts:2:4',
    )
  })

  it('copies the first stored beacon link when invoked without an argument', async () => {
    const annotation = createAnnotation()
    annotationStore.setForUri(annotation.uri, [annotation])
    useBeaconExplorer()

    await registeredCommand(commands.copyLink)()

    expect(clipboardWriteText).toHaveBeenCalledExactlyOnceWith(
      'file:///workspace/src/a.ts:2:4',
    )
  })

  it('reveals a beacon when invoked from a tree context menu item', async () => {
    const annotation = createAnnotation()
    useBeaconExplorer()

    await registeredCommand(commands.reveal)(createLeaf(annotation))

    expect(openTextDocument).toHaveBeenCalledExactlyOnceWith({
      value: 'file:///workspace/src/a.ts',
    })
    expect(showTextDocument).toHaveBeenCalledTimes(1)
    expect(revealRange).toHaveBeenCalledTimes(1)
  })

  it('reveals the first stored beacon when invoked without an argument', async () => {
    const annotation = createAnnotation()
    annotationStore.setForUri(annotation.uri, [annotation])
    useBeaconExplorer()

    await registeredCommand(commands.reveal)()

    expect(openTextDocument).toHaveBeenCalledExactlyOnceWith({
      value: 'file:///workspace/src/a.ts',
    })
    expect(showTextDocument).toHaveBeenCalledTimes(1)
    expect(revealRange).toHaveBeenCalledTimes(1)
  })
})
