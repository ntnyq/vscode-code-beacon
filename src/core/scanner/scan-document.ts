import type {
  BeaconAnnotation,
  CompiledBeaconRule,
  SerializedPosition,
  SerializedRange,
} from '../../types/annotation'
import { getCommentRanges } from './comment-ranges'
import type { OffsetRange } from './comment-ranges'

/**
 * Reason a document scan was skipped before matching rules.
 */
export interface BeaconSkipReason {
  readonly reason: 'maxFileSize'
  readonly message: string
}

/**
 * Complete result of scanning a single document for beacon annotations.
 */
export interface BeaconScanResult {
  readonly uri: string
  readonly languageId: string
  readonly annotations: readonly BeaconAnnotation[]
  readonly skipped?: BeaconSkipReason
  readonly durationMs: number
}

/**
 * Inputs required by the pure document scanner.
 */
export interface ScanDocumentOptions {
  readonly text: string
  readonly languageId: string
  readonly uri: string
  readonly source: BeaconAnnotation['source']
  readonly rules: readonly CompiledBeaconRule[]
  readonly commentOnly: boolean
  readonly maxFileSize: number
}

/**
 * Converts an absolute text offset to a serialized line/character position.
 */
function positionAt(text: string, offset: number): SerializedPosition {
  const before = text.slice(0, offset)
  const line = before.split('\n').length - 1
  const lastNewline = before.lastIndexOf('\n')

  return {
    character: lastNewline === -1 ? offset : offset - lastNewline - 1,
    line,
  }
}

/**
 * Converts absolute text offsets into a serialized range.
 */
function rangeAt(text: string, start: number, end: number): SerializedRange {
  return {
    end: positionAt(text, end),
    start: positionAt(text, start),
  }
}

/**
 * Finds the offset of the end of the current line.
 */
function lineEndAt(text: string, offset: number): number {
  const newline = text.indexOf('\n', offset)
  return newline === -1 ? text.length : newline
}

/**
 * Extracts the display message for one regex match according to rule settings.
 */
function extractMessage(
  text: string,
  match: RegExpExecArray,
  matchEnd: number,
  rule: CompiledBeaconRule,
): string {
  if (rule.messageMode.mode === 'match') {
    return ''
  }

  if (rule.messageMode.mode === 'group') {
    const namedValue = match.groups?.[rule.messageMode.group]
    return rule.messageMode.trim
      ? (namedValue ?? '').trim()
      : (namedValue ?? '')
  }

  const value = text.slice(matchEnd, lineEndAt(text, matchEnd))
  return rule.messageMode.trim ? value.replace(/^[:\s-]+/u, '').trim() : value
}

/**
 * Builds a stable annotation id from document, rule, and match position.
 */
function annotationId(
  uri: string,
  ruleId: string,
  start: number,
  keyword: string,
): string {
  return `${uri}:${ruleId}:${start}:${keyword}`
}

/**
 * Checks whether a rule is enabled for the current VS Code language id.
 */
function isRuleEnabledForLanguage(
  rule: CompiledBeaconRule,
  languageId: string,
): boolean {
  const languages = rule.languages

  if (!languages || languages.length === 0) {
    return true
  }

  const excluded = new Set(
    languages
      .filter(language => language.startsWith('!'))
      .map(language => language.slice(1)),
  )

  if (excluded.has(languageId) || excluded.has('*')) {
    return false
  }

  const included = languages.filter(language => !language.startsWith('!'))

  return (
    included.length === 0 ||
    included.includes('*') ||
    included.includes(languageId)
  )
}

/**
 * Scans one offset range with every compiled rule.
 */
function scanRange(
  text: string,
  range: OffsetRange,
  options: ScanDocumentOptions,
): BeaconAnnotation[] {
  const annotations: BeaconAnnotation[] = []
  const segment = text.slice(range.start, range.end)

  for (const rule of options.rules) {
    if (!isRuleEnabledForLanguage(rule, options.languageId)) {
      continue
    }

    rule.matcherRegex.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = rule.matcherRegex.exec(segment))) {
      const start = range.start + match.index
      const keyword = match[0]

      if (keyword.length === 0) {
        if (rule.matcherRegex.lastIndex >= segment.length) {
          break
        }
        rule.matcherRegex.lastIndex += 1
        continue
      }

      const end = start + keyword.length
      const message = extractMessage(text, match, end, rule)
      const keywordRange = rangeAt(text, start, end)
      const messageEnd = lineEndAt(text, end)
      const messageRange = rangeAt(text, end, messageEnd)

      annotations.push({
        category: rule.category,
        column: keywordRange.start.character,
        id: annotationId(options.uri, rule.id, start, keyword),
        keyword,
        keywordRange,
        languageId: options.languageId,
        line: keywordRange.start.line,
        message,
        messageRange,
        diagnostics: rule.diagnostics,
        range:
          rule.style.marker === 'line'
            ? rangeAt(text, start, messageEnd)
            : keywordRange,
        ruleId: rule.id,
        severity: rule.severity,
        source: options.source,
        style: rule.style,
        uri: options.uri,
      })
    }
  }

  return annotations
}

/**
 * Scans a document text for all configured beacon annotations.
 */
export function scanDocument(options: ScanDocumentOptions): BeaconScanResult {
  const startedAt = Date.now()

  if (options.maxFileSize > 0 && options.text.length > options.maxFileSize) {
    return {
      annotations: [],
      durationMs: Date.now() - startedAt,
      languageId: options.languageId,
      skipped: {
        message: `File length ${options.text.length} exceeds configured maxFileSize ${options.maxFileSize}`,
        reason: 'maxFileSize',
      },
      uri: options.uri,
    }
  }

  const fullDocumentRanges = [{ end: options.text.length, start: 0 }]
  const commentRanges = getCommentRanges(options.text, options.languageId)

  return {
    annotations: options.rules.flatMap(rule => {
      const ranges =
        options.commentOnly || rule.commentOnly
          ? commentRanges
          : fullDocumentRanges

      return ranges.flatMap(range =>
        scanRange(options.text, range, {
          ...options,
          rules: [rule],
        }),
      )
    }),
    durationMs: Date.now() - startedAt,
    languageId: options.languageId,
    uri: options.uri,
  }
}
