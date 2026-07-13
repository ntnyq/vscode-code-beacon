import type { BeaconAnnotation } from '../../types/annotation'
import type { BeaconGitMetadata } from '../git/blame'

/**
 * Formats a one-based annotation location for hover content.
 */
function formatAnnotationLocation(annotation: BeaconAnnotation): string {
  return `${annotation.uri}:${annotation.line + 1}:${annotation.column + 1}`
}

/**
 * Builds Markdown hover content for a beacon annotation.
 */
export function formatBeaconHoverMarkdown(
  annotation: BeaconAnnotation,
  metadata?: BeaconGitMetadata,
): string {
  const title = annotation.message
    ? `**${annotation.keyword}** ${annotation.message}`
    : `**${annotation.keyword}**`

  const details = [
    title,
    '',
    `- Category: \`${annotation.category}\``,
    `- Severity: \`${annotation.severity}\``,
    `- Rule: \`${annotation.ruleId}\``,
    `- Source: \`${annotation.source}\``,
    `- Location: \`${formatAnnotationLocation(annotation)}\``,
  ]

  if (metadata) {
    details.push(
      '',
      '**Git**',
      `- Author: ${metadata.authorName}`,
      `- Date: \`${metadata.commitDate}\``,
      `- Commit: \`${metadata.hash.slice(0, 7)}\``,
      `- Summary: ${metadata.summary}`,
    )
  }

  return details.join('\n')
}
