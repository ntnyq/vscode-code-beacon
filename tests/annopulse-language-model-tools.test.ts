import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageModelToolResult } from 'vscode'
import type * as Vscode from 'vscode'
import {
  ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME,
  ANNOPULSE_QUALITY_CHECK_TOOL_NAME,
  useAnnoPulseLanguageModelTools,
} from '../src/composables/use-annopulse-language-model-tools'
import type { AnnoPulseListAnnotationsInput } from '../src/core/ai/list-annotations'
import { annotationStore } from '../src/core/store/annotation-store'
import type { AnnoPulseAnnotation } from '../src/types/annotation'
import { seedAnnotationStore } from './fixtures/annotation-store'

type RegisteredTool = Vscode.LanguageModelTool<AnnoPulseListAnnotationsInput>

const {
  configState,
  registerTool,
  registeredTools,
  textPart,
  toolDisposable,
  useDisposable,
  vscodeState,
} = vi.hoisted(() => {
  const toolInstances = new Map<string, RegisteredTool>()
  const registrationDisposable = { dispose: vi.fn<() => void>() }

  return {
    configState: { enabled: false },
    registerTool: vi.fn<
      (name: string, tool: RegisteredTool) => Vscode.Disposable
    >((name, tool) => {
      toolInstances.set(name, tool)
      return registrationDisposable
    }),
    registeredTools: toolInstances,
    textPart: vi.fn<(value: string) => void>(),
    toolDisposable: registrationDisposable,
    useDisposable: vi.fn<(value: unknown) => unknown>(value => value),
    vscodeState: {
      activeTextEditor: undefined as Vscode.TextEditor | undefined,
      activeTextEditorReads: 0,
      visibleTextEditors: [] as Vscode.TextEditor[],
      visibleTextEditorsReads: 0,
    },
  }
})

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      useDisposable,
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('../src/config'),
  () =>
    ({
      config: { ai: configState },
    }) as Record<string, unknown>,
)

vi.mock(import('vscode'), () => {
  class MockLanguageModelTextPart {
    public readonly value: string

    public constructor(value: string) {
      this.value = value
      textPart(value)
    }
  }

  class MockLanguageModelToolResult {
    public readonly content: unknown[]

    public constructor(content: unknown[]) {
      this.content = content
    }
  }

  return {
    LanguageModelTextPart: MockLanguageModelTextPart,
    LanguageModelToolResult: MockLanguageModelToolResult,
    lm: { registerTool },
    window: {
      get activeTextEditor() {
        vscodeState.activeTextEditorReads++
        return vscodeState.activeTextEditor
      },
      get visibleTextEditors() {
        vscodeState.visibleTextEditorsReads++
        return vscodeState.visibleTextEditors
      },
    },
  } as unknown as Partial<typeof Vscode>
})

const cancellationToken = {} as Vscode.CancellationToken

function annotation(
  id: string,
  uri = 'file:///workspace/a.ts',
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
    uri,
  }
}

function editor(uri: string): Vscode.TextEditor {
  return {
    document: {
      uri: { toString: () => uri },
    },
  } as Vscode.TextEditor
}

function registeredTool(name: string): RegisteredTool {
  const tool = registeredTools.get(name)

  if (!tool) {
    throw new TypeError(`Expected ${name} to be registered`)
  }

  return tool
}

function resultText(result: Vscode.LanguageModelToolResult): string {
  const part = result.content[0] as { value?: unknown } | undefined

  if (typeof part?.value !== 'string') {
    throw new TypeError('Expected a text tool result part')
  }

  return part.value
}

function invocation(
  input: AnnoPulseListAnnotationsInput,
): Vscode.LanguageModelToolInvocationOptions<AnnoPulseListAnnotationsInput> {
  return { input, toolInvocationToken: undefined }
}

function toolResult(
  result: Vscode.LanguageModelToolResult | null | undefined,
): Vscode.LanguageModelToolResult {
  if (!result) {
    throw new TypeError('Expected a Language Model Tool result')
  }

  return result
}

function annotationIds(
  result: Vscode.LanguageModelToolResult | null | undefined,
): string[] {
  const serialized = resultText(toolResult(result))
  const parsed = JSON.parse(serialized) as { annotations: { id: string }[] }

  return parsed.annotations.map(item => item.id)
}

function qualityResult(
  result: Vscode.LanguageModelToolResult | null | undefined,
): {
  annotations: { annotation: { id: string }; annotationId: string }[]
  counts: { good: number; needsAttention: number; poor: number }
  returned: number
  scope: string
  total: number
  truncated: boolean
} {
  return JSON.parse(resultText(toolResult(result)))
}

describe(useAnnoPulseLanguageModelTools, () => {
  beforeEach(() => {
    annotationStore.clear()
    configState.enabled = false
    registerTool.mockClear()
    registeredTools.clear()
    textPart.mockClear()
    useDisposable.mockClear()
    vscodeState.activeTextEditor = undefined
    vscodeState.activeTextEditorReads = 0
    vscodeState.visibleTextEditors = []
    vscodeState.visibleTextEditorsReads = 0
  })

  it('registers and disposes both manifest tools', () => {
    useAnnoPulseLanguageModelTools()

    expect(registerTool).toHaveBeenCalledWith(
      'annopulse_list_annotations',
      expect.objectContaining({
        invoke: expect.any(Function),
        prepareInvocation: expect.any(Function),
      }),
    )
    expect(registerTool).toHaveBeenCalledWith(
      'annopulse_quality_check',
      expect.objectContaining({
        invoke: expect.any(Function),
        prepareInvocation: expect.any(Function),
      }),
    )
    expect(useDisposable).toHaveBeenCalledTimes(2)
    expect(useDisposable).toHaveBeenNthCalledWith(1, toolDisposable)
    expect(useDisposable).toHaveBeenNthCalledWith(2, toolDisposable)
    expect(ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME).toBe(
      'annopulse_list_annotations',
    )
    expect(ANNOPULSE_QUALITY_CHECK_TOOL_NAME).toBe('annopulse_quality_check')
  })

  it('prepares a side-effect-free confirmation for the selected scope and limit', async () => {
    useAnnoPulseLanguageModelTools()

    const prepared = await registeredTool(
      ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME,
    ).prepareInvocation?.(
      { input: { limit: 2, scope: 'activeFile' } },
      cancellationToken,
    )

    expect(prepared).toMatchObject({
      invocationMessage:
        'Listing up to 2 AnnoPulse annotations from the active file.',
      confirmationMessages: {
        title: 'Share AnnoPulse annotations',
        message:
          'Share up to 2 already-indexed AnnoPulse annotations from the active file with the agent?',
      },
    })
  })

  it('prepares a quality confirmation for the selected scope and limit', async () => {
    useAnnoPulseLanguageModelTools()

    await expect(
      registeredTool(ANNOPULSE_QUALITY_CHECK_TOOL_NAME).prepareInvocation?.(
        { input: { limit: 2, scope: 'openEditors' } },
        cancellationToken,
      ),
    ).resolves.toMatchObject({
      confirmationMessages: { title: 'Share AnnoPulse annotation quality' },
      invocationMessage:
        'Checking up to 2 AnnoPulse annotations from open editors.',
    })
  })

  it('throws synchronously without reading the store or editors while AI tools are disabled', () => {
    useAnnoPulseLanguageModelTools()
    const getAll = vi.spyOn(annotationStore, 'getAll')

    try {
      expect(() =>
        registeredTool(ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME).invoke(
          invocation({}),
          cancellationToken,
        ),
      ).toThrow(
        'AnnoPulse Language Model Tools are disabled. Enable annopulse.ai.enabled to use them.',
      )
      expect(getAll).not.toHaveBeenCalled()
      expect(vscodeState.activeTextEditorReads).toBe(0)
      expect(vscodeState.visibleTextEditorsReads).toBe(0)
    } finally {
      getAll.mockRestore()
    }
  })

  it('throws synchronously without reading the store or editors while quality tools are disabled', () => {
    useAnnoPulseLanguageModelTools()
    const getAll = vi.spyOn(annotationStore, 'getAll')

    try {
      expect(() =>
        registeredTool(ANNOPULSE_QUALITY_CHECK_TOOL_NAME).invoke(
          invocation({}),
          cancellationToken,
        ),
      ).toThrow(
        'AnnoPulse Language Model Tools are disabled. Enable annopulse.ai.enabled to use them.',
      )
      expect(getAll).not.toHaveBeenCalled()
      expect(vscodeState.activeTextEditorReads).toBe(0)
      expect(vscodeState.visibleTextEditorsReads).toBe(0)
    } finally {
      getAll.mockRestore()
    }
  })

  it('returns a bounded all-scope store snapshot when enabled', async () => {
    configState.enabled = true
    seedAnnotationStore(annotationStore, 'file:///workspace/a.ts', [
      annotation('a'),
    ])
    seedAnnotationStore(annotationStore, 'file:///workspace/b.ts', [
      annotation('b', 'file:///workspace/b.ts'),
    ])
    useAnnoPulseLanguageModelTools()

    const result = await registeredTool(
      ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME,
    ).invoke(invocation({ limit: 1 }), cancellationToken)

    expect(textPart).toHaveBeenCalledWith(
      expect.stringContaining('"returned":1'),
    )
    expect(result).toBeInstanceOf(LanguageModelToolResult)
  })

  it('uses the active editor URI for active-file invocations', async () => {
    configState.enabled = true
    seedAnnotationStore(annotationStore, 'file:///workspace/a.ts', [
      annotation('a'),
    ])
    seedAnnotationStore(annotationStore, 'file:///workspace/b.ts', [
      annotation('b', 'file:///workspace/b.ts'),
    ])
    vscodeState.activeTextEditor = editor('file:///workspace/b.ts')
    vscodeState.visibleTextEditors = [editor('file:///workspace/a.ts')]
    useAnnoPulseLanguageModelTools()

    const result = await registeredTool(
      ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME,
    ).invoke(invocation({ scope: 'activeFile' }), cancellationToken)

    expect(annotationIds(result)).toStrictEqual(['b'])
  })

  it('uses visible editor URIs for open-editor invocations', async () => {
    configState.enabled = true
    seedAnnotationStore(annotationStore, 'file:///workspace/a.ts', [
      annotation('a'),
    ])
    seedAnnotationStore(annotationStore, 'file:///workspace/b.ts', [
      annotation('b', 'file:///workspace/b.ts'),
    ])
    seedAnnotationStore(annotationStore, 'file:///workspace/c.ts', [
      annotation('c', 'file:///workspace/c.ts'),
    ])
    vscodeState.activeTextEditor = editor('file:///workspace/a.ts')
    vscodeState.visibleTextEditors = [
      editor('file:///workspace/b.ts'),
      editor('file:///workspace/c.ts'),
    ]
    useAnnoPulseLanguageModelTools()

    const result = await registeredTool(
      ANNOPULSE_LIST_ANNOTATIONS_TOOL_NAME,
    ).invoke(invocation({ scope: 'openEditors' }), cancellationToken)

    expect(annotationIds(result)).toStrictEqual(['b', 'c'])
  })

  it('returns a quality JSON result scoped to the active editor when enabled', async () => {
    configState.enabled = true
    seedAnnotationStore(annotationStore, 'file:///workspace/a.ts', [
      annotation('a'),
    ])
    seedAnnotationStore(annotationStore, 'file:///workspace/b.ts', [
      annotation('b', 'file:///workspace/b.ts'),
    ])
    vscodeState.activeTextEditor = editor('file:///workspace/b.ts')
    useAnnoPulseLanguageModelTools()

    const result = await registeredTool(
      ANNOPULSE_QUALITY_CHECK_TOOL_NAME,
    ).invoke(invocation({ scope: 'activeFile' }), cancellationToken)

    expect(qualityResult(result)).toMatchObject({
      annotations: [
        {
          annotation: { id: 'b' },
          annotationId: 'b',
          level: 'needsAttention',
          score: 70,
        },
      ],
      counts: { good: 0, needsAttention: 1, poor: 0 },
      returned: 1,
      scope: 'activeFile',
      total: 1,
      truncated: false,
    })
  })

  it('returns a quality JSON result scoped to visible editors when enabled', async () => {
    configState.enabled = true
    seedAnnotationStore(annotationStore, 'file:///workspace/a.ts', [
      annotation('a'),
    ])
    seedAnnotationStore(annotationStore, 'file:///workspace/b.ts', [
      annotation('b', 'file:///workspace/b.ts'),
    ])
    seedAnnotationStore(annotationStore, 'file:///workspace/c.ts', [
      annotation('c', 'file:///workspace/c.ts'),
    ])
    vscodeState.visibleTextEditors = [
      editor('file:///workspace/b.ts'),
      editor('file:///workspace/c.ts'),
    ]
    useAnnoPulseLanguageModelTools()

    const result = await registeredTool(
      ANNOPULSE_QUALITY_CHECK_TOOL_NAME,
    ).invoke(invocation({ scope: 'openEditors' }), cancellationToken)

    expect(qualityResult(result)).toMatchObject({
      annotations: [
        { annotation: { id: 'b' }, annotationId: 'b' },
        { annotation: { id: 'c' }, annotationId: 'c' },
      ],
      counts: { good: 0, needsAttention: 2, poor: 0 },
      returned: 2,
      scope: 'openEditors',
      total: 2,
      truncated: false,
    })
  })
})
