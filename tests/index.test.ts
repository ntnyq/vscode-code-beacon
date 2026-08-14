import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as AnnoPulseCodeLens from '../src/composables/use-annopulse-codelens'
import type * as AnnoPulseCommands from '../src/composables/use-annopulse-commands'
import type * as AnnoPulseDiagnostics from '../src/composables/use-annopulse-diagnostics'
import type * as AnnoPulseExplorer from '../src/composables/use-annopulse-explorer'
import type * as AnnoPulseGit from '../src/composables/use-annopulse-git'
import type * as AnnoPulseHighlight from '../src/composables/use-annopulse-highlight'
import type * as AnnoPulseHover from '../src/composables/use-annopulse-hover'
import type * as AnnoPulseLanguageModelTools from '../src/composables/use-annopulse-language-model-tools'
import type * as AnnoPulseNotebook from '../src/composables/use-annopulse-notebook'
import type * as AnnoPulseSourceControl from '../src/composables/use-annopulse-source-control'
import type * as WorkspaceScan from '../src/composables/use-workspace-scan'
import type * as ChangedUriIndex from '../src/core/git/changed-uri-index'
import type * as Logger from '../src/utils/logger'

const {
  annopulseGit,
  changedUriIndex,
  createChangedUriIndex,
  defineExtension,
  useAnnoPulseCodeLens,
  useAnnoPulseCommands,
  useAnnoPulseDiagnostics,
  useAnnoPulseExplorer,
  useAnnoPulseGit,
  useAnnoPulseHighlight,
  useAnnoPulseHover,
  useAnnoPulseLanguageModelTools,
  useAnnoPulseNotebook,
  useAnnoPulseSourceControl,
  useDisposable,
  useWorkspaceScan,
} = vi.hoisted(() => {
  const metadata = vi.fn<() => void>()
  const git = { getMetadata: metadata }
  const index = {
    dispose: vi.fn<() => void>(),
    getAll: vi.fn<() => ReadonlySet<string>>(() => new Set()),
    subscribe: vi.fn<
      (listener: () => void) => {
        dispose: () => void
      }
    >(() => ({ dispose: vi.fn<() => void>() })),
  }
  const scan = vi.fn<() => void>()

  return {
    annopulseGit: git,
    changedUriIndex: index,
    createChangedUriIndex: vi.fn<(source: typeof git) => typeof index>(
      () => index,
    ),
    defineExtension: vi.fn<
      (setup: (context: { workspaceState: unknown }) => unknown) => {
        activate: (context: { workspaceState: unknown }) => unknown
        deactivate: () => void
      }
    >((setup: (context: { workspaceState: unknown }) => unknown) => ({
      activate: (context: { workspaceState: unknown }) => setup(context),
      deactivate: vi.fn<() => void>(),
    })),
    useAnnoPulseCodeLens: vi.fn<() => void>(),
    useAnnoPulseCommands: vi.fn<(workspaceState: unknown) => void>(),
    useAnnoPulseDiagnostics: vi.fn<() => void>(),
    useAnnoPulseExplorer:
      vi.fn<(adapter: typeof git, changedUris: typeof index) => void>(),
    useAnnoPulseGit: vi.fn<() => typeof git>(() => git),
    useAnnoPulseHighlight: vi.fn<() => { scanTextDocument: typeof scan }>(
      () => ({
        scanTextDocument: scan,
      }),
    ),
    useAnnoPulseHover: vi.fn<(getMetadata: typeof metadata) => void>(),
    useAnnoPulseLanguageModelTools: vi.fn<() => void>(),
    useAnnoPulseNotebook: vi.fn<(scanDocument: typeof scan) => void>(),
    useAnnoPulseSourceControl: vi.fn<(changedUris: typeof index) => void>(),
    useDisposable: vi.fn<(disposable: typeof index) => typeof index>(
      disposable => disposable,
    ),
    useWorkspaceScan: vi.fn<() => void>(),
  }
})

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      defineExtension,
      useDisposable,
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('../src/composables/use-annopulse-codelens'),
  () =>
    ({
      useAnnoPulseCodeLens,
    }) as unknown as Partial<typeof AnnoPulseCodeLens>,
)
vi.mock(
  import('../src/composables/use-annopulse-commands'),
  () =>
    ({
      useAnnoPulseCommands,
    }) as unknown as Partial<typeof AnnoPulseCommands>,
)
vi.mock(
  import('../src/composables/use-annopulse-diagnostics'),
  () =>
    ({
      useAnnoPulseDiagnostics,
    }) as unknown as Partial<typeof AnnoPulseDiagnostics>,
)
vi.mock(
  import('../src/composables/use-annopulse-explorer'),
  () =>
    ({
      useAnnoPulseExplorer,
    }) as unknown as Partial<typeof AnnoPulseExplorer>,
)
vi.mock(
  import('../src/composables/use-annopulse-git'),
  () => ({ useAnnoPulseGit }) as unknown as Partial<typeof AnnoPulseGit>,
)
vi.mock(
  import('../src/composables/use-annopulse-highlight'),
  () =>
    ({
      useAnnoPulseHighlight,
    }) as unknown as Partial<typeof AnnoPulseHighlight>,
)
vi.mock(
  import('../src/composables/use-annopulse-hover'),
  () =>
    ({
      useAnnoPulseHover,
    }) as unknown as Partial<typeof AnnoPulseHover>,
)
vi.mock(
  import('../src/composables/use-annopulse-language-model-tools'),
  () =>
    ({
      useAnnoPulseLanguageModelTools,
    }) as unknown as Partial<typeof AnnoPulseLanguageModelTools>,
)
vi.mock(
  import('../src/composables/use-annopulse-notebook'),
  () =>
    ({
      useAnnoPulseNotebook,
    }) as unknown as Partial<typeof AnnoPulseNotebook>,
)
vi.mock(
  import('../src/composables/use-annopulse-source-control'),
  () =>
    ({
      useAnnoPulseSourceControl,
    }) as unknown as Partial<typeof AnnoPulseSourceControl>,
)
vi.mock(
  import('../src/core/git/changed-uri-index'),
  () =>
    ({
      createChangedUriIndex,
    }) as unknown as Partial<typeof ChangedUriIndex>,
)
vi.mock(
  import('../src/composables/use-workspace-scan'),
  () =>
    ({
      useWorkspaceScan,
    }) as unknown as Partial<typeof WorkspaceScan>,
)
vi.mock(
  import('../src/utils/logger'),
  () =>
    ({
      logger: { info: vi.fn<(message: string) => void>() },
    }) as unknown as Partial<typeof Logger>,
)

describe('extension activation', () => {
  it('shares one Git adapter with every Git-aware feature', async () => {
    const { activate } = await import('../src/index')

    activate({ workspaceState: {} } as never)

    expect(useAnnoPulseGit).toHaveBeenCalledExactlyOnceWith()
    expect(createChangedUriIndex).toHaveBeenCalledExactlyOnceWith(annopulseGit)
    expect(useDisposable).toHaveBeenCalledExactlyOnceWith(changedUriIndex)
    expect(useAnnoPulseExplorer).toHaveBeenCalledExactlyOnceWith(
      annopulseGit,
      changedUriIndex,
    )
    expect(useAnnoPulseHover).toHaveBeenCalledExactlyOnceWith(
      annopulseGit.getMetadata,
    )
    expect(useAnnoPulseSourceControl).toHaveBeenCalledExactlyOnceWith(
      changedUriIndex,
    )
    expect(useAnnoPulseLanguageModelTools).toHaveBeenCalledExactlyOnceWith()
    expect(useAnnoPulseLanguageModelTools).toHaveBeenCalledAfter(
      useAnnoPulseCodeLens,
    )
  })
})
