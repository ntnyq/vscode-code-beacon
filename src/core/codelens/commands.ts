import { commands } from '../../meta'
import type { AnnoPulseAnnotation } from '../../types/annotation'

/**
 * Command descriptor used by CodeLens actions for one AnnoPulse annotation.
 */
export interface AnnoPulseCodeLensCommand {
  readonly command: string
  readonly title: string
  readonly arguments: [AnnoPulseAnnotation]
}

/**
 * Builds CodeLens commands for the current resolved and ignored state.
 */
export function createAnnoPulseCodeLensCommands(
  annotation: AnnoPulseAnnotation,
): readonly AnnoPulseCodeLensCommand[] {
  return [
    annotation.resolved
      ? {
          arguments: [annotation],
          command: commands.unresolve,
          title: 'Reopen',
        }
      : {
          arguments: [annotation],
          command: commands.resolve,
          title: 'Resolve',
        },
    annotation.ignored
      ? {
          arguments: [annotation],
          command: commands.unignore,
          title: 'Unignore',
        }
      : {
          arguments: [annotation],
          command: commands.ignore,
          title: 'Ignore',
        },
    {
      arguments: [annotation],
      command: commands.copyLink,
      title: 'Copy Link',
    },
    {
      arguments: [annotation],
      command: commands.createIssue,
      title: 'Create Issue',
    },
    {
      arguments: [annotation],
      command: commands.reveal,
      title: 'Reveal',
    },
  ]
}
