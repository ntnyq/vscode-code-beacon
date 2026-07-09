import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import { applyBeaconDecorations } from '../src/core/decorations/apply-decorations'
import { EditorDecorationCaches } from '../src/core/decorations/editor-decoration-caches'
import type {
  BeaconAnnotation,
  BeaconStyleConfig,
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

const baseStyle = {
  backgroundColor: '#0969da',
  border: '1px solid transparent',
  borderRadius: '3px',
  color: '#ffffff',
  marker: 'keyword',
  overviewRulerColor: '#0969da',
} satisfies Required<BeaconStyleConfig>

function createEditor(): Vscode.TextEditor {
  return {
    setDecorations: vi.fn<Vscode.TextEditor['setDecorations']>(),
  } as unknown as Vscode.TextEditor
}

function createAnnotation(
  id: string,
  style: Required<BeaconStyleConfig>,
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
    style,
    uri: `file:///workspace/src/${id}.ts`,
  }
}

describe(EditorDecorationCaches, () => {
  it('keeps decoration lifetimes isolated by editor', () => {
    const caches = new EditorDecorationCaches()
    const firstEditor = createEditor()
    const secondEditor = createEditor()
    const firstStyle = { ...baseStyle, backgroundColor: '#9a6700' }
    const secondStyle = { ...baseStyle, backgroundColor: '#cf222e' }

    applyBeaconDecorations(
      firstEditor,
      [createAnnotation('a', firstStyle)],
      caches.get(firstEditor),
    )
    applyBeaconDecorations(
      secondEditor,
      [createAnnotation('b', secondStyle)],
      caches.get(secondEditor),
    )

    expect(createTextEditorDecorationType).toHaveBeenCalledTimes(2)
    expect(dispose).not.toHaveBeenCalled()
  })
})
