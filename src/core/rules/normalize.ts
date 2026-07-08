import { DEFAULT_BEACON_RULES, DEFAULT_STYLE } from '../../constants/defaults'
import type {
  BeaconMessageConfig,
  BeaconRuleError,
  BeaconRuleConfig,
  CompiledBeaconRule,
  NormalizedRuleResult,
} from '../../types/annotation'

/**
 * Default message extraction behavior for built-in and custom rules.
 */
const DEFAULT_MESSAGE_MODE: Required<BeaconMessageConfig> = {
  group: 'message',
  mode: 'lineRest',
  trim: true,
}

/**
 * Escapes literal matcher text so it can be embedded inside a RegExp source.
 */
function escapeRegExp(value: string): string {
  return value.replaceAll(/[.*+?^${}()|[\]\\]/gu, String.raw`\$&`)
}

/**
 * Builds the RegExp source for a text matcher rule.
 */
function buildTextPattern(rule: BeaconRuleConfig): string {
  if (rule.matcher.type !== 'text') {
    throw new Error('Expected text matcher')
  }

  const escaped = escapeRegExp(rule.matcher.value)
  const prefix = (rule.matcher.wholeWord ?? true) ? String.raw`\b` : ''

  if (rule.matcher.colon === 'required') {
    return `${prefix}${escaped}:`
  }

  if (rule.matcher.colon === 'forbidden') {
    return `${prefix}${escaped}`
  }

  return `${prefix}${escaped}:?`
}

/**
 * Ensures compiled matchers always advance through every match in a document.
 */
function ensureGlobalFlag(flags: string | undefined): string {
  if (!flags) {
    return 'g'
  }

  return flags.includes('g') ? flags : `${flags}g`
}

/**
 * Compiles one rule into a runtime matcher with resolved defaults.
 */
function compileRule(rule: BeaconRuleConfig): CompiledBeaconRule {
  let flags: string | undefined

  if (rule.matcher.type === 'regex') {
    flags = rule.matcher.flags
  } else if (rule.matcher.caseSensitive) {
    flags = 'g'
  } else {
    flags = 'gi'
  }

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

/**
 * Merges built-in rules with custom rules and reports invalid matchers.
 */
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
      const matcherValue =
        rule.matcher.type === 'regex'
          ? rule.matcher.pattern
          : rule.matcher.value

      errors.push({
        message: `Invalid regular expression for rule "${rule.id}": ${matcherValue}`,
        ruleId: rule.id,
      })
    }
  }

  return { errors, rules }
}
