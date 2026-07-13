import type { BeaconAnnotation } from '../../types/annotation'
import type { BeaconAnnotationState } from './annotation-state'

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
   * Marks an annotation resolved or unresolved by id.
   */
  markResolved: (id: string, resolved: boolean) => void

  /**
   * Marks an annotation ignored or unignored by id.
   */
  markIgnored: (id: string, ignored: boolean) => void

  /**
   * Returns the resolved and ignored annotation identifiers.
   */
  getState: () => BeaconAnnotationState

  /**
   * Replaces resolved and ignored annotation state.
   */
  restoreState: (state: BeaconAnnotationState) => void

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
   * Persistent per-annotation resolved state keyed by annotation id.
   */
  const resolvedIds = new Set<string>()

  /**
   * Persistent per-annotation ignored state keyed by annotation id.
   */
  const ignoredIds = new Set<string>()

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

  /**
   * Applies persistent state flags to a scanned annotation.
   */
  const withState = (annotation: BeaconAnnotation): BeaconAnnotation => ({
    ...annotation,
    ignored: ignoredIds.has(annotation.id),
    resolved: resolvedIds.has(annotation.id),
  })

  /**
   * Rewrites all stored annotations with the latest persistent state flags.
   */
  const refreshStoredState = () => {
    for (const [uri, annotations] of annotationsByUri) {
      annotationsByUri.set(uri, annotations.map(withState))
    }
  }

  return {
    /**
     * Clears annotations for every URI.
     */
    clear() {
      annotationsByUri.clear()
      resolvedIds.clear()
      ignoredIds.clear()
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
     * Returns the resolved and ignored annotation identifiers.
     */
    getState() {
      return {
        ignoredIds: [...ignoredIds].sort(),
        resolvedIds: [...resolvedIds].sort(),
      }
    },

    /**
     * Replaces annotations for one URI and notifies subscribers.
     */
    setForUri(uri, annotations) {
      annotationsByUri.set(uri, annotations.map(withState))
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
          ...replacementAnnotations.map(withState),
        ]

        if (nextAnnotations.length > 0) {
          annotationsByUri.set(uri, nextAnnotations)
        } else {
          annotationsByUri.delete(uri)
        }
      }

      for (const [uri, replacementAnnotations] of replacementByUri) {
        if (!annotationsByUri.has(uri) && replacementAnnotations.length > 0) {
          annotationsByUri.set(uri, replacementAnnotations.map(withState))
        }
      }

      notify()
    },

    /**
     * Marks an annotation resolved or unresolved by id.
     */
    markResolved(id, resolved) {
      if (resolved) {
        resolvedIds.add(id)
      } else {
        resolvedIds.delete(id)
      }

      refreshStoredState()
      notify()
    },

    /**
     * Replaces resolved and ignored annotation state.
     */
    restoreState(state) {
      resolvedIds.clear()
      ignoredIds.clear()

      for (const id of state.resolvedIds) {
        resolvedIds.add(id)
      }

      for (const id of state.ignoredIds) {
        ignoredIds.add(id)
      }

      refreshStoredState()
      notify()
    },

    /**
     * Marks an annotation ignored or unignored by id.
     */
    markIgnored(id, ignored) {
      if (ignored) {
        ignoredIds.add(id)
      } else {
        ignoredIds.delete(id)
      }

      refreshStoredState()
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
