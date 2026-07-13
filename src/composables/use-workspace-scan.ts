import { useDisposable } from 'reactive-vscode'
import {
  ProgressLocation,
  RelativePattern,
  commands as vscodeCommands,
  window,
  workspace,
} from 'vscode'
import type { Disposable, Uri } from 'vscode'
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

interface WorkspaceUriScanSucceeded {
  readonly annotations: readonly BeaconAnnotation[]
  readonly succeeded: true
}

interface WorkspaceUriScanFailed {
  readonly succeeded: false
}

type WorkspaceUriScanResult = WorkspaceUriScanSucceeded | WorkspaceUriScanFailed

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
 * Resolves the current include and exclude globs used by workspace scans.
 */
function workspaceScanGlobs() {
  return {
    exclude: toGlobUnion(workspaceExcludePatterns()),
    include: toGlobUnion(config.include, '**/*') ?? '**/*',
  }
}

/**
 * Creates a scanner that applies the current workspace scan settings to one URI.
 */
function createWorkspaceUriScanner() {
  const normalizedRules = normalizeRules(
    config.rules as readonly BeaconRuleConfig[],
    {
      allowCustomRegex: workspace.isTrusted,
    },
  )

  for (const error of normalizedRules.errors) {
    logger.warn(`Rule ${error.ruleId}: ${error.message}`)
  }

  return async (uri: Uri): Promise<WorkspaceUriScanResult> => {
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

      return {
        annotations: result.annotations,
        succeeded: true,
      }
    } catch (error) {
      logger.warn(
        `Failed to scan ${uri.toString()}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )

      return { succeeded: false }
    }
  }
}

/**
 * Replaces workspace annotations for one URI while retaining other workspace results.
 */
function replaceWorkspaceAnnotationsForUri(
  uri: string,
  annotations: readonly BeaconAnnotation[],
) {
  const annotationsByUri = new Map<string, BeaconAnnotation[]>()

  for (const annotation of annotationStore.getAll()) {
    if (annotation.source !== 'workspace') {
      continue
    }

    const existing = annotationsByUri.get(annotation.uri) ?? []
    existing.push(annotation)
    annotationsByUri.set(annotation.uri, existing)
  }

  annotationsByUri.set(uri, [...annotations])
  annotationStore.replaceForSource('workspace', annotationsByUri)
}

/**
 * Returns the workspace annotations currently stored for one URI.
 */
function workspaceAnnotationsForUri(uri: string): readonly BeaconAnnotation[] {
  return annotationStore
    .getForUri(uri)
    .filter(annotation => annotation.source === 'workspace')
}

/**
 * Registers the workspace scan command.
 */
export function useWorkspaceScan() {
  const knownWorkspaceUris = new Set<string>()
  const uriGenerations = new Map<string, number>()
  let watcherDisposables: Disposable[] = []
  let scanConfigurationGeneration = 0
  let watcherGeneration = 0
  let workspaceGeneration = 0
  let watcherRegistered = false

  /**
   * Rescans an included workspace URI and replaces only its workspace annotations.
   */
  const rescanWorkspaceUri = async (
    uri: Uri,
    expectedScanConfigurationGeneration = scanConfigurationGeneration,
    expectedWatcherGeneration = watcherGeneration,
  ) => {
    if (
      expectedScanConfigurationGeneration !== scanConfigurationGeneration ||
      expectedWatcherGeneration !== watcherGeneration
    ) {
      return
    }

    const uriString = uri.toString()
    const workspaceFolder = workspace.getWorkspaceFolder(uri)
    if (!workspaceFolder) {
      return
    }

    let matchingUris: readonly Uri[]
    try {
      const { exclude } = workspaceScanGlobs()
      matchingUris = await workspace.findFiles(
        new RelativePattern(
          workspaceFolder,
          workspace.asRelativePath(uri, false),
        ),
        exclude,
        1,
      )
    } catch (error) {
      logger.warn(
        `Failed to check ${uriString} against workspace scan filters: ${
          error instanceof Error ? error.message : String(error)
        }`,
      )
      return
    }

    const isIncluded = matchingUris.some(
      matchingUri => matchingUri.toString() === uriString,
    )

    if (!isIncluded) {
      return
    }

    if (
      expectedScanConfigurationGeneration !== scanConfigurationGeneration ||
      expectedWatcherGeneration !== watcherGeneration
    ) {
      return
    }

    workspaceGeneration += 1
    const generation = (uriGenerations.get(uriString) ?? 0) + 1
    uriGenerations.set(uriString, generation)
    knownWorkspaceUris.add(uriString)

    const result = await createWorkspaceUriScanner()(uri)

    if (
      result.succeeded &&
      uriGenerations.get(uriString) === generation &&
      expectedScanConfigurationGeneration === scanConfigurationGeneration &&
      expectedWatcherGeneration === watcherGeneration
    ) {
      replaceWorkspaceAnnotationsForUri(uriString, result.annotations)
    }
  }

  const deleteWorkspaceUri = (
    uri: Uri,
    expectedScanConfigurationGeneration = scanConfigurationGeneration,
    expectedWatcherGeneration = watcherGeneration,
  ) => {
    if (
      expectedScanConfigurationGeneration !== scanConfigurationGeneration ||
      expectedWatcherGeneration !== watcherGeneration
    ) {
      return
    }

    const uriString = uri.toString()
    if (!knownWorkspaceUris.delete(uriString)) {
      return
    }

    uriGenerations.set(uriString, (uriGenerations.get(uriString) ?? 0) + 1)
    replaceWorkspaceAnnotationsForUri(uriString, [])
  }

  /**
   * Registers file watchers after the first successful workspace snapshot exists.
   */
  const registerWatcher = () => {
    if (watcherRegistered) {
      return
    }

    watcherRegistered = true
    const currentWatcherGeneration = ++watcherGeneration
    const currentScanConfigurationGeneration = scanConfigurationGeneration
    const { include } = workspaceScanGlobs()
    const watcher = workspace.createFileSystemWatcher(include)
    watcherDisposables = [
      watcher,
      watcher.onDidCreate(uri =>
        rescanWorkspaceUri(
          uri,
          currentScanConfigurationGeneration,
          currentWatcherGeneration,
        ),
      ),
      watcher.onDidChange(uri =>
        rescanWorkspaceUri(
          uri,
          currentScanConfigurationGeneration,
          currentWatcherGeneration,
        ),
      ),
      watcher.onDidDelete(uri =>
        deleteWorkspaceUri(
          uri,
          currentScanConfigurationGeneration,
          currentWatcherGeneration,
        ),
      ),
    ]

    for (const disposable of watcherDisposables) {
      useDisposable(disposable)
    }
  }

  /**
   * Stops the current watcher before replacing it with one using new settings.
   */
  const disposeWatcher = () => {
    watcherGeneration += 1
    for (const disposable of watcherDisposables) {
      disposable.dispose()
    }

    watcherDisposables = []
    watcherRegistered = false
  }

  /**
   * Scans workspace files with progress and stores discovered annotations.
   */
  const scanWorkspace = () => {
    const configurationGeneration = scanConfigurationGeneration
    const generation = ++workspaceGeneration

    return window.withProgress(
      {
        location: ProgressLocation.Notification,
        title: 'Scanning Code Beacon annotations',
      },
      async progress => {
        const { exclude, include } = workspaceScanGlobs()
        const files = await workspace.findFiles(
          include,
          exclude,
          config.maxFilesForSearch,
        )
        const scanUri = createWorkspaceUriScanner()

        let scanned = 0
        const annotationsByUri = new Map<string, readonly BeaconAnnotation[]>()
        const scanUriGenerations = new Map<string, number>()

        for (const uri of files) {
          const uriString = uri.toString()
          const uriGeneration = (uriGenerations.get(uriString) ?? 0) + 1
          uriGenerations.set(uriString, uriGeneration)
          scanUriGenerations.set(uriString, uriGeneration)
          scanned += 1
          progress.report({
            message: `${scanned}/${files.length}`,
          })

          const result = await scanUri(uri)
          annotationsByUri.set(
            uriString,
            result.succeeded
              ? result.annotations
              : workspaceAnnotationsForUri(uriString),
          )
        }

        if (
          scanConfigurationGeneration !== configurationGeneration ||
          workspaceGeneration !== generation
        ) {
          return
        }

        for (const [uri, uriGeneration] of scanUriGenerations) {
          if (uriGenerations.get(uri) === uriGeneration) {
            continue
          }

          const currentAnnotations = workspaceAnnotationsForUri(uri)
          if (currentAnnotations.length > 0) {
            annotationsByUri.set(uri, currentAnnotations)
          } else {
            annotationsByUri.delete(uri)
          }
        }

        annotationStore.replaceForSource('workspace', annotationsByUri)
        knownWorkspaceUris.clear()
        for (const uri of files) {
          knownWorkspaceUris.add(uri.toString())
        }
        registerWatcher()
        logger.info(`Workspace scan completed: ${scanned} files`)
      },
    )
  }

  useDisposable(
    vscodeCommands.registerCommand(commands.scanWorkspace, scanWorkspace),
  )
  useDisposable(
    workspace.onDidChangeConfiguration(event => {
      const affectsScanConfiguration =
        event.affectsConfiguration('code-beacon.include') ||
        event.affectsConfiguration('code-beacon.exclude') ||
        event.affectsConfiguration('code-beacon.commentOnly') ||
        event.affectsConfiguration('code-beacon.maxFileSize') ||
        event.affectsConfiguration('code-beacon.rules') ||
        event.affectsConfiguration('code-beacon') ||
        event.affectsConfiguration('files.exclude') ||
        event.affectsConfiguration('search.exclude')
      if (!affectsScanConfiguration) {
        return
      }

      scanConfigurationGeneration += 1
      knownWorkspaceUris.clear()
      if (!watcherRegistered) {
        return
      }

      disposeWatcher()
      registerWatcher()
    }),
  )

  return {
    rescanWorkspaceUri,
    scanWorkspace,
  }
}
