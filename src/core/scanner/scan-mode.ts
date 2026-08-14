import type { ConfigShorthandTypeMap } from '../../meta'

/**
 * Configured scan mode exposed by the extension settings schema.
 */
export type AnnoPulseScanMode = ConfigShorthandTypeMap['scanMode']

/**
 * Initial scan action selected when the extension activates or refreshes.
 */
export type InitialScanTarget =
  | 'visibleEditors'
  | 'openEditors'
  | 'workspace'
  | 'none'

/**
 * Scope used for incremental scans after a text document changes.
 */
export type AutomaticDocumentChangeScope =
  | 'visibleEditors'
  | 'openEditors'
  | 'none'

/**
 * Resolves a user-facing scan mode into the initial scan target.
 */
export function initialScanTarget(mode: AnnoPulseScanMode): InitialScanTarget {
  if (mode === 'manual') {
    return 'none'
  }

  return mode
}

/**
 * Resolves a user-facing scan mode into an incremental document-change scope.
 */
export function automaticDocumentChangeScope(
  mode: AnnoPulseScanMode,
): AutomaticDocumentChangeScope {
  if (mode === 'visibleEditors') {
    return 'visibleEditors'
  }

  if (mode === 'openEditors' || mode === 'workspace') {
    return 'openEditors'
  }

  return 'none'
}
