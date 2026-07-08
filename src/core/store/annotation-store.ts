import type { BeaconAnnotation } from '../../types/annotation'

/**
 * Callback invoked whenever the annotation store changes.
 */
export type AnnotationStoreListener = () => void

/**
 * Mutable in-memory store for annotations keyed by document URI.
 */
export interface AnnotationStore {
  /**
   * Replaces annotations for one URI and notifies subscribers.
   */
  setForUri: (uri: string, annotations: readonly BeaconAnnotation[]) => void

  /**
   * Replaces annotations owned by one source while preserving other sources.
   */
  replaceForSource: (
    source: BeaconAnnotation['source'],
    annotationsByUri: ReadonlyMap<string, readonly BeaconAnnotation[]>,
  ) => void

  /**
   * Returns annotations for one URI.
   */
  getForUri: (uri: string) => readonly BeaconAnnotation[]

  /**
   * Returns every annotation in the store.
   */
  getAll: () => readonly BeaconAnnotation[]

  /**
   * Clears annotations for every URI.
   */
  clear: () => void

  /**
   * Subscribes to store changes and returns an unsubscribe callback.
   */
  subscribe: (listener: AnnotationStoreListener) => () => void
}

/**
 * Creates an isolated annotation store instance for runtime or tests.
 */
export function createAnnotationStore(): AnnotationStore {
  /**
   * Current annotations grouped by document URI.
   */
  const annotationsByUri = new Map<string, readonly BeaconAnnotation[]>()

  /**
   * Active subscribers notified after every store mutation.
   */
  const listeners = new Set<AnnotationStoreListener>()

  /**
   * Notifies every active subscriber that store contents changed.
   */
  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    /**
     * Clears annotations for every URI.
     */
    clear() {
      annotationsByUri.clear()
      notify()
    },

    /**
     * Returns every annotation in the store.
     */
    getAll() {
      return [...annotationsByUri.values()].flat()
    },

    /**
     * Returns annotations for one URI.
     */
    getForUri(uri) {
      return [...(annotationsByUri.get(uri) ?? [])]
    },

    /**
     * Replaces annotations for one URI and notifies subscribers.
     */
    setForUri(uri, annotations) {
      annotationsByUri.set(uri, [...annotations])
      notify()
    },

    /**
     * Replaces annotations owned by one source while preserving other sources.
     */
    replaceForSource(source, replacementByUri) {
      for (const [uri, existingAnnotations] of annotationsByUri) {
        const retainedAnnotations = existingAnnotations.filter(
          annotation => annotation.source !== source,
        )
        const replacementAnnotations = replacementByUri.get(uri) ?? []
        const nextAnnotations = [
          ...retainedAnnotations,
          ...replacementAnnotations,
        ]

        if (nextAnnotations.length > 0) {
          annotationsByUri.set(uri, nextAnnotations)
        } else {
          annotationsByUri.delete(uri)
        }
      }

      for (const [uri, replacementAnnotations] of replacementByUri) {
        if (!annotationsByUri.has(uri) && replacementAnnotations.length > 0) {
          annotationsByUri.set(uri, [...replacementAnnotations])
        }
      }

      notify()
    },

    /**
     * Subscribes to store changes and returns an unsubscribe callback.
     */
    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}

/**
 * Shared runtime annotation store used by extension composables.
 */
export const annotationStore = createAnnotationStore()
