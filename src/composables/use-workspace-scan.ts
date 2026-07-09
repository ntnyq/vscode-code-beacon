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
import type { BeaconAnnotation, BeaconRuleConfig } from '../types/annotation'
import { logger } from '../utils/logger'

/**
 * Builds the effective workspace exclude patterns from Code Beacon and VS Code settings.
 */
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

/**
 * Registers the workspace scan command.
 */
export function useWorkspaceScan() {
  /**
   * Scans workspace files with progress and stores discovered annotations.
   */
  const scanWorkspace = () =>
    window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: 'Scanning Code Beacon annotations',
      },
      async progress => {
        const normalizedRules = normalizeRules(
          config.rules as readonly BeaconRuleConfig[],
          {
            allowCustomRegex: workspace.isTrusted,
          },
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
        const annotationsByUri = new Map<string, readonly BeaconAnnotation[]>()

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

            annotationsByUri.set(uri.toString(), result.annotations)
          } catch (error) {
            logger.warn(
              `Failed to scan ${uri.toString()}: ${
                error instanceof Error ? error.message : String(error)
              }`,
            )
          }
        }

        annotationStore.replaceForSource('workspace', annotationsByUri)
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
