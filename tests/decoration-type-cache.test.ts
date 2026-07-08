import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import {
  DecorationTypeCache,
  createDecorationRenderOptions,
  decorationStyleKey,
} from '../src/core/decorations/decoration-type-cache'
import type { BeaconStyleConfig } from '../src/types/annotation'

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
} satisfies Required<BeaconStyleConfig>

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
})
