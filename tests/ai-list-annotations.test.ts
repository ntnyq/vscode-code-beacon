import { describe, expect, it } from 'vitest'
import {
  listAnnoPulseAnnotations,
  normalizeAnnoPulseListAnnotationsInput,
  serializeAnnoPulseListAnnotations,
} from '../src/core/ai/list-annotations'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

const context = {
  activeUri: 'file:///workspace/a.ts',
  openUris: ['file:///workspace/a.ts', 'file:///workspace/b.ts'],
}

const annotations = [
  annotation('b-later', {
    column: 4,
    line: 2,
    uri: 'file:///workspace/b.ts',
  }),
  annotation('a-resolved', { resolved: true }),
  annotation('a-first', { owner: '  Ada  ' }),
  annotation('c-ignored', {
    ignored: true,
    uri: 'file:///workspace/c.ts',
  }),
]

function annotation(
  id: string,
  overrides: Partial<AnnoPulseAnnotation> = {},
): AnnoPulseAnnotation {
  return {
    category: 'todo',
    column: 3,
    id,
    keyword: 'TODO:',
    keywordRange: {
      end: { character: 8, line: 1 },
      start: { character: 3, line: 1 },
    },
    languageId: 'typescript',
    line: 1,
    message: 'ship it',
    range: {
      end: { character: 8, line: 1 },
      start: { character: 3, line: 1 },
    },
    ruleId: 'todo',
    severity: 'information',
    source: 'visibleEditor',
    uri: 'file:///workspace/a.ts',
    ...overrides,
  }
}

describe(listAnnoPulseAnnotations, () => {
  it('returns unresolved, unignored annotations by default', () => {
    expect(listAnnoPulseAnnotations(annotations, {}, context)).toStrictEqual({
      annotations: [
        expect.objectContaining({
          id: 'a-first',
          owner: 'Ada',
          resolved: false,
          ignored: false,
        }),
        expect.objectContaining({
          id: 'b-later',
          resolved: false,
          ignored: false,
        }),
      ],
      returned: 2,
      scope: 'all',
      total: 2,
      truncated: false,
    })
  })

  it('limits active file results to the active URI', () => {
    expect(
      listAnnoPulseAnnotations(
        annotations,
        { scope: 'activeFile' },
        context,
      ).annotations.map(item => item.id),
    ).toStrictEqual(['a-first'])
  })

  it('limits open editor results to open URIs', () => {
    expect(
      listAnnoPulseAnnotations(
        annotations,
        { scope: 'openEditors' },
        context,
      ).annotations.map(item => item.id),
    ).toStrictEqual(['a-first', 'b-later'])
  })

  it('includes resolved and ignored annotations in source order when requested', () => {
    expect(
      listAnnoPulseAnnotations(
        annotations,
        { includeIgnored: true, includeResolved: true },
        context,
      ).annotations.map(item => item.id),
    ).toStrictEqual(['a-resolved', 'a-first', 'b-later', 'c-ignored'])
  })

  it('reports the unbounded total when a result limit truncates it', () => {
    expect(
      listAnnoPulseAnnotations(annotations, { limit: 1 }, context),
    ).toMatchObject({
      returned: 1,
      total: 2,
      truncated: true,
    })
  })

  it.each([0, 101, 1.5, '10' as never])(
    'normalizes invalid limit %j to 50',
    limit => {
      expect(normalizeAnnoPulseListAnnotationsInput({ limit })).toMatchObject({
        limit: 50,
      })
    },
  )

  it('retains the maximum allowed result limit', () => {
    expect(
      normalizeAnnoPulseListAnnotationsInput({ limit: 100 }),
    ).toMatchObject({
      limit: 100,
    })
  })

  it('projects nonempty optional dates without exposing annotation internals', () => {
    const result = listAnnoPulseAnnotations(
      [
        annotation('dated', {
          dueDate: ' 2026-08-01 ',
          expiresDate: '2026-09-01',
        }),
        annotation('blank-dates', { dueDate: ' ', expiresDate: '\t' }),
      ],
      {},
      context,
    )

    expect(result.annotations).toStrictEqual([
      expect.objectContaining({
        dueDate: '2026-08-01',
        expiresDate: '2026-09-01',
        id: 'dated',
      }),
      expect.objectContaining({ id: 'blank-dates' }),
    ])
    expect(result.annotations[1]).not.toHaveProperty('dueDate')
    expect(result.annotations[1]).not.toHaveProperty('expiresDate')
    expect(result.annotations[0]).not.toHaveProperty('range')
    expect(result.annotations[0]).not.toHaveProperty('keywordRange')
    expect(result.annotations[0]).not.toHaveProperty('messageRange')
    expect(result.annotations[0]).not.toHaveProperty('style')
    expect(result.annotations[0]).not.toHaveProperty('diagnostics')
  })
})

describe(serializeAnnoPulseListAnnotations, () => {
  it('serializes the result without exposing annotation internals', () => {
    const result = listAnnoPulseAnnotations(annotations, {}, context)
    const serialized = JSON.parse(
      serializeAnnoPulseListAnnotations(result),
    ) as typeof result

    expect(serialized).toStrictEqual(result)
    expect(serialized.annotations[0]).not.toHaveProperty('range')
    expect(serialized.annotations[0]).not.toHaveProperty('keywordRange')
    expect(serialized.annotations[0]).not.toHaveProperty('messageRange')
    expect(serialized.annotations[0]).not.toHaveProperty('style')
    expect(serialized.annotations[0]).not.toHaveProperty('diagnostics')
    expect(serialized.annotations[0]).not.toHaveProperty('git')
    expect(serialized.annotations[0]).not.toHaveProperty('email')
    expect(serialized.annotations[0]).not.toHaveProperty('documentText')
  })
})
