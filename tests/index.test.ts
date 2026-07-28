import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as BeaconCodeLens from '../src/composables/use-beacon-codelens'
import type * as BeaconCommands from '../src/composables/use-beacon-commands'
import type * as BeaconDiagnostics from '../src/composables/use-beacon-diagnostics'
import type * as BeaconExplorer from '../src/composables/use-beacon-explorer'
import type * as BeaconGit from '../src/composables/use-beacon-git'
import type * as BeaconHighlight from '../src/composables/use-beacon-highlight'
import type * as BeaconHover from '../src/composables/use-beacon-hover'
import type * as BeaconLanguageModelTools from '../src/composables/use-beacon-language-model-tools'
import type * as BeaconNotebook from '../src/composables/use-beacon-notebook'
import type * as BeaconSourceControl from '../src/composables/use-beacon-source-control'
import type * as WorkspaceScan from '../src/composables/use-workspace-scan'
import type * as ChangedUriIndex from '../src/core/git/changed-uri-index'
import type * as Logger from '../src/utils/logger'

const {
  beaconGit,
  changedUriIndex,
  createChangedUriIndex,
  defineExtension,
  useBeaconCodeLens,
  useBeaconCommands,
  useBeaconDiagnostics,
  useBeaconExplorer,
  useBeaconGit,
  useBeaconHighlight,
  useBeaconHover,
  useBeaconLanguageModelTools,
  useBeaconNotebook,
  useBeaconSourceControl,
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
    beaconGit: git,
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
    useBeaconCodeLens: vi.fn<() => void>(),
    useBeaconCommands: vi.fn<(workspaceState: unknown) => void>(),
    useBeaconDiagnostics: vi.fn<() => void>(),
    useBeaconExplorer:
      vi.fn<(adapter: typeof git, changedUris: typeof index) => void>(),
    useBeaconGit: vi.fn<() => typeof git>(() => git),
    useBeaconHighlight: vi.fn<() => { scanTextDocument: typeof scan }>(() => ({
      scanTextDocument: scan,
    })),
    useBeaconHover: vi.fn<(getMetadata: typeof metadata) => void>(),
    useBeaconLanguageModelTools: vi.fn<() => void>(),
    useBeaconNotebook: vi.fn<(scanDocument: typeof scan) => void>(),
    useBeaconSourceControl: vi.fn<(changedUris: typeof index) => void>(),
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
  import('../src/composables/use-beacon-codelens'),
  () =>
    ({
      useBeaconCodeLens,
    }) as unknown as Partial<typeof BeaconCodeLens>,
)
vi.mock(
  import('../src/composables/use-beacon-commands'),
  () =>
    ({
      useBeaconCommands,
    }) as unknown as Partial<typeof BeaconCommands>,
)
vi.mock(
  import('../src/composables/use-beacon-diagnostics'),
  () =>
    ({
      useBeaconDiagnostics,
    }) as unknown as Partial<typeof BeaconDiagnostics>,
)
vi.mock(
  import('../src/composables/use-beacon-explorer'),
  () =>
    ({
      useBeaconExplorer,
    }) as unknown as Partial<typeof BeaconExplorer>,
)
vi.mock(
  import('../src/composables/use-beacon-git'),
  () => ({ useBeaconGit }) as unknown as Partial<typeof BeaconGit>,
)
vi.mock(
  import('../src/composables/use-beacon-highlight'),
  () =>
    ({
      useBeaconHighlight,
    }) as unknown as Partial<typeof BeaconHighlight>,
)
vi.mock(
  import('../src/composables/use-beacon-hover'),
  () =>
    ({
      useBeaconHover,
    }) as unknown as Partial<typeof BeaconHover>,
)
vi.mock(
  import('../src/composables/use-beacon-language-model-tools'),
  () =>
    ({
      useBeaconLanguageModelTools,
    }) as unknown as Partial<typeof BeaconLanguageModelTools>,
)
vi.mock(
  import('../src/composables/use-beacon-notebook'),
  () =>
    ({
      useBeaconNotebook,
    }) as unknown as Partial<typeof BeaconNotebook>,
)
vi.mock(
  import('../src/composables/use-beacon-source-control'),
  () =>
    ({
      useBeaconSourceControl,
    }) as unknown as Partial<typeof BeaconSourceControl>,
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

    expect(useBeaconGit).toHaveBeenCalledExactlyOnceWith()
    expect(createChangedUriIndex).toHaveBeenCalledExactlyOnceWith(beaconGit)
    expect(useDisposable).toHaveBeenCalledExactlyOnceWith(changedUriIndex)
    expect(useBeaconExplorer).toHaveBeenCalledExactlyOnceWith(
      beaconGit,
      changedUriIndex,
    )
    expect(useBeaconHover).toHaveBeenCalledExactlyOnceWith(
      beaconGit.getMetadata,
    )
    expect(useBeaconSourceControl).toHaveBeenCalledExactlyOnceWith(
      changedUriIndex,
    )
    expect(useBeaconLanguageModelTools).toHaveBeenCalledExactlyOnceWith()
    expect(useBeaconLanguageModelTools).toHaveBeenCalledAfter(useBeaconCodeLens)
  })
})
