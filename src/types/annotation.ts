/**
 * Semantic bucket used to group and style an AnnoPulse annotation.
 */
export type AnnoPulseCategory =
  | 'todo'
  | 'fixme'
  | 'bug'
  | 'hack'
  | 'note'
  | 'review'
  | 'security'
  | 'perf'
  | 'question'
  | 'custom'

/**
 * Product-level severity that maps to decorations and VS Code diagnostics.
 */
export type AnnoPulseSeverity = 'hint' | 'information' | 'warning' | 'error'

/**
 * Decoration target that controls how much of an annotation is highlighted.
 */
export type AnnoPulseMarker = 'keyword' | 'message' | 'line'

/**
 * Serializable zero-based text position independent of VS Code runtime types.
 */
export interface SerializedPosition {
  readonly line: number
  readonly character: number
}

/**
 * Serializable text range independent of VS Code runtime types.
 */
export interface SerializedRange {
  readonly start: SerializedPosition
  readonly end: SerializedPosition
}

/**
 * User-facing matcher that searches for a literal text token.
 */
export interface AnnoPulseTextMatcherConfig {
  readonly type: 'text'
  readonly value: string
  readonly caseSensitive?: boolean
  readonly wholeWord?: boolean
  readonly colon?: 'required' | 'optional' | 'forbidden'
}

/**
 * User-facing matcher that searches with a regular expression.
 */
export interface AnnoPulseRegexMatcherConfig {
  readonly type: 'regex'
  readonly pattern: string
  readonly flags?: string
}

/**
 * Supported matcher variants for an AnnoPulse rule.
 */
export type AnnoPulseMatcherConfig =
  | AnnoPulseTextMatcherConfig
  | AnnoPulseRegexMatcherConfig

/**
 * Visual styling options used to build VS Code decoration types.
 */
export interface AnnoPulseStyleConfig {
  readonly marker?: AnnoPulseMarker
  readonly color?: string
  readonly backgroundColor?: string
  readonly border?: string
  readonly borderRadius?: string
  readonly overviewRulerColor?: string
}

/**
 * Per-rule diagnostics options reserved for Problems integration.
 */
export interface AnnoPulseDiagnosticsConfig {
  readonly enabled?: boolean
  readonly severity?: AnnoPulseSeverity
}

/**
 * Message extraction strategy used after a keyword or regex match.
 */
export interface AnnoPulseMessageConfig {
  readonly mode?: 'lineRest' | 'match' | 'group'
  readonly group?: string
  readonly trim?: boolean
}

/**
 * Configurable rule that describes how an AnnoPulse annotation is detected.
 */
export interface AnnoPulseRuleConfig {
  readonly id: string
  readonly label: string
  readonly category: AnnoPulseCategory
  readonly enabled?: boolean
  readonly matcher: AnnoPulseMatcherConfig
  readonly message?: AnnoPulseMessageConfig
  readonly severity: AnnoPulseSeverity
  readonly commentOnly?: boolean
  readonly languages?: readonly string[]
  readonly style?: AnnoPulseStyleConfig
  readonly diagnostics?: AnnoPulseDiagnosticsConfig
}

/**
 * Runtime-ready rule with compiled matcher and fully resolved defaults.
 */
export interface CompiledAnnoPulseRule extends AnnoPulseRuleConfig {
  readonly enabled: true
  readonly matcherRegex: RegExp
  readonly caseSensitive: boolean
  readonly messageMode: Required<AnnoPulseMessageConfig>
  readonly style: Required<AnnoPulseStyleConfig>
}

/**
 * Validation error produced while normalizing user-provided rules.
 */
export interface AnnoPulseRuleError {
  readonly ruleId: string
  readonly message: string
}

/**
 * Result of merging built-in rules with user overrides.
 */
export interface NormalizedRuleResult {
  readonly rules: readonly CompiledAnnoPulseRule[]
  readonly errors: readonly AnnoPulseRuleError[]
}

/**
 * Concrete annotation found in a document scan.
 */
export interface AnnoPulseAnnotation {
  readonly id: string
  readonly ruleId: string
  readonly category: AnnoPulseCategory
  readonly severity: AnnoPulseSeverity
  readonly style?: Required<AnnoPulseStyleConfig>
  readonly uri: string
  readonly languageId: string
  readonly range: SerializedRange
  readonly keywordRange: SerializedRange
  readonly messageRange?: SerializedRange
  readonly diagnostics?: AnnoPulseDiagnosticsConfig
  readonly owner?: string
  readonly dueDate?: string
  readonly expiresDate?: string
  readonly resolved?: boolean
  readonly ignored?: boolean
  readonly line: number
  readonly column: number
  readonly keyword: string
  readonly message: string
  readonly source: 'visibleEditor' | 'openEditor' | 'workspace' | 'notebook'
}
