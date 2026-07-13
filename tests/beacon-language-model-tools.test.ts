import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LanguageModelToolResult } from 'vscode'
import type * as Vscode from 'vscode'
import {
  BEACON_LIST_ANNOTATIONS_TOOL_NAME,
  useBeaconLanguageModelTools,
} from '../src/composables/use-beacon-language-model-tools'
import type { BeaconListAnnotationsInput } from '../src/core/ai/list-annotations'
import { annotationStore } from '../src/core/store/annotation-store'
import type { BeaconAnnotation } from '../src/types/annotation'

type RegisteredTool = Vscode.LanguageModelTool<BeaconListAnnotationsInput>

const {
  configState,
  registerTool,
  registeredTools,
  textPart,
  toolDisposable,
  useDisposable,
  vscodeState,
} = vi.hoisted(() => {
  const toolInstances: RegisteredTool[] = []
  const registrationDisposable = { dispose: vi.fn<() => void>() }

  return {
    configState: { enabled: false },
    registerTool: vi.fn<
      (name: string, tool: RegisteredTool) => Vscode.Disposable
    >((_name, tool) => {
      toolInstances.push(tool)
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

function editor(uri: string): Vscode.TextEditor {
  return {
    document: {
      uri: { toString: () => uri },
    },
  } as Vscode.TextEditor
}

function registeredTool(): RegisteredTool {
  const tool = registeredTools[0]

  if (!tool) {
    throw new TypeError('Expected a Language Model Tool to be registered')
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
  input: BeaconListAnnotationsInput,
): Vscode.LanguageModelToolInvocationOptions<BeaconListAnnotationsInput> {
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

describe(useBeaconLanguageModelTools, () => {
  beforeEach(() => {
    annotationStore.clear()
    configState.enabled = false
    registerTool.mockClear()
    registeredTools.length = 0
    textPart.mockClear()
    useDisposable.mockClear()
    vscodeState.activeTextEditor = undefined
    vscodeState.activeTextEditorReads = 0
    vscodeState.visibleTextEditors = []
    vscodeState.visibleTextEditorsReads = 0
  })

  it('registers the manifest tool and disposes its registration', () => {
    useBeaconLanguageModelTools()

    expect(registerTool).toHaveBeenCalledWith(
      'code_beacon_list_annotations',
      expect.objectContaining({
        invoke: expect.any(Function),
        prepareInvocation: expect.any(Function),
      }),
    )
    expect(useDisposable).toHaveBeenCalledWith(toolDisposable)
    expect(BEACON_LIST_ANNOTATIONS_TOOL_NAME).toBe(
      'code_beacon_list_annotations',
    )
  })

  it('prepares a side-effect-free confirmation for the selected scope and limit', async () => {
    useBeaconLanguageModelTools()

    const prepared = await registeredTool().prepareInvocation?.(
      { input: { limit: 2, scope: 'activeFile' } },
      cancellationToken,
    )

    expect(prepared).toMatchObject({
      invocationMessage:
        'Listing up to 2 Code Beacon annotations from the active file.',
      confirmationMessages: {
        title: 'Share Code Beacon annotations',
        message:
          'Share up to 2 already-indexed Code Beacon annotations from the active file with the agent?',
      },
    })
  })

  it('throws synchronously without reading the store or editors while AI tools are disabled', () => {
    useBeaconLanguageModelTools()
    const getAll = vi.spyOn(annotationStore, 'getAll')

    try {
      expect(() =>
        registeredTool().invoke(invocation({}), cancellationToken),
      ).toThrow(
        'Code Beacon Language Model Tools are disabled. Enable code-beacon.ai.enabled to use them.',
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
    annotationStore.setForUri('file:///workspace/a.ts', [annotation('a')])
    annotationStore.setForUri('file:///workspace/b.ts', [
      annotation('b', 'file:///workspace/b.ts'),
    ])
    useBeaconLanguageModelTools()

    const result = await registeredTool().invoke(
      invocation({ limit: 1 }),
      cancellationToken,
    )

    expect(textPart).toHaveBeenCalledWith(
      expect.stringContaining('"returned":1'),
    )
    expect(result).toBeInstanceOf(LanguageModelToolResult)
  })

  it('uses the active editor URI for active-file invocations', async () => {
    configState.enabled = true
    annotationStore.setForUri('file:///workspace/a.ts', [annotation('a')])
    annotationStore.setForUri('file:///workspace/b.ts', [
      annotation('b', 'file:///workspace/b.ts'),
    ])
    vscodeState.activeTextEditor = editor('file:///workspace/b.ts')
    vscodeState.visibleTextEditors = [editor('file:///workspace/a.ts')]
    useBeaconLanguageModelTools()

    const result = await registeredTool().invoke(
      invocation({ scope: 'activeFile' }),
      cancellationToken,
    )

    expect(annotationIds(result)).toStrictEqual(['b'])
  })

  it('uses visible editor URIs for open-editor invocations', async () => {
    configState.enabled = true
    annotationStore.setForUri('file:///workspace/a.ts', [annotation('a')])
    annotationStore.setForUri('file:///workspace/b.ts', [
      annotation('b', 'file:///workspace/b.ts'),
    ])
    annotationStore.setForUri('file:///workspace/c.ts', [
      annotation('c', 'file:///workspace/c.ts'),
    ])
    vscodeState.activeTextEditor = editor('file:///workspace/a.ts')
    vscodeState.visibleTextEditors = [
      editor('file:///workspace/b.ts'),
      editor('file:///workspace/c.ts'),
    ]
    useBeaconLanguageModelTools()

    const result = await registeredTool().invoke(
      invocation({ scope: 'openEditors' }),
      cancellationToken,
    )

    expect(annotationIds(result)).toStrictEqual(['b', 'c'])
  })
})
