import { extensions, workspace } from 'vscode'
import type { TextDocument } from 'vscode'
import { BeaconGitMetadataCache, parseBlameCommitHash } from '../core/git/blame'
import type { BeaconGitMetadata } from '../core/git/blame'
import type { BeaconAnnotation } from '../types/annotation'

interface GitExtension {
  getAPI: (version: 1) => API | undefined
}

interface API {
  getRepository: (uri: TextDocument['uri']) => Repository | null | undefined
}

interface Repository {
  readonly isUsingVirtualFileSystem: boolean
  readonly rootUri: TextDocument['uri']
  blame: (path: string) => Promise<string>
  getCommit: (hash: string) => Promise<Commit>
}

interface Commit {
  readonly authorDate: Date
  readonly authorEmail?: string
  readonly authorName: string
  readonly hash: string
  readonly message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isGitExtension(value: unknown): value is GitExtension {
  return isRecord(value) && typeof value.getAPI === 'function'
}

function isAPI(value: unknown): value is API {
  return isRecord(value) && typeof value.getRepository === 'function'
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

function toMetadata(commit: Commit): BeaconGitMetadata {
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
export function useBeaconGit() {
  const cache = new BeaconGitMetadataCache()

  async function getMetadataForAnnotations(
    document: TextDocument,
    annotations: readonly BeaconAnnotation[],
  ): Promise<ReadonlyMap<string, BeaconGitMetadata>> {
    const metadataByAnnotationId = new Map<string, BeaconGitMetadata>()

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

      const uncachedAnnotations: BeaconAnnotation[] = []
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
      const annotationsByHash = new Map<string, BeaconAnnotation[]>()

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
    async getMetadata(
      document: TextDocument,
      annotation: BeaconAnnotation,
    ): Promise<BeaconGitMetadata | undefined> {
      const metadataByAnnotationId = await getMetadataForAnnotations(document, [
        annotation,
      ])
      return metadataByAnnotationId.get(annotation.id)
    },
    getMetadataForAnnotations,
  }
}
