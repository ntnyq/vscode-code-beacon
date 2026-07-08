/**
 * Value shape used by VS Code files.exclude and search.exclude settings.
 */
export type VscodeExcludeValue = boolean | { readonly when?: string }

/**
 * VS Code exclude map keyed by glob pattern.
 */
export type VscodeExcludeConfig = Record<string, VscodeExcludeValue>

/**
 * Converts multiple glob patterns into a single brace-union glob.
 */
export function toGlobUnion(
  patterns: readonly string[],
  fallback?: string,
): string | undefined {
  const normalizedPatterns = patterns
    .map(pattern => pattern.trim())
    .filter(Boolean)

  if (normalizedPatterns.length === 0) {
    return fallback
  }

  if (normalizedPatterns.length === 1) {
    return normalizedPatterns[0] ?? fallback
  }

  return `{${normalizedPatterns.join(',')}}`
}

/**
 * Extracts enabled exclude patterns from a VS Code exclude configuration map.
 */
export function enabledExcludePatterns(
  config: VscodeExcludeConfig | undefined,
): string[] {
  if (!config) {
    return []
  }

  return Object.entries(config)
    .filter(([, value]) => value === true || typeof value === 'object')
    .map(([pattern]) => pattern)
}
