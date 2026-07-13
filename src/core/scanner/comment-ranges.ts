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
  readonly quotes?: readonly QuoteSyntax[]
}

interface QuoteSyntax {
  readonly delimiter: string
  readonly multiline: boolean
  readonly escapeMode: 'backslash' | 'double' | 'none'
  readonly prefixes: readonly string[]
  readonly startMode: 'any' | 'boundary'
}

interface CreateQuoteOptions {
  readonly multiline?: boolean
  readonly prefixes?: readonly string[]
  readonly startMode?: QuoteSyntax['startMode']
}

function createQuote(
  delimiter: string,
  escapeMode: QuoteSyntax['escapeMode'],
  options: CreateQuoteOptions = {},
): QuoteSyntax {
  return {
    delimiter,
    escapeMode,
    multiline: options.multiline ?? false,
    prefixes: options.prefixes ?? [],
    startMode: options.startMode ?? 'boundary',
  }
}

const backslashQuote = (
  delimiter: string,
  options?: CreateQuoteOptions,
): QuoteSyntax => createQuote(delimiter, 'backslash', options)
const plainQuote = (
  delimiter: string,
  options?: CreateQuoteOptions,
): QuoteSyntax => createQuote(delimiter, 'none', options)
const doubledQuote = (
  delimiter: string,
  options?: CreateQuoteOptions,
): QuoteSyntax => createQuote(delimiter, 'double', options)

const PYTHON_STRING_PREFIXES = [
  'fr',
  'rf',
  'br',
  'rb',
  'f',
  'r',
  'b',
  'u',
] as const

const C_LIKE_QUOTES = [backslashQuote('"'), backslashQuote("'")] as const
const JAVASCRIPT_QUOTES = [
  ...C_LIKE_QUOTES,
  backslashQuote('`', { multiline: true }),
] as const
const GO_QUOTES = [
  ...C_LIKE_QUOTES,
  plainQuote('`', { multiline: true }),
] as const
const HTML_QUOTES = [plainQuote('"'), plainQuote("'")] as const
const PYTHON_QUOTES = [
  backslashQuote('"""', {
    multiline: true,
    prefixes: PYTHON_STRING_PREFIXES,
  }),
  backslashQuote("'''", {
    multiline: true,
    prefixes: PYTHON_STRING_PREFIXES,
  }),
  backslashQuote('"', { prefixes: PYTHON_STRING_PREFIXES }),
  backslashQuote("'", { prefixes: PYTHON_STRING_PREFIXES }),
] as const
const SHELL_QUOTES = [
  backslashQuote('"', { startMode: 'any' }),
  plainQuote("'", { startMode: 'any' }),
  backslashQuote('`', { multiline: true, startMode: 'any' }),
] as const
const TOML_QUOTES = [
  backslashQuote('"""', { multiline: true }),
  plainQuote("'''", { multiline: true }),
  backslashQuote('"'),
  plainQuote("'"),
] as const
const YAML_QUOTES = [backslashQuote('"'), doubledQuote("'")] as const

/**
 * Comment syntax table for languages supported by the lightweight scanner.
 */
const COMMENT_SYNTAX: Record<string, CommentSyntax> = {
  c: { block: [['/*', '*/']], line: ['//'], quotes: C_LIKE_QUOTES },
  cpp: { block: [['/*', '*/']], line: ['//'], quotes: C_LIKE_QUOTES },
  css: { block: [['/*', '*/']], quotes: C_LIKE_QUOTES },
  go: { block: [['/*', '*/']], line: ['//'], quotes: GO_QUOTES },
  html: { block: [['<!--', '-->']], quotes: HTML_QUOTES },
  java: { block: [['/*', '*/']], line: ['//'], quotes: C_LIKE_QUOTES },
  javascript: {
    block: [['/*', '*/']],
    line: ['//'],
    quotes: JAVASCRIPT_QUOTES,
  },
  javascriptreact: {
    block: [['/*', '*/']],
    line: ['//'],
    quotes: JAVASCRIPT_QUOTES,
  },
  less: { block: [['/*', '*/']], line: ['//'], quotes: C_LIKE_QUOTES },
  markdown: { block: [['<!--', '-->']] },
  python: { line: ['#'], quotes: PYTHON_QUOTES },
  ruby: { line: ['#'], quotes: C_LIKE_QUOTES },
  rust: {
    block: [['/*', '*/']],
    line: ['//'],
    quotes: [backslashQuote('"')],
  },
  scss: { block: [['/*', '*/']], line: ['//'], quotes: C_LIKE_QUOTES },
  shellscript: { line: ['#'], quotes: SHELL_QUOTES },
  toml: { line: ['#'], quotes: TOML_QUOTES },
  typescript: {
    block: [['/*', '*/']],
    line: ['//'],
    quotes: JAVASCRIPT_QUOTES,
  },
  typescriptreact: {
    block: [['/*', '*/']],
    line: ['//'],
    quotes: JAVASCRIPT_QUOTES,
  },
  yaml: { line: ['#'], quotes: YAML_QUOTES },
}

function quotedValueEnd(
  text: string,
  start: number,
  quote: QuoteSyntax,
): number {
  const { delimiter, escapeMode, multiline } = quote

  for (let index = start + delimiter.length; index < text.length; index += 1) {
    if (escapeMode === 'backslash' && text[index] === '\\') {
      index += 1
      continue
    }

    if (text.startsWith(delimiter, index)) {
      if (
        escapeMode === 'double' &&
        text.startsWith(delimiter, index + delimiter.length)
      ) {
        index += delimiter.length * 2 - 1
        continue
      }

      return index + delimiter.length
    }

    if (!multiline && text[index] === '\n') {
      return index + 1
    }
  }

  return text.length
}

function tokenAt(
  text: string,
  index: number,
  tokens: readonly string[],
): string | undefined {
  for (const token of tokens) {
    if (text.startsWith(token, index)) {
      return token
    }
  }

  return undefined
}

function isEscaped(text: string, index: number): boolean {
  let backslashCount = 0

  for (let cursor = index - 1; cursor >= 0 && text[cursor] === '\\'; cursor--) {
    backslashCount += 1
  }

  return backslashCount % 2 === 1
}

function canStartQuotedValue(
  text: string,
  index: number,
  quote: QuoteSyntax,
): boolean {
  const { prefixes, startMode } = quote
  if (isEscaped(text, index)) {
    return false
  }

  if (startMode === 'any' || index === 0) {
    return true
  }

  const isBoundary = (position: number) =>
    position === 0 || /[\s=([{,:;!?&|+*/%<>-]/u.test(text[position - 1] ?? '')

  if (isBoundary(index)) {
    return true
  }

  const lowerText = text.toLowerCase()
  return prefixes.some(prefix => {
    const prefixStart = index - prefix.length
    return (
      prefixStart >= 0 &&
      lowerText.slice(prefixStart, index) === prefix &&
      isBoundary(prefixStart)
    )
  })
}

function quoteAt(
  text: string,
  index: number,
  quotes: readonly QuoteSyntax[],
): QuoteSyntax | undefined {
  for (const quote of quotes) {
    if (text.startsWith(quote.delimiter, index)) {
      return quote
    }
  }

  return undefined
}

function blockPairAt(
  text: string,
  index: number,
  pairs: readonly [string, string][],
): readonly [string, string] | undefined {
  for (const pair of pairs) {
    if (text.startsWith(pair[0], index)) {
      return pair
    }
  }

  return undefined
}

/**
 * Finds non-overlapping comments while skipping common quoted string forms.
 */
function findCommentRanges(text: string, syntax: CommentSyntax): OffsetRange[] {
  const ranges: OffsetRange[] = []
  const lineTokens = syntax.line ?? []
  const blockPairs = syntax.block ?? []
  let index = 0

  while (index < text.length) {
    const lineToken = tokenAt(text, index, lineTokens)
    if (lineToken) {
      const lineEnd = text.indexOf('\n', index + lineToken.length)
      const end = lineEnd === -1 ? text.length : lineEnd
      ranges.push({ end, start: index })
      index = end
      continue
    }

    const blockPair = blockPairAt(text, index, blockPairs)
    if (blockPair) {
      const [open, close] = blockPair
      const closeStart = text.indexOf(close, index + open.length)
      const end = closeStart === -1 ? text.length : closeStart + close.length
      ranges.push({ end, start: index })
      index = end
      continue
    }

    const quote = quoteAt(text, index, syntax.quotes ?? [])
    if (quote && canStartQuotedValue(text, index, quote)) {
      index = quotedValueEnd(text, index, quote)
      continue
    }

    index += 1
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

  return findCommentRanges(text, syntax)
}
