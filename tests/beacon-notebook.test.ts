import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import { useBeaconNotebook } from '../src/composables/use-beacon-notebook'
import { config } from '../src/config'
import type * as CodeBeaconConfig from '../src/config'
import { annotationStore } from '../src/core/store/annotation-store'
import type { BeaconAnnotation } from '../src/types/annotation'

const {
  changeListeners,
  closeListeners,
  notebookDocuments,
  openListeners,
  useDisposable,
} = vi.hoisted(() => {
  const changes: unknown[] = []
  const closes: unknown[] = []
  const notebooks: unknown[] = []
  const opens: unknown[] = []

  return {
    changeListeners: changes,
    closeListeners: closes,
    notebookDocuments: notebooks,
    openListeners: opens,
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
        scanMode: 'openEditors',
      },
    }) as unknown as Partial<typeof CodeBeaconConfig>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      workspace: {
        get notebookDocuments() {
          return notebookDocuments
        },
        onDidChangeNotebookDocument: (listener: unknown) => {
          changeListeners.push(listener)
          return { dispose: vi.fn<() => void>() }
        },
        onDidCloseNotebookDocument: (listener: unknown) => {
          closeListeners.push(listener)
          return { dispose: vi.fn<() => void>() }
        },
        onDidOpenNotebookDocument: (listener: unknown) => {
          openListeners.push(listener)
          return { dispose: vi.fn<() => void>() }
        },
      },
    }) as unknown as Partial<typeof Vscode>,
)

function uri(value: string) {
  return {
    toString: () => value,
  }
}

function cell(documentUri: string): Vscode.NotebookCell {
  return {
    document: {
      uri: uri(documentUri),
    },
  } as Vscode.NotebookCell
}

function notebook(
  notebookUri: string,
  cells: readonly Vscode.NotebookCell[],
): Vscode.NotebookDocument {
  return {
    getCells: () => cells,
    uri: uri(notebookUri),
  } as Vscode.NotebookDocument
}

function annotation(notebookCell: Vscode.NotebookCell): BeaconAnnotation {
  return {
    category: 'todo',
    column: 0,
    id: notebookCell.document.uri.toString(),
    keyword: 'TODO:',
    keywordRange: {
      end: { character: 5, line: 0 },
      start: { character: 0, line: 0 },
    },
    languageId: 'python',
    line: 0,
    message: 'scan cell',
    range: {
      end: { character: 5, line: 0 },
      start: { character: 0, line: 0 },
    },
    ruleId: 'todo',
    severity: 'information',
    source: 'notebook',
    uri: notebookCell.document.uri.toString(),
  }
}

describe('beacon notebook lifecycle', () => {
  const cellA = cell('vscode-notebook-cell:///a')
  const cellB = cell('vscode-notebook-cell:///b')
  const notebookA = notebook('file:///book.ipynb', [cellA])
  const scanTextDocument = vi.fn<
    (
      document: Vscode.TextDocument,
      source: BeaconAnnotation['source'],
    ) => readonly BeaconAnnotation[]
  >(() => [])

  beforeEach(() => {
    annotationStore.clear()
    changeListeners.length = 0
    closeListeners.length = 0
    notebookDocuments.length = 0
    openListeners.length = 0
    scanTextDocument.mockClear()
    useDisposable.mockClear()
    Object.assign(config, { scanMode: 'openEditors' })
  })

  it('scans cells in notebooks already open at activation', () => {
    notebookDocuments.push(notebookA)

    useBeaconNotebook(scanTextDocument)

    expect(scanTextDocument).toHaveBeenCalledWith(cellA.document, 'notebook')
  })

  it('scans added cells and clears removed and closed notebook cells', () => {
    useBeaconNotebook(scanTextDocument)

    const openListener = openListeners[0] as
      | ((notebook: Vscode.NotebookDocument) => void)
      | undefined
    if (!openListener) {
      throw new Error('Expected an open notebook listener')
    }
    openListener(notebookA)
    annotationStore.setForUri(cellA.document.uri.toString(), [
      annotation(cellA),
    ])

    const changeListener = changeListeners[0] as
      | ((event: Vscode.NotebookDocumentChangeEvent) => void)
      | undefined
    if (!changeListener) {
      throw new Error('Expected a notebook change listener')
    }
    changeListener({
      cellChanges: [],
      contentChanges: [
        { addedCells: [cellB], range: {}, removedCells: [cellA] },
      ],
      notebook: notebookA,
    } as unknown as Vscode.NotebookDocumentChangeEvent)

    expect(scanTextDocument).toHaveBeenCalledWith(cellB.document, 'notebook')
    expect(
      annotationStore.getForUri(cellA.document.uri.toString()),
    ).toStrictEqual([])
    annotationStore.setForUri(cellB.document.uri.toString(), [
      annotation(cellB),
    ])

    const closeListener = closeListeners[0] as
      | ((notebook: Vscode.NotebookDocument) => void)
      | undefined
    if (!closeListener) {
      throw new Error('Expected a close notebook listener')
    }
    closeListener(notebookA)

    expect(
      annotationStore.getForUri(cellB.document.uri.toString()),
    ).toStrictEqual([])
  })

  it('does not scan opened notebooks in manual mode', () => {
    Object.assign(config, { scanMode: 'manual' })
    useBeaconNotebook(scanTextDocument)

    const openListener = openListeners[0] as
      | ((notebook: Vscode.NotebookDocument) => void)
      | undefined
    if (!openListener) {
      throw new Error('Expected an open notebook listener')
    }
    openListener(notebookA)

    const changeListener = changeListeners[0] as
      | ((event: Vscode.NotebookDocumentChangeEvent) => void)
      | undefined
    if (!changeListener) {
      throw new Error('Expected a notebook change listener')
    }
    changeListener({
      cellChanges: [],
      contentChanges: [{ addedCells: [cellB], range: {}, removedCells: [] }],
      notebook: notebookA,
    } as unknown as Vscode.NotebookDocumentChangeEvent)

    expect(scanTextDocument).not.toHaveBeenCalled()
  })

  it('clears manually scanned cells when their opened notebook closes', () => {
    Object.assign(config, { scanMode: 'manual' })
    useBeaconNotebook(scanTextDocument)

    const openListener = openListeners[0] as
      | ((notebook: Vscode.NotebookDocument) => void)
      | undefined
    if (!openListener) {
      throw new Error('Expected an open notebook listener')
    }
    openListener(notebookA)
    annotationStore.setForUri(cellA.document.uri.toString(), [
      annotation(cellA),
    ])

    const closeListener = closeListeners[0] as
      | ((notebook: Vscode.NotebookDocument) => void)
      | undefined
    if (!closeListener) {
      throw new Error('Expected a close notebook listener')
    }
    closeListener(notebookA)

    expect(scanTextDocument).not.toHaveBeenCalled()
    expect(
      annotationStore.getForUri(cellA.document.uri.toString()),
    ).toStrictEqual([])
  })

  it('rescans changed cell documents in visibleEditors mode', () => {
    Object.assign(config, { scanMode: 'visibleEditors' })
    useBeaconNotebook(scanTextDocument)

    const changeListener = changeListeners[0] as
      | ((event: Vscode.NotebookDocumentChangeEvent) => void)
      | undefined
    if (!changeListener) {
      throw new Error('Expected a notebook change listener')
    }
    changeListener({
      cellChanges: [
        {
          cell: cellA,
          document: cellA.document,
          executionSummary: undefined,
          metadata: undefined,
          outputs: undefined,
        },
      ],
      contentChanges: [],
      metadata: undefined,
      notebook: notebookA,
    } as Vscode.NotebookDocumentChangeEvent)

    expect(scanTextDocument).toHaveBeenCalledExactlyOnceWith(
      cellA.document,
      'notebook',
    )
  })
})
