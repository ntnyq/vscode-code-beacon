import type {
  AnnoPulseRuleConfig,
  AnnoPulseStyleConfig,
} from '../types/annotation'

/**
 * Default workspace include pattern used by workspace scans.
 */
export const DEFAULT_INCLUDE = ['**/*'] as const

/**
 * Default workspace exclude patterns that avoid dependencies and generated files.
 */
export const DEFAULT_EXCLUDE = [
  '**/node_modules/**',
  '**/bower_components/**',
  '**/dist/**',
  '**/build/**',
  '**/.git/**',
  '**/.vscode/**',
  '**/.vscode-test/**',
  '**/.github/**',
  '**/.next/**',
  '**/coverage/**',
  '**/*.min.*',
  '**/*.map',
  '**/pnpm-lock.yaml',
  '**/package-lock.json',
  '**/yarn.lock',
] as const

/**
 * Baseline decoration style merged into every normalized AnnoPulse rule.
 */
export const DEFAULT_STYLE: Required<AnnoPulseStyleConfig> = {
  backgroundColor: '#6f42c1',
  border: '1px solid transparent',
  borderRadius: '3px',
  color: '#ffffff',
  marker: 'keyword',
  overviewRulerColor: '#6f42c1',
}

/**
 * Built-in AnnoPulse rules available before any user configuration overrides.
 */
export const DEFAULT_ANNOPULSE_RULES: readonly AnnoPulseRuleConfig[] = [
  {
    category: 'todo',
    commentOnly: true,
    enabled: true,
    id: 'todo',
    label: 'TODO',
    matcher: {
      caseSensitive: false,
      colon: 'optional',
      type: 'text',
      value: 'TODO',
      wholeWord: true,
    },
    severity: 'information',
    style: {
      backgroundColor: '#9a6700',
      overviewRulerColor: '#9a6700',
    },
  },
  {
    category: 'fixme',
    commentOnly: true,
    enabled: true,
    id: 'fixme',
    label: 'FIXME',
    matcher: {
      caseSensitive: false,
      colon: 'optional',
      type: 'text',
      value: 'FIXME',
      wholeWord: true,
    },
    severity: 'warning',
    style: {
      backgroundColor: '#cf222e',
      overviewRulerColor: '#cf222e',
    },
  },
  {
    category: 'bug',
    commentOnly: true,
    enabled: true,
    id: 'bug',
    label: 'BUG',
    matcher: {
      caseSensitive: false,
      colon: 'optional',
      type: 'text',
      value: 'BUG',
      wholeWord: true,
    },
    severity: 'error',
    style: {
      backgroundColor: '#a40e26',
      overviewRulerColor: '#a40e26',
    },
  },
  {
    category: 'hack',
    commentOnly: true,
    enabled: true,
    id: 'hack',
    label: 'HACK',
    matcher: {
      caseSensitive: false,
      colon: 'optional',
      type: 'text',
      value: 'HACK',
      wholeWord: true,
    },
    severity: 'warning',
  },
  {
    category: 'note',
    commentOnly: true,
    enabled: true,
    id: 'note',
    label: 'NOTE',
    matcher: {
      caseSensitive: false,
      colon: 'optional',
      type: 'text',
      value: 'NOTE',
      wholeWord: true,
    },
    severity: 'hint',
    style: {
      backgroundColor: '#0969da',
      overviewRulerColor: '#0969da',
    },
  },
  {
    category: 'review',
    commentOnly: true,
    enabled: true,
    id: 'review',
    label: 'REVIEW',
    matcher: {
      caseSensitive: false,
      colon: 'optional',
      type: 'text',
      value: 'REVIEW',
      wholeWord: true,
    },
    severity: 'information',
  },
  {
    category: 'security',
    commentOnly: true,
    enabled: true,
    id: 'security',
    label: 'SECURITY',
    matcher: {
      caseSensitive: false,
      colon: 'optional',
      type: 'text',
      value: 'SECURITY',
      wholeWord: true,
    },
    severity: 'error',
    style: {
      backgroundColor: '#d1242f',
      overviewRulerColor: '#d1242f',
    },
  },
  {
    category: 'perf',
    commentOnly: true,
    enabled: true,
    id: 'perf',
    label: 'PERF',
    matcher: {
      flags: 'i',
      pattern: '\\b(?:PERF|OPTIMIZE):?',
      type: 'regex',
    },
    severity: 'warning',
  },
  {
    category: 'question',
    commentOnly: true,
    enabled: true,
    id: 'question',
    label: 'QUESTION',
    matcher: {
      flags: 'i',
      pattern: '\\b(?:QUESTION|ASK|Q):?',
      type: 'regex',
    },
    severity: 'information',
  },
]
