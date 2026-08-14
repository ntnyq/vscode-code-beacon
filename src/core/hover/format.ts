import type { AnnoPulseAnnotation } from '../../types/annotation'
import type { AnnoPulseGitMetadata } from '../git/blame'
import {
  annopulseDisplayOwner,
  annopulseDisplayState,
  formatAnnoPulseGitAge,
} from '../git/presentation'

/**
 * Formats a one-based annotation location for hover content.
 */
function formatAnnotationLocation(annotation: AnnoPulseAnnotation): string {
  return `${annotation.uri}:${annotation.line + 1}:${annotation.column + 1}`
}

function escapeMarkdown(value: string): string {
  return value.replaceAll(/[\\`*_{}[\]<>()#+\-.!|]/gu, String.raw`\$&`)
}

/**
 * Builds Markdown hover content for an AnnoPulse annotation.
 */
export function formatAnnoPulseHoverMarkdown(
  annotation: AnnoPulseAnnotation,
  metadata?: AnnoPulseGitMetadata,
  now: Date = new Date(),
): string {
  const owner = annopulseDisplayOwner(annotation)
  const title = annotation.message
    ? `**${escapeMarkdown(annotation.keyword)}** ${escapeMarkdown(annotation.message)}`
    : `**${escapeMarkdown(annotation.keyword)}**`

  const details = [
    title,
    '',
    `- Category: \`${escapeMarkdown(annotation.category)}\``,
    `- Severity: \`${escapeMarkdown(annotation.severity)}\``,
    `- Rule: \`${escapeMarkdown(annotation.ruleId)}\``,
    `- Source: \`${escapeMarkdown(annotation.source)}\``,
    `- Location: \`${escapeMarkdown(formatAnnotationLocation(annotation))}\``,
  ]

  if (owner) {
    details.push(`- Owner: @${escapeMarkdown(owner)}`)
  }

  details.push(`- State: ${annopulseDisplayState(annotation)}`)

  if (metadata) {
    const age = formatAnnoPulseGitAge(metadata, now)

    details.push(
      '',
      '**Git**',
      `- Author: ${escapeMarkdown(metadata.authorName)}`,
      ...(metadata.authorEmail
        ? [`- Email: ${escapeMarkdown(metadata.authorEmail)}`]
        : []),
      `- Date: \`${escapeMarkdown(metadata.commitDate)}\``,
      ...(age ? [`- Age: \`${age}\``] : []),
      `- Commit: \`${escapeMarkdown(metadata.hash.slice(0, 7))}\``,
      `- Summary: ${escapeMarkdown(metadata.summary)}`,
    )
  }

  return details.join('\n')
}
