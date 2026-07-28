import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import { useWorkspaceScan } from '../src/composables/use-workspace-scan'
import { config } from '../src/config'
import type * as CodeBeaconConfig from '../src/config'
import { annotationStore } from '../src/core/store/annotation-store'
import { seedAnnotationStore } from './fixtures/annotation-store'

interface TestUri {
  readonly path: string
  readonly workspaceFolderName?: string
  readonly toString: () => string
}

interface TestDocument {
  readonly getText: () => string
  readonly languageId: string
}

type TestUriListener = (uri: TestUri) => unknown

interface TestFileSystemWatcher {
  dispose: () => void
  onDidChange: (listener: TestUriListener) => { dispose: () => void }
  onDidCreate: (listener: TestUriListener) => { dispose: () => void }
  onDidDelete: (listener: TestUriListener) => { dispose: () => void }
}

function uri(path: string, workspaceFolderName?: string): TestUri {
  return {
    path,
    workspaceFolderName,
    toString: () => `file:///workspace/${path}`,
  }
}

const {
  changeListeners,
  configurationListeners,
  createListeners,
  createFileSystemWatcher,
  deleteListeners,
  findFiles,
  getWorkspaceFolder,
  loggerWarn,
  openTextDocument,
  progressCancellation,
  RelativePattern,
  useDisposable,
} = vi.hoisted(() => {
  const changes: ((uri: TestUri) => unknown)[] = []
  const configurations: ((event: {
    affectsConfiguration: (section: string) => boolean
  }) => void)[] = []
  const creates: ((uri: TestUri) => unknown)[] = []
  const deletes: ((uri: TestUri) => unknown)[] = []

  class TestRelativePattern {
    public readonly base: unknown
    public readonly pattern: string

    public constructor(base: unknown, pattern: string) {
      this.base = base
      this.pattern = pattern
    }
  }

  return {
    changeListeners: changes,
    configurationListeners: configurations,
    createListeners: creates,
    createFileSystemWatcher: vi.fn<(include: unknown) => TestFileSystemWatcher>(
      () => ({
        dispose: () => {},
        onDidChange: (listener: TestUriListener) => {
          changes.push(listener)
          return { dispose: () => {} }
        },
        onDidCreate: (listener: TestUriListener) => {
          creates.push(listener)
          return { dispose: () => {} }
        },
        onDidDelete: (listener: TestUriListener) => {
          deletes.push(listener)
          return { dispose: () => {} }
        },
      }),
    ),
    deleteListeners: deletes,
    findFiles:
      vi.fn<
        (
          include: unknown,
          exclude: unknown,
          maxResults: unknown,
        ) => Promise<readonly TestUri[]>
      >(),
    getWorkspaceFolder:
      vi.fn<(uri: TestUri) => { uri: { path: string } } | undefined>(),
    loggerWarn: vi.fn<(message: string) => void>(),
    openTextDocument:
      vi.fn<
        (uri: TestUri) => Promise<{ getText: () => string; languageId: string }>
      >(),
    progressCancellation: { isCancellationRequested: false },
    RelativePattern: TestRelativePattern,
    useDisposable: vi.fn<(value: unknown) => unknown>(value => value),
  }
})

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      defineLogger: () => ({
        info: () => {},
        warn: loggerWarn,
      }),
      useDisposable,
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('../src/config'),
  () =>
    ({
      config: {
        commentOnly: false,
        exclude: [],
        include: ['**/*'],
        maxFileSize: 100_000,
        maxFilesForSearch: 100,
        respectFilesExclude: false,
        respectSearchExclude: false,
        rules: [
          {
            category: 'todo',
            commentOnly: false,
            id: 'todo',
            label: 'TODO',
            matcher: { type: 'text', value: 'TODO' },
            severity: 'information',
          },
        ],
      },
    }) as unknown as Partial<typeof CodeBeaconConfig>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      ProgressLocation: { Notification: 15 },
      RelativePattern,
      commands: {
        registerCommand: () => ({ dispose: () => {} }),
      },
      window: {
        withProgress: (
          _options: unknown,
          task: (
            progress: { report: () => void },
            token: { readonly isCancellationRequested: boolean },
          ) => unknown,
        ) => task({ report: () => {} }, progressCancellation),
      },
      workspace: {
        asRelativePath: (testUri: TestUri, includeWorkspaceFolder?: boolean) =>
          includeWorkspaceFolder && testUri.workspaceFolderName
            ? `${testUri.workspaceFolderName}/${testUri.path}`
            : testUri.path,
        createFileSystemWatcher,
        findFiles,
        getWorkspaceFolder,
        getConfiguration: () => ({ get: () => {} }),
        isTrusted: true,
        openTextDocument,
        onDidChangeConfiguration: (
          listener: (event: {
            affectsConfiguration: (section: string) => boolean
          }) => void,
        ) => {
          configurationListeners.push(listener)
          return { dispose: () => {} }
        },
      },
    }) as unknown as Partial<typeof Vscode>,
)

const a = uri('src/a.ts')
const b = uri('src/b.ts')

function annotationsFor(testUri: TestUri) {
  return annotationStore.getForUri(testUri.toString())
}

async function scanInitialWorkspace(
  documents: ReadonlyMap<string, string>,
  files: readonly TestUri[] = [a, b],
) {
  findFiles.mockImplementation(
    (_include: unknown, _exclude: unknown, maxResults: unknown) =>
      Promise.resolve(maxResults === 100 ? files : [a]),
  )
  openTextDocument.mockImplementation((testUri: TestUri) =>
    Promise.resolve({
      getText: () => documents.get(testUri.toString()) ?? '',
      languageId: 'typescript',
    }),
  )

  const scanner = useWorkspaceScan()
  await scanner.scanWorkspace()
  return scanner
}

describe('workspace scan file events', () => {
  beforeEach(() => {
    annotationStore.clear()
    changeListeners.length = 0
    configurationListeners.length = 0
    createListeners.length = 0
    deleteListeners.length = 0
    createFileSystemWatcher.mockClear()
    findFiles.mockReset()
    getWorkspaceFolder.mockReturnValue({ uri: { path: '/workspace' } })
    loggerWarn.mockClear()
    openTextDocument.mockReset()
    progressCancellation.isCancellationRequested = false
    useDisposable.mockClear()
    Object.assign(config, {
      exclude: [],
      include: ['**/*'],
    })
  })

  it('replaces changed URI workspace annotations without affecting other URIs', async () => {
    await scanInitialWorkspace(
      new Map([
        [a.toString(), 'TODO: old'],
        [b.toString(), 'TODO: keep'],
      ]),
    )

    openTextDocument.mockImplementation((testUri: TestUri) =>
      Promise.resolve({
        getText: () => (testUri === a ? 'TODO: new' : 'TODO: keep'),
        languageId: 'typescript',
      }),
    )

    const handler = changeListeners[0]
    if (!handler) {
      throw new Error('Expected a change listener')
    }
    handler(a)

    await vi.waitFor(() => {
      expect(
        annotationsFor(a).map(annotation => annotation.message),
      ).toStrictEqual(['new'])
    })
    expect(
      annotationsFor(b).map(annotation => annotation.message),
    ).toStrictEqual(['keep'])
  })

  it('uses bounded concurrency for full workspace scans', async () => {
    const files = Array.from({ length: 12 }, (_, index) =>
      uri(`src/${index}.ts`),
    )
    findFiles.mockResolvedValue(files)
    let activeScans = 0
    let maximumActiveScans = 0
    openTextDocument.mockImplementation(async () => {
      activeScans += 1
      maximumActiveScans = Math.max(maximumActiveScans, activeScans)
      await Promise.resolve()
      activeScans -= 1
      return { getText: () => 'TODO: concurrent', languageId: 'typescript' }
    })

    await useWorkspaceScan().scanWorkspace()

    expect(maximumActiveScans).toBeGreaterThan(1)
    expect(maximumActiveScans).toBeLessThan(files.length)
  })

  it('does not publish a partial snapshot when a full scan is cancelled', async () => {
    seedAnnotationStore(annotationStore, a.toString(), [
      {
        category: 'todo',
        column: 0,
        id: 'existing',
        keyword: 'TODO',
        keywordRange: {
          end: { character: 4, line: 0 },
          start: { character: 0, line: 0 },
        },
        languageId: 'typescript',
        line: 0,
        message: 'existing',
        range: {
          end: { character: 4, line: 0 },
          start: { character: 0, line: 0 },
        },
        ruleId: 'todo',
        severity: 'information',
        source: 'workspace',
        uri: a.toString(),
      },
    ])
    findFiles.mockResolvedValue([a, b])
    openTextDocument.mockImplementation(() => {
      progressCancellation.isCancellationRequested = true
      return Promise.resolve({
        getText: () => 'TODO: replacement',
        languageId: 'typescript',
      })
    })

    await useWorkspaceScan().scanWorkspace()

    expect(annotationsFor(a).map(annotation => annotation.id)).toStrictEqual([
      'existing',
    ])
    expect(annotationsFor(b)).toStrictEqual([])
  })

  it('does not let a cancelled full scan invalidate an in-flight watcher result', async () => {
    const scanner = await scanInitialWorkspace(
      new Map([[a.toString(), 'TODO: initial']]),
      [a],
    )
    openTextDocument.mockClear()
    const watcherDocument = Promise.withResolvers<TestDocument>()
    openTextDocument
      .mockReturnValueOnce(watcherDocument.promise)
      .mockImplementationOnce(() => {
        progressCancellation.isCancellationRequested = true
        return Promise.resolve({
          getText: () => 'TODO: cancelled',
          languageId: 'typescript',
        })
      })

    const watcherScan = scanner.rescanWorkspaceUri(a as unknown as Vscode.Uri)
    await vi.waitFor(() => expect(openTextDocument).toHaveBeenCalledTimes(1))
    const cancelledScan = scanner.scanWorkspace()
    await vi.waitFor(() => expect(openTextDocument).toHaveBeenCalledTimes(2))
    watcherDocument.resolve({
      getText: () => 'TODO: watcher result',
      languageId: 'typescript',
    })

    await Promise.all([watcherScan, cancelledScan])
    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['watcher result'])
  })

  it('removes only deleted URI workspace annotations', async () => {
    await scanInitialWorkspace(
      new Map([
        [a.toString(), 'TODO: remove'],
        [b.toString(), 'TODO: keep'],
      ]),
    )

    const handler = deleteListeners[0]
    if (!handler) {
      throw new Error('Expected a delete listener')
    }
    handler(a)

    await vi.waitFor(() => {
      expect(annotationsFor(a)).toStrictEqual([])
    })
    expect(annotationsFor(b)).toHaveLength(1)
  })

  it('does not open a file excluded by the one-file workspace query', async () => {
    await scanInitialWorkspace(new Map([[a.toString(), 'TODO: initial']]), [a])
    openTextDocument.mockReset()
    findFiles.mockResolvedValue([])

    const handler = createListeners[0]
    if (!handler) {
      throw new Error('Expected a create listener')
    }
    handler(uri('ignored/generated.ts'))

    await vi.waitFor(() => {
      expect(findFiles).toHaveBeenLastCalledWith(
        expect.objectContaining({ pattern: 'ignored/generated.ts' }),
        undefined,
        1,
      )
    })
    expect(openTextDocument).not.toHaveBeenCalled()
  })

  it('keeps the newest change result when earlier reads resolve last', async () => {
    await scanInitialWorkspace(new Map([[a.toString(), 'TODO: initial']]), [a])
    openTextDocument.mockClear()

    const firstDocument = Promise.withResolvers<TestDocument>()
    const secondDocument = Promise.withResolvers<TestDocument>()
    openTextDocument
      .mockReturnValueOnce(firstDocument.promise)
      .mockReturnValueOnce(secondDocument.promise)

    const handler = changeListeners[0]
    if (!handler) {
      throw new Error('Expected a change listener')
    }
    handler(a)
    handler(a)

    await vi.waitFor(() => {
      expect(openTextDocument).toHaveBeenCalledTimes(2)
    })
    secondDocument.resolve({
      getText: () => 'TODO: newest',
      languageId: 'typescript',
    })

    await vi.waitFor(() => {
      expect(
        annotationsFor(a).map(annotation => annotation.message),
      ).toStrictEqual(['newest'])
    })
    firstDocument.resolve({
      getText: () => 'TODO: stale',
      languageId: 'typescript',
    })

    await vi.waitFor(() => {
      expect(
        annotationsFor(a).map(annotation => annotation.message),
      ).toStrictEqual(['newest'])
    })
  })

  it('retains prior annotations when a changed file cannot be read', async () => {
    await scanInitialWorkspace(new Map([[a.toString(), 'TODO: initial']]), [a])
    openTextDocument.mockRejectedValueOnce(new Error('temporarily unavailable'))

    await useWorkspaceScan().rescanWorkspaceUri(a as unknown as Vscode.Uri)

    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['initial'])
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('temporarily unavailable'),
    )
  })

  it('retains a hidden workspace snapshot when a full scan cannot read its file', async () => {
    const scanner = await scanInitialWorkspace(
      new Map([[a.toString(), 'TODO: initial']]),
      [a],
    )
    const workspaceAnnotations = annotationStore.getForSourceUri(
      'workspace',
      a.toString(),
    )
    annotationStore.setForSourceUri(
      'visibleEditor',
      a.toString(),
      workspaceAnnotations,
    )
    findFiles.mockResolvedValue([a])
    openTextDocument.mockRejectedValueOnce(new Error('temporarily unavailable'))

    await scanner.scanWorkspace()

    expect(
      annotationStore
        .getForSourceUri('workspace', a.toString())
        .map(annotation => annotation.message),
    ).toStrictEqual(['initial'])
  })

  it('retains prior annotations when the changed-file query fails', async () => {
    await scanInitialWorkspace(new Map([[a.toString(), 'TODO: initial']]), [a])
    findFiles.mockRejectedValueOnce(new Error('search temporarily unavailable'))

    await useWorkspaceScan().rescanWorkspaceUri(a as unknown as Vscode.Uri)

    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['initial'])
    expect(loggerWarn).toHaveBeenCalledWith(
      expect.stringContaining('search temporarily unavailable'),
    )
  })

  it('does not let a stale full scan overwrite a newer watcher result', async () => {
    const scanner = await scanInitialWorkspace(
      new Map([[a.toString(), 'TODO: initial']]),
      [a],
    )
    openTextDocument.mockClear()

    const staleDocument = Promise.withResolvers<TestDocument>()
    openTextDocument
      .mockReturnValueOnce(staleDocument.promise)
      .mockResolvedValueOnce({
        getText: () => 'TODO: watcher result',
        languageId: 'typescript',
      })

    const staleScan = scanner.scanWorkspace()
    await vi.waitFor(() => {
      expect(openTextDocument).toHaveBeenCalledTimes(1)
    })
    const handler = changeListeners.at(-1)
    if (!handler) {
      throw new Error('Expected a change listener')
    }
    handler(a)

    await vi.waitFor(() => {
      expect(
        annotationsFor(a).map(annotation => annotation.message),
      ).toStrictEqual(['watcher result'])
    })

    staleDocument.resolve({
      getText: () => 'TODO: stale result',
      languageId: 'typescript',
    })
    await staleScan

    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['watcher result'])
  })

  it('does not let a stale watcher result overwrite a newer full scan', async () => {
    const scanner = await scanInitialWorkspace(
      new Map([[a.toString(), 'TODO: initial']]),
      [a],
    )
    openTextDocument.mockClear()

    const watcherDocument = Promise.withResolvers<TestDocument>()
    openTextDocument
      .mockReturnValueOnce(watcherDocument.promise)
      .mockResolvedValueOnce({
        getText: () => 'TODO: full scan result',
        languageId: 'typescript',
      })

    const handler = changeListeners.at(-1)
    if (!handler) {
      throw new Error('Expected a change listener')
    }
    const watcherScan = handler(a)
    await vi.waitFor(() => {
      expect(openTextDocument).toHaveBeenCalledTimes(1)
    })

    await scanner.scanWorkspace()
    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['full scan result'])

    watcherDocument.resolve({
      getText: () => 'TODO: stale watcher result',
      languageId: 'typescript',
    })
    await watcherScan
    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['full scan result'])
  })

  it('does not let an older concurrent full scan overwrite the newest scan', async () => {
    const scanner = await scanInitialWorkspace(
      new Map([[a.toString(), 'TODO: initial']]),
      [a],
    )
    openTextDocument.mockClear()

    const firstDocument = Promise.withResolvers<TestDocument>()
    openTextDocument
      .mockReturnValueOnce(firstDocument.promise)
      .mockResolvedValueOnce({
        getText: () => 'TODO: newest full scan',
        languageId: 'typescript',
      })

    const olderScan = scanner.scanWorkspace()
    await vi.waitFor(() => {
      expect(openTextDocument).toHaveBeenCalledTimes(1)
    })
    const newestScan = scanner.scanWorkspace()

    await newestScan
    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['newest full scan'])

    firstDocument.resolve({
      getText: () => 'TODO: older full scan',
      languageId: 'typescript',
    })
    await olderScan

    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['newest full scan'])
  })

  it('does not let a stale full scan commit after scan settings change', async () => {
    const scanner = await scanInitialWorkspace(
      new Map([[a.toString(), 'TODO: initial']]),
      [a],
    )
    openTextDocument.mockClear()

    const fullDocument = Promise.withResolvers<TestDocument>()
    openTextDocument.mockReturnValueOnce(fullDocument.promise)
    const staleScan = scanner.scanWorkspace()
    await vi.waitFor(() => {
      expect(openTextDocument).toHaveBeenCalledTimes(1)
    })
    expect(fullDocument.resolve).toBeTypeOf('function')

    Object.assign(config, { exclude: ['**/src/**'] })
    const listener = configurationListeners[0]
    if (!listener) {
      throw new Error('Expected a configuration listener')
    }
    listener({
      affectsConfiguration: section => section === 'code-beacon.exclude',
    })

    fullDocument.resolve({
      getText: () => 'TODO: stale full result',
      languageId: 'typescript',
    })
    await staleScan

    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['initial'])
  })

  it('does not let an ignored watcher event cancel an in-flight full scan', async () => {
    const scanner = await scanInitialWorkspace(
      new Map([[a.toString(), 'TODO: initial']]),
      [a],
    )
    openTextDocument.mockClear()
    findFiles.mockImplementation(
      (_include: unknown, _exclude: unknown, maxResults: unknown) =>
        Promise.resolve(maxResults === 1 ? [] : [a]),
    )

    const fullDocument = Promise.withResolvers<TestDocument>()
    openTextDocument.mockReturnValueOnce(fullDocument.promise)
    const fullScan = scanner.scanWorkspace()
    await vi.waitFor(() => {
      expect(openTextDocument).toHaveBeenCalledTimes(1)
    })

    await scanner.rescanWorkspaceUri(uri('ignored.ts') as unknown as Vscode.Uri)
    const getText = vi.fn<() => string>(() => 'TODO: full scan result')
    fullDocument.resolve({
      getText,
      languageId: 'typescript',
    })
    await fullScan
    expect(getText).toHaveBeenCalledTimes(1)

    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['full scan result'])
  })

  it('ignores a delete event for a URI outside workspace scan results', async () => {
    await scanInitialWorkspace(new Map([[a.toString(), 'TODO: initial']]), [a])
    const deleteHandler = deleteListeners.at(-1)
    if (!deleteHandler) {
      throw new Error('Expected a delete listener')
    }
    deleteHandler(uri('ignored.ts'))

    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['initial'])
  })

  it('uses a workspace-folder-scoped pattern for a multi-root changed file', async () => {
    const multiRootFile = uri('src/from-second-root.ts', 'second-root')
    const workspaceFolder = {
      name: 'second-root',
      uri: { path: '/workspace-b' },
    }
    getWorkspaceFolder.mockReturnValue(workspaceFolder)
    await scanInitialWorkspace(new Map([[a.toString(), 'TODO: initial']]), [a])
    findFiles.mockResolvedValue([multiRootFile])

    await useWorkspaceScan().rescanWorkspaceUri(
      multiRootFile as unknown as Vscode.Uri,
    )

    expect(findFiles).toHaveBeenLastCalledWith(
      expect.objectContaining({
        base: workspaceFolder,
        pattern: 'src/from-second-root.ts',
      }),
      undefined,
      1,
    )
  })

  it('activates watcher subscriptions only after the first successful scan', async () => {
    const scanner = useWorkspaceScan()

    expect(createFileSystemWatcher).not.toHaveBeenCalled()
    findFiles.mockRejectedValueOnce(new Error('initial search failed'))
    await expect(scanner.scanWorkspace()).rejects.toThrow(
      'initial search failed',
    )
    expect(createFileSystemWatcher).not.toHaveBeenCalled()
    expect(changeListeners).toHaveLength(0)

    findFiles.mockResolvedValue([a])
    openTextDocument.mockResolvedValue({
      getText: () => 'TODO: initial',
      languageId: 'typescript',
    })
    await scanner.scanWorkspace()

    expect(createFileSystemWatcher).toHaveBeenCalledTimes(1)
    expect(createListeners).toHaveLength(1)
    expect(changeListeners).toHaveLength(1)
    expect(deleteListeners).toHaveLength(1)
    expect(useDisposable).toHaveBeenCalledTimes(6)
    expect(useDisposable).toHaveBeenCalledWith(
      createFileSystemWatcher.mock.results[0]?.value,
    )
  })

  it('uses updated workspace scan settings and recreates an active watcher', async () => {
    const scanner = await scanInitialWorkspace(
      new Map([[a.toString(), 'TODO: initial']]),
      [a],
    )

    Object.assign(config, {
      exclude: ['**/generated/**'],
      include: ['**/*.md'],
    })
    const listener = configurationListeners[0]
    if (!listener) {
      throw new Error('Expected a configuration listener')
    }
    listener({
      affectsConfiguration: section => section === 'code-beacon.include',
    })

    expect(createFileSystemWatcher).toHaveBeenLastCalledWith('**/*.md')

    findFiles.mockResolvedValue([])
    await scanner.scanWorkspace()

    expect(findFiles).toHaveBeenLastCalledWith(
      '**/*.md',
      '**/generated/**',
      100,
    )
  })

  it('recreates an active watcher after exclude settings change', async () => {
    await scanInitialWorkspace(new Map([[a.toString(), 'TODO: initial']]), [a])
    Object.assign(config, { exclude: ['**/generated/**'] })
    const listener = configurationListeners[0]
    if (!listener) {
      throw new Error('Expected a configuration listener')
    }
    listener({
      affectsConfiguration: section => section === 'code-beacon.exclude',
    })

    expect(createFileSystemWatcher).toHaveBeenCalledTimes(2)
    const handler = changeListeners.at(-1)
    if (!handler) {
      throw new Error('Expected a replacement change listener')
    }
    openTextDocument.mockResolvedValueOnce({
      getText: () => 'TODO: updated',
      languageId: 'typescript',
    })
    await handler(a)

    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['updated'])
  })

  it('ignores an old watcher callback after the include setting changes', async () => {
    await scanInitialWorkspace(new Map([[a.toString(), 'TODO: initial']]), [a])
    const oldHandler = changeListeners[0]
    if (!oldHandler) {
      throw new Error('Expected an initial change listener')
    }

    const watcherDocument = Promise.withResolvers<TestDocument>()
    openTextDocument.mockClear()
    openTextDocument.mockReturnValueOnce(watcherDocument.promise)
    const oldScan = oldHandler(a)
    await vi.waitFor(() => {
      expect(openTextDocument).toHaveBeenCalledTimes(1)
    })
    expect(watcherDocument.resolve).toBeTypeOf('function')

    Object.assign(config, { include: ['**/*.md'] })
    const listener = configurationListeners[0]
    if (!listener) {
      throw new Error('Expected a configuration listener')
    }
    listener({
      affectsConfiguration: section => section === 'code-beacon.include',
    })

    watcherDocument.resolve({
      getText: () => 'TODO: stale watcher result',
      languageId: 'typescript',
    })
    await oldScan

    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['initial'])
  })

  it('ignores an in-flight watcher callback after exclude settings change', async () => {
    await scanInitialWorkspace(new Map([[a.toString(), 'TODO: initial']]), [a])
    const oldHandler = changeListeners[0]
    if (!oldHandler) {
      throw new Error('Expected an initial change listener')
    }

    const watcherDocument = Promise.withResolvers<TestDocument>()
    openTextDocument.mockClear()
    openTextDocument.mockReturnValueOnce(watcherDocument.promise)
    const oldScan = oldHandler(a)
    await vi.waitFor(() => {
      expect(openTextDocument).toHaveBeenCalledTimes(1)
    })
    expect(watcherDocument.resolve).toBeTypeOf('function')

    Object.assign(config, { exclude: ['**/src/**'] })
    const listener = configurationListeners[0]
    if (!listener) {
      throw new Error('Expected a configuration listener')
    }
    listener({
      affectsConfiguration: section => section === 'code-beacon.exclude',
    })

    watcherDocument.resolve({
      getText: () => 'TODO: stale watcher result',
      languageId: 'typescript',
    })
    await oldScan

    expect(
      annotationsFor(a).map(annotation => annotation.message),
    ).toStrictEqual(['initial'])
  })
})
