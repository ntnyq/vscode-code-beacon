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

  it('captures annotation owners from common TODO owner syntaxes', () => {
    const result = scanDocument({
      commentOnly: true,
      languageId: 'typescript',
      maxFileSize: 1_000_000,
      rules,
      source: 'visibleEditor',
      text: [
        '// TODO(alice): parenthesized owner',
        '// FIXME @bob: mention owner',
        '// BUG [owner=carol]: bracket owner',
      ].join('\n'),
      uri: 'file:///workspace/src/owners.ts',
    })

    expect(
      result.annotations.map(annotation => annotation.owner),
    ).toStrictEqual(['alice', 'bob', 'carol'])
    expect(
      result.annotations.map(annotation => annotation.message),
    ).toStrictEqual(['parenthesized owner', 'mention owner', 'bracket owner'])
  })

  it('extracts owner and date directives while preserving the message', () => {
    const [annotation] = scanDocument({
      commentOnly: true,
      languageId: 'typescript',
      maxFileSize: 1_000_000,
      rules,
      source: 'visibleEditor',
      text: '// TODO(alice): due:2026-08-01 add retry limit expires:2026-09-01',
      uri: 'file:///workspace/dates.ts',
    }).annotations

    expect(annotation).toMatchObject({
      dueDate: '2026-08-01',
      expiresDate: '2026-09-01',
      message: 'add retry limit',
      owner: 'alice',
    })
  })

  it('retains malformed values and lets the last duplicate directive win', () => {
    const [annotation] = scanDocument({
      commentOnly: true,
      languageId: 'typescript',
      maxFileSize: 1_000_000,
      rules,
      source: 'visibleEditor',
      text: '// TODO: due:2026-01-01 document cache expires:2026-12-01 due:not-a-date behavior',
      uri: 'file:///workspace/dates.ts',
    }).annotations

    expect(annotation).toMatchObject({
      dueDate: 'not-a-date',
      expiresDate: '2026-12-01',
      message: 'document cache behavior',
    })
  })

  it('merges indented follow-up comment lines into multiline annotations', () => {
    const result = scanDocument({
      commentOnly: true,
      languageId: 'typescript',
      maxFileSize: 1_000_000,
      rules,
      source: 'visibleEditor',
      text: [
        '// TODO: write docs',
        '//   include configuration examples',
        '//   include screenshots',
        'const done = false',
      ].join('\n'),
      uri: 'file:///workspace/src/multiline.ts',
    })

    expect(result.annotations).toHaveLength(1)
    expect(result.annotations[0]?.message).toBe(
      'write docs\ninclude configuration examples\ninclude screenshots',
    )
    expect(result.annotations[0]?.range.end.line).toBe(2)
  })

  it('removes date directives from multiline annotation messages in order', () => {
    const [annotation] = scanDocument({
      commentOnly: true,
      languageId: 'typescript',
      maxFileSize: 1_000_000,
      rules,
      source: 'visibleEditor',
      text: [
        '// TODO: due:2026-10-01 draft release notes',
        '//   include migration notes expires:2026-10-15',
        '//   due:not-a-date coordinate reviewers',
      ].join('\n'),
      uri: 'file:///workspace/multiline-dates.ts',
    }).annotations

    expect(annotation).toMatchObject({
      dueDate: 'not-a-date',
      expiresDate: '2026-10-15',
      message:
        'draft release notes\ninclude migration notes\ncoordinate reviewers',
    })
  })

  it('preserves owner syntax in follow-up lines while extracting date directives', () => {
    const [annotation] = scanDocument({
      commentOnly: true,
      languageId: 'typescript',
      maxFileSize: 1_000_000,
      rules,
      source: 'visibleEditor',
      text: [
        '// TODO(alice): due:2026-10-01 draft release notes',
        '//   @bob: add migration notes expires:2026-10-15',
      ].join('\n'),
      uri: 'file:///workspace/multiline-follow-up-owner.ts',
    }).annotations

    expect(annotation).toMatchObject({
      dueDate: '2026-10-01',
      expiresDate: '2026-10-15',
      message: 'draft release notes\n@bob: add migration notes',
      owner: 'alice',
    })
  })

  it('extracts date directives from custom named-group messages without parsing owners', () => {
    const customRules = normalizeRules([
      {
        category: 'custom',
        enabled: true,
        id: 'group-directives',
        label: 'GROUP',
        matcher: {
          pattern: String.raw`GROUP:\s*(?<message>.+)`,
          type: 'regex',
        },
        message: {
          group: 'message',
          mode: 'group',
        },
        severity: 'information',
      },
    ]).rules
    const matchedAnnotation = scanDocument({
      commentOnly: false,
      languageId: 'plaintext',
      maxFileSize: 1_000_000,
      rules: customRules,
      source: 'visibleEditor',
      text: 'GROUP: @alice: due:2026-01-01 document expires:not-a-date due:later cache',
      uri: 'file:///workspace/group-directives.txt',
    }).annotations.find(candidate => candidate.ruleId === 'group-directives')

    expect(matchedAnnotation).toMatchObject({
      dueDate: 'later',
      expiresDate: 'not-a-date',
      message: '@alice: document cache',
      owner: undefined,
    })
  })

  it('extracts date directives from trim-false line-rest messages without trimming whitespace', () => {
    const customRules = normalizeRules([
      {
        category: 'custom',
        enabled: true,
        id: 'raw-directives',
        label: 'RAW',
        matcher: {
          colon: 'required',
          type: 'text',
          value: 'RAW',
        },
        message: {
          mode: 'lineRest',
          trim: false,
        },
        severity: 'information',
      },
    ]).rules
    const matchedAnnotation = scanDocument({
      commentOnly: false,
      languageId: 'plaintext',
      maxFileSize: 1_000_000,
      rules: customRules,
      source: 'visibleEditor',
      text: 'RAW:  keep  due:2026-10-01  whitespace expires:not-a-date  ',
      uri: 'file:///workspace/raw-directives.txt',
    }).annotations.find(candidate => candidate.ruleId === 'raw-directives')

    expect(matchedAnnotation).toMatchObject({
      dueDate: '2026-10-01',
      expiresDate: 'not-a-date',
      message: '  keep   whitespace  ',
    })
  })
})
