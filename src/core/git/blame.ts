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
    return this.entries.get(
      BeaconGitMetadataCache.createKey(uri, version, line),
    )
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
    this.entries.set(
      BeaconGitMetadataCache.createKey(uri, version, line),
      metadata,
    )
  }

  private static createKey(uri: string, version: number, line: number): string {
    return `${uri}:${version}:${line}`
  }
}
