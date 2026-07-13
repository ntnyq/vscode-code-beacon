import type * as ReactiveVscode from 'reactive-vscode'
import { describe, expect, it, vi } from 'vitest'
import type * as BeaconCodeLens from '../src/composables/use-beacon-codelens'
import type * as BeaconCommands from '../src/composables/use-beacon-commands'
import type * as BeaconDiagnostics from '../src/composables/use-beacon-diagnostics'
import type * as BeaconExplorer from '../src/composables/use-beacon-explorer'
import type * as BeaconGit from '../src/composables/use-beacon-git'
import type * as BeaconHighlight from '../src/composables/use-beacon-highlight'
import type * as BeaconHover from '../src/composables/use-beacon-hover'
import type * as BeaconNotebook from '../src/composables/use-beacon-notebook'
import type * as BeaconSourceControl from '../src/composables/use-beacon-source-control'
import type * as WorkspaceScan from '../src/composables/use-workspace-scan'
import type * as Logger from '../src/utils/logger'

const {
  beaconGit,
  defineExtension,
  useBeaconCodeLens,
  useBeaconCommands,
  useBeaconDiagnostics,
  useBeaconExplorer,
  useBeaconGit,
  useBeaconHighlight,
  useBeaconHover,
  useBeaconNotebook,
  useBeaconSourceControl,
  useWorkspaceScan,
} = vi.hoisted(() => {
  const metadata = vi.fn<() => void>()
  const git = { getMetadata: metadata }
  const scan = vi.fn<() => void>()

  return {
    beaconGit: git,
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
    useBeaconExplorer: vi.fn<(adapter: typeof git) => void>(),
    useBeaconGit: vi.fn<() => typeof git>(() => git),
    useBeaconHighlight: vi.fn<() => { scanTextDocument: typeof scan }>(() => ({
      scanTextDocument: scan,
    })),
    useBeaconHover: vi.fn<(getMetadata: typeof metadata) => void>(),
    useBeaconNotebook: vi.fn<(scanDocument: typeof scan) => void>(),
    useBeaconSourceControl: vi.fn<(adapter: typeof git) => void>(),
    useWorkspaceScan: vi.fn<() => void>(),
  }
})

vi.mock(
  import('reactive-vscode'),
  () => ({ defineExtension }) as unknown as Partial<typeof ReactiveVscode>,
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
    expect(useBeaconExplorer).toHaveBeenCalledExactlyOnceWith(beaconGit)
    expect(useBeaconHover).toHaveBeenCalledExactlyOnceWith(
      beaconGit.getMetadata,
    )
    expect(useBeaconSourceControl).toHaveBeenCalledExactlyOnceWith(beaconGit)
  })
})
