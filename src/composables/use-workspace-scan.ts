import { useDisposable } from 'reactive-vscode'
import {
  ProgressLocation,
  commands as vscodeCommands,
  window,
  workspace,
} from 'vscode'
import { config } from '../config'
import { normalizeRules } from '../core/rules/normalize'
import { scanDocument } from '../core/scanner/scan-document'
import { annotationStore } from '../core/store/annotation-store'
import {
  enabledExcludePatterns,
  toGlobUnion,
  type VscodeExcludeConfig,
} from '../core/workspace/globs'
import { commands } from '../meta'
import type { BeaconRuleConfig } from '../types/annotation'
import { logger } from '../utils/logger'

function workspaceExcludePatterns(): string[] {
  const patterns = [...config.exclude]

  if (config.respectFilesExclude) {
    patterns.push(
      ...enabledExcludePatterns(
        workspace.getConfiguration('files').get('exclude') as
          | VscodeExcludeConfig
          | undefined,
      ),
    )
  }

  if (config.respectSearchExclude) {
    patterns.push(
      ...enabledExcludePatterns(
        workspace.getConfiguration('search').get('exclude') as
          | VscodeExcludeConfig
          | undefined,
      ),
    )
  }

  return patterns
}

export function useWorkspaceScan() {
  const scanWorkspace = () =>
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: 'Scanning Code Beacon annotations',
      },
      async progress => {
        const normalizedRules = normalizeRules(
          config.rules as readonly BeaconRuleConfig[],
        )

        for (const error of normalizedRules.errors) {
          logger.warn(`Rule ${error.ruleId}: ${error.message}`)
        }

        const files = await workspace.findFiles(
          toGlobUnion(config.include, '**/*') ?? '**/*',
          toGlobUnion(workspaceExcludePatterns()),
          config.maxFilesForSearch,
        )

        let scanned = 0

        for (const uri of files) {
          scanned += 1
          progress.report({
            message: `${scanned}/${files.length}`,
          })

          try {
            const document = await workspace.openTextDocument(uri)
            const result = scanDocument({
              commentOnly: config.commentOnly,
              languageId: document.languageId,
              maxFileSize: config.maxFileSize,
              rules: normalizedRules.rules,
              source: 'workspace',
              text: document.getText(),
              uri: uri.toString(),
            })

            annotationStore.setForUri(uri.toString(), result.annotations)
          } catch (error) {
            logger.warn(
              `Failed to scan ${uri.toString()}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
          }
        }

        logger.info(`Workspace scan completed: ${scanned} files`)
      },
    )

  useDisposable(
    vscodeCommands.registerCommand(commands.scanWorkspace, scanWorkspace),
  )

  return {
    scanWorkspace,
  }
}
