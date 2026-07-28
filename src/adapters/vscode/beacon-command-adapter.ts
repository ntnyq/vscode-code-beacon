import {
  ConfigurationTarget,
  commands as vscodeCommands,
  env,
  LanguageModelChatMessage,
  LanguageModelTextPart,
  lm,
  ProgressLocation,
  Range,
  Uri,
  window,
  WorkspaceEdit,
  workspace,
} from 'vscode'
import type { CancellationToken } from 'vscode'
import { config } from '../../config'
import { createAiActionExecutor } from '../../core/ai/action-execution'
import type {
  AiActionCancellation,
  AiActionExecutionDependencies,
} from '../../core/ai/action-execution'
import type {
  BeaconCommandAdapter,
  BeaconCommandDocument,
  BeaconCommandHandler,
  BeaconCommandLanguageModel,
} from '../../core/commands/beacon-command-handlers'
import type { BeaconExportFormat } from '../../core/export/format'
import { extensionId } from '../../meta'

const createLanguageModelUserMessage = LanguageModelChatMessage.User

function createVscodeAiActionExecutor() {
  const dependencies: AiActionExecutionDependencies<
    BeaconCommandLanguageModel,
    AiActionCancellation
  > = {
    async selectModel() {
      const [model] = await lm.selectChatModels({ vendor: 'copilot' })

      if (!model) {
        return
      }

      return {
        async request(messages, token) {
          const response = await model.sendRequest(
            messages.map(message => createLanguageModelUserMessage(message)),
            undefined,
            token as CancellationToken,
          )
          return response.stream
        },
      }
    },
    runWithProgress(title, task) {
      return window.withProgress(
        {
          cancellable: true,
          location: ProgressLocation.Notification,
          title,
        },
        (_progress, token) => task(token),
      )
    },
    textFromPart: part =>
      part instanceof LanguageModelTextPart ? part.value : undefined,
  }

  return createAiActionExecutor(dependencies)
}

async function openDocument(uri: string): Promise<BeaconCommandDocument> {
  const document = await workspace.openTextDocument(Uri.parse(uri))

  return {
    applyGeneratedFix(application) {
      const edit = new WorkspaceEdit()
      edit.replace(
        Uri.parse(uri),
        new Range(
          document.positionAt(application.start),
          document.positionAt(application.end),
        ),
        application.replacement,
        {
          label: 'Apply Code Beacon generated fix',
          needsConfirmation: true,
        },
      )

      return workspace.applyEdit(edit)
    },
    getText: () => document.getText(),
    languageId: document.languageId,
  }
}

async function openExportDocument(format: BeaconExportFormat, content: string) {
  const extensionByFormat = {
    csv: 'csv',
    json: 'json',
    markdown: 'md',
  }
  const document = await workspace.openTextDocument({
    content,
    language: extensionByFormat[format],
  })

  await window.showTextDocument(document)
}

/**
 * Creates the production adapter for VS Code command side effects.
 */
export function createVscodeBeaconCommandAdapter(): BeaconCommandAdapter & {
  readonly registerCommand: (
    command: string,
    handler: BeaconCommandHandler,
  ) => { dispose: () => void }
} {
  return {
    get aiEnabled() {
      return config.ai.enabled
    },
    get enabled() {
      return config.enable
    },
    createAiActionExecutor: createVscodeAiActionExecutor,
    createOutput: name => window.createOutputChannel(name),
    openDocument,
    openExportDocument,
    openExtensionSettings: () =>
      vscodeCommands.executeCommand(
        'workbench.action.openSettings',
        `@ext:${extensionId}`,
      ),
    registerCommand: (command, handler) =>
      vscodeCommands.registerCommand(command, handler),
    setEnabled: value =>
      config.update('enable', value, ConfigurationTarget.Global),
    showInformation: message => window.showInformationMessage(message),
    showWarning: message => window.showWarningMessage(message),
    writeClipboard: content => env.clipboard.writeText(content),
  }
}
