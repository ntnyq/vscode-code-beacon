import type { AnnoPulseAnnotation } from '../../types/annotation'
import type { AnnoPulseGitMetadata } from '../git/blame'

/**
 * Portable issue content generated from a AnnoPulse annotation.
 */
export interface AnnoPulseIssueContent {
  readonly title: string
  readonly body: string
}

/**
 * Converts CRLF and CR line endings to LF.
 */
function normalizeLineEndings(value: string): string {
  return value.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
}

/**
 * Converts dynamic inline content into one trimmed line.
 */
function normalizeInlineText(value: string): string {
  return normalizeLineEndings(value)
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .join(' ')
}

/**
 * Finds the longest consecutive backtick run in a string.
 */
function longestBacktickRun(value: string): number {
  let longestRun = 0
  let currentRun = 0

  for (const character of value) {
    if (character === '`') {
      currentRun += 1
      longestRun = Math.max(longestRun, currentRun)
    } else {
      currentRun = 0
    }
  }

  return longestRun
}

/**
 * Formats a value as safe inline Markdown code with a unique delimiter.
 */
function formatInlineCode(value: string): string {
  const inlineText = normalizeInlineText(value)
  const delimiter = '`'.repeat(longestBacktickRun(inlineText) + 1)
  const padding =
    inlineText.startsWith('`') || inlineText.endsWith('`') ? ' ' : ''

  return `${delimiter}${padding}${inlineText}${padding}${delimiter}`
}

/**
 * Escapes Markdown punctuation so dynamic text remains literal.
 */
function escapeMarkdownText(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll(
      /(?<punctuation>[\\`*_[\]{}()#!<>+.\-|~])/gu,
      String.raw`\$<punctuation>`,
    )
}

/**
 * Converts message text to one safe, literal body paragraph.
 */
function formatBodyParagraph(value: string): string {
  return escapeMarkdownText(normalizeInlineText(value))
}

/**
 * Extracts the first nonempty line for an issue title.
 */
function firstNonemptyLine(value: string): string {
  return (
    normalizeLineEndings(value)
      .split('\n')
      .find(line => line.trim())
      ?.trim() ?? ''
  )
}

/**
 * Formats a one-based annotation location for an issue body.
 */
function formatLocation(annotation: AnnoPulseAnnotation): string {
  return `${normalizeInlineText(annotation.uri)}:${annotation.line + 1}:${annotation.column + 1}`
}

/**
 * Builds a portable Markdown title and body for one AnnoPulse annotation.
 */
export function formatAnnoPulseIssue(
  annotation: AnnoPulseAnnotation,
  metadata?: AnnoPulseGitMetadata,
): AnnoPulseIssueContent {
  const title = [
    normalizeInlineText(annotation.keyword),
    firstNonemptyLine(annotation.message),
  ]
    .filter(Boolean)
    .join(' ')
  const owner = normalizeInlineText(annotation.owner ?? '')
  const ownerLine = owner ? `- **Owner:** ${formatInlineCode(owner)}` : ''
  const message = formatBodyParagraph(annotation.message)
  const gitSection = metadata
    ? [
        '## Git',
        '',
        `- **Author:** ${formatBodyParagraph(metadata.authorName)}`,
        `- **Date:** ${formatInlineCode(metadata.commitDate)}`,
        `- **Commit:** ${formatInlineCode(
          normalizeInlineText(metadata.hash).slice(0, 7),
        )}`,
        `- **Summary:** ${formatBodyParagraph(metadata.summary)}`,
      ].join('\n')
    : ''

  return {
    title,
    body: [
      '## AnnoPulse',
      '',
      `- **Category:** ${formatInlineCode(annotation.category)}`,
      `- **Severity:** ${formatInlineCode(annotation.severity)}`,
      `- **Rule:** ${formatInlineCode(annotation.ruleId)}`,
      `- **Location:** ${formatInlineCode(formatLocation(annotation))}`,
      ...(ownerLine ? [ownerLine] : []),
      '',
      '## Annotation',
      '',
      message || 'No annotation message provided.',
      ...(gitSection ? ['', gitSection] : []),
      '',
    ].join('\n'),
  }
}
