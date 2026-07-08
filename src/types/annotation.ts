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

export type BeaconSeverity = 'hint' | 'information' | 'warning' | 'error'

export type BeaconMarker = 'keyword' | 'message' | 'line'

export interface SerializedPosition {
  readonly line: number
  readonly character: number
}

export interface SerializedRange {
  readonly start: SerializedPosition
  readonly end: SerializedPosition
}

export interface BeaconTextMatcherConfig {
  readonly type: 'text'
  readonly value: string
  readonly caseSensitive?: boolean
  readonly wholeWord?: boolean
  readonly colon?: 'required' | 'optional' | 'forbidden'
}

export interface BeaconRegexMatcherConfig {
  readonly type: 'regex'
  readonly pattern: string
  readonly flags?: string
}

export type BeaconMatcherConfig =
  | BeaconTextMatcherConfig
  | BeaconRegexMatcherConfig

export interface BeaconStyleConfig {
  readonly marker?: BeaconMarker
  readonly color?: string
  readonly backgroundColor?: string
  readonly border?: string
  readonly borderRadius?: string
  readonly overviewRulerColor?: string
}

export interface BeaconDiagnosticsConfig {
  readonly enabled?: boolean
  readonly severity?: BeaconSeverity
}

export interface BeaconMessageConfig {
  readonly mode?: 'lineRest' | 'match' | 'group'
  readonly group?: string
  readonly trim?: boolean
}

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

export interface CompiledBeaconRule extends BeaconRuleConfig {
  readonly enabled: true
  readonly matcherRegex: RegExp
  readonly caseSensitive: boolean
  readonly messageMode: Required<BeaconMessageConfig>
  readonly style: Required<BeaconStyleConfig>
}

export interface BeaconRuleError {
  readonly ruleId: string
  readonly message: string
}

export interface NormalizedRuleResult {
  readonly rules: readonly CompiledBeaconRule[]
  readonly errors: readonly BeaconRuleError[]
}

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
  readonly line: number
  readonly column: number
  readonly keyword: string
  readonly message: string
  readonly source: 'visibleEditor' | 'openEditor' | 'workspace' | 'notebook'
}
