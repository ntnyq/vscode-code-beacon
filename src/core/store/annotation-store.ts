import type { AnnoPulseAnnotation } from '../../types/annotation'
import type { AnnoPulseAnnotationState } from './annotation-state'

/**
 * Callback invoked whenever the annotation store changes.
 */
export type AnnotationStoreListener = () => void

/**
 * Mutable in-memory store for annotations keyed by document URI.
 */
export interface AnnotationStore {
  /**
   * Replaces annotations owned by one source for one URI.
   */
  setForSourceUri: (
    source: AnnoPulseAnnotation['source'],
    uri: string,
    annotations: readonly AnnoPulseAnnotation[],
  ) => void

  /**
   * Replaces annotations owned by one source while preserving other sources.
   */
  replaceForSource: (
    source: AnnoPulseAnnotation['source'],
    annotationsByUri: ReadonlyMap<string, readonly AnnoPulseAnnotation[]>,
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
  getState: () => AnnoPulseAnnotationState

  /**
   * Replaces resolved and ignored annotation state.
   */
  restoreState: (state: AnnoPulseAnnotationState) => void

  /**
   * Returns annotations for one URI.
   */
  getForUri: (uri: string) => readonly AnnoPulseAnnotation[]

  /**
   * Returns the retained snapshot for one source and URI.
   */
  getForSourceUri: (
    source: AnnoPulseAnnotation['source'],
    uri: string,
  ) => readonly AnnoPulseAnnotation[]

  /**
   * Releases one source's ownership of a URI.
   */
  removeForSourceUri: (
    source: AnnoPulseAnnotation['source'],
    uri: string,
  ) => void

  /**
   * Releases every live-document source for one URI.
   */
  removeLiveForUri: (uri: string) => void

  /**
   * Returns every annotation in the store.
   */
  getAll: () => readonly AnnoPulseAnnotation[]

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
 * Builds a position-independent key used to carry state across document edits.
 */
function annotationStateKey(annotation: AnnoPulseAnnotation): string {
  return JSON.stringify([
    annotation.uri,
    annotation.ruleId,
    annotation.category,
    annotation.keyword,
    annotation.message,
    annotation.owner ?? '',
    annotation.dueDate ?? '',
    annotation.expiresDate ?? '',
  ])
}

/**
 * Keeps the first annotation for each logical ID to avoid cross-source duplicates.
 */
function uniqueById(
  annotations: readonly AnnoPulseAnnotation[],
): readonly AnnoPulseAnnotation[] {
  const uniqueAnnotations = new Map<string, AnnoPulseAnnotation>()

  for (const annotation of annotations) {
    if (!uniqueAnnotations.has(annotation.id)) {
      uniqueAnnotations.set(annotation.id, annotation)
    }
  }

  return [...uniqueAnnotations.values()]
}

function isCloserAnnotation(
  candidate: AnnoPulseAnnotation,
  current: AnnoPulseAnnotation,
  reference: AnnoPulseAnnotation,
): boolean {
  const candidateLineDistance = Math.abs(candidate.line - reference.line)
  const currentLineDistance = Math.abs(current.line - reference.line)

  return (
    candidateLineDistance < currentLineDistance ||
    (candidateLineDistance === currentLineDistance &&
      Math.abs(candidate.column - reference.column) <
        Math.abs(current.column - reference.column))
  )
}

function takeClosestReplacement(
  annotation: AnnoPulseAnnotation,
  candidates: AnnoPulseAnnotation[],
): AnnoPulseAnnotation | undefined {
  let replacementIndex = candidates.findIndex(
    candidate => candidate.id === annotation.id,
  )
  if (replacementIndex === -1) {
    replacementIndex = 0
    let closestCandidate = candidates[0]

    for (let index = 1; index < candidates.length; index += 1) {
      const candidate = candidates[index]
      if (
        candidate &&
        isCloserAnnotation(candidate, closestCandidate, annotation)
      ) {
        closestCandidate = candidate
        replacementIndex = index
      }
    }
  }

  return candidates.splice(replacementIndex, 1)[0]
}

/**
 * Creates an isolated annotation store instance for runtime or tests.
 */
export function createAnnotationStore(): AnnotationStore {
  /**
   * Current annotations grouped by document URI.
   */
  const annotationsByUri = new Map<string, readonly AnnoPulseAnnotation[]>()

  /**
   * Latest source snapshots retained even when a higher-priority source wins.
   */
  const sourceSnapshotsByUri = new Map<
    string,
    Map<AnnoPulseAnnotation['source'], readonly AnnoPulseAnnotation[]>
  >()

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
  const withState = (annotation: AnnoPulseAnnotation): AnnoPulseAnnotation => ({
    ...annotation,
    ignored: ignoredIds.has(annotation.id),
    resolved: resolvedIds.has(annotation.id),
  })

  /**
   * Moves state to matching annotations whose generated IDs changed after edits.
   */
  const reconcileState = (
    previous: readonly AnnoPulseAnnotation[],
    next: readonly AnnoPulseAnnotation[],
  ) => {
    const previousByKey = new Map<string, AnnoPulseAnnotation[]>()
    const nextByKey = new Map<string, AnnoPulseAnnotation[]>()

    for (const annotation of previous) {
      const key = annotationStateKey(annotation)
      previousByKey.set(key, [...(previousByKey.get(key) ?? []), annotation])
    }

    for (const annotation of next) {
      const key = annotationStateKey(annotation)
      nextByKey.set(key, [...(nextByKey.get(key) ?? []), annotation])
    }

    const moveState = (
      annotation: AnnoPulseAnnotation,
      replacement: AnnoPulseAnnotation | undefined,
    ) => {
      if (!replacement || replacement.id === annotation.id) {
        return
      }

      if (resolvedIds.delete(annotation.id)) {
        resolvedIds.add(replacement.id)
      }

      if (ignoredIds.delete(annotation.id)) {
        ignoredIds.add(replacement.id)
      }
    }

    for (const [key, previousAnnotations] of previousByKey) {
      const candidates = nextByKey.get(key)
      if (!candidates || candidates.length === 0) {
        continue
      }

      if (previousAnnotations.length === candidates.length) {
        for (const [index, annotation] of previousAnnotations.entries()) {
          if (resolvedIds.has(annotation.id) || ignoredIds.has(annotation.id)) {
            moveState(annotation, candidates[index])
          }
        }
        continue
      }

      for (const annotation of previousAnnotations) {
        if (!resolvedIds.has(annotation.id) && !ignoredIds.has(annotation.id)) {
          continue
        }

        if (candidates.length === 0) {
          continue
        }

        moveState(annotation, takeClosestReplacement(annotation, candidates))
      }
    }
  }

  /**
   * Rewrites all stored annotations with the latest persistent state flags.
   */
  const refreshStoredState = () => {
    for (const [uri, annotations] of annotationsByUri) {
      annotationsByUri.set(uri, annotations.map(withState))
    }
  }

  const sourcePriority: Readonly<
    Record<AnnoPulseAnnotation['source'], number>
  > = {
    notebook: 3,
    openEditor: 3,
    visibleEditor: 4,
    workspace: 1,
  }
  const liveDocumentSources = new Set<AnnoPulseAnnotation['source']>([
    'notebook',
    'openEditor',
    'visibleEditor',
  ])

  /**
   * Rebuilds the deduplicated public snapshot for one URI.
   */
  const refreshUri = (uri: string) => {
    const sourceSnapshots = sourceSnapshotsByUri.get(uri)
    if (!sourceSnapshots || sourceSnapshots.size === 0) {
      annotationsByUri.delete(uri)
      sourceSnapshotsByUri.delete(uri)
      return
    }

    const liveSnapshot = [...sourceSnapshots]
      .filter(([source]) => liveDocumentSources.has(source))
      .sort(
        ([left], [right]) => sourcePriority[right] - sourcePriority[left],
      )[0]?.[1]
    const projectedSnapshots = liveSnapshot
      ? [liveSnapshot]
      : [...sourceSnapshots.values()]
    const nextAnnotations = uniqueById(
      projectedSnapshots
        .flat()
        .map(withState)
        .sort(
          (left, right) =>
            sourcePriority[right.source] - sourcePriority[left.source],
        ),
    )

    if (nextAnnotations.length > 0) {
      annotationsByUri.set(uri, nextAnnotations)
    } else {
      annotationsByUri.delete(uri)
    }
  }

  /**
   * Publishes one source snapshot for a URI without notifying subscribers.
   */
  const setSourceForUri = (
    source: AnnoPulseAnnotation['source'],
    uri: string,
    annotations: readonly AnnoPulseAnnotation[],
  ) => {
    const sourceSnapshots =
      sourceSnapshotsByUri.get(uri) ??
      new Map<AnnoPulseAnnotation['source'], readonly AnnoPulseAnnotation[]>()
    const previousSourceAnnotations = liveDocumentSources.has(source)
      ? [...sourceSnapshots]
          .filter(([snapshotSource]) => liveDocumentSources.has(snapshotSource))
          .flatMap(([, snapshotAnnotations]) => snapshotAnnotations)
      : (sourceSnapshots.get(source) ?? [])

    if (liveDocumentSources.has(source)) {
      for (const liveSource of liveDocumentSources) {
        if (liveSource !== source) {
          sourceSnapshots.delete(liveSource)
        }
      }
    }

    const replacementAnnotations = annotations.map(annotation => ({
      ...annotation,
      source,
      uri,
    }))

    reconcileState(previousSourceAnnotations, replacementAnnotations)

    if (replacementAnnotations.length > 0 || liveDocumentSources.has(source)) {
      sourceSnapshots.set(source, replacementAnnotations)
      sourceSnapshotsByUri.set(uri, sourceSnapshots)
    } else {
      sourceSnapshots.delete(source)
      if (sourceSnapshots.size === 0) {
        sourceSnapshotsByUri.delete(uri)
      }
    }

    refreshUri(uri)
  }

  /**
   * Releases one source snapshot without notifying subscribers.
   */
  const removeSourceForUri = (
    source: AnnoPulseAnnotation['source'],
    uri: string,
  ) => {
    const sourceSnapshots = sourceSnapshotsByUri.get(uri)
    if (!sourceSnapshots) {
      return
    }

    sourceSnapshots.delete(source)
    if (sourceSnapshots.size === 0) {
      sourceSnapshotsByUri.delete(uri)
    }
    refreshUri(uri)
  }

  return {
    /**
     * Clears annotations for every URI.
     */
    clear() {
      annotationsByUri.clear()
      sourceSnapshotsByUri.clear()
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
     * Returns the retained snapshot for one source and URI.
     */
    getForSourceUri(source, uri) {
      return [...(sourceSnapshotsByUri.get(uri)?.get(source) ?? [])].map(
        withState,
      )
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
     * Replaces annotations owned by one source for one URI.
     */
    setForSourceUri(source, uri, annotations) {
      setSourceForUri(source, uri, annotations)
      notify()
    },

    /**
     * Releases one source's ownership of a URI.
     */
    removeForSourceUri(source, uri) {
      removeSourceForUri(source, uri)
      notify()
    },

    /**
     * Releases every live-document source for one URI.
     */
    removeLiveForUri(uri) {
      for (const source of liveDocumentSources) {
        removeSourceForUri(source, uri)
      }
      notify()
    },

    /**
     * Replaces annotations owned by one source while preserving other sources.
     */
    replaceForSource(source, replacementByUri) {
      const existingSourceUris = [...sourceSnapshotsByUri]
        .filter(([, snapshots]) => snapshots.has(source))
        .map(([uri]) => uri)
      const uris = new Set([...existingSourceUris, ...replacementByUri.keys()])

      for (const uri of uris) {
        const replacement = replacementByUri.get(uri)
        if (replacement) {
          setSourceForUri(source, uri, replacement)
        } else {
          removeSourceForUri(source, uri)
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
