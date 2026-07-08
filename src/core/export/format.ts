import type { BeaconAnnotation } from '../../types/annotation'

/**
 * Export formats supported by Code Beacon commands.
 */
export type BeaconExportFormat = 'markdown' | 'json' | 'csv'

/**
 * Stable serialized annotation shape used by JSON and CSV exports.
 */
interface ExportableAnnotation {
  readonly category: string
  readonly column: number
  readonly keyword: string
  readonly line: number
  readonly message: string
  readonly ruleId: string
  readonly severity: string
  readonly source: string
  readonly uri: string
}

/**
 * Converts a runtime annotation into a one-based export record.
 */
function toExportableAnnotation(
  annotation: BeaconAnnotation,
): ExportableAnnotation {
  return {
    category: annotation.category,
    column: annotation.column + 1,
    keyword: annotation.keyword,
    line: annotation.line + 1,
    message: annotation.message,
    ruleId: annotation.ruleId,
    severity: annotation.severity,
    source: annotation.source,
    uri: annotation.uri,
  }
}

/**
 * Escapes a single CSV cell value according to common CSV rules.
 */
function escapeCsvValue(value: string | number): string {
  const rawValue = String(value)
  const stringValue = /^[\t\r=+\-@]/u.test(rawValue) ? `'${rawValue}` : rawValue

  if (!/[",\n]/u.test(stringValue)) {
    return stringValue
  }

  return `"${stringValue.replaceAll('"', '""')}"`
}

/**
 * Formats a one-based annotation location for human-readable exports.
 */
function formatAnnotationLink(annotation: BeaconAnnotation): string {
  return `${annotation.uri}:${annotation.line + 1}:${annotation.column + 1}`
}

/**
 * Formats annotations as a compact Markdown report.
 */
export function formatAnnotationsAsMarkdown(
  annotations: readonly BeaconAnnotation[],
): string {
  if (annotations.length === 0) {
    return '# Code Beacon\n\nNo annotations found.\n'
  }

  return [
    '# Code Beacon',
    '',
    ...annotations.map(annotation => {
      const message = annotation.message ? ` - ${annotation.message}` : ''
      return `- \`${annotation.keyword}\` ${formatAnnotationLink(annotation)}${message}`
    }),
    '',
  ].join('\n')
}

/**
 * Formats annotations as pretty-printed JSON with one-based positions.
 */
export function formatAnnotationsAsJson(
  annotations: readonly BeaconAnnotation[],
): string {
  return `${JSON.stringify(annotations.map(toExportableAnnotation), null, 2)}\n`
}

/**
 * Formats annotations as CSV with escaped values and one-based positions.
 */
export function formatAnnotationsAsCsv(
  annotations: readonly BeaconAnnotation[],
): string {
  const headers = [
    'uri',
    'line',
    'column',
    'keyword',
    'message',
    'category',
    'severity',
    'ruleId',
    'source',
  ]
  const rows = annotations.map(annotation => {
    const item = toExportableAnnotation(annotation)
    return [
      item.uri,
      item.line,
      item.column,
      item.keyword,
      item.message,
      item.category,
      item.severity,
      item.ruleId,
      item.source,
    ]
      .map(escapeCsvValue)
      .join(',')
  })

  return `${[headers.join(','), ...rows].join('\n')}\n`
}

/**
 * Dispatches annotation export formatting by requested format.
 */
export function formatAnnotations(
  annotations: readonly BeaconAnnotation[],
  format: BeaconExportFormat,
): string {
  const formatters = {
    csv: formatAnnotationsAsCsv,
    json: formatAnnotationsAsJson,
    markdown: formatAnnotationsAsMarkdown,
  }

  return formatters[format](annotations)
}
