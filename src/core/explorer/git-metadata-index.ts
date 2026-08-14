import type { AnnoPulseAnnotation } from '../../types/annotation'
import type { AnnoPulseGitMetadata } from '../git/blame'

/**
 * One document and the annotations whose metadata should be resolved together.
 */
export interface AnnoPulseExplorerMetadataTarget<TDocument> {
  readonly document: TDocument
  readonly annotations: readonly AnnoPulseAnnotation[]
}

/**
 * Resolves Git metadata for all annotations in one document.
 */
export type AnnoPulseExplorerMetadataResolver<TDocument> = (
  document: TDocument,
  annotations: readonly AnnoPulseAnnotation[],
) => Promise<ReadonlyMap<string, AnnoPulseGitMetadata>>

/**
 * Tracks Git metadata for the current Explorer snapshot.
 */
export class AnnoPulseExplorerGitMetadataIndex<TDocument> {
  public readonly metadataByAnnotationId = new Map<
    string,
    AnnoPulseGitMetadata
  >()

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
    targets: readonly AnnoPulseExplorerMetadataTarget<TDocument>[],
    resolve: AnnoPulseExplorerMetadataResolver<TDocument>,
    onUpdate: () => void,
  ): Promise<void> {
    const generation = this.generation + 1
    this.generation = generation
    this.metadataByAnnotationId.clear()

    for (const target of targets) {
      if (generation !== this.generation) {
        return
      }

      let metadata: ReadonlyMap<string, AnnoPulseGitMetadata>
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
