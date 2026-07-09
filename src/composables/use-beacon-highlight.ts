import { useDisposable } from 'reactive-vscode'
import { commands as vscodeCommands, window, workspace } from 'vscode'
import type { TextDocument, TextEditor } from 'vscode'
import { config } from '../config'
import { applyBeaconDecorations } from '../core/decorations/apply-decorations'
import { EditorDecorationCaches } from '../core/decorations/editor-decoration-caches'
import { normalizeRules } from '../core/rules/normalize'
import { scanDocument } from '../core/scanner/scan-document'
import {
  automaticDocumentChangeScope,
  initialScanTarget,
} from '../core/scanner/scan-mode'
import { annotationStore } from '../core/store/annotation-store'
import { isScannableTextDocument } from '../core/workspace/documents'
import { commands } from '../meta'
import type { BeaconAnnotation, BeaconRuleConfig } from '../types/annotation'
import { logger } from '../utils/logger'

/**
 * Finds the visible editor instance for a document, if one exists.
 */
function visibleEditorForDocument(
  document: TextDocument,
): TextEditor | undefined {
  return window.visibleTextEditors.find(
    visibleEditor => visibleEditor.document === document,
  )
}

/**
 * Scans a text document and updates the annotation store for its URI.
 */
function scanTextDocument(
  document: TextDocument,
  source: BeaconAnnotation['source'],
): readonly BeaconAnnotation[] {
  const uri = document.uri.toString()

  if (!config.enable || !isScannableTextDocument(document, config.languages)) {
    annotationStore.setForUri(uri, [])
    return []
  }

  const normalizedRules = normalizeRules(
    config.rules as readonly BeaconRuleConfig[],
    {
      allowCustomRegex: workspace.isTrusted,
    },
  )

  for (const error of normalizedRules.errors) {
    logger.warn(`Rule ${error.ruleId}: ${error.message}`)
  }

  const result = scanDocument({
    commentOnly: config.commentOnly,
    languageId: document.languageId,
    maxFileSize: config.maxFileSize,
    rules: normalizedRules.rules,
    source,
    text: document.getText(),
    uri,
  })

  annotationStore.setForUri(uri, result.annotations)

  return result.annotations
}

/**
 * Registers editor scanning, scan commands, and decoration updates.
 */
export function useBeaconHighlight() {
  const decorationCaches = new EditorDecorationCaches()

  /**
   * Re-applies visible editor decorations from the current store contents.
   */
  const refreshVisibleDecorations = () => {
    decorationCaches.disposeForClosedEditors(window.visibleTextEditors)

    for (const editor of window.visibleTextEditors) {
      if (!config.decorations.enabled) {
        decorationCaches.clearForEditor(editor)
        continue
      }

      applyBeaconDecorations(
        editor,
        annotationStore.getForUri(editor.document.uri.toString()),
        decorationCaches.get(editor),
      )
    }
  }

  /**
   * Scans a visible editor and applies decorations for its annotations.
   */
  const scanTextEditor = (
    editor: TextEditor,
    source: BeaconAnnotation['source'] = 'visibleEditor',
  ) => {
    scanTextDocument(editor.document, source)
  }

  /**
   * Scans every currently visible text editor.
   */
  const refreshVisibleEditors = () => {
    for (const editor of window.visibleTextEditors) {
      scanTextEditor(editor)
    }
  }

  /**
   * Scans every open text document known to the VS Code workspace.
   */
  const scanOpenEditors = () => {
    for (const document of workspace.textDocuments) {
      const editor = visibleEditorForDocument(document)

      if (editor) {
        scanTextEditor(editor, 'openEditor')
      } else {
        scanTextDocument(document, 'openEditor')
      }
    }
  }

  /**
   * Scans the active editor when one is available.
   */
  const scanActiveFile = () => {
    if (window.activeTextEditor) {
      scanTextEditor(window.activeTextEditor)
    }
  }

  /**
   * Runs the initial or refresh scan selected by code-beacon.scanMode.
   */
  const scanByConfiguredMode = () => {
    const target = initialScanTarget(config.scanMode)

    if (target === 'visibleEditors') {
      refreshVisibleEditors()
      return
    }

    if (target === 'openEditors') {
      scanOpenEditors()
      return
    }

    if (target === 'workspace') {
      vscodeCommands.executeCommand(commands.scanWorkspace)
    }
  }

  useDisposable(
    workspace.onDidChangeTextDocument(event => {
      const scope = automaticDocumentChangeScope(config.scanMode)

      if (scope === 'none') {
        return
      }

      const editor = visibleEditorForDocument(event.document)

      if (scope === 'visibleEditors') {
        if (editor) {
          scanTextEditor(editor)
        }
        return
      }

      if (editor) {
        scanTextEditor(editor, 'openEditor')
      } else {
        scanTextDocument(event.document, 'openEditor')
      }
    }),
  )
  useDisposable(
    window.onDidChangeVisibleTextEditors(() => {
      const scope = automaticDocumentChangeScope(config.scanMode)

      if (scope === 'visibleEditors') {
        refreshVisibleEditors()
        return
      }

      if (scope === 'openEditors') {
        for (const editor of window.visibleTextEditors) {
          scanTextEditor(editor, 'openEditor')
        }
      }
    }),
  )
  useDisposable(
    workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('code-beacon')) {
        scanByConfiguredMode()
        refreshVisibleDecorations()
      }
    }),
  )
  useDisposable(
    workspace.onDidGrantWorkspaceTrust(() => {
      scanByConfiguredMode()
      refreshVisibleDecorations()
    }),
  )
  useDisposable({
    dispose: annotationStore.subscribe(refreshVisibleDecorations),
  })
  useDisposable({
    dispose() {
      decorationCaches.disposeAll()
    },
  })

  useDisposable(
    vscodeCommands.registerCommand(commands.refresh, scanByConfiguredMode),
  )
  useDisposable(
    vscodeCommands.registerCommand(commands.scanActiveFile, scanActiveFile),
  )
  useDisposable(
    vscodeCommands.registerCommand(commands.scanOpenEditors, scanOpenEditors),
  )

  scanByConfiguredMode()

  return {
    refreshVisibleEditors,
    scanActiveFile,
    scanByConfiguredMode,
    scanOpenEditors,
    scanTextDocument,
    scanTextEditor,
  }
}
