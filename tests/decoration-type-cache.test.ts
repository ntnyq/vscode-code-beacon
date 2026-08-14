import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import { applyAnnoPulseDecorations } from '../src/core/decorations/apply-decorations'
import {
  DecorationTypeCache,
  createDecorationRenderOptions,
  decorationStyleKey,
} from '../src/core/decorations/decoration-type-cache'
import type {
  AnnoPulseAnnotation,
  AnnoPulseStyleConfig,
} from '../src/types/annotation'

const { createTextEditorDecorationType, dispose } = vi.hoisted(() => {
  const disposeMock = vi.fn<() => void>()
  const createTextEditorDecorationTypeMock = vi.fn<
    () => { dispose: () => void }
  >(() => ({ dispose: disposeMock }))

  return {
    createTextEditorDecorationType: createTextEditorDecorationTypeMock,
    dispose: disposeMock,
  }
})

vi.mock(
  import('vscode'),
  () =>
    ({
      DecorationRangeBehavior: {
        ClosedClosed: 0,
      },
      OverviewRulerLane: {
        Right: 4,
      },
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
      window: {
        createTextEditorDecorationType,
      },
    }) as unknown as Partial<typeof Vscode>,
)

const style = {
  backgroundColor: '#0969da',
  border: '1px solid transparent',
  borderRadius: '3px',
  color: '#ffffff',
  marker: 'keyword',
  overviewRulerColor: '#0969da',
} satisfies Required<AnnoPulseStyleConfig>

function createAnnotation(): AnnoPulseAnnotation {
  return {
    category: 'todo',
    column: 3,
    id: 'a',
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
    style,
    uri: 'file:///workspace/src/a.ts',
  }
}

describe(DecorationTypeCache, () => {
  it('reuses decoration types for identical styles', () => {
    const cache = new DecorationTypeCache()

    const first = cache.get(style)
    const second = cache.get({ ...style })

    expect(first).toBe(second)
    expect(createTextEditorDecorationType).toHaveBeenCalledTimes(1)
  })

  it('disposes stale decoration types', () => {
    const cache = new DecorationTypeCache()
    const activeStyle = { ...style, backgroundColor: '#9a6700' }
    const staleStyle = { ...style, backgroundColor: '#cf222e' }

    cache.get(activeStyle)
    cache.get(staleStyle)
    cache.disposeStale([decorationStyleKey(activeStyle)])

    expect(dispose).toHaveBeenCalledTimes(1)
  })

  it('creates VS Code decoration render options from rule style', () => {
    expect(createDecorationRenderOptions(style)).toMatchObject({
      backgroundColor: '#0969da',
      border: '1px solid transparent',
      borderRadius: '3px',
      color: '#ffffff',
      overviewRulerColor: '#0969da',
      overviewRulerLane: 4,
      rangeBehavior: 0,
    })
  })

  it('clears stale editor decorations before disposing their types', () => {
    const cache = new DecorationTypeCache()
    const setDecorations = vi.fn<Vscode.TextEditor['setDecorations']>()
    const editor = {
      setDecorations,
    } as unknown as Vscode.TextEditor

    applyAnnoPulseDecorations(editor, [createAnnotation()], cache)
    const decorationType = createTextEditorDecorationType.mock.results[0]?.value
    applyAnnoPulseDecorations(editor, [], cache)

    expect(setDecorations).toHaveBeenLastCalledWith(decorationType, [])
  })
})
