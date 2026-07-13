/**
 * Git commit metadata shown alongside a source line.
 */
export interface BeaconGitMetadata {
  authorName: string
  authorEmail?: string
  commitDate: string
  hash: string
  summary: string
}

export const MAX_BEACON_GIT_METADATA_CACHE_ENTRIES = 1000

/**
 * Extracts the commit hash from one zero-based line of git blame output.
 */
export function parseBlameCommitHash(
  output: string,
  line: number,
): string | undefined {
  if (line < 0 || !Number.isInteger(line)) {
    return undefined
  }

  const blameLine = output.split('\n')[line]
  const hash = blameLine?.trimStart().split(/\s+/u, 1)[0]?.replace(/^\^/u, '')

  return hash && /^[\da-f]+$/iu.test(hash) ? hash : undefined
}

/**
 * Caches git metadata for a particular document version and line.
 */
export class BeaconGitMetadataCache {
  private readonly entries = new Map<string, BeaconGitMetadata>()

  /**
   * Returns metadata cached for one document version and line.
   */
  public get(
    uri: string,
    version: number,
    line: number,
  ): BeaconGitMetadata | undefined {
    const key = BeaconGitMetadataCache.createKey(uri, version, line)
    const metadata = this.entries.get(key)

    if (metadata) {
      this.entries.delete(key)
      this.entries.set(key, metadata)
    }

    return metadata
  }

  /**
   * Stores metadata for one document version and line.
   */
  public set(
    uri: string,
    version: number,
    line: number,
    metadata: BeaconGitMetadata,
  ) {
    const key = BeaconGitMetadataCache.createKey(uri, version, line)
    this.entries.delete(key)
    this.entries.set(key, metadata)

    while (this.entries.size > MAX_BEACON_GIT_METADATA_CACHE_ENTRIES) {
      const oldestKey = this.entries.keys().next().value
      if (oldestKey === undefined) {
        break
      }
      this.entries.delete(oldestKey)
    }
  }

  private static createKey(uri: string, version: number, line: number): string {
    return `${uri}:${version}:${line}`
  }
}
