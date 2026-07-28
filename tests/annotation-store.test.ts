import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import { createAnnotationStore } from '../src/core/store/annotation-store'
import type { BeaconAnnotation } from '../src/types/annotation'
import { seedAnnotationStore } from './fixtures/annotation-store'

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

function shiftAnnotationLines(
  annotation: BeaconAnnotation,
  lineOffset: number,
): BeaconAnnotation {
  return {
    ...annotation,
    id: `shifted-${annotation.id}`,
    line: annotation.line + lineOffset,
    keywordRange: {
      end: {
        ...annotation.keywordRange.end,
        line: annotation.keywordRange.end.line + lineOffset,
      },
      start: {
        ...annotation.keywordRange.start,
        line: annotation.keywordRange.start.line + lineOffset,
      },
    },
    range: {
      end: {
        ...annotation.range.end,
        line: annotation.range.end.line + lineOffset,
      },
      start: {
        ...annotation.range.start,
        line: annotation.range.start.line + lineOffset,
      },
    },
  }
}

describe('annotation store', () => {
  it('stores annotations by URI and notifies subscribers', () => {
    const store = createAnnotationStore()
    const listener = vi.fn<() => void>()
    const dispose = store.subscribe(listener)

    seedAnnotationStore(store, 'file:///workspace/src/a.ts', [
      createAnnotation('a'),
    ])

    expect(store.getForUri('file:///workspace/src/a.ts')).toHaveLength(1)
    expect(store.getAll().map(annotation => annotation.id)).toStrictEqual(['a'])
    expect(listener).toHaveBeenCalledTimes(1)

    dispose()
    seedAnnotationStore(
      store,
      'file:///workspace/src/a.ts',
      [],
      'visibleEditor',
    )
    expect(listener).toHaveBeenCalledTimes(1)
  })

  it('clears all annotations', () => {
    const store = createAnnotationStore()
    seedAnnotationStore(store, 'file:///workspace/src/a.ts', [
      createAnnotation('a'),
    ])
    seedAnnotationStore(store, 'file:///workspace/src/b.ts', [
      createAnnotation('b', 'file:///workspace/src/b.ts'),
    ])

    store.clear()

    expect(store.getAll()).toStrictEqual([])
  })

  it('replaces annotations for one source without dropping other sources', () => {
    const store = createAnnotationStore()
    seedAnnotationStore(store, 'file:///workspace/src/a.ts', [
      createAnnotation('visible-a'),
      {
        ...createAnnotation('workspace-a'),
        source: 'workspace',
      },
    ])
    seedAnnotationStore(store, 'file:///workspace/src/old.ts', [
      {
        ...createAnnotation('workspace-old', 'file:///workspace/src/old.ts'),
        source: 'workspace',
      },
    ])

    store.replaceForSource(
      'workspace',
      new Map([
        [
          'file:///workspace/src/b.ts',
          [
            {
              ...createAnnotation('workspace-b', 'file:///workspace/src/b.ts'),
              source: 'workspace',
            },
          ],
        ],
      ]),
    )

    expect(
      store
        .getAll()
        .map(annotation => annotation.id)
        .sort(),
    ).toStrictEqual(['visible-a', 'workspace-b'])
  })

  it('does not duplicate the same annotation across scan sources', () => {
    const store = createAnnotationStore()
    const visibleAnnotation = createAnnotation('shared')

    seedAnnotationStore(store, visibleAnnotation.uri, [visibleAnnotation])
    store.replaceForSource(
      'workspace',
      new Map([
        [
          visibleAnnotation.uri,
          [{ ...visibleAnnotation, source: 'workspace' } as const],
        ],
      ]),
    )

    expect(store.getForUri(visibleAnnotation.uri)).toStrictEqual([
      expect.objectContaining({ id: 'shared', source: 'visibleEditor' }),
    ])
  })

  it('uses a live source as the authoritative URI snapshot', () => {
    const store = createAnnotationStore()
    const visibleAnnotation = createAnnotation('shared')
    const workspaceAnnotation = {
      ...createAnnotation('workspace-only'),
      source: 'workspace',
    } as const

    store.setForSourceUri('visibleEditor', visibleAnnotation.uri, [
      visibleAnnotation,
    ])
    store.setForSourceUri('workspace', visibleAnnotation.uri, [
      { ...visibleAnnotation, source: 'workspace' },
      workspaceAnnotation,
    ])

    expect(store.getForUri(visibleAnnotation.uri)).toStrictEqual([
      expect.objectContaining({ id: 'shared', source: 'visibleEditor' }),
    ])

    store.setForSourceUri('visibleEditor', visibleAnnotation.uri, [])

    expect(store.getForUri(visibleAnnotation.uri)).toStrictEqual([])

    store.removeForSourceUri('visibleEditor', visibleAnnotation.uri)

    expect(store.getForUri(visibleAnnotation.uri)).toStrictEqual([
      expect.objectContaining({ id: 'shared', source: 'workspace' }),
      expect.objectContaining({ id: 'workspace-only', source: 'workspace' }),
    ])

    store.removeForSourceUri('workspace', visibleAnnotation.uri)

    expect(store.getForUri(visibleAnnotation.uri)).toStrictEqual([])
  })

  it('replaces stale live-document sources for the same URI', () => {
    const store = createAnnotationStore()
    const visibleAnnotation = createAnnotation('visible-stale')
    const openAnnotation = {
      ...createAnnotation('open-fresh'),
      source: 'openEditor',
    } as const
    const workspaceAnnotation = {
      ...createAnnotation('workspace-retained'),
      source: 'workspace',
    } as const

    store.setForSourceUri('visibleEditor', visibleAnnotation.uri, [
      visibleAnnotation,
    ])
    store.setForSourceUri('workspace', visibleAnnotation.uri, [
      workspaceAnnotation,
    ])
    store.markResolved(visibleAnnotation.id, true)
    store.setForSourceUri('openEditor', visibleAnnotation.uri, [openAnnotation])

    expect(store.getForUri(visibleAnnotation.uri)).toStrictEqual([
      expect.objectContaining({
        id: 'open-fresh',
        resolved: true,
        source: 'openEditor',
      }),
    ])
    expect(
      store.getForSourceUri('workspace', visibleAnnotation.uri),
    ).toStrictEqual([
      expect.objectContaining({
        id: 'workspace-retained',
        source: 'workspace',
      }),
    ])
  })

  it('preserves resolved and ignored state across rescans', () => {
    const store = createAnnotationStore()
    const annotation = createAnnotation('a')

    seedAnnotationStore(store, annotation.uri, [annotation])
    store.markResolved(annotation.id, true)
    store.markIgnored(annotation.id, true)
    seedAnnotationStore(store, annotation.uri, [annotation])

    expect(store.getForUri(annotation.uri)[0]).toMatchObject({
      ignored: true,
      resolved: true,
    })
  })

  it('moves persisted state when an annotation shifts during a rescan', () => {
    const store = createAnnotationStore()
    const original = createAnnotation('offset-10')
    const shifted = {
      ...original,
      column: original.column + 5,
      id: 'offset-15',
      keywordRange: {
        end: { character: 13, line: 1 },
        start: { character: 8, line: 1 },
      },
      range: {
        end: { character: 13, line: 1 },
        start: { character: 8, line: 1 },
      },
    }

    seedAnnotationStore(store, original.uri, [original])
    store.markResolved(original.id, true)
    seedAnnotationStore(store, original.uri, [shifted])

    expect(store.getForUri(original.uri)[0]).toMatchObject({
      id: shifted.id,
      resolved: true,
    })
    expect(store.getState()).toStrictEqual({
      ignoredIds: [],
      resolvedIds: [shifted.id],
    })
  })

  it('moves state from the closest repeated annotation without consuming it for an unresolved peer', () => {
    const store = createAnnotationStore()
    const first = createAnnotation('first')
    const second = {
      ...first,
      id: 'second',
      line: 2,
      keywordRange: {
        end: { character: 8, line: 2 },
        start: { character: 3, line: 2 },
      },
      range: {
        end: { character: 8, line: 2 },
        start: { character: 3, line: 2 },
      },
    }
    const shiftedSecond = {
      ...second,
      id: 'shifted-second',
      line: 1,
      keywordRange: first.keywordRange,
      range: first.range,
    }

    seedAnnotationStore(store, first.uri, [first, second])
    store.markResolved(second.id, true)
    seedAnnotationStore(store, first.uri, [shiftedSecond])

    expect(store.getForUri(first.uri)[0]).toMatchObject({
      id: shiftedSecond.id,
      resolved: true,
    })
    expect(store.getState().resolvedIds).toStrictEqual([shiftedSecond.id])
  })

  it('keeps repeated annotation state aligned across a uniform line shift', () => {
    const store = createAnnotationStore()
    const first = createAnnotation('first')
    const second = {
      ...first,
      id: 'second',
      line: 10,
      keywordRange: {
        end: { character: 8, line: 10 },
        start: { character: 3, line: 10 },
      },
      range: {
        end: { character: 8, line: 10 },
        start: { character: 3, line: 10 },
      },
    }
    const shifted = [
      shiftAnnotationLines(first, 15),
      shiftAnnotationLines(second, 15),
    ]

    seedAnnotationStore(store, first.uri, [first, second])
    store.markResolved(second.id, true)
    seedAnnotationStore(store, first.uri, shifted)

    expect(store.getForUri(first.uri)).toMatchObject([
      { id: 'shifted-first', resolved: false },
      { id: 'shifted-second', resolved: true },
    ])
  })

  it('snapshots and restores resolved and ignored annotation state', () => {
    const store = createAnnotationStore()

    store.markResolved('a', true)
    store.markIgnored('b', true)

    const restoredStore = createAnnotationStore()
    restoredStore.restoreState(store.getState())
    seedAnnotationStore(restoredStore, 'file:///workspace/src/a.ts', [
      createAnnotation('a'),
      createAnnotation('b'),
    ])

    expect(store.getState()).toStrictEqual({
      ignoredIds: ['b'],
      resolvedIds: ['a'],
    })
    expect(restoredStore.getForUri('file:///workspace/src/a.ts')).toMatchObject(
      [
        { id: 'a', ignored: false, resolved: true },
        { id: 'b', ignored: true, resolved: false },
      ],
    )
  })

  it('formats file links with one-based line and column numbers', async () => {
    const { formatBeaconLink } = await import('../src/utils/ranges')

    expect(formatBeaconLink(createAnnotation('a'))).toBe(
      'file:///workspace/src/a.ts:2:4',
    )
  })
})
