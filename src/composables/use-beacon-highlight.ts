import { useDisposable } from 'reactive-vscode'
import { commands as vscodeCommands, window, workspace } from 'vscode'
import type { TextDocument, TextEditor } from 'vscode'
import { config } from '../config'
import { applyBeaconDecorations } from '../core/decorations/apply-decorations'
import { DecorationTypeCache } from '../core/decorations/decoration-type-cache'
import { normalizeRules } from '../core/rules/normalize'
import { scanDocument } from '../core/scanner/scan-document'
import {
  automaticDocumentChangeScope,
  initialScanTarget,
} from '../core/scanner/scan-mode'
import { annotationStore } from '../core/store/annotation-store'
import { commands } from '../meta'
import type { BeaconAnnotation, BeaconRuleConfig } from '../types/annotation'
import { logger } from '../utils/logger'

/**
 * Checks whether a language id is allowed by the current language filters.
 */
function isLanguageEnabled(languageId: string): boolean {
  const languages = config.languages

  if (languages.length === 0) {
    return true
  }

  const excluded = new Set(
    languages
      .filter(language => language.startsWith('!'))
      .map(language => language.slice(1)),
  )

  if (excluded.has(languageId) || excluded.has('*')) {
    return false
  }

  const included = languages.filter(language => !language.startsWith('!'))
  return (
    included.length === 0 ||
    included.includes('*') ||
    included.includes(languageId)
  )
}

/**
 * Checks whether a document can be scanned by the current runtime.
 */
function isScannableDocument(document: TextDocument): boolean {
  return (
    document.uri.scheme === 'file' && isLanguageEnabled(document.languageId)
  )
}

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
 * Registers editor scanning, scan commands, and decoration updates.
 */
export function useBeaconHighlight() {
  const decorationCache = new DecorationTypeCache()

  /**
   * Scans a text document and updates the annotation store for its URI.
   */
  const scanTextDocument = (
    document: TextDocument,
    source: BeaconAnnotation['source'],
  ): readonly BeaconAnnotation[] => {
    const uri = document.uri.toString()

    if (!config.enable || !isScannableDocument(document)) {
      annotationStore.setForUri(uri, [])
      return []
    }

    const normalizedRules = normalizeRules(
      config.rules as readonly BeaconRuleConfig[],
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
   * Scans a visible editor and applies decorations for its annotations.
   */
  const scanTextEditor = (
    editor: TextEditor,
    source: BeaconAnnotation['source'] = 'visibleEditor',
  ) => {
    const annotations = scanTextDocument(editor.document, source)

    if (config.decorations.enabled) {
      applyBeaconDecorations(editor, annotations, decorationCache)
    }
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
      }
    }),
  )
  useDisposable({
    dispose() {
      decorationCache.disposeAll()
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
