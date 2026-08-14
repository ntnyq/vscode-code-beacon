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
import { createConfiguredDocumentScanner } from '../core/scanner/configured-document-scanner'
import { annotationStore } from '../core/store/annotation-store'
import {
  enabledExcludePatterns,
  toGlobUnion,
  type VscodeExcludeConfig,
} from '../core/workspace/globs'
import { commands } from '../meta'
import type {
  AnnoPulseAnnotation,
  AnnoPulseRuleConfig,
} from '../types/annotation'
import { logger } from '../utils/logger'

interface WorkspaceUriScanSucceeded {
  readonly annotations: readonly AnnoPulseAnnotation[]
  readonly succeeded: true
}

interface WorkspaceUriScanFailed {
  readonly succeeded: false
}

type WorkspaceUriScanResult = WorkspaceUriScanSucceeded | WorkspaceUriScanFailed

const WORKSPACE_SCAN_CONCURRENCY = 8

/**
 * Builds the effective workspace exclude patterns from AnnoPulse and VS Code settings.
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
  const scanner = createConfiguredDocumentScanner({
    allowCustomRegex: workspace.isTrusted,
    commentOnly: config.commentOnly,
    maxFileSize: config.maxFileSize,
    rules: config.rules as readonly AnnoPulseRuleConfig[],
    warn: message => logger.warn(message),
  })

  return async (uri: Uri): Promise<WorkspaceUriScanResult> => {
    try {
      const document = await workspace.openTextDocument(uri)
      const result = scanner.scan({
        languageId: document.languageId,
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
 * Returns the workspace annotations currently stored for one URI.
 */
function workspaceAnnotationsForUri(
  uri: string,
): readonly AnnoPulseAnnotation[] {
  return annotationStore.getForSourceUri('workspace', uri)
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
      annotationStore.setForSourceUri(
        'workspace',
        uriString,
        result.annotations,
      )
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
    annotationStore.removeForSourceUri('workspace', uriString)
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
    const generation = workspaceGeneration

    return window.withProgress(
      {
        cancellable: true,
        location: ProgressLocation.Notification,
        title: 'Scanning AnnoPulse annotations',
      },
      async (progress, token) => {
        const { exclude, include } = workspaceScanGlobs()
        const files = await workspace.findFiles(
          include,
          exclude,
          config.maxFilesForSearch,
        )
        const scanUri = createWorkspaceUriScanner()

        let scanned = 0
        const annotationsByUri = new Map<
          string,
          readonly AnnoPulseAnnotation[]
        >()
        const scanUriGenerations = new Map<string, number>()

        let nextFileIndex = 0

        const scanNextFile = async () => {
          while (
            nextFileIndex < files.length &&
            !token.isCancellationRequested
          ) {
            const uri = files[nextFileIndex]
            nextFileIndex += 1
            if (!uri) {
              return
            }

            const uriString = uri.toString()
            const uriGeneration = (uriGenerations.get(uriString) ?? 0) + 1
            scanUriGenerations.set(uriString, uriGeneration)

            const result = await scanUri(uri)
            annotationsByUri.set(
              uriString,
              result.succeeded
                ? result.annotations
                : workspaceAnnotationsForUri(uriString),
            )
            scanned += 1
            progress.report({ message: `${scanned}/${files.length}` })
          }
        }

        await Promise.all(
          Array.from(
            { length: Math.min(WORKSPACE_SCAN_CONCURRENCY, files.length) },
            scanNextFile,
          ),
        )

        if (token.isCancellationRequested) {
          return
        }

        if (
          scanConfigurationGeneration !== configurationGeneration ||
          workspaceGeneration !== generation
        ) {
          return
        }

        for (const [uri, uriGeneration] of scanUriGenerations) {
          if ((uriGenerations.get(uri) ?? 0) === uriGeneration - 1) {
            uriGenerations.set(uri, uriGeneration)
            continue
          }

          const currentAnnotations = workspaceAnnotationsForUri(uri)
          if (currentAnnotations.length > 0) {
            annotationsByUri.set(uri, currentAnnotations)
          } else {
            annotationsByUri.delete(uri)
          }
        }

        workspaceGeneration += 1
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
        event.affectsConfiguration('annopulse.include') ||
        event.affectsConfiguration('annopulse.exclude') ||
        event.affectsConfiguration('annopulse.commentOnly') ||
        event.affectsConfiguration('annopulse.maxFileSize') ||
        event.affectsConfiguration('annopulse.rules') ||
        event.affectsConfiguration('annopulse') ||
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
