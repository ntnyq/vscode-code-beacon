import { DEFAULT_BEACON_RULES, DEFAULT_STYLE } from '../../constants/defaults'
import type {
  BeaconMessageConfig,
  BeaconRuleError,
  BeaconRuleConfig,
  CompiledBeaconRule,
  NormalizedRuleResult,
} from '../../types/annotation'

const DEFAULT_MESSAGE_MODE: Required<BeaconMessageConfig> = {
  group: 'message',
  mode: 'lineRest',
  trim: true,
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function buildTextPattern(rule: BeaconRuleConfig): string {
  if (rule.matcher.type !== 'text') {
    throw new Error('Expected text matcher')
  }

  const escaped = escapeRegExp(rule.matcher.value)
  const prefix = (rule.matcher.wholeWord ?? true) ? '\\b' : ''

  if (rule.matcher.colon === 'required') {
    return `${prefix}${escaped}:`
  }

  if (rule.matcher.colon === 'forbidden') {
    return `${prefix}${escaped}`
  }

  return `${prefix}${escaped}:?`
}

function ensureGlobalFlag(flags: string | undefined): string {
  if (!flags) {
    return 'g'
  }

  return flags.includes('g') ? flags : `${flags}g`
}

function compileRule(rule: BeaconRuleConfig): CompiledBeaconRule {
  const flags =
    rule.matcher.type === 'regex'
      ? rule.matcher.flags
      : rule.matcher.caseSensitive
        ? 'g'
        : 'gi'
  const source =
    rule.matcher.type === 'regex'
      ? rule.matcher.pattern
      : buildTextPattern(rule)
  const matcherRegex = new RegExp(source, ensureGlobalFlag(flags))

  return {
    ...rule,
    caseSensitive:
      rule.matcher.type === 'text'
        ? (rule.matcher.caseSensitive ?? false)
        : !matcherRegex.ignoreCase,
    enabled: true,
    matcherRegex,
    messageMode: {
      ...DEFAULT_MESSAGE_MODE,
      ...rule.message,
    },
    style: {
      ...DEFAULT_STYLE,
      ...rule.style,
    },
  }
}

export function normalizeRules(
  customRules: readonly BeaconRuleConfig[],
): NormalizedRuleResult {
  const mergedRules = new Map<string, BeaconRuleConfig>()
  const errors: BeaconRuleError[] = []

  for (const rule of DEFAULT_BEACON_RULES) {
    mergedRules.set(rule.id, rule)
  }

  for (const rule of customRules) {
    mergedRules.set(rule.id, rule)
  }

  const rules: CompiledBeaconRule[] = []

  for (const rule of mergedRules.values()) {
    if (rule.enabled === false) {
      continue
    }

    try {
      rules.push(compileRule(rule))
    } catch {
      errors.push({
        message: `Invalid regular expression for rule "${rule.id}": ${
          rule.matcher.type === 'regex'
            ? rule.matcher.pattern
            : rule.matcher.value
        }`,
        ruleId: rule.id,
      })
    }
  }

  return { errors, rules }
}
