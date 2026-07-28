import { describe, expect, it } from 'vitest'
import { decodeAnnotationTarget } from '../src/core/commands/annotation-target'
import type { BeaconAnnotation } from '../src/types/annotation'

function annotation(): BeaconAnnotation {
  return {
    category: 'todo',
    column: 3,
    id: 'todo:example',
    keyword: 'TODO:',
    keywordRange: {
      end: { character: 8, line: 1 },
      start: { character: 3, line: 1 },
    },
    languageId: 'typescript',
    line: 1,
    message: 'ship it',
    range: {
      end: { character: 15, line: 1 },
      start: { character: 3, line: 1 },
    },
    ruleId: 'todo',
    severity: 'information',
    source: 'visibleEditor',
    uri: 'file:///workspace/src/example.ts',
  }
}

describe('annotation command target', () => {
  it('decodes direct annotations and Explorer leaf elements', () => {
    const target = annotation()

    expect(decodeAnnotationTarget(target)).toBe(target)
    expect(decodeAnnotationTarget({ annotation: target, type: 'beacon' })).toBe(
      target,
    )
  })

  it('rejects incomplete annotations and unrelated tree elements', () => {
    const target = annotation()

    expect(
      decodeAnnotationTarget({
        ...target,
        keywordRange: {
          end: { character: -1, line: 1 },
          start: { character: 3, line: 1 },
        },
      }),
    ).toBeUndefined()
    expect(
      decodeAnnotationTarget({ annotation: target, type: 'group' }),
    ).toBeUndefined()
    expect(decodeAnnotationTarget({ id: target.id })).toBeUndefined()
  })
})
