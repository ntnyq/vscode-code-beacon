import { extensions, workspace } from 'vscode'
import type { Disposable, TextDocument } from 'vscode'
import {
  AnnoPulseGitMetadataCache,
  parseBlameCommitHash,
} from '../core/git/blame'
import type { AnnoPulseGitMetadata } from '../core/git/blame'
import type { AnnoPulseAnnotation } from '../types/annotation'

interface GitExtension {
  getAPI: (version: 1) => API | undefined
}

interface API {
  getRepository: (uri: TextDocument['uri']) => Repository | null | undefined
}

export interface AnnoPulseGitAdapter {
  getChangedUris: () => Promise<ReadonlySet<string>>
  getMetadata: (
    document: TextDocument,
    annotation: AnnoPulseAnnotation,
  ) => Promise<AnnoPulseGitMetadata | undefined>
  getMetadataForAnnotations: (
    document: TextDocument,
    annotations: readonly AnnoPulseAnnotation[],
  ) => Promise<ReadonlyMap<string, AnnoPulseGitMetadata>>
  subscribeToChangedUris: (listener: () => void) => Promise<Disposable>
}

type Event<T> = (listener: (event: T) => void) => Disposable

interface Change {
  readonly uri: {
    toString: () => string
  }
}

interface RepositoryState {
  readonly indexChanges: readonly Change[]
  readonly mergeChanges: readonly Change[]
  readonly onDidChange: Event<void>
  readonly untrackedChanges: readonly Change[]
  readonly workingTreeChanges: readonly Change[]
}

interface ChangedUrisAPI extends API {
  readonly onDidCloseRepository: Event<Repository>
  readonly onDidOpenRepository: Event<Repository>
  readonly repositories: readonly Repository[]
}

interface Repository {
  readonly isUsingVirtualFileSystem: boolean
  readonly rootUri: TextDocument['uri']
  blame: (path: string) => Promise<string>
  getCommit: (hash: string) => Promise<Commit>
}

interface ChangedUrisRepository extends Repository {
  readonly state: RepositoryState
}

interface Commit {
  readonly authorDate: Date
  readonly authorEmail?: string
  readonly authorName: string
  readonly hash: string
  readonly message: string
}

const NOOP_DISPOSABLE: Disposable = { dispose: () => false }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isGitExtension(value: unknown): value is GitExtension {
  return isRecord(value) && typeof value.getAPI === 'function'
}

function isAPI(value: unknown): value is API {
  return isRecord(value) && typeof value.getRepository === 'function'
}

function isChange(value: unknown): value is Change {
  return (
    isRecord(value) &&
    isRecord(value.uri) &&
    typeof value.uri.toString === 'function'
  )
}

function isRepositoryState(value: unknown): value is RepositoryState {
  return (
    isRecord(value) &&
    Array.isArray(value.indexChanges) &&
    Array.isArray(value.workingTreeChanges) &&
    Array.isArray(value.mergeChanges) &&
    Array.isArray(value.untrackedChanges) &&
    typeof value.onDidChange === 'function'
  )
}

function isChangedUrisAPI(value: unknown): value is ChangedUrisAPI {
  return (
    isRecord(value) &&
    typeof value.getRepository === 'function' &&
    Array.isArray(value.repositories) &&
    typeof value.onDidOpenRepository === 'function' &&
    typeof value.onDidCloseRepository === 'function'
  )
}

function isUri(value: unknown): value is TextDocument['uri'] {
  return (
    isRecord(value) &&
    typeof value.authority === 'string' &&
    typeof value.path === 'string' &&
    typeof value.scheme === 'string'
  )
}

function isRepository(value: unknown): value is Repository {
  return (
    isRecord(value) &&
    typeof value.isUsingVirtualFileSystem === 'boolean' &&
    isUri(value.rootUri) &&
    typeof value.blame === 'function' &&
    typeof value.getCommit === 'function'
  )
}

function isChangedUrisRepository(
  value: unknown,
): value is ChangedUrisRepository {
  return (
    isRecord(value) && isRepository(value) && isRepositoryState(value.state)
  )
}

function isRepositoryRelativePath(path: string): boolean {
  return (
    path.length > 0 &&
    !path.startsWith('/') &&
    !path.startsWith('\\') &&
    !/^[a-z]:[\\/]/iu.test(path) &&
    !path.split(/[\\/]/u).includes('..')
  )
}

function repositoryRelativePath(
  documentUri: TextDocument['uri'],
  repositoryRootUri: TextDocument['uri'],
): string | undefined {
  if (
    documentUri.scheme !== repositoryRootUri.scheme ||
    documentUri.authority !== repositoryRootUri.authority
  ) {
    return undefined
  }

  const rootPath =
    repositoryRootUri.path === '/'
      ? '/'
      : repositoryRootUri.path.replace(/\/+$/u, '')
  if (!rootPath) {
    return undefined
  }

  const prefix = rootPath === '/' ? '/' : `${rootPath}/`
  if (!documentUri.path.startsWith(prefix)) {
    return undefined
  }

  const path = documentUri.path.slice(prefix.length)
  return isRepositoryRelativePath(path) ? path : undefined
}

function isCommit(value: unknown): value is Commit {
  if (!isRecord(value)) {
    return false
  }

  return (
    typeof value.authorName === 'string' &&
    (value.authorEmail === undefined ||
      typeof value.authorEmail === 'string') &&
    value.authorDate instanceof Date &&
    typeof value.hash === 'string' &&
    typeof value.message === 'string'
  )
}

function toMetadata(commit: Commit): AnnoPulseGitMetadata {
  return {
    authorEmail: commit.authorEmail,
    authorName: commit.authorName,
    commitDate: commit.authorDate.toISOString(),
    hash: commit.hash,
    summary: commit.message,
  }
}

/**
 * Resolves optional Git blame metadata through VS Code's built-in Git extension.
 */
export function useAnnoPulseGit(): AnnoPulseGitAdapter {
  const cache = new AnnoPulseGitMetadataCache()

  async function getChangedUrisAPI(): Promise<ChangedUrisAPI | undefined> {
    if (!workspace.isTrusted) {
      return undefined
    }

    try {
      const extension = extensions.getExtension<unknown>('vscode.git')
      if (!extension) {
        return undefined
      }

      const gitExtension = await extension.activate()
      if (!isGitExtension(gitExtension)) {
        return undefined
      }

      const api = gitExtension.getAPI(1)
      return isChangedUrisAPI(api) ? api : undefined
    } catch {
      return undefined
    }
  }

  function collectChangedUris(
    repositories: readonly Repository[],
  ): ReadonlySet<string> {
    const uris = new Set<string>()

    for (const repository of repositories) {
      if (
        !isChangedUrisRepository(repository) ||
        repository.isUsingVirtualFileSystem
      ) {
        continue
      }

      const { state } = repository
      const changes = [
        ...state.indexChanges,
        ...state.workingTreeChanges,
        ...state.mergeChanges,
        ...state.untrackedChanges,
      ]

      for (const change of changes) {
        if (isChange(change)) {
          uris.add(change.uri.toString())
        }
      }
    }

    return uris
  }

  async function getChangedUris(): Promise<ReadonlySet<string>> {
    const api = await getChangedUrisAPI()
    if (!api) {
      return new Set()
    }

    try {
      return collectChangedUris(api.repositories)
    } catch {
      return new Set()
    }
  }

  async function subscribeToChangedUris(
    listener: () => void,
  ): Promise<Disposable> {
    const api = await getChangedUrisAPI()
    if (!api) {
      return NOOP_DISPOSABLE
    }
    const changedUrisApi = api

    let disposed = false
    let repositoryDisposables: Disposable[] = []
    const apiDisposables: Disposable[] = []

    function dispose() {
      if (disposed) {
        return
      }

      disposed = true
      for (const disposable of [...repositoryDisposables, ...apiDisposables]) {
        disposable.dispose()
      }
      repositoryDisposables = []
      apiDisposables.length = 0
    }

    function rebindRepositoryListeners(): boolean {
      for (const disposable of repositoryDisposables) {
        disposable.dispose()
      }
      repositoryDisposables = []

      const notifyWhenActive = () => {
        if (!disposed) {
          listener()
        }
      }

      try {
        for (const repository of changedUrisApi.repositories) {
          if (
            !isChangedUrisRepository(repository) ||
            repository.isUsingVirtualFileSystem
          ) {
            continue
          }

          const disposable = repository.state.onDidChange(notifyWhenActive)
          if (
            !isRecord(disposable) ||
            typeof disposable.dispose !== 'function'
          ) {
            throw new TypeError('Invalid Git repository state listener')
          }
          repositoryDisposables.push(disposable)
        }

        return true
      } catch {
        dispose()
        return false
      }
    }

    try {
      const onRepositoryChange = () => {
        if (!disposed && rebindRepositoryListeners()) {
          listener()
        }
      }
      const openDisposable =
        changedUrisApi.onDidOpenRepository(onRepositoryChange)
      if (
        !isRecord(openDisposable) ||
        typeof openDisposable.dispose !== 'function'
      ) {
        throw new TypeError('Invalid Git repository listener')
      }
      apiDisposables.push(openDisposable)

      const closeDisposable =
        changedUrisApi.onDidCloseRepository(onRepositoryChange)
      if (
        !isRecord(closeDisposable) ||
        typeof closeDisposable.dispose !== 'function'
      ) {
        throw new TypeError('Invalid Git repository listener')
      }
      apiDisposables.push(closeDisposable)

      if (!rebindRepositoryListeners()) {
        return NOOP_DISPOSABLE
      }

      return { dispose }
    } catch {
      dispose()
      return NOOP_DISPOSABLE
    }
  }

  async function getMetadataForAnnotations(
    document: TextDocument,
    annotations: readonly AnnoPulseAnnotation[],
  ): Promise<ReadonlyMap<string, AnnoPulseGitMetadata>> {
    const metadataByAnnotationId = new Map<string, AnnoPulseGitMetadata>()

    if (!workspace.isTrusted) {
      return metadataByAnnotationId
    }

    try {
      const extension = extensions.getExtension<unknown>('vscode.git')
      if (!extension) {
        return metadataByAnnotationId
      }

      const gitExtension = await extension.activate()
      if (!isGitExtension(gitExtension)) {
        return metadataByAnnotationId
      }

      const api = gitExtension.getAPI(1)
      if (!isAPI(api)) {
        return metadataByAnnotationId
      }

      const repository = api.getRepository(document.uri)
      if (!isRepository(repository) || repository.isUsingVirtualFileSystem) {
        return metadataByAnnotationId
      }

      const uncachedAnnotations: AnnoPulseAnnotation[] = []
      const documentUri = document.uri.toString()

      for (const annotation of annotations) {
        const cached = cache.get(documentUri, document.version, annotation.line)
        if (cached) {
          metadataByAnnotationId.set(annotation.id, cached)
        } else {
          uncachedAnnotations.push(annotation)
        }
      }

      if (uncachedAnnotations.length === 0) {
        return metadataByAnnotationId
      }

      const path = repositoryRelativePath(document.uri, repository.rootUri)
      if (!path) {
        return metadataByAnnotationId
      }

      const blame = await repository.blame(path)
      const annotationsByHash = new Map<string, AnnoPulseAnnotation[]>()

      for (const annotation of uncachedAnnotations) {
        const hash = parseBlameCommitHash(blame, annotation.line)
        if (!hash) {
          continue
        }

        const annotationsForHash = annotationsByHash.get(hash)
        if (annotationsForHash) {
          annotationsForHash.push(annotation)
        } else {
          annotationsByHash.set(hash, [annotation])
        }
      }

      for (const [hash, annotationsForHash] of annotationsByHash) {
        try {
          const commit = await repository.getCommit(hash)
          if (!isCommit(commit)) {
            continue
          }

          const metadata = toMetadata(commit)
          for (const annotation of annotationsForHash) {
            cache.set(documentUri, document.version, annotation.line, metadata)
            metadataByAnnotationId.set(annotation.id, metadata)
          }
        } catch {
          continue
        }
      }

      return metadataByAnnotationId
    } catch {
      return metadataByAnnotationId
    }
  }

  return {
    getChangedUris,
    async getMetadata(
      document: TextDocument,
      annotation: AnnoPulseAnnotation,
    ): Promise<AnnoPulseGitMetadata | undefined> {
      const metadataByAnnotationId = await getMetadataForAnnotations(document, [
        annotation,
      ])
      return metadataByAnnotationId.get(annotation.id)
    },
    getMetadataForAnnotations,
    subscribeToChangedUris,
  }
}
