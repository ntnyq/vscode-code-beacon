import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import { useBeaconExplorer } from '../src/composables/use-beacon-explorer'
import type * as CodeBeaconConfig from '../src/config'
import type { BeaconLeafTreeElement } from '../src/core/explorer/tree-data-provider'
import { annotationStore } from '../src/core/store/annotation-store'
import { commands } from '../src/meta'
import type { BeaconAnnotation } from '../src/types/annotation'

const {
  clipboardWriteText,
  commandHandlers,
  createTreeView,
  executeCommand,
  openTextDocument,
  revealRange,
  showTextDocument,
} = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()
  const revealRangeMock = vi.fn<() => void>()

  return {
    clipboardWriteText: vi.fn<() => Promise<void>>(() => Promise.resolve()),
    commandHandlers: handlers,
    createTreeView: vi.fn<() => { dispose: () => void }>(() => ({
      dispose: vi.fn<() => void>(),
    })),
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
          groupBy: 'file',
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
        showTextDocument,
      },
      workspace: {
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
    clipboardWriteText.mockClear()
    commandHandlers.clear()
    createTreeView.mockClear()
    executeCommand.mockClear()
    openTextDocument.mockClear()
    revealRange.mockClear()
    showTextDocument.mockClear()
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
