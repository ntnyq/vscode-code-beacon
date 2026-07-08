import { describe, expect, it } from 'vitest'
import { normalizeRules } from '../src/core/rules/normalize'
import { scanDocument } from '../src/core/scanner/scan-document'

const rules = normalizeRules([]).rules

describe('document scanner', () => {
  it('scans comments and ignores string literals by default', () => {
    const result = scanDocument({
      commentOnly: true,
      languageId: 'typescript',
      maxFileSize: 1_000_000,
      rules,
      source: 'visibleEditor',
      text: [
        'const value = "TODO: not a comment"',
        '// TODO: write the scanner',
        '// FIXME: handle old entries',
      ].join('\n'),
      uri: 'file:///workspace/src/example.ts',
    })

    expect(result.skipped).toBeUndefined()
    expect(result.annotations).toHaveLength(2)
    expect(
      result.annotations.map(annotation => annotation.keyword),
    ).toStrictEqual(['TODO:', 'FIXME:'])
    expect(
      result.annotations.map(annotation => annotation.message),
    ).toStrictEqual(['write the scanner', 'handle old entries'])
  })

  it('skips files above the configured size limit', () => {
    const result = scanDocument({
      commentOnly: true,
      languageId: 'typescript',
      maxFileSize: 4,
      rules,
      source: 'visibleEditor',
      text: 'TODO: too large',
      uri: 'file:///workspace/src/large.ts',
    })

    expect(result.annotations).toStrictEqual([])
    expect(result.skipped).toStrictEqual({
      message: 'File length 15 exceeds configured maxFileSize 4',
      reason: 'maxFileSize',
    })
  })

  it('honors rule language filters', () => {
    const filteredRules = normalizeRules([
      {
        category: 'custom',
        enabled: true,
        id: 'python-only',
        label: 'PYONLY',
        languages: ['python'],
        matcher: {
          type: 'text',
          value: 'PYONLY',
        },
        severity: 'information',
      },
    ]).rules
    const result = scanDocument({
      commentOnly: false,
      languageId: 'typescript',
      maxFileSize: 1_000_000,
      rules: filteredRules,
      source: 'visibleEditor',
      text: '// PYONLY: not for typescript',
      uri: 'file:///workspace/src/example.ts',
    })

    expect(
      result.annotations.some(
        annotation => annotation.ruleId === 'python-only',
      ),
    ).toBe(false)
  })

  it('honors per-rule comment-only scanning', () => {
    const commentOnlyRules = normalizeRules([
      {
        category: 'custom',
        commentOnly: true,
        enabled: true,
        id: 'review-comment-only',
        label: 'REVIEWME',
        matcher: {
          type: 'text',
          value: 'REVIEWME',
        },
        severity: 'information',
      },
    ]).rules
    const result = scanDocument({
      commentOnly: false,
      languageId: 'typescript',
      maxFileSize: 1_000_000,
      rules: commentOnlyRules,
      source: 'visibleEditor',
      text: [
        'const value = "REVIEWME: not a comment"',
        '// REVIEWME: comment',
      ].join('\n'),
      uri: 'file:///workspace/src/example.ts',
    })

    expect(
      result.annotations
        .filter(annotation => annotation.ruleId === 'review-comment-only')
        .map(annotation => annotation.message),
    ).toStrictEqual(['comment'])
  })
})
