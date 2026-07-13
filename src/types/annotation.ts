/**
 * Semantic bucket used to group and style a beacon annotation.
 */
export type BeaconCategory =
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
export type BeaconSeverity = 'hint' | 'information' | 'warning' | 'error'

/**
 * Decoration target that controls how much of an annotation is highlighted.
 */
export type BeaconMarker = 'keyword' | 'message' | 'line'

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
export interface BeaconTextMatcherConfig {
  readonly type: 'text'
  readonly value: string
  readonly caseSensitive?: boolean
  readonly wholeWord?: boolean
  readonly colon?: 'required' | 'optional' | 'forbidden'
}

/**
 * User-facing matcher that searches with a regular expression.
 */
export interface BeaconRegexMatcherConfig {
  readonly type: 'regex'
  readonly pattern: string
  readonly flags?: string
}

/**
 * Supported matcher variants for a beacon rule.
 */
export type BeaconMatcherConfig =
  | BeaconTextMatcherConfig
  | BeaconRegexMatcherConfig

/**
 * Visual styling options used to build VS Code decoration types.
 */
export interface BeaconStyleConfig {
  readonly marker?: BeaconMarker
  readonly color?: string
  readonly backgroundColor?: string
  readonly border?: string
  readonly borderRadius?: string
  readonly overviewRulerColor?: string
}

/**
 * Per-rule diagnostics options reserved for Problems integration.
 */
export interface BeaconDiagnosticsConfig {
  readonly enabled?: boolean
  readonly severity?: BeaconSeverity
}

/**
 * Message extraction strategy used after a keyword or regex match.
 */
export interface BeaconMessageConfig {
  readonly mode?: 'lineRest' | 'match' | 'group'
  readonly group?: string
  readonly trim?: boolean
}

/**
 * Configurable rule that describes how a beacon annotation is detected.
 */
export interface BeaconRuleConfig {
  readonly id: string
  readonly label: string
  readonly category: BeaconCategory
  readonly enabled?: boolean
  readonly matcher: BeaconMatcherConfig
  readonly message?: BeaconMessageConfig
  readonly severity: BeaconSeverity
  readonly commentOnly?: boolean
  readonly languages?: readonly string[]
  readonly style?: BeaconStyleConfig
  readonly diagnostics?: BeaconDiagnosticsConfig
}

/**
 * Runtime-ready rule with compiled matcher and fully resolved defaults.
 */
export interface CompiledBeaconRule extends BeaconRuleConfig {
  readonly enabled: true
  readonly matcherRegex: RegExp
  readonly caseSensitive: boolean
  readonly messageMode: Required<BeaconMessageConfig>
  readonly style: Required<BeaconStyleConfig>
}

/**
 * Validation error produced while normalizing user-provided rules.
 */
export interface BeaconRuleError {
  readonly ruleId: string
  readonly message: string
}

/**
 * Result of merging built-in rules with user overrides.
 */
export interface NormalizedRuleResult {
  readonly rules: readonly CompiledBeaconRule[]
  readonly errors: readonly BeaconRuleError[]
}

/**
 * Concrete annotation found in a document scan.
 */
export interface BeaconAnnotation {
  readonly id: string
  readonly ruleId: string
  readonly category: BeaconCategory
  readonly severity: BeaconSeverity
  readonly style?: Required<BeaconStyleConfig>
  readonly uri: string
  readonly languageId: string
  readonly range: SerializedRange
  readonly keywordRange: SerializedRange
  readonly messageRange?: SerializedRange
  readonly diagnostics?: BeaconDiagnosticsConfig
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
