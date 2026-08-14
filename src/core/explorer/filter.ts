import type {
  AnnoPulseAnnotation,
  AnnoPulseCategory,
  AnnoPulseSeverity,
} from '../../types/annotation'
import type { AnnoPulseGitMetadata } from '../git/blame'

/**
 * Scope used to select the annotations displayed in the AnnoPulse Explorer.
 */
export type AnnoPulseExplorerScope =
  | 'workspace'
  | 'activeFile'
  | 'openEditors'
  | 'changedFiles'

/**
 * Plain Explorer filter input independent from the VS Code API.
 */
export interface AnnoPulseExplorerFilter {
  readonly scope: AnnoPulseExplorerScope
  readonly categories: readonly AnnoPulseCategory[]
  readonly severities: readonly AnnoPulseSeverity[]
  readonly owners: readonly string[]
  readonly query: string
  readonly includeResolved: boolean
  readonly includeIgnored: boolean
  readonly onlyOwnerless: boolean
  readonly onlyStale: boolean
  readonly staleDays: number
  readonly now: Date
  readonly metadataByAnnotationId: ReadonlyMap<string, AnnoPulseGitMetadata>
  readonly activeUri: string | undefined
  readonly openUris: readonly string[]
  readonly changedUris: ReadonlySet<string>
}

export function isAnnoPulseOwnerless(annotation: AnnoPulseAnnotation): boolean {
  return (
    annotation.owner?.trim() === undefined || annotation.owner.trim() === ''
  )
}

export function isAnnoPulseStale(
  metadata: AnnoPulseGitMetadata | undefined,
  staleDays: number,
  now: Date,
): boolean {
  const commitTime = metadata ? Date.parse(metadata.commitDate) : Number.NaN
  const cutoff = now.getTime() - staleDays * 24 * 60 * 60 * 1000
  return Number.isFinite(commitTime) && commitTime < cutoff
}

/**
 * Compares annotations by source location for deterministic Explorer output.
 */
export function compareAnnoPulseAnnotations(
  left: AnnoPulseAnnotation,
  right: AnnoPulseAnnotation,
): number {
  return (
    left.uri.localeCompare(right.uri) ||
    left.line - right.line ||
    left.column - right.column
  )
}

function matchesScope(
  annotation: AnnoPulseAnnotation,
  filter: AnnoPulseExplorerFilter,
  openUris: ReadonlySet<string>,
): boolean {
  switch (filter.scope) {
    case 'activeFile': {
      return annotation.uri === filter.activeUri
    }
    case 'changedFiles': {
      return filter.changedUris.has(annotation.uri)
    }
    case 'openEditors': {
      return openUris.has(annotation.uri)
    }
    case 'workspace': {
      return true
    }
  }
}

function matchesState(
  annotation: AnnoPulseAnnotation,
  filter: AnnoPulseExplorerFilter,
): boolean {
  return (
    (!annotation.resolved || filter.includeResolved) &&
    (!annotation.ignored || filter.includeIgnored)
  )
}

function matchesGitMetadata(
  annotation: AnnoPulseAnnotation,
  filter: AnnoPulseExplorerFilter,
): boolean {
  return (
    (!filter.onlyOwnerless || isAnnoPulseOwnerless(annotation)) &&
    (!filter.onlyStale ||
      isAnnoPulseStale(
        filter.metadataByAnnotationId.get(annotation.id),
        filter.staleDays,
        filter.now,
      ))
  )
}

function matchesFacets(
  annotation: AnnoPulseAnnotation,
  filter: AnnoPulseExplorerFilter,
): boolean {
  return (
    (filter.categories.length === 0 ||
      filter.categories.includes(annotation.category)) &&
    (filter.severities.length === 0 ||
      filter.severities.includes(annotation.severity)) &&
    (filter.owners.length === 0 ||
      filter.owners.includes(annotation.owner ?? ''))
  )
}

function matchesQuery(annotation: AnnoPulseAnnotation, query: string): boolean {
  return (
    query === '' ||
    [
      annotation.keyword,
      annotation.message,
      annotation.owner ?? '',
      annotation.ruleId,
    ].some(value => value.toLowerCase().includes(query))
  )
}

/**
 * Returns the annotations matching a plain Explorer filter in source order.
 */
export function filterAnnoPulseAnnotations(
  annotations: readonly AnnoPulseAnnotation[],
  filter: AnnoPulseExplorerFilter,
): AnnoPulseAnnotation[] {
  const query = filter.query.trim().toLowerCase()
  const openUris = new Set(filter.openUris)

  return annotations
    .filter(
      annotation =>
        matchesState(annotation, filter) &&
        matchesScope(annotation, filter, openUris) &&
        matchesGitMetadata(annotation, filter) &&
        matchesFacets(annotation, filter) &&
        matchesQuery(annotation, query),
    )
    .toSorted(compareAnnoPulseAnnotations)
}
