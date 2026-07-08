export type VscodeExcludeValue = boolean | { readonly when?: string }

export type VscodeExcludeConfig = Record<string, VscodeExcludeValue>

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
