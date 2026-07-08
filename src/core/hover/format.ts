import type { BeaconAnnotation } from '../../types/annotation'

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
): string {
  const title = annotation.message
    ? `**${annotation.keyword}** ${annotation.message}`
    : `**${annotation.keyword}**`

  return [
    title,
    '',
    `- Category: \`${annotation.category}\``,
    `- Severity: \`${annotation.severity}\``,
    `- Rule: \`${annotation.ruleId}\``,
    `- Source: \`${annotation.source}\``,
    `- Location: \`${formatAnnotationLocation(annotation)}\``,
  ].join('\n')
}
