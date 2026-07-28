import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import {
  useBeaconHover,
  type BeaconGitMetadataLookup,
} from '../src/composables/use-beacon-hover'
import type { BeaconGitMetadata } from '../src/core/git/blame'
import { annotationStore } from '../src/core/store/annotation-store'
import type { BeaconAnnotation } from '../src/types/annotation'

interface HoverProvider {
  provideHover: (
    document: Vscode.TextDocument,
    position: Vscode.Position,
  ) => Promise<Vscode.Hover | null> | Vscode.Hover | null
}

type RegisterHoverProvider = (
  selector: unknown,
  provider: HoverProvider,
) => { dispose: () => void }

const { hoverProviders, registerHoverProvider, useDisposable } = vi.hoisted(
  () => {
    const providers: HoverProvider[] = []

    return {
      hoverProviders: providers,
      registerHoverProvider: vi.fn<RegisterHoverProvider>(
        (_selector, provider) => {
          providers.push(provider)
          return { dispose: vi.fn<() => void>() }
        },
      ),
      useDisposable: vi.fn<(value: unknown) => unknown>(value => value),
    }
  },
)

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
      config: {
        enable: true,
        hover: { enabled: true },
      },
    }) as Record<string, unknown>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      Hover: class {
        public readonly contents: unknown

        public constructor(contents: unknown) {
          this.contents = contents
        }
      },
      MarkdownString: class {
        public readonly value: string

        public constructor(value: string) {
          this.value = value
        }
      },
      languages: { registerHoverProvider },
    }) as unknown as Partial<typeof Vscode>,
)

function annotation(): BeaconAnnotation {
  return {
    category: 'todo',
    column: 3,
    id: 'annotation',
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
    uri: 'file:///workspace/src/a.ts',
  }
}

function document(): Vscode.TextDocument {
  return {
    uri: {
      toString: () => 'file:///workspace/src/a.ts',
    },
  } as Vscode.TextDocument
}

function registeredHoverProvider(): HoverProvider {
  const provider = hoverProviders[0]
  if (!provider) {
    throw new Error('Expected a hover provider to be registered')
  }

  return provider
}

function markdownValue(hover: Vscode.Hover | null): string {
  if (!hover) {
    throw new Error('Expected a hover result')
  }

  const contents = Array.isArray(hover.contents)
    ? hover.contents[0]
    : hover.contents
  if (!contents || typeof contents === 'string') {
    throw new Error('Expected Markdown hover content')
  }

  return contents.value
}

describe('beacon hover', () => {
  beforeEach(() => {
    annotationStore.clear()
    hoverProviders.length = 0
    registerHoverProvider.mockClear()
    useDisposable.mockClear()
  })

  it('awaits Git metadata for the hovered annotation', async () => {
    const testDocument = document()
    const testAnnotation = annotation()
    const metadata: BeaconGitMetadata = {
      authorName: 'Ada Lovelace',
      commitDate: '2026-07-12T04:00:00.000Z',
      hash: 'a1b2c3d4e5f6',
      summary: 'Add beacon metadata',
    }
    const getMetadata = vi.fn<BeaconGitMetadataLookup>(() =>
      Promise.resolve(metadata),
    )
    annotationStore.setForUri(testDocument.uri.toString(), [testAnnotation])

    useBeaconHover(getMetadata)

    const result = await registeredHoverProvider().provideHover(testDocument, {
      character: 3,
      line: 1,
    } as Vscode.Position)

    expect(getMetadata).toHaveBeenCalledExactlyOnceWith(
      testDocument,
      expect.objectContaining(testAnnotation),
    )
    expect(markdownValue(result)).toContain('**Git**')
    expect(markdownValue(result)).toContain('- Commit: `a1b2c3d`')
  })

  it.each([
    ['resolves undefined', () => Promise.resolve()],
    ['rejects', () => Promise.reject(new Error('Git unavailable'))],
  ])('preserves the base hover when metadata lookup %s', async (_, lookup) => {
    const testDocument = document()
    annotationStore.setForUri(testDocument.uri.toString(), [annotation()])

    useBeaconHover(lookup)

    const result = await registeredHoverProvider().provideHover(testDocument, {
      character: 3,
      line: 1,
    } as Vscode.Position)

    expect(markdownValue(result)).toContain('**TODO:** ship it')
    expect(markdownValue(result)).not.toContain('**Git**')
  })
})
