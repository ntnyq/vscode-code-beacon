import { describe, expect, it } from 'vitest'
import { DEFAULT_ANNOPULSE_RULES } from '../src/constants/defaults'
import { normalizeRules } from '../src/core/rules/normalize'
import type { AnnoPulseRuleConfig } from '../src/types/annotation'

describe('rule normalization', () => {
  it('returns enabled built-in rules when no custom rules are provided', () => {
    const result = normalizeRules([])

    expect(result.errors).toStrictEqual([])
    expect(result.rules.map(rule => rule.id)).toStrictEqual(
      DEFAULT_ANNOPULSE_RULES.map(rule => rule.id),
    )
    expect(
      result.rules.find(rule => rule.id === 'todo')?.matcherRegex.source,
    ).toBe(String.raw`\bTODO:?`)
  })

  it('overrides a built-in rule by id', () => {
    const customRules: AnnoPulseRuleConfig[] = [
      {
        id: 'todo',
        label: 'Work Item',
        category: 'todo',
        enabled: true,
        matcher: {
          type: 'text',
          value: 'WORK',
          wholeWord: true,
          colon: 'optional',
          caseSensitive: false,
        },
        severity: 'warning',
      },
    ]

    const result = normalizeRules(customRules)

    expect(result.errors).toStrictEqual([])
    expect(result.rules.find(rule => rule.id === 'todo')).toMatchObject({
      id: 'todo',
      label: 'Work Item',
      severity: 'warning',
    })
    expect(
      result.rules.find(rule => rule.id === 'todo')?.matcherRegex.source,
    ).toBe(String.raw`\bWORK:?`)
  })

  it('reports invalid regex rules without throwing', () => {
    const result = normalizeRules([
      {
        id: 'broken',
        label: 'Broken',
        category: 'custom',
        enabled: true,
        matcher: {
          type: 'regex',
          pattern: '(',
        },
        severity: 'information',
      },
    ])

    expect(result.rules.some(rule => rule.id === 'broken')).toBe(false)
    expect(result.errors).toStrictEqual([
      {
        ruleId: 'broken',
        message: 'Invalid regular expression for rule "broken": (',
      },
    ])
  })

  it('reports matchers that can produce zero-length matches', () => {
    const result = normalizeRules([
      {
        id: 'empty',
        label: 'Empty',
        category: 'custom',
        enabled: true,
        matcher: {
          type: 'regex',
          pattern: '^',
        },
        severity: 'information',
      },
    ])

    expect(result.rules.some(rule => rule.id === 'empty')).toBe(false)
    expect(result.errors).toStrictEqual([
      {
        ruleId: 'empty',
        message: 'Matcher for rule "empty" must consume at least one character',
      },
    ])
  })

  it('ignores custom regex rules when custom regex is disabled', () => {
    const result = normalizeRules(
      [
        {
          id: 'unsafe',
          label: 'Unsafe',
          category: 'custom',
          enabled: true,
          matcher: {
            type: 'regex',
            pattern: '(a+)+$',
          },
          severity: 'warning',
        },
        {
          id: 'safe-text',
          label: 'Safe Text',
          category: 'custom',
          enabled: true,
          matcher: {
            type: 'text',
            value: 'SAFE',
          },
          severity: 'information',
        },
      ],
      {
        allowCustomRegex: false,
      },
    )

    expect(result.rules.some(rule => rule.id === 'unsafe')).toBe(false)
    expect(result.rules.some(rule => rule.id === 'safe-text')).toBe(true)
    expect(result.rules.some(rule => rule.id === 'perf')).toBe(true)
    expect(result.errors).toContainEqual({
      ruleId: 'unsafe',
      message:
        'Regex matcher for rule "unsafe" is disabled in untrusted workspaces',
    })
  })

  it('drops disabled custom rules', () => {
    const result = normalizeRules([
      {
        id: 'skip',
        label: 'Skip',
        category: 'custom',
        enabled: false,
        matcher: {
          type: 'text',
          value: 'SKIP',
        },
        severity: 'hint',
      },
    ])

    expect(result.rules.some(rule => rule.id === 'skip')).toBe(false)
  })
})
