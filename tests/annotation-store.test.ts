import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import { createAnnotationStore } from '../src/core/store/annotation-store'
import type { BeaconAnnotation } from '../src/types/annotation'

vi.mock(
  import('vscode'),
  () =>
    ({
      Range: class Range {
        public readonly startLine: number
        public readonly startCharacter: number
        public readonly endLine: number
        public readonly endCharacter: number

        public constructor(
          startLine: number,
          startCharacter: number,
          endLine: number,
          endCharacter: number,
        ) {
          this.startLine = startLine
          this.startCharacter = startCharacter
          this.endLine = endLine
          this.endCharacter = endCharacter
        }
      },
    }) as unknown as Partial<typeof Vscode>,
)

function createAnnotation(
  id: string,
  uri = 'file:///workspace/src/a.ts',
): BeaconAnnotation {
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
    uri,
  }
}

describe('annotation store', () => {
  it('stores annotations by URI and notifies subscribers', () => {
    const store = createAnnotationStore()
    const listener = vi.fn<() => void>()
    const dispose = store.subscribe(listener)

    store.setForUri('file:///workspace/src/a.ts', [createAnnotation('a')])

    expect(store.getForUri('file:///workspace/src/a.ts')).toHaveLength(1)
    expect(store.getAll().map(annotation => annotation.id)).toStrictEqual(['a'])
    expect(listener).toHaveBeenCalledTimes(1)

    dispose()
    store.setForUri('file:///workspace/src/a.ts', [])
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clears all annotations', () => {
    const store = createAnnotationStore()
    store.setForUri('file:///workspace/src/a.ts', [createAnnotation('a')])
    store.setForUri('file:///workspace/src/b.ts', [
      createAnnotation('b', 'file:///workspace/src/b.ts'),
    ])

    store.clear()

    expect(store.getAll()).toStrictEqual([])
  })

  it('formats file links with one-based line and column numbers', async () => {
    const { formatBeaconLink } = await import('../src/utils/ranges')

    expect(formatBeaconLink(createAnnotation('a'))).toBe(
      'file:///workspace/src/a.ts:2:4',
    )
  })
})
