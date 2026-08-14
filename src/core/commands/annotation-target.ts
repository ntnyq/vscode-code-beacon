import type { AnnoPulseAnnotation } from '../../types/annotation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isAnnoPulseCategory(value: unknown): boolean {
  return (
    value === 'todo' ||
    value === 'fixme' ||
    value === 'bug' ||
    value === 'hack' ||
    value === 'note' ||
    value === 'review' ||
    value === 'security' ||
    value === 'perf' ||
    value === 'question' ||
    value === 'custom'
  )
}

function isAnnoPulseSeverity(value: unknown): boolean {
  return (
    value === 'hint' ||
    value === 'information' ||
    value === 'warning' ||
    value === 'error'
  )
}

function isSerializedPosition(value: unknown): boolean {
  return (
    isRecord(value) &&
    typeof value.line === 'number' &&
    Number.isInteger(value.line) &&
    value.line >= 0 &&
    typeof value.character === 'number' &&
    Number.isInteger(value.character) &&
    value.character >= 0
  )
}

function isSerializedRange(value: unknown): boolean {
  return (
    isRecord(value) &&
    isSerializedPosition(value.start) &&
    isSerializedPosition(value.end)
  )
}

function isAnnoPulseStyle(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.marker === 'keyword' ||
      value.marker === 'message' ||
      value.marker === 'line') &&
    typeof value.color === 'string' &&
    typeof value.backgroundColor === 'string' &&
    typeof value.border === 'string' &&
    typeof value.borderRadius === 'string' &&
    typeof value.overviewRulerColor === 'string'
  )
}

function isAnnoPulseDiagnostics(value: unknown): boolean {
  return (
    isRecord(value) &&
    (!('enabled' in value) || typeof value.enabled === 'boolean') &&
    (!('severity' in value) || isAnnoPulseSeverity(value.severity))
  )
}

function isAnnoPulseSource(value: unknown): boolean {
  return (
    value === 'visibleEditor' ||
    value === 'openEditor' ||
    value === 'workspace' ||
    value === 'notebook'
  )
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === 'string'
}

function isOptionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === 'boolean'
}

function hasRequiredAnnotationFields(value: Record<string, unknown>): boolean {
  return (
    typeof value.id === 'string' &&
    typeof value.ruleId === 'string' &&
    isAnnoPulseCategory(value.category) &&
    isAnnoPulseSeverity(value.severity) &&
    typeof value.uri === 'string' &&
    typeof value.languageId === 'string' &&
    isSerializedRange(value.range) &&
    isSerializedRange(value.keywordRange) &&
    typeof value.line === 'number' &&
    Number.isInteger(value.line) &&
    value.line >= 0 &&
    typeof value.column === 'number' &&
    Number.isInteger(value.column) &&
    value.column >= 0 &&
    typeof value.keyword === 'string' &&
    typeof value.message === 'string' &&
    isAnnoPulseSource(value.source)
  )
}

function hasValidOptionalAnnotationFields(
  value: Record<string, unknown>,
): boolean {
  return (
    (value.style === undefined || isAnnoPulseStyle(value.style)) &&
    (value.messageRange === undefined ||
      isSerializedRange(value.messageRange)) &&
    (value.diagnostics === undefined ||
      isAnnoPulseDiagnostics(value.diagnostics)) &&
    isOptionalString(value.owner) &&
    isOptionalString(value.dueDate) &&
    isOptionalString(value.expiresDate) &&
    isOptionalBoolean(value.resolved) &&
    isOptionalBoolean(value.ignored)
  )
}

function isAnnoPulseAnnotation(value: unknown): value is AnnoPulseAnnotation {
  return (
    isRecord(value) &&
    hasRequiredAnnotationFields(value) &&
    hasValidOptionalAnnotationFields(value)
  )
}

/**
 * Decodes a command argument as either a direct annotation or an Explorer leaf.
 */
export function decodeAnnotationTarget(
  value: unknown,
): AnnoPulseAnnotation | undefined {
  if (isAnnoPulseAnnotation(value)) {
    return value
  }

  if (
    isRecord(value) &&
    value.type === 'annopulse' &&
    isAnnoPulseAnnotation(value.annotation)
  ) {
    return value.annotation
  }

  return undefined
}
