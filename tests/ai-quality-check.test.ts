import { describe, expect, it } from 'vitest'
import {
  createAnnoPulseQualityCheck,
  serializeAnnoPulseQualityCheck,
} from '../src/core/ai/quality-check'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

const context = {
  activeUri: 'file:///workspace/a.ts',
  openUris: ['file:///workspace/a.ts', 'file:///workspace/b.ts'],
}

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
    message: 'cache parser regression',
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

describe(createAnnoPulseQualityCheck, () => {
  it('scores a bounded active-file snapshot and retains selection metadata', () => {
    const result = createAnnoPulseQualityCheck(
      [
        annotation('b', { dueDate: '2026-08-02', line: 2 }),
        annotation('a', { dueDate: '2026-08-01' }),
        annotation('other-file', { uri: 'file:///workspace/b.ts' }),
      ],
      { limit: 1, scope: 'activeFile' },
      context,
      new Date(2026, 0, 2),
    )

    expect(result).toMatchObject({
      annotations: [
        {
          annotation: expect.objectContaining({
            dueDate: '2026-08-01',
            id: 'a',
          }),
          level: 'needsAttention',
          score: 70,
        },
      ],
      counts: { good: 0, needsAttention: 1, poor: 0 },
      returned: 1,
      scope: 'activeFile',
      total: 2,
      truncated: true,
    })
  })
})

describe(serializeAnnoPulseQualityCheck, () => {
  it('serializes safe quality JSON without annotation internals', () => {
    const result = createAnnoPulseQualityCheck(
      [
        annotation('a', {
          diagnostics: { enabled: true },
          dueDate: '2026-08-01',
          messageRange: {
            end: { character: 20, line: 1 },
            start: { character: 8, line: 1 },
          },
          style: {
            backgroundColor: '',
            border: '',
            borderRadius: '',
            color: '',
            marker: 'keyword',
            overviewRulerColor: '',
          },
        }),
      ],
      {},
      context,
      new Date(2026, 0, 2),
    )
    const serialized = JSON.parse(
      serializeAnnoPulseQualityCheck(result),
    ) as typeof result
    const serializedAnnotation = serialized.annotations[0]?.annotation

    expect(serialized).toStrictEqual(result)
    expect(serializedAnnotation).not.toHaveProperty('range')
    expect(serializedAnnotation).not.toHaveProperty('keywordRange')
    expect(serializedAnnotation).not.toHaveProperty('messageRange')
    expect(serializedAnnotation).not.toHaveProperty('style')
    expect(serializedAnnotation).not.toHaveProperty('diagnostics')
    expect(serializedAnnotation).not.toHaveProperty('git')
    expect(serializedAnnotation).not.toHaveProperty('email')
    expect(serializedAnnotation).not.toHaveProperty('documentText')
  })
})
