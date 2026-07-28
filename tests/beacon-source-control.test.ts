import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import type { BeaconGitAdapter } from '../src/composables/use-beacon-git'
import { useBeaconSourceControl } from '../src/composables/use-beacon-source-control'
import type * as CodeBeaconConfig from '../src/config'
import { createChangedUriIndex } from '../src/core/git/changed-uri-index'
import { annotationStore } from '../src/core/store/annotation-store'
import type { BeaconAnnotation } from '../src/types/annotation'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve
    reject = nextReject
  })
  return { promise, reject, resolve }
}

const {
  configurationListeners,
  createResourceGroup,
  createSourceControl,
  configState,
  getChangedUris,
  gitChangedUrisListeners,
  gitChangedUrisSubscriptions,
  resourceGroup,
  sourceControl,
  subscribeToChangedUris,
  useDisposable,
} = vi.hoisted(() => {
  const changedUrisListeners: (() => void)[] = []
  const changedUrisSubscriptions: { dispose: () => void }[] = []
  const configurationListenerCallbacks: ((event: {
    affectsConfiguration: (key: string) => boolean
  }) => void)[] = []
  const state = { enabled: false }
  const testResourceGroup = {
    dispose: vi.fn<() => void>(),
    resourceStates: [] as unknown[],
  }
  const testSourceControl = {
    count: 0,
    createResourceGroup: vi.fn<
      (id: string, label: string) => typeof testResourceGroup
    >(() => testResourceGroup),
    dispose: vi.fn<() => void>(),
  }

  return {
    configurationListeners: configurationListenerCallbacks,
    configState: state,
    createResourceGroup: testSourceControl.createResourceGroup,
    createSourceControl: vi.fn<
      (id: string, label: string) => typeof testSourceControl
    >(() => testSourceControl),
    getChangedUris: vi.fn<() => Promise<ReadonlySet<string>>>(() =>
      Promise.resolve(new Set()),
    ),
    gitChangedUrisListeners: changedUrisListeners,
    gitChangedUrisSubscriptions: changedUrisSubscriptions,
    resourceGroup: testResourceGroup,
    sourceControl: testSourceControl,
    subscribeToChangedUris: vi.fn<
      (listener: () => void) => Promise<{ dispose: () => void }>
    >(listener => {
      changedUrisListeners.push(listener)
      const subscription = { dispose: vi.fn<() => void>() }
      changedUrisSubscriptions.push(subscription)
      return Promise.resolve(subscription)
    }),
    useDisposable: vi.fn<(value: unknown) => unknown>(value => value),
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
      config: {
        scm: configState,
      },
    }) as unknown as Partial<typeof CodeBeaconConfig>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      ThemeIcon: class ThemeIcon {
        public readonly id: string

        public constructor(id: string) {
          this.id = id
        }
      },
      Uri: {
        parse: (value: string) => ({ value }),
      },
      scm: {
        createSourceControl,
      },
      workspace: {
        onDidChangeConfiguration: (
          listener: (event: {
            affectsConfiguration: (key: string) => boolean
          }) => void,
        ) => {
          configurationListeners.push(listener)
          return { dispose: vi.fn<() => void>() }
        },
      },
    }) as unknown as Partial<typeof Vscode>,
)

function annotation(
  id: string,
  overrides: Partial<BeaconAnnotation> = {},
): BeaconAnnotation {
  return {
    category: 'todo',
    column: 0,
    id,
    keyword: 'TODO',
    keywordRange: {
      end: { character: 4, line: 0 },
      start: { character: 0, line: 0 },
    },
    languageId: 'typescript',
    line: 0,
    message: 'Follow up',
    range: {
      end: { character: 4, line: 0 },
      start: { character: 0, line: 0 },
    },
    ruleId: 'todo',
    severity: 'information',
    source: 'workspace',
    uri: 'file:///a.ts',
    ...overrides,
  }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('beacon Source Control', () => {
  const git: Pick<
    BeaconGitAdapter,
    'getChangedUris' | 'subscribeToChangedUris'
  > = {
    getChangedUris,
    subscribeToChangedUris,
  }
  let changedUriIndex = createChangedUriIndex(git)

  beforeEach(() => {
    changedUriIndex.dispose()
    annotationStore.clear()
    configState.enabled = false
    configurationListeners.length = 0
    gitChangedUrisListeners.length = 0
    gitChangedUrisSubscriptions.length = 0
    createResourceGroup.mockClear()
    createSourceControl.mockClear()
    getChangedUris.mockReset()
    getChangedUris.mockResolvedValue(new Set())
    resourceGroup.dispose.mockClear()
    resourceGroup.resourceStates = []
    sourceControl.count = 0
    sourceControl.dispose.mockClear()
    subscribeToChangedUris.mockReset()
    subscribeToChangedUris.mockImplementation(listener => {
      gitChangedUrisListeners.push(listener)
      const subscription = { dispose: vi.fn<() => void>() }
      gitChangedUrisSubscriptions.push(subscription)
      return Promise.resolve(subscription)
    })
    useDisposable.mockClear()
    changedUriIndex = createChangedUriIndex(git)
  })

  it('does not create a Source Control provider while disabled', () => {
    useBeaconSourceControl(changedUriIndex)

    expect(createSourceControl).not.toHaveBeenCalled()
    expect(sourceControl.count).toBe(0)
    expect(resourceGroup.resourceStates).toStrictEqual([])
  })

  it('lists sorted changed annotation files with standard open commands', async () => {
    configState.enabled = true
    getChangedUris.mockResolvedValue(new Set(['file:///b.ts', 'file:///a.ts']))
    annotationStore.setForUri('file:///a.ts', [
      annotation('a-1'),
      annotation('a-2'),
    ])
    annotationStore.setForUri('file:///b.ts', [
      annotation('b-1', { resolved: true, uri: 'file:///b.ts' }),
    ])

    useBeaconSourceControl(changedUriIndex)
    await flushPromises()

    expect(createSourceControl).toHaveBeenCalledWith(
      'code-beacon',
      'Code Beacon',
    )
    expect(createResourceGroup).toHaveBeenCalledWith(
      'changedBeacons',
      'Changed Beacons',
    )
    expect(sourceControl.count).toBe(2)
    expect(resourceGroup.resourceStates).toMatchObject([
      {
        command: {
          arguments: [expect.objectContaining({ value: 'file:///a.ts' })],
          command: 'vscode.open',
          title: 'Open Beacon File',
        },
        contextValue: 'codeBeaconChangedResource',
        decorations: {
          icon: expect.objectContaining({ id: 'comment-discussion' }),
          tooltip: '2 Code Beacon annotations (TODO)',
        },
      },
      { resourceUri: expect.objectContaining({ value: 'file:///b.ts' }) },
    ])
  })

  it('refreshes from annotation and Git state changes', async () => {
    configState.enabled = true
    getChangedUris.mockResolvedValueOnce(new Set(['file:///a.ts']))
    useBeaconSourceControl(changedUriIndex)
    await flushPromises()

    expect(sourceControl.count).toBe(0)
    annotationStore.setForUri('file:///a.ts', [annotation('a-1')])
    expect(sourceControl.count).toBe(1)
    expect(resourceGroup.resourceStates).toHaveLength(1)

    getChangedUris.mockResolvedValueOnce(new Set(['file:///b.ts']))
    annotationStore.setForUri('file:///b.ts', [
      annotation('b-1', { uri: 'file:///b.ts' }),
    ])
    gitChangedUrisListeners[0]!()
    await flushPromises()

    expect(sourceControl.count).toBe(1)
    expect(resourceGroup.resourceStates).toMatchObject([
      { resourceUri: expect.objectContaining({ value: 'file:///b.ts' }) },
    ])
  })

  it('empties resources when Git is unavailable or rejects', async () => {
    configState.enabled = true
    getChangedUris.mockResolvedValueOnce(new Set(['file:///a.ts']))
    annotationStore.setForUri('file:///a.ts', [annotation('a-1')])
    useBeaconSourceControl(changedUriIndex)
    await flushPromises()

    expect(sourceControl.count).toBe(1)
    getChangedUris.mockRejectedValueOnce(new Error('Git unavailable'))
    gitChangedUrisListeners[0]!()
    await flushPromises()

    expect(sourceControl.count).toBe(0)
    expect(resourceGroup.resourceStates).toStrictEqual([])
  })

  it('keeps the latest Git snapshot when older refreshes settle later', async () => {
    const initialSnapshot = deferred<ReadonlySet<string>>()
    const listenerSnapshot = deferred<ReadonlySet<string>>()
    const olderRejectedSnapshot = deferred<ReadonlySet<string>>()
    const latestSnapshot = deferred<ReadonlySet<string>>()
    configState.enabled = true
    getChangedUris.mockReturnValueOnce(initialSnapshot.promise)
    getChangedUris.mockReturnValueOnce(listenerSnapshot.promise)
    getChangedUris.mockReturnValueOnce(olderRejectedSnapshot.promise)
    getChangedUris.mockReturnValueOnce(latestSnapshot.promise)
    annotationStore.setForUri('file:///a.ts', [annotation('a-1')])
    annotationStore.setForUri('file:///b.ts', [
      annotation('b-1', { uri: 'file:///b.ts' }),
    ])
    annotationStore.setForUri('file:///c.ts', [
      annotation('c-1', { uri: 'file:///c.ts' }),
    ])

    useBeaconSourceControl(changedUriIndex)
    await flushPromises()
    gitChangedUrisListeners[0]!()

    listenerSnapshot.resolve(new Set(['file:///b.ts']))
    await flushPromises()
    expect(sourceControl.count).toBe(1)
    expect(resourceGroup.resourceStates).toMatchObject([
      { resourceUri: expect.objectContaining({ value: 'file:///b.ts' }) },
    ])

    initialSnapshot.resolve(new Set(['file:///a.ts']))
    await flushPromises()

    expect(sourceControl.count).toBe(1)
    expect(resourceGroup.resourceStates).toMatchObject([
      { resourceUri: expect.objectContaining({ value: 'file:///b.ts' }) },
    ])

    gitChangedUrisListeners[0]!()
    gitChangedUrisListeners[0]!()
    latestSnapshot.resolve(new Set(['file:///c.ts']))
    await flushPromises()
    olderRejectedSnapshot.reject(new Error('Superseded Git snapshot failed'))
    await flushPromises()

    expect(sourceControl.count).toBe(1)
    expect(resourceGroup.resourceStates).toMatchObject([
      { resourceUri: expect.objectContaining({ value: 'file:///c.ts' }) },
    ])
  })

  it('disposes provider, group, and Git subscription when disabled', async () => {
    configState.enabled = true
    useBeaconSourceControl(changedUriIndex)
    await flushPromises()
    const gitSubscription = gitChangedUrisSubscriptions[0]!

    configState.enabled = false
    configurationListeners[0]!({
      affectsConfiguration: (key: string) => key === 'code-beacon.scm.enabled',
    })

    expect(gitSubscription.dispose).toHaveBeenCalledTimes(1)
    expect(resourceGroup.dispose).toHaveBeenCalledTimes(1)
    expect(sourceControl.dispose).toHaveBeenCalledTimes(1)
    expect(sourceControl.count).toBe(0)
    expect(resourceGroup.resourceStates).toStrictEqual([])
  })

  it('disposes a late Git subscription and ignores a late snapshot after disable', async () => {
    const changedUris = deferred<ReadonlySet<string>>()
    const subscription = deferred<{ dispose: () => void }>()
    const lateSubscription = { dispose: vi.fn<() => void>() }
    configState.enabled = true
    getChangedUris.mockReturnValueOnce(changedUris.promise)
    subscribeToChangedUris.mockReturnValueOnce(subscription.promise)
    useBeaconSourceControl(changedUriIndex)

    configState.enabled = false
    configurationListeners[0]!({
      affectsConfiguration: (key: string) => key === 'code-beacon.scm.enabled',
    })
    changedUris.resolve(new Set(['file:///a.ts']))
    subscription.resolve(lateSubscription)
    await flushPromises()

    expect(lateSubscription.dispose).toHaveBeenCalledTimes(1)
    expect(sourceControl.count).toBe(0)
    expect(resourceGroup.resourceStates).toStrictEqual([])
  })
})
