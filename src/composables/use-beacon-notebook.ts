import { useDisposable } from 'reactive-vscode'
import { workspace } from 'vscode'
import type { NotebookCell, NotebookDocument, TextDocument } from 'vscode'
import { config } from '../config'
import { initialScanTarget } from '../core/scanner/scan-mode'
import { annotationStore } from '../core/store/annotation-store'
import type { BeaconAnnotation } from '../types/annotation'

/**
 * Scans one text document and returns its stored annotations.
 */
export type ScanTextDocument = (
  document: TextDocument,
  source: BeaconAnnotation['source'],
) => readonly BeaconAnnotation[]

/**
 * Coordinates scans and cleanup for the cells of open notebook documents.
 */
export function useBeaconNotebook(scanTextDocument: ScanTextDocument) {
  const cellsByNotebookUri = new Map<string, Set<string>>()

  const trackCell = (notebook: NotebookDocument, cell: NotebookCell) => {
    const notebookUri = notebook.uri.toString()
    const cellUri = cell.document.uri.toString()
    const cells = cellsByNotebookUri.get(notebookUri) ?? new Set<string>()

    cells.add(cellUri)
    cellsByNotebookUri.set(notebookUri, cells)
  }

  const scanCell = (notebook: NotebookDocument, cell: NotebookCell) => {
    trackCell(notebook, cell)
    scanTextDocument(cell.document, 'notebook')
  }

  const scanNotebook = (notebook: NotebookDocument) => {
    const scansAutomatically = initialScanTarget(config.scanMode) !== 'none'

    for (const cell of notebook.getCells()) {
      if (scansAutomatically) {
        scanCell(notebook, cell)
      } else {
        trackCell(notebook, cell)
      }
    }
  }

  const clearCell = (notebook: NotebookDocument, cell: NotebookCell) => {
    annotationStore.setForUri(cell.document.uri.toString(), [])
    cellsByNotebookUri
      .get(notebook.uri.toString())
      ?.delete(cell.document.uri.toString())
  }

  useDisposable(workspace.onDidOpenNotebookDocument(scanNotebook))
  useDisposable(
    workspace.onDidChangeNotebookDocument(event => {
      const scansAutomatically = initialScanTarget(config.scanMode) !== 'none'

      for (const contentChange of event.contentChanges) {
        for (const cell of contentChange.addedCells) {
          if (scansAutomatically) {
            scanCell(event.notebook, cell)
          } else {
            trackCell(event.notebook, cell)
          }
        }

        for (const cell of contentChange.removedCells) {
          clearCell(event.notebook, cell)
        }
      }

      if (scansAutomatically) {
        for (const cellChange of event.cellChanges) {
          if (cellChange.document) {
            trackCell(event.notebook, cellChange.cell)
            scanTextDocument(cellChange.document, 'notebook')
          }
        }
      }
    }),
  )
  useDisposable(
    workspace.onDidCloseNotebookDocument(notebook => {
      const notebookUri = notebook.uri.toString()

      for (const cellUri of cellsByNotebookUri.get(notebookUri) ?? []) {
        annotationStore.setForUri(cellUri, [])
      }

      cellsByNotebookUri.delete(notebookUri)
    }),
  )

  for (const notebook of workspace.notebookDocuments) {
    scanNotebook(notebook)
  }

  return { scanNotebook }
}
