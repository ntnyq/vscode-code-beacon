import { describe, expect, it } from 'vitest'
import { createAnnoPulseSourceControlResources } from '../src/core/source-control/resources'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

function createAnnotation(
  overrides: Partial<AnnoPulseAnnotation> = {},
): AnnoPulseAnnotation {
  return {
    category: 'todo',
    column: 0,
    id: 'annotation',
    keyword: 'TODO',
    keywordRange: {
      end: { character: 4, line: 0 },
      start: { character: 0, line: 0 },
    },
    languageId: 'typescript',
    line: 0,
    message: 'Follow up',
    range: {
      end: { character: 4, line: 0 },
      start: { character: 0, line: 0 },
    },
    ruleId: 'todo',
    severity: 'information',
    source: 'workspace',
    uri: 'file:///workspace/a.ts',
    ...overrides,
  }
}

const annotations = [
  createAnnotation({ category: 'todo', id: 'a-todo' }),
  createAnnotation({ category: 'bug', id: 'a-bug' }),
  createAnnotation({
    category: 'review',
    id: 'a-ignored-review',
    ignored: true,
  }),
  createAnnotation({
    category: 'note',
    id: 'b-note',
    resolved: true,
    uri: 'file:///workspace/b.ts',
  }),
  createAnnotation({
    category: 'fixme',
    id: 'c-fixme',
    uri: 'file:///workspace/c.ts',
  }),
]

describe(createAnnoPulseSourceControlResources, () => {
  it('describes annotations for changed URIs, including resolved annotations', () => {
    expect(
      createAnnoPulseSourceControlResources(
        new Set(['file:///workspace/b.ts', 'file:///workspace/a.ts']),
        annotations,
      ),
    ).toStrictEqual([
      {
        annotationCount: 3,
        categories: ['BUG', 'REVIEW', 'TODO'],
        tooltip: '3 AnnoPulse annotations (BUG, REVIEW, TODO)',
        uri: 'file:///workspace/a.ts',
      },
      {
        annotationCount: 1,
        categories: ['NOTE'],
        tooltip: '1 AnnoPulse annotation (NOTE)',
        uri: 'file:///workspace/b.ts',
      },
    ])
  })

  it('returns an empty list when no changed URI has an annotation', () => {
    expect(
      createAnnoPulseSourceControlResources(new Set(), annotations),
    ).toStrictEqual([])
    expect(
      createAnnoPulseSourceControlResources(
        new Set(['file:///workspace/c.ts']),
        [],
      ),
    ).toStrictEqual([])
  })
})
