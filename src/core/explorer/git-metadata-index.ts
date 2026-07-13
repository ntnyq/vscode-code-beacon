import type { BeaconAnnotation } from '../../types/annotation'
import type { BeaconGitMetadata } from '../git/blame'

/**
 * One document and the annotations whose metadata should be resolved together.
 */
export interface BeaconExplorerMetadataTarget<TDocument> {
  readonly document: TDocument
  readonly annotations: readonly BeaconAnnotation[]
}

/**
 * Resolves Git metadata for all annotations in one document.
 */
export type BeaconExplorerMetadataResolver<TDocument> = (
  document: TDocument,
  annotations: readonly BeaconAnnotation[],
) => Promise<ReadonlyMap<string, BeaconGitMetadata>>

/**
 * Tracks Git metadata for the current Explorer snapshot.
 */
export class BeaconExplorerGitMetadataIndex<TDocument> {
  public readonly metadataByAnnotationId = new Map<string, BeaconGitMetadata>()

  private generation = 0

  /**
   * Empties the current snapshot and invalidates any in-flight hydration.
   */
  public clear() {
    this.generation += 1
    this.metadataByAnnotationId.clear()
  }

  /**
   * Hydrates targets in order and publishes only current-generation results.
   */
  public async hydrate(
    targets: readonly BeaconExplorerMetadataTarget<TDocument>[],
    resolve: BeaconExplorerMetadataResolver<TDocument>,
    onUpdate: () => void,
  ): Promise<void> {
    const generation = this.generation + 1
    this.generation = generation
    this.metadataByAnnotationId.clear()

    for (const target of targets) {
      if (generation !== this.generation) {
        return
      }

      let metadata: ReadonlyMap<string, BeaconGitMetadata>
      try {
        metadata = await resolve(target.document, target.annotations)
      } catch {
        continue
      }

      if (generation !== this.generation) {
        return
      }

      for (const [annotationId, value] of metadata) {
        this.metadataByAnnotationId.set(annotationId, value)
      }
      onUpdate()
    }
  }
}
