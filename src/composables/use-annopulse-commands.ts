import { useDisposable } from 'reactive-vscode'
import type { Memento } from 'vscode'
import { createVsannopulseCommandAdapter } from '../adapters/vscode/annopulse-command-adapter'
import { createAnnoPulseCommandHandlers } from '../core/commands/annopulse-command-handlers'
import { registerAnnoPulseCommands } from '../core/commands/register-annopulse-commands'
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
export function useAnnoPulseCommands(workspaceState: Memento) {
  const adapter = createVsannopulseCommandAdapter()
  const handlers = createAnnoPulseCommandHandlers(adapter, annotationStore)
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

  for (const registration of registerAnnoPulseCommands(
    adapter.registerCommand,
    handlers,
  )) {
    useDisposable(registration)
  }

  return {
    exportAnnotations: handlers.exportAnnotations,
  }
}
