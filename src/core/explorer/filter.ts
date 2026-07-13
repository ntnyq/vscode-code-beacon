import type {
  BeaconAnnotation,
  BeaconCategory,
  BeaconSeverity,
} from '../../types/annotation'

/**
 * Scope used to select the annotations displayed in the Code Beacon Explorer.
 */
export type BeaconExplorerScope = 'workspace' | 'activeFile' | 'openEditors'

/**
 * Plain Explorer filter input independent from the VS Code API.
 */
export interface BeaconExplorerFilter {
  readonly scope: BeaconExplorerScope
  readonly categories: readonly BeaconCategory[]
  readonly severities: readonly BeaconSeverity[]
  readonly owners: readonly string[]
  readonly query: string
  readonly includeResolved: boolean
  readonly includeIgnored: boolean
  readonly activeUri: string | undefined
  readonly openUris: readonly string[]
}

/**
 * Compares annotations by source location for deterministic Explorer output.
 */
export function compareBeaconAnnotations(
  left: BeaconAnnotation,
  right: BeaconAnnotation,
): number {
  return (
    left.uri.localeCompare(right.uri) ||
    left.line - right.line ||
    left.column - right.column
  )
}

/**
 * Returns the annotations matching a plain Explorer filter in source order.
 */
export function filterBeaconAnnotations(
  annotations: readonly BeaconAnnotation[],
  filter: BeaconExplorerFilter,
): BeaconAnnotation[] {
  const query = filter.query.trim().toLowerCase()
  const openUris = new Set(filter.openUris)

  return annotations
    .filter(annotation => {
      if (annotation.resolved && !filter.includeResolved) {
        return false
      }

      if (annotation.ignored && !filter.includeIgnored) {
        return false
      }

      if (
        filter.scope === 'activeFile' &&
        annotation.uri !== filter.activeUri
      ) {
        return false
      }

      if (filter.scope === 'openEditors' && !openUris.has(annotation.uri)) {
        return false
      }

      if (
        filter.categories.length > 0 &&
        !filter.categories.includes(annotation.category)
      ) {
        return false
      }

      if (
        filter.severities.length > 0 &&
        !filter.severities.includes(annotation.severity)
      ) {
        return false
      }

      if (
        filter.owners.length > 0 &&
        !filter.owners.includes(annotation.owner ?? '')
      ) {
        return false
      }

      if (query === '') {
        return true
      }

      return [
        annotation.keyword,
        annotation.message,
        annotation.owner ?? '',
        annotation.ruleId,
      ].some(value => value.toLowerCase().includes(query))
    })
    .toSorted(compareBeaconAnnotations)
}
