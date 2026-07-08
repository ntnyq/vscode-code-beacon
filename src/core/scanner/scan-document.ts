import type {
  BeaconAnnotation,
  CompiledBeaconRule,
  SerializedPosition,
  SerializedRange,
} from '../../types/annotation'
import { getCommentRanges } from './comment-ranges'
import type { OffsetRange } from './comment-ranges'

export interface BeaconSkipReason {
  readonly reason: 'maxFileSize'
  readonly message: string
}

export interface BeaconScanResult {
  readonly uri: string
  readonly languageId: string
  readonly annotations: readonly BeaconAnnotation[]
  readonly skipped?: BeaconSkipReason
  readonly durationMs: number
}

export interface ScanDocumentOptions {
  readonly text: string
  readonly languageId: string
  readonly uri: string
  readonly source: BeaconAnnotation['source']
  readonly rules: readonly CompiledBeaconRule[]
  readonly commentOnly: boolean
  readonly maxFileSize: number
}

function positionAt(text: string, offset: number): SerializedPosition {
  const before = text.slice(0, offset)
  const line = before.split('\n').length - 1
  const lastNewline = before.lastIndexOf('\n')

  return {
    character: lastNewline === -1 ? offset : offset - lastNewline - 1,
    line,
  }
}

function rangeAt(text: string, start: number, end: number): SerializedRange {
  return {
    end: positionAt(text, end),
    start: positionAt(text, start),
  }
}

function lineEndAt(text: string, offset: number): number {
  const newline = text.indexOf('\n', offset)
  return newline === -1 ? text.length : newline
}

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

function annotationId(
  uri: string,
  ruleId: string,
  start: number,
  keyword: string,
): string {
  return `${uri}:${ruleId}:${start}:${keyword}`
}

function scanRange(
  text: string,
  range: OffsetRange,
  options: ScanDocumentOptions,
): BeaconAnnotation[] {
  const annotations: BeaconAnnotation[] = []
  const segment = text.slice(range.start, range.end)

  for (const rule of options.rules) {
    rule.matcherRegex.lastIndex = 0
    let match: RegExpExecArray | null

    while ((match = rule.matcherRegex.exec(segment))) {
      const start = range.start + match.index
      const keyword = match[0]
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
        range:
          rule.style.marker === 'line'
            ? rangeAt(text, start, messageEnd)
            : keywordRange,
        ruleId: rule.id,
        severity: rule.severity,
        source: options.source,
        uri: options.uri,
      })
    }
  }

  return annotations
}

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

  const ranges = options.commentOnly
    ? getCommentRanges(options.text, options.languageId)
    : [{ end: options.text.length, start: 0 }]

  return {
    annotations: ranges.flatMap(range =>
      scanRange(options.text, range, options),
    ),
    durationMs: Date.now() - startedAt,
    languageId: options.languageId,
    uri: options.uri,
  }
}
