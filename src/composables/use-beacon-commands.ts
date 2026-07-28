import { useDisposable } from 'reactive-vscode'
import type { Memento } from 'vscode'
import { createVscodeBeaconCommandAdapter } from '../adapters/vscode/beacon-command-adapter'
import { createBeaconCommandHandlers } from '../core/commands/beacon-command-handlers'
import { registerBeaconCommands } from '../core/commands/register-beacon-commands'
import { createMementoAnnotationStateStorage } from '../core/store/annotation-state'
import { annotationStore } from '../core/store/annotation-store'

async function saveAnnotationState(
  previousSave: Promise<void>,
  save: () => PromiseLike<void>,
): Promise<void> {
  try {
    await previousSave
    await save()
  } catch {
    // Persistence is best-effort; the in-memory annotation state remains valid.
  }
}

/**
 * Connects command handlers, VS Code registrations, and persisted state.
 */
export function useBeaconCommands(workspaceState: Memento) {
  const adapter = createVscodeBeaconCommandAdapter()
  const handlers = createBeaconCommandHandlers(adapter, annotationStore)
  const storage = createMementoAnnotationStateStorage(workspaceState)
  let saveChain = Promise.resolve()

  useDisposable({ dispose: handlers.dispose })

  annotationStore.restoreState(storage.load())
  useDisposable({
    dispose: annotationStore.subscribe(() => {
      const state = annotationStore.getState()
      saveChain = saveAnnotationState(saveChain, () => storage.save(state))
    }),
  })

  for (const registration of registerBeaconCommands(
    adapter.registerCommand,
    handlers,
  )) {
    useDisposable(registration)
  }

  return {
    exportAnnotations: handlers.exportAnnotations,
  }
}
