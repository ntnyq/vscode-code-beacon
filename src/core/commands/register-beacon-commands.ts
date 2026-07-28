import { commands } from '../../meta'
import type {
  BeaconCommandHandler,
  BeaconCommandHandlers,
} from './beacon-command-handlers'

export interface BeaconCommandRegistration {
  readonly dispose: () => void
}

export type RegisterBeaconCommand = (
  command: string,
  handler: BeaconCommandHandler,
) => BeaconCommandRegistration

/**
 * Registers every contributed command against its business handler.
 */
export function registerBeaconCommands(
  registerCommand: RegisterBeaconCommand,
  handlers: BeaconCommandHandlers,
): readonly BeaconCommandRegistration[] {
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
