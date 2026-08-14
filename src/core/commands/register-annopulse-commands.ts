import { commands } from '../../meta'
import type {
  AnnoPulseCommandHandler,
  AnnoPulseCommandHandlers,
} from './annopulse-command-handlers'

export interface AnnoPulseCommandRegistration {
  readonly dispose: () => void
}

export type RegisterAnnoPulseCommand = (
  command: string,
  handler: AnnoPulseCommandHandler,
) => AnnoPulseCommandRegistration

/**
 * Registers every contributed command against its business handler.
 */
export function registerAnnoPulseCommands(
  registerCommand: RegisterAnnoPulseCommand,
  handlers: AnnoPulseCommandHandlers,
): readonly AnnoPulseCommandRegistration[] {
  return [
    registerCommand(commands.enable, handlers.enable),
    registerCommand(commands.disable, handlers.disable),
    registerCommand(commands.toggle, handlers.toggle),
    registerCommand(commands.openSettings, handlers.openSettings),
    registerCommand(commands.clearCache, handlers.clearCache),
    registerCommand(commands.resolve, handlers.resolve),
    registerCommand(commands.unresolve, handlers.unresolve),
    registerCommand(commands.ignore, handlers.ignore),
    registerCommand(commands.unignore, handlers.unignore),
    registerCommand(commands.copyMarkdown, handlers.copyMarkdown),
    registerCommand(commands.createIssue, handlers.createIssue),
    registerCommand(commands.explain, handlers.explain),
    registerCommand(commands.generateFix, handlers.generateFix),
    registerCommand(commands.summarizeWorkspace, handlers.summarizeWorkspace),
    registerCommand(commands.exportMarkdown, handlers.exportMarkdown),
    registerCommand(commands.exportJson, handlers.exportJson),
    registerCommand(commands.exportCsv, handlers.exportCsv),
  ]
}
