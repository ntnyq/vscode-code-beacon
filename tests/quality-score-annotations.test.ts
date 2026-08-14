import { describe, expect, it } from 'vitest'
import {
  scoreAnnoPulseAnnotation,
  scoreAnnoPulseAnnotations,
} from '../src/core/quality/score-annotations'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

const now = new Date(2026, 0, 2)

function annotation(
  overrides: Partial<AnnoPulseAnnotation> = {},
): AnnoPulseAnnotation {
  return {
    category: 'todo',
    column: 1,
    id: 'annotation',
    keyword: 'TODO:',
    keywordRange: {
      end: { character: 5, line: 1 },
      start: { character: 0, line: 1 },
    },
    languageId: 'typescript',
    line: 1,
    message: 'add retry limit',
    range: {
      end: { character: 20, line: 1 },
      start: { character: 0, line: 1 },
    },
    ruleId: 'todo',
    severity: 'information',
    source: 'visibleEditor',
    uri: 'file:///workspace/src/file.ts',
    ...overrides,
  }
}

describe(scoreAnnoPulseAnnotation, () => {
  it('reports an empty message and missing owner', () => {
    expect(
      scoreAnnoPulseAnnotation(annotation({ message: '', owner: ' \t' }), now),
    ).toMatchObject({
      score: 40,
      level: 'poor',
      issues: [
        { code: 'emptyMessage', penalty: 45 },
        { code: 'missingOwner', penalty: 15 },
      ],
    })
  })

  it('reports standalone placeholders as vague', () => {
    expect(
      scoreAnnoPulseAnnotation(annotation({ message: 'later' }), now).issues,
    ).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'vagueMessage', penalty: 25 }),
      ]),
    )
  })

  it('reports a task with too little context', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({ message: 'update', owner: 'Ada' }),
        now,
      ).issues,
    ).toStrictEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: 'missingContext', penalty: 15 }),
      ]),
    )
  })

  it('reports task messages without a recognized action', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({ message: 'cache parser regression', owner: 'Ada' }),
        now,
      ).issues,
    ).toStrictEqual([
      expect.objectContaining({ code: 'missingAction', penalty: 15 }),
    ])
  })

  it('reports invalid due dates before expired dates', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({
          dueDate: '2026-02-29',
          expiresDate: '2026-01-01',
          message: 'add retry limit',
          owner: 'Ada',
        }),
        now,
      ).issues,
    ).toStrictEqual([
      expect.objectContaining({ code: 'invalidDueDate', penalty: 10 }),
      expect.objectContaining({ code: 'expired', penalty: 25 }),
    ])
  })

  it('accepts real leap days', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({
          dueDate: '2024-02-29',
          expiresDate: '2026-01-02',
          owner: 'Ada',
        }),
        new Date(2026, 0, 2),
      ).issues,
    ).toStrictEqual([expect.objectContaining({ code: 'overdue', penalty: 20 })])
  })

  it('does not mark due dates on the current calendar day as overdue', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({ dueDate: '2026-01-02', owner: 'Ada' }),
        now,
      ).issues,
    ).toStrictEqual([])
  })

  it('recognizes documented Chinese task actions', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({ message: '修复缓存', owner: 'Ada' }),
        now,
      ).issues,
    ).toStrictEqual([
      expect.objectContaining({ code: 'missingContext', penalty: 15 }),
    ])
  })

  it('reports invalid expiry dates and overdue valid due dates', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({
          dueDate: '2026-01-01',
          expiresDate: '2026-13-01',
          owner: 'Ada',
        }),
        now,
      ).issues,
    ).toStrictEqual([
      expect.objectContaining({ code: 'invalidExpiresDate', penalty: 10 }),
      expect.objectContaining({ code: 'overdue', penalty: 20 }),
    ])
  })

  it('clamps scores at zero', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({
          dueDate: '2026-01-01',
          expiresDate: '2026-01-01',
          message: '',
        }),
        now,
      ).score,
    ).toBe(0)
  })

  it('uses the good and needs-attention level boundary', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({ dueDate: '2026-01-01', owner: 'Ada' }),
        now,
      ),
    ).toMatchObject({ level: 'good', score: 80 })
    expect(
      scoreAnnoPulseAnnotation(
        annotation({ dueDate: '2026-13-01', message: 'later' }),
        now,
      ),
    ).toMatchObject({ level: 'needsAttention', score: 50 })
  })

  it('suppresses action and context findings after empty and vague messages', () => {
    const emptyCodes = scoreAnnoPulseAnnotation(
      annotation({ message: '' }),
      now,
    ).issues.map(issue => issue.code)
    const vagueCodes = scoreAnnoPulseAnnotation(
      annotation({ message: 'something' }),
      now,
    ).issues.map(issue => issue.code)

    expect(emptyCodes).toContain('emptyMessage')
    expect(emptyCodes).not.toContain('vagueMessage')
    expect(emptyCodes).not.toContain('missingAction')
    expect(emptyCodes).not.toContain('missingContext')
    expect(vagueCodes).toContain('vagueMessage')
    expect(vagueCodes).not.toContain('missingAction')
    expect(vagueCodes).not.toContain('missingContext')
  })

  it('does not require action, context, or owner for notes', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({ category: 'note', message: 'background' }),
        now,
      ).issues,
    ).toStrictEqual([])
  })

  it('does not report vague messages for notes', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({ category: 'note', message: 'later' }),
        now,
      ).issues,
    ).toStrictEqual([])
  })

  it('still reports empty messages and date defects for notes', () => {
    expect(
      scoreAnnoPulseAnnotation(
        annotation({
          category: 'note',
          dueDate: 'invalid',
          expiresDate: '2026-01-01',
          message: '',
        }),
        now,
      ).issues,
    ).toStrictEqual([
      expect.objectContaining({ code: 'emptyMessage' }),
      expect.objectContaining({ code: 'invalidDueDate' }),
      expect.objectContaining({ code: 'expired' }),
    ])
  })
})

describe(scoreAnnoPulseAnnotations, () => {
  it('sorts the returned annotations and excludes resolved and ignored by default', () => {
    const report = scoreAnnoPulseAnnotations(
      [
        annotation({ id: 'late', line: 3, uri: 'file:///b.ts', owner: 'Ada' }),
        annotation({ id: 'resolved', resolved: true }),
        annotation({
          id: 'first',
          column: 2,
          line: 1,
          owner: 'Ada',
          uri: 'file:///a.ts',
        }),
        annotation({ id: 'ignored', ignored: true }),
      ],
      { now },
    )

    expect(report.annotations.map(item => item.annotationId)).toStrictEqual([
      'first',
      'late',
    ])
    expect(report.counts).toStrictEqual({
      good: 2,
      needsAttention: 0,
      poor: 0,
    })
  })

  it('includes resolved and ignored annotations only when requested', () => {
    const report = scoreAnnoPulseAnnotations(
      [
        annotation({ id: 'resolved', owner: 'Ada', resolved: true }),
        annotation({ id: 'ignored', ignored: true, message: '' }),
      ],
      { includeIgnored: true, includeResolved: true, now },
    )

    expect(report.annotations.map(item => item.annotationId)).toStrictEqual([
      'resolved',
      'ignored',
    ])
    expect(report.counts).toStrictEqual({
      good: 1,
      needsAttention: 0,
      poor: 1,
    })
  })
})
