/**
 * Minimal text document shape needed for scan eligibility checks.
 */
export interface ScannableTextDocument {
  readonly languageId: string
  readonly uri: {
    readonly scheme: string
  }
}

/**
 * Provider selector used for source documents across local and virtual schemes.
 */
export const beaconDocumentSelector = '*'

/**
 * Schemes that are text documents but not source files users expect to scan.
 */
const UNSCANNABLE_SCHEMES = new Set(['debug', 'output'])

/**
 * Checks whether a language id is allowed by the current language filters.
 */
export function isLanguageEnabled(
  languageId: string,
  languages: readonly string[],
): boolean {
  if (languages.length === 0) {
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
 * Checks whether a text document can be scanned by Code Beacon.
 */
export function isScannableTextDocument(
  document: ScannableTextDocument,
  languages: readonly string[],
): boolean {
  return (
    !UNSCANNABLE_SCHEMES.has(document.uri.scheme) &&
    isLanguageEnabled(document.languageId, languages)
  )
}
