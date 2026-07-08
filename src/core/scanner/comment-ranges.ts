/**
 * Offset range within a document that should be scanned for annotations.
 */
export interface OffsetRange {
  readonly start: number
  readonly end: number
  readonly fallback?: boolean
}

/**
 * Comment delimiters supported for a VS Code language id.
 */
interface CommentSyntax {
  readonly line?: readonly string[]
  readonly block?: readonly [string, string][]
}

/**
 * Comment syntax table for languages supported by the lightweight scanner.
 */
const COMMENT_SYNTAX: Record<string, CommentSyntax> = {
  c: { block: [['/*', '*/']], line: ['//'] },
  cpp: { block: [['/*', '*/']], line: ['//'] },
  css: { block: [['/*', '*/']] },
  go: { block: [['/*', '*/']], line: ['//'] },
  html: { block: [['<!--', '-->']] },
  java: { block: [['/*', '*/']], line: ['//'] },
  javascript: { block: [['/*', '*/']], line: ['//'] },
  javascriptreact: { block: [['/*', '*/']], line: ['//'] },
  less: { block: [['/*', '*/']], line: ['//'] },
  markdown: { block: [['<!--', '-->']] },
  python: { line: ['#'] },
  ruby: { line: ['#'] },
  rust: { block: [['/*', '*/']], line: ['//'] },
  scss: { block: [['/*', '*/']], line: ['//'] },
  shellscript: { line: ['#'] },
  toml: { line: ['#'] },
  typescript: { block: [['/*', '*/']], line: ['//'] },
  typescriptreact: { block: [['/*', '*/']], line: ['//'] },
  yaml: { line: ['#'] },
}

/**
 * Finds line-comment ranges for every line containing one of the provided tokens.
 */
function findLineCommentRanges(
  text: string,
  tokens: readonly string[],
): OffsetRange[] {
  const ranges: OffsetRange[] = []
  let lineStart = 0

  while (lineStart <= text.length) {
    const lineEndIndex = text.indexOf('\n', lineStart)
    const lineEnd = lineEndIndex === -1 ? text.length : lineEndIndex
    const line = text.slice(lineStart, lineEnd)
    const tokenIndex = tokens
      .map(token => line.indexOf(token))
      .filter(index => index >= 0)
      .sort((a, b) => a - b)[0]

    if (tokenIndex !== undefined) {
      ranges.push({
        end: lineEnd,
        start: lineStart + tokenIndex,
      })
    }

    if (lineEndIndex === -1) {
      break
    }
    lineStart = lineEnd + 1
  }

  return ranges
}

/**
 * Finds block-comment ranges for every configured open/close delimiter pair.
 */
function findBlockCommentRanges(
  text: string,
  pairs: readonly [string, string][],
): OffsetRange[] {
  const ranges: OffsetRange[] = []

  for (const [open, close] of pairs) {
    let searchFrom = 0
    while (searchFrom < text.length) {
      const start = text.indexOf(open, searchFrom)
      if (start === -1) {
        break
      }

      const closeStart = text.indexOf(close, start + open.length)
      const end = closeStart === -1 ? text.length : closeStart + close.length
      ranges.push({ end, start })
      searchFrom = end
    }
  }

  return ranges
}

/**
 * Returns comment ranges for a language, or a full-document fallback if unknown.
 */
export function getCommentRanges(
  text: string,
  languageId: string,
): readonly OffsetRange[] {
  const syntax = COMMENT_SYNTAX[languageId]

  if (!syntax) {
    return [{ end: text.length, fallback: true, start: 0 }]
  }

  return [
    ...(syntax.line ? findLineCommentRanges(text, syntax.line) : []),
    ...(syntax.block ? findBlockCommentRanges(text, syntax.block) : []),
  ].sort((a, b) => a.start - b.start)
}
