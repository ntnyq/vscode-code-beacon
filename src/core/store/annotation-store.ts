import type { BeaconAnnotation } from '../../types/annotation'

export type AnnotationStoreListener = () => void

export interface AnnotationStore {
  setForUri: (uri: string, annotations: readonly BeaconAnnotation[]) => void
  getForUri: (uri: string) => readonly BeaconAnnotation[]
  getAll: () => readonly BeaconAnnotation[]
  clear: () => void
  subscribe: (listener: AnnotationStoreListener) => () => void
}

export function createAnnotationStore(): AnnotationStore {
  const annotationsByUri = new Map<string, readonly BeaconAnnotation[]>()
  const listeners = new Set<AnnotationStoreListener>()

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  return {
    clear() {
      annotationsByUri.clear()
      notify()
    },

    getAll() {
      return [...annotationsByUri.values()].flat()
    },

    getForUri(uri) {
      return [...(annotationsByUri.get(uri) ?? [])]
    },

    setForUri(uri, annotations) {
      annotationsByUri.set(uri, [...annotations])
      notify()
    },

    subscribe(listener) {
      listeners.add(listener)

      return () => {
        listeners.delete(listener)
      }
    },
  }
}

export const annotationStore = createAnnotationStore()
