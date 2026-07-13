import type { BeaconAnnotation } from '../../types/annotation'
import type { BeaconGitMetadata } from './blame'

/**
 * Returns a trimmed owner name when an annotation has one.
 */
export function beaconDisplayOwner(
  annotation: BeaconAnnotation,
): string | undefined {
  return annotation.owner?.trim() || undefined
}

/**
 * Returns the annotation lifecycle state for display.
 */
export function beaconDisplayState(annotation: BeaconAnnotation): string {
  const states = [
    ...(annotation.resolved ? ['resolved'] : []),
    ...(annotation.ignored ? ['ignored'] : []),
  ]

  return states.join(', ') || 'active'
}

/**
 * Formats a commit date as a deterministic relative day label.
 */
export function formatBeaconGitAge(
  metadata: BeaconGitMetadata | undefined,
  now: Date,
): string | undefined {
  const commitTime = Date.parse(metadata?.commitDate ?? '')

  if (!Number.isFinite(commitTime)) {
    return undefined
  }

  const days = Math.floor((now.getTime() - commitTime) / 86_400_000)

  if (days <= 0) {
    return 'today'
  }

  return `${days} ${days === 1 ? 'day' : 'days'} ago`
}

/**
 * Formats compact metadata for a Beacon Explorer item description.
 */
export function formatBeaconExplorerDescription(
  annotation: BeaconAnnotation,
  metadata: BeaconGitMetadata | undefined,
  now: Date,
): string {
  const owner = beaconDisplayOwner(annotation)
  const age = formatBeaconGitAge(metadata, now)

  return [
    `${annotation.line + 1}:${annotation.column + 1}`,
    owner ? `@${owner}` : undefined,
    metadata?.authorName,
    age,
    ...(annotation.resolved ? ['resolved'] : []),
    ...(annotation.ignored ? ['ignored'] : []),
  ]
    .filter((value): value is string => value !== undefined)
    .join(' • ')
}

/**
 * Formats complete plain-text metadata for a Beacon Explorer tooltip.
 */
export function formatBeaconExplorerTooltip(
  annotation: BeaconAnnotation,
  metadata: BeaconGitMetadata | undefined,
  now: Date,
): string {
  const owner = beaconDisplayOwner(annotation)
  const age = formatBeaconGitAge(metadata, now)
  const title = annotation.message
    ? `${annotation.keyword} ${annotation.message}`
    : annotation.keyword
  const details = [
    title,
    `Location: ${annotation.uri}:${annotation.line + 1}:${annotation.column + 1}`,
    `Owner: ${owner ? `@${owner}` : 'Unassigned'}`,
    `State: ${beaconDisplayState(annotation)}`,
  ]

  if (metadata) {
    details.push(
      'Git:',
      `Author: ${metadata.authorName}`,
      ...(metadata.authorEmail ? [`Email: ${metadata.authorEmail}`] : []),
      `Date: ${metadata.commitDate}`,
      ...(age ? [`Age: ${age}`] : []),
      `Commit: ${metadata.hash.slice(0, 7)}`,
      `Summary: ${metadata.summary}`,
    )
  }

  return details.join('\n')
}
