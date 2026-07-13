import type { Memento } from 'vscode'

/**
 * Serializable resolved and ignored annotation identifiers.
 */
export interface BeaconAnnotationState {
  readonly resolvedIds: readonly string[]
  readonly ignoredIds: readonly string[]
}

/**
 * Loads and saves persisted annotation state.
 */
export interface AnnotationStateStorage {
  load: () => BeaconAnnotationState
  save: (state: BeaconAnnotationState) => Thenable<void>
}

const annotationStateKey = 'code-beacon.annotationState'

const emptyState: BeaconAnnotationState = {
  ignoredIds: [],
  resolvedIds: [],
}

/**
 * Retains unique string identifiers in their stored order.
 */
function normalizeIds(value: unknown): readonly string[] {
  if (!Array.isArray(value)) {
    return []
  }

  return [
    ...new Set(value.filter((id): id is string => typeof id === 'string')),
  ]
}

/**
 * Converts an unknown Memento payload into a safe annotation state snapshot.
 */
function normalizeState(value: unknown): BeaconAnnotationState {
  if (typeof value !== 'object' || value === null) {
    return emptyState
  }

  const state = value as Record<string, unknown>

  if (!Array.isArray(state.resolvedIds) || !Array.isArray(state.ignoredIds)) {
    return emptyState
  }

  return {
    ignoredIds: normalizeIds(state.ignoredIds),
    resolvedIds: normalizeIds(state.resolvedIds),
  }
}

/**
 * Creates annotation state storage backed by VS Code workspace Memento data.
 */
export function createMementoAnnotationStateStorage(
  memento: Pick<Memento, 'get' | 'update'>,
): AnnotationStateStorage {
  return {
    load: () => normalizeState(memento.get<unknown>(annotationStateKey)),
    save: state => memento.update(annotationStateKey, state),
  }
}
