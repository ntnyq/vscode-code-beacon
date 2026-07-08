import { useDisposable } from 'reactive-vscode'
import { commands as vscodeCommands, window, workspace } from 'vscode'
import type { TextDocument, TextEditor } from 'vscode'
import { config } from '../config'
import { applyBeaconDecorations } from '../core/decorations/apply-decorations'
import { DecorationTypeCache } from '../core/decorations/decoration-type-cache'
import { normalizeRules } from '../core/rules/normalize'
import { scanDocument } from '../core/scanner/scan-document'
import { annotationStore } from '../core/store/annotation-store'
import { commands } from '../meta'
import type { BeaconRuleConfig } from '../types/annotation'
import { logger } from '../utils/logger'

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

function isScannableDocument(document: TextDocument): boolean {
  return (
    document.uri.scheme === 'file' && isLanguageEnabled(document.languageId)
  )
}

export function useBeaconHighlight() {
  const decorationCache = new DecorationTypeCache()

  const scanTextEditor = (editor: TextEditor) => {
    const { document } = editor
    const uri = document.uri.toString()

    if (!config.enable || !isScannableDocument(document)) {
      annotationStore.setForUri(uri, [])
      return
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
      source: 'visibleEditor',
      text: document.getText(),
      uri,
    })

    annotationStore.setForUri(uri, result.annotations)

    if (config.decorations.enabled) {
      applyBeaconDecorations(editor, result.annotations, decorationCache)
    }
  }

  const refreshVisibleEditors = () => {
    for (const editor of window.visibleTextEditors) {
      scanTextEditor(editor)
    }
  }

  const scanActiveFile = () => {
    if (window.activeTextEditor) {
      scanTextEditor(window.activeTextEditor)
    }
  }

  useDisposable(
    workspace.onDidChangeTextDocument(event => {
      const editor = window.visibleTextEditors.find(
        visibleEditor => visibleEditor.document === event.document,
      )

      if (editor) {
        scanTextEditor(editor)
      }
    }),
  )
  useDisposable(window.onDidChangeVisibleTextEditors(refreshVisibleEditors))
  useDisposable(
    workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('code-beacon')) {
        refreshVisibleEditors()
      }
    }),
  )
  useDisposable({
    dispose() {
      decorationCache.disposeAll()
    },
  })

  useDisposable(
    vscodeCommands.registerCommand(commands.refresh, refreshVisibleEditors),
  )
  useDisposable(
    vscodeCommands.registerCommand(commands.scanActiveFile, scanActiveFile),
  )
  useDisposable(
    vscodeCommands.registerCommand(
      commands.scanOpenEditors,
      refreshVisibleEditors,
    ),
  )

  refreshVisibleEditors()

  return {
    refreshVisibleEditors,
    scanActiveFile,
    scanTextEditor,
  }
}
