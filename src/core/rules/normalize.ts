import { DEFAULT_BEACON_RULES, DEFAULT_STYLE } from '../../constants/defaults'
import type {
  BeaconMessageConfig,
  BeaconRuleError,
  BeaconRuleConfig,
  CompiledBeaconRule,
  NormalizedRuleResult,
} from '../../types/annotation'

/**
 * Runtime options that constrain custom rule normalization.
 */
export interface NormalizeRuleOptions {
  readonly allowCustomRegex?: boolean
}

/**
 * Default message extraction behavior for built-in and custom rules.
 */
const DEFAULT_MESSAGE_MODE: Required<BeaconMessageConfig> = {
  group: 'message',
  mode: 'lineRest',
  trim: true,
}

/**
 * Error raised when a matcher is valid JavaScript but unsafe for scanning.
 */
class BeaconRuleCompileError extends Error {
  public override readonly name = 'BeaconRuleCompileError'
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
 * Checks common inputs for zero-length matches that would stall RegExp.exec.
 */
function canMatchWithoutConsuming(regex: RegExp): boolean {
  const flags = regex.flags.replaceAll('g', '')
  const probeRegex = new RegExp(regex.source, flags)
  const samples = ['', 'x', 'TODO', '// TODO: message']

  return samples.some(sample => probeRegex.exec(sample)?.[0] === '')
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

  if (canMatchWithoutConsuming(matcherRegex)) {
    throw new BeaconRuleCompileError(
      `Matcher for rule "${rule.id}" must consume at least one character`,
    )
  }

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
  options: NormalizeRuleOptions = {},
): NormalizedRuleResult {
  const mergedRules = new Map<string, BeaconRuleConfig>()
  const errors: BeaconRuleError[] = []

  for (const rule of DEFAULT_BEACON_RULES) {
    mergedRules.set(rule.id, rule)
  }

  for (const rule of customRules) {
    if (options.allowCustomRegex === false && rule.matcher.type === 'regex') {
      errors.push({
        message: `Regex matcher for rule "${rule.id}" is disabled in untrusted workspaces`,
        ruleId: rule.id,
      })
      continue
    }

    mergedRules.set(rule.id, rule)
  }

  const rules: CompiledBeaconRule[] = []

  for (const rule of mergedRules.values()) {
    if (rule.enabled === false) {
      continue
    }

    try {
      rules.push(compileRule(rule))
    } catch (error) {
      if (error instanceof BeaconRuleCompileError) {
        errors.push({
          message: error.message,
          ruleId: rule.id,
        })
        continue
      }

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
