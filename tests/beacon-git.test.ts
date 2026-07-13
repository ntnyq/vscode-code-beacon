import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import { useBeaconGit } from '../src/composables/use-beacon-git'
import type { BeaconAnnotation } from '../src/types/annotation'

interface TestUri {
  readonly authority: string
  readonly path: string
  readonly scheme: string
  readonly toString: () => string
}

interface TestChange {
  readonly originalUri?: TestUri
  readonly uri: TestUri
}

interface TestDisposable {
  dispose: () => void
}

interface TestRepositoryState {
  readonly indexChanges: readonly TestChange[]
  readonly mergeChanges: readonly TestChange[]
  readonly onDidChange: (listener: () => void) => TestDisposable
  readonly untrackedChanges: readonly TestChange[]
  readonly workingTreeChanges: readonly TestChange[]
}

interface TestRepository {
  readonly blame: ReturnType<typeof vi.fn<(path: string) => Promise<string>>>
  readonly getCommit: ReturnType<
    typeof vi.fn<(hash: string) => Promise<TestCommit>>
  >
  isUsingVirtualFileSystem: boolean
  readonly rootUri: TestUri
  readonly state: TestRepositoryState
}

interface TestCommit {
  readonly authorDate: Date
  readonly authorEmail: string
  readonly authorName: string
  readonly hash: string
  readonly message: string
}

const { asRelativePath, getExtension } = vi.hoisted(() => ({
  asRelativePath: vi.fn<
    (uri: TestUri, includeWorkspaceFolder?: boolean) => string
  >(() => 'src/example.ts'),
  getExtension: vi.fn<(id: string) => unknown>(),
}))

function event() {
  const listeners = new Set<() => void>()

  return {
    event: (listener: () => void): TestDisposable => {
      listeners.add(listener)
      return { dispose: () => listeners.delete(listener) }
    },
    fire: () => {
      for (const listener of listeners) {
        listener()
      }
    },
    get listenerCount() {
      return listeners.size
    },
  }
}

function repositoryState(
  changes: Partial<
    Pick<
      TestRepositoryState,
      | 'indexChanges'
      | 'mergeChanges'
      | 'untrackedChanges'
      | 'workingTreeChanges'
    >
  > = {},
) {
  const onDidChange = event()

  return {
    indexChanges: changes.indexChanges ?? [],
    mergeChanges: changes.mergeChanges ?? [],
    onDidChange: onDidChange.event,
    signal: onDidChange,
    untrackedChanges: changes.untrackedChanges ?? [],
    workingTreeChanges: changes.workingTreeChanges ?? [],
  }
}

let isTrusted = true

vi.mock(
  import('vscode'),
  () =>
    ({
      extensions: { getExtension },
      workspace: {
        asRelativePath,
        get isTrusted() {
          return isTrusted
        },
      },
    }) as unknown as Partial<typeof Vscode>,
)

function uri(path: string): TestUri {
  return {
    authority: '',
    path,
    scheme: 'file',
    toString: () => `file://${path}`,
  }
}

function document(
  version = 1,
  path = '/workspace/src/example.ts',
): Vscode.TextDocument {
  return {
    uri: uri(path),
    version,
  } as Vscode.TextDocument
}

function annotation(line = 4, id = `annotation-${line}`): BeaconAnnotation {
  return { id, line } as BeaconAnnotation
}

function repository(
  rootUri = uri('/workspace'),
  state = repositoryState(),
): TestRepository {
  return {
    blame: vi.fn<(path: string) => Promise<string>>(() =>
      Promise.resolve(
        [
          'a1b2c3d4 (Ada Lovelace 2026-07-12 12:00:00 +0800 1) const one = 1;',
          'a1b2c3d4 (Ada Lovelace 2026-07-12 12:00:00 +0800 2) const two = 2;',
          'a1b2c3d4 (Ada Lovelace 2026-07-12 12:00:00 +0800 3) const three = 3;',
          'a1b2c3d4 (Ada Lovelace 2026-07-12 12:00:00 +0800 4) const four = 4;',
          'a1b2c3d4 (Ada Lovelace 2026-07-12 12:00:00 +0800 5) const five = 5;',
        ].join('\n'),
      ),
    ),
    getCommit: vi.fn<(hash: string) => Promise<TestCommit>>(() =>
      Promise.resolve({
        authorDate: new Date('2026-07-12T04:00:00.000Z'),
        authorEmail: 'ada@example.com',
        authorName: 'Ada Lovelace',
        hash: 'a1b2c3d4',
        message: 'Add beacon metadata',
      }),
    ),
    isUsingVirtualFileSystem: false,
    rootUri,
    state,
  }
}

function gitExtension(
  testRepository: TestRepository,
  repositories: TestRepository[] = [testRepository],
) {
  const getRepository = vi.fn<(uri: unknown) => TestRepository | undefined>(
    () => testRepository,
  )
  const onDidCloseRepository = event()
  const onDidOpenRepository = event()
  const getAPI = vi.fn<
    (version: number) => {
      getRepository: typeof getRepository
      onDidCloseRepository: typeof onDidCloseRepository.event
      onDidOpenRepository: typeof onDidOpenRepository.event
      repositories: readonly TestRepository[]
    }
  >(() => ({
    getRepository,
    onDidCloseRepository: onDidCloseRepository.event,
    onDidOpenRepository: onDidOpenRepository.event,
    repositories,
  }))
  const activate = vi.fn<() => Promise<{ getAPI: typeof getAPI }>>(() =>
    Promise.resolve({ getAPI }),
  )

  return {
    activate,
    closeRepository: onDidCloseRepository,
    getAPI,
    getRepository,
    openRepository: onDidOpenRepository,
    repositories,
  }
}

describe('beacon Git metadata', () => {
  beforeEach(() => {
    asRelativePath.mockReset()
    asRelativePath.mockReturnValue('src/example.ts')
    getExtension.mockReset()
    isTrusted = true
  })

  it('resolves a flat built-in Git commit through the blame API', async () => {
    const testRepository = repository()
    const extension = gitExtension(testRepository)
    const testDocument = document()
    getExtension.mockReturnValue(extension)

    const result = await useBeaconGit().getMetadata(testDocument, annotation())

    expect(getExtension).toHaveBeenCalledWith('vscode.git')
    expect(extension.activate).toHaveBeenCalledTimes(1)
    expect(extension.getAPI).toHaveBeenCalledWith(1)
    expect(extension.getRepository).toHaveBeenCalledWith(testDocument.uri)
    expect(asRelativePath).not.toHaveBeenCalled()
    expect(testRepository.blame).toHaveBeenCalledWith('src/example.ts')
    expect(testRepository.getCommit).toHaveBeenCalledWith('a1b2c3d4')
    expect(result).toStrictEqual({
      authorEmail: 'ada@example.com',
      authorName: 'Ada Lovelace',
      commitDate: '2026-07-12T04:00:00.000Z',
      hash: 'a1b2c3d4',
      summary: 'Add beacon metadata',
    })
  })

  it('blames a nested repository document relative to its repository root', async () => {
    const testRepository = repository(uri('/workspace/packages/foo'))
    const extension = gitExtension(testRepository)
    const testDocument = document(1, '/workspace/packages/foo/src/a.ts')
    asRelativePath.mockReturnValue('packages/foo/src/a.ts')
    getExtension.mockReturnValue(extension)

    await useBeaconGit().getMetadata(testDocument, annotation())

    expect(asRelativePath).not.toHaveBeenCalled()
    expect(testRepository.blame).toHaveBeenCalledWith('src/a.ts')
  })

  it('does not access Git in an untrusted workspace', async () => {
    isTrusted = false

    await expect(
      useBeaconGit().getMetadata(document(), annotation()),
    ).resolves.toBeUndefined()

    expect(getExtension).not.toHaveBeenCalled()
    expect(asRelativePath).not.toHaveBeenCalled()
  })

  it('does not blame a virtual repository', async () => {
    const testRepository = repository()
    testRepository.isUsingVirtualFileSystem = true
    const extension = gitExtension(testRepository)
    getExtension.mockReturnValue(extension)

    await expect(
      useBeaconGit().getMetadata(document(), annotation()),
    ).resolves.toBeUndefined()

    expect(testRepository.blame).not.toHaveBeenCalled()
    expect(testRepository.getCommit).not.toHaveBeenCalled()
    expect(asRelativePath).not.toHaveBeenCalled()
  })

  it('does not activate a missing Git extension', async () => {
    await expect(
      useBeaconGit().getMetadata(document(), annotation()),
    ).resolves.toBeUndefined()

    expect(asRelativePath).not.toHaveBeenCalled()
  })

  it('does not call an absent Git API', async () => {
    const activate = vi.fn<() => Promise<unknown>>(() => Promise.resolve({}))
    getExtension.mockReturnValue({ activate })

    await expect(
      useBeaconGit().getMetadata(document(), annotation()),
    ).resolves.toBeUndefined()

    expect(activate).toHaveBeenCalledTimes(1)
    expect(asRelativePath).not.toHaveBeenCalled()
  })

  it.each([
    { missingRepository: undefined, name: 'undefined' },
    { missingRepository: null, name: 'null' },
  ])(
    'does not query a document with a $name repository',
    async ({ missingRepository }) => {
      const getRepository = vi.fn<(uri: unknown) => null | undefined>(
        () => missingRepository,
      )
      const getAPI = vi.fn<
        (version: number) => { getRepository: typeof getRepository }
      >(() => ({ getRepository }))
      const activate = vi.fn<() => Promise<{ getAPI: typeof getAPI }>>(() =>
        Promise.resolve({ getAPI }),
      )
      getExtension.mockReturnValue({ activate })

      await expect(
        useBeaconGit().getMetadata(document(), annotation()),
      ).resolves.toBeUndefined()

      expect(getRepository).toHaveBeenCalledTimes(1)
      expect(asRelativePath).not.toHaveBeenCalled()
    },
  )

  it('returns undefined when obtaining the Git API throws', async () => {
    const getAPI = vi.fn<(version: number) => never>(() => {
      throw new Error('Git API unavailable')
    })
    const activate = vi.fn<() => Promise<{ getAPI: typeof getAPI }>>(() =>
      Promise.resolve({ getAPI }),
    )
    getExtension.mockReturnValue({ activate })

    await expect(
      useBeaconGit().getMetadata(document(), annotation()),
    ).resolves.toBeUndefined()

    expect(asRelativePath).not.toHaveBeenCalled()
  })

  it('does not resolve a malformed blame row', async () => {
    const testRepository = repository()
    testRepository.blame.mockResolvedValue('not-a-hash (Ada Lovelace) TODO')
    const extension = gitExtension(testRepository)
    getExtension.mockReturnValue(extension)

    await expect(
      useBeaconGit().getMetadata(document(), annotation()),
    ).resolves.toBeUndefined()

    expect(testRepository.getCommit).not.toHaveBeenCalled()
  })

  it('does not blame an escaping repository-relative path', async () => {
    const testRepository = repository()
    const extension = gitExtension(testRepository)
    const testDocument = document(1, '/workspace/../outside.ts')
    getExtension.mockReturnValue(extension)

    await expect(
      useBeaconGit().getMetadata(testDocument, annotation()),
    ).resolves.toBeUndefined()

    expect(testRepository.blame).not.toHaveBeenCalled()
    expect(testRepository.getCommit).not.toHaveBeenCalled()
  })

  it('returns undefined when Git extension activation rejects', async () => {
    const activate = vi.fn<() => Promise<unknown>>(() =>
      Promise.reject(new Error('Git extension disabled')),
    )
    getExtension.mockReturnValue({ activate })

    await expect(
      useBeaconGit().getMetadata(document(), annotation()),
    ).resolves.toBeUndefined()

    expect(asRelativePath).not.toHaveBeenCalled()
  })

  it('returns undefined when blame rejects', async () => {
    const testRepository = repository()
    testRepository.blame.mockRejectedValue(new Error('blame failed'))
    const extension = gitExtension(testRepository)
    getExtension.mockReturnValue(extension)

    await expect(
      useBeaconGit().getMetadata(document(), annotation()),
    ).resolves.toBeUndefined()

    expect(testRepository.getCommit).not.toHaveBeenCalled()
  })

  it('returns undefined when commit lookup rejects', async () => {
    const testRepository = repository()
    testRepository.getCommit.mockRejectedValue(new Error('commit failed'))
    const extension = gitExtension(testRepository)
    getExtension.mockReturnValue(extension)

    await expect(
      useBeaconGit().getMetadata(document(), annotation()),
    ).resolves.toBeUndefined()
  })

  it('reuses metadata cached for the same document version and line', async () => {
    const testRepository = repository()
    const extension = gitExtension(testRepository)
    getExtension.mockReturnValue(extension)
    const git = useBeaconGit()
    const sameDocument = document()
    const sameAnnotation = annotation()

    await git.getMetadata(sameDocument, sameAnnotation)
    await git.getMetadata(sameDocument, sameAnnotation)

    expect(testRepository.blame).toHaveBeenCalledTimes(1)
    expect(testRepository.getCommit).toHaveBeenCalledTimes(1)
  })

  it('resolves multiple annotations with one blame and one commit lookup per hash', async () => {
    const testRepository = repository()
    testRepository.blame.mockResolvedValue(
      [
        'a1b2c3d4 (Ada Lovelace 2026-07-12 12:00:00 +0800 1) const one = 1;',
        'a1b2c3d4 (Ada Lovelace 2026-07-12 12:00:00 +0800 2) const two = 2;',
        'f5e6d7c8 (Grace Hopper 2026-07-12 12:00:00 +0800 3) const three = 3;',
      ].join('\n'),
    )
    testRepository.getCommit.mockImplementation(hash =>
      Promise.resolve({
        authorDate: new Date('2026-07-12T04:00:00.000Z'),
        authorEmail:
          hash === 'a1b2c3d4' ? 'ada@example.com' : 'grace@example.com',
        authorName: hash === 'a1b2c3d4' ? 'Ada Lovelace' : 'Grace Hopper',
        hash,
        message: hash === 'a1b2c3d4' ? 'Add beacon metadata' : 'Fix compiler',
      }),
    )
    const extension = gitExtension(testRepository)
    const testDocument = document()
    const annotations = [
      annotation(0, 'first'),
      annotation(1, 'second'),
      annotation(2, 'third'),
    ]
    getExtension.mockReturnValue(extension)

    const result = await useBeaconGit().getMetadataForAnnotations(
      testDocument,
      annotations,
    )

    expect(testRepository.blame).toHaveBeenCalledTimes(1)
    expect(testRepository.blame).toHaveBeenCalledWith('src/example.ts')
    expect(testRepository.getCommit).toHaveBeenCalledTimes(2)
    expect(testRepository.getCommit).toHaveBeenCalledWith('a1b2c3d4')
    expect(testRepository.getCommit).toHaveBeenCalledWith('f5e6d7c8')
    expect(result).toStrictEqual(
      new Map([
        [
          'first',
          {
            authorEmail: 'ada@example.com',
            authorName: 'Ada Lovelace',
            commitDate: '2026-07-12T04:00:00.000Z',
            hash: 'a1b2c3d4',
            summary: 'Add beacon metadata',
          },
        ],
        [
          'second',
          {
            authorEmail: 'ada@example.com',
            authorName: 'Ada Lovelace',
            commitDate: '2026-07-12T04:00:00.000Z',
            hash: 'a1b2c3d4',
            summary: 'Add beacon metadata',
          },
        ],
        [
          'third',
          {
            authorEmail: 'grace@example.com',
            authorName: 'Grace Hopper',
            commitDate: '2026-07-12T04:00:00.000Z',
            hash: 'f5e6d7c8',
            summary: 'Fix compiler',
          },
        ],
      ]),
    )
  })

  it('returns same-version cached batch metadata without Git lookups', async () => {
    const testRepository = repository()
    const extension = gitExtension(testRepository)
    const git = useBeaconGit()
    const testDocument = document()
    const annotations = [annotation(0, 'first'), annotation(1, 'second')]
    getExtension.mockReturnValue(extension)

    await git.getMetadataForAnnotations(testDocument, annotations)
    testRepository.blame.mockClear()
    testRepository.getCommit.mockClear()
    await git.getMetadataForAnnotations(testDocument, annotations)

    expect(testRepository.blame).not.toHaveBeenCalled()
    expect(testRepository.getCommit).not.toHaveBeenCalled()
  })

  it('retains cached batch metadata when a later blame lookup fails', async () => {
    const testRepository = repository()
    const extension = gitExtension(testRepository)
    const git = useBeaconGit()
    const testDocument = document()
    getExtension.mockReturnValue(extension)

    await git.getMetadataForAnnotations(testDocument, [annotation(0, 'cached')])
    testRepository.blame.mockRejectedValueOnce(new Error('blame failed'))

    const result = await git.getMetadataForAnnotations(testDocument, [
      annotation(0, 'cached'),
      annotation(1, 'missing'),
    ])

    expect(result).toStrictEqual(
      new Map([
        [
          'cached',
          {
            authorEmail: 'ada@example.com',
            authorName: 'Ada Lovelace',
            commitDate: '2026-07-12T04:00:00.000Z',
            hash: 'a1b2c3d4',
            summary: 'Add beacon metadata',
          },
        ],
      ]),
    )
  })
})

describe('changed Git URIs', () => {
  beforeEach(() => {
    getExtension.mockReset()
    isTrusted = true
  })

  it('collects the current URI from every change bucket without duplicates', async () => {
    const staged = uri('/workspace/staged.ts')
    const unstaged = uri('/workspace/unstaged.ts')
    const merged = uri('/workspace/merged.ts')
    const untracked = uri('/workspace/untracked.ts')
    const renamed = uri('/workspace/renamed.ts')
    const testRepository = repository(
      uri('/workspace'),
      repositoryState({
        indexChanges: [
          { uri: staged },
          { originalUri: uri('/workspace/old.ts'), uri: renamed },
        ],
        mergeChanges: [{ uri: merged }],
        untrackedChanges: [{ uri: untracked }],
        workingTreeChanges: [{ uri: unstaged }, { uri: renamed }],
      }),
    )
    const extension = gitExtension(testRepository)
    getExtension.mockReturnValue(extension)

    await expect(useBeaconGit().getChangedUris()).resolves.toStrictEqual(
      new Set([
        staged.toString(),
        renamed.toString(),
        unstaged.toString(),
        merged.toString(),
        untracked.toString(),
      ]),
    )
  })

  it('ignores virtual repositories while collecting changed URIs', async () => {
    const localRepository = repository(
      uri('/workspace'),
      repositoryState({
        workingTreeChanges: [{ uri: uri('/workspace/local.ts') }],
      }),
    )
    const virtualRepository = repository(
      uri('/virtual'),
      repositoryState({
        workingTreeChanges: [{ uri: uri('/virtual/ignored.ts') }],
      }),
    )
    virtualRepository.isUsingVirtualFileSystem = true
    const extension = gitExtension(localRepository, [
      localRepository,
      virtualRepository,
    ])
    getExtension.mockReturnValue(extension)

    await expect(useBeaconGit().getChangedUris()).resolves.toStrictEqual(
      new Set(['file:///workspace/local.ts']),
    )
  })

  it('returns an empty changed URI set when Git is unavailable', async () => {
    isTrusted = false

    await expect(useBeaconGit().getChangedUris()).resolves.toStrictEqual(
      new Set(),
    )
    expect(getExtension).not.toHaveBeenCalled()

    isTrusted = true
    await expect(useBeaconGit().getChangedUris()).resolves.toStrictEqual(
      new Set(),
    )

    const getAPI = vi.fn<(version: number) => never>(() => {
      throw new Error('Git API unavailable')
    })
    getExtension.mockReturnValue({
      activate: vi.fn<() => Promise<{ getAPI: typeof getAPI }>>(() =>
        Promise.resolve({ getAPI }),
      ),
    })

    await expect(useBeaconGit().getChangedUris()).resolves.toStrictEqual(
      new Set(),
    )

    const activate = vi.fn<() => Promise<unknown>>(() =>
      Promise.reject(new Error('Git extension disabled')),
    )
    getExtension.mockReturnValue({ activate })

    await expect(useBeaconGit().getChangedUris()).resolves.toStrictEqual(
      new Set(),
    )
  })

  it('observes repository changes and removes every listener when disposed', async () => {
    const state = repositoryState()
    const testRepository = repository(uri('/workspace'), state)
    const extension = gitExtension(testRepository)
    const listener = vi.fn<() => void>()
    getExtension.mockReturnValue(extension)

    const disposable = await useBeaconGit().subscribeToChangedUris(listener)

    state.signal.fire()
    expect(listener).toHaveBeenCalledTimes(1)

    const openedState = repositoryState()
    const openedRepository = repository(uri('/workspace/opened'), openedState)
    extension.repositories.push(openedRepository)
    extension.openRepository.fire()
    openedState.signal.fire()
    expect(listener).toHaveBeenCalledTimes(3)

    extension.repositories.splice(
      extension.repositories.indexOf(openedRepository),
      1,
    )
    extension.closeRepository.fire()
    openedState.signal.fire()
    expect(listener).toHaveBeenCalledTimes(4)

    disposable.dispose()
    state.signal.fire()
    extension.openRepository.fire()
    extension.closeRepository.fire()

    expect(listener).toHaveBeenCalledTimes(4)
    expect(state.signal.listenerCount).toBe(0)
    expect(extension.openRepository.listenerCount).toBe(0)
    expect(extension.closeRepository.listenerCount).toBe(0)
  })

  it('disposes an open listener when close-listener registration throws', async () => {
    const testRepository = repository()
    const extension = gitExtension(testRepository)
    extension.getAPI.mockReturnValue({
      getRepository: extension.getRepository,
      onDidCloseRepository: () => {
        throw new Error('Git close listener unavailable')
      },
      onDidOpenRepository: extension.openRepository.event,
      repositories: extension.repositories,
    })
    getExtension.mockReturnValue(extension)

    const disposable = await useBeaconGit().subscribeToChangedUris(vi.fn())

    expect(extension.openRepository.listenerCount).toBe(0)
    disposable.dispose()
    expect(extension.openRepository.listenerCount).toBe(0)
  })
})
