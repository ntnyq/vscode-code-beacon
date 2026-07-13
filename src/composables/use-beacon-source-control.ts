import { useDisposable } from 'reactive-vscode'
import {
  ThemeIcon,
  Uri,
  scm,
  workspace,
  type Disposable,
  type SourceControl,
  type SourceControlResourceGroup,
  type SourceControlResourceState,
} from 'vscode'
import { config } from '../config'
import { createBeaconSourceControlResources } from '../core/source-control/resources'
import { annotationStore } from '../core/store/annotation-store'
import type { BeaconGitAdapter } from './use-beacon-git'

const SOURCE_CONTROL_ID = 'code-beacon'
const SOURCE_CONTROL_LABEL = 'Code Beacon'
const RESOURCE_GROUP_ID = 'changedBeacons'
const RESOURCE_GROUP_LABEL = 'Changed Beacons'

export function useBeaconSourceControl(
  git: Pick<BeaconGitAdapter, 'getChangedUris' | 'subscribeToChangedUris'>,
) {
  let changedUris = new Set<string>()
  let generation = 0
  let changedUrisRequest = 0
  let gitSubscription: Disposable | undefined
  let group: SourceControlResourceGroup | undefined
  let sourceControl: SourceControl | undefined

  function render() {
    if (!sourceControl || !group) {
      return
    }
    const states: SourceControlResourceState[] =
      createBeaconSourceControlResources(
        changedUris,
        annotationStore.getAll(),
      ).map(descriptor => {
        const resourceUri = Uri.parse(descriptor.uri)
        return {
          command: {
            arguments: [resourceUri],
            command: 'vscode.open',
            title: 'Open Beacon File',
          },
          contextValue: 'codeBeaconChangedResource',
          decorations: {
            icon: new ThemeIcon('comment-discussion'),
            tooltip: descriptor.tooltip,
          },
          resourceUri,
        }
      })
    group.resourceStates = states
    sourceControl.count = states.length
  }

  function disable() {
    changedUrisRequest += 1
    if (!sourceControl && !group && !gitSubscription) {
      return
    }

    generation += 1
    changedUris = new Set()
    gitSubscription?.dispose()
    gitSubscription = undefined
    group?.dispose()
    group = undefined
    sourceControl?.dispose()
    sourceControl = undefined
  }

  function refreshChangedUris() {
    const request = changedUrisRequest + 1
    changedUrisRequest = request
    if (!config.scm.enabled || !sourceControl) {
      return
    }
    const enabledGeneration = generation
    void git.getChangedUris().then(
      uris => {
        if (
          request !== changedUrisRequest ||
          enabledGeneration !== generation ||
          !config.scm.enabled
        ) {
          return
        }
        changedUris = new Set(uris)
        render()
      },
      () => {
        if (
          request !== changedUrisRequest ||
          enabledGeneration !== generation ||
          !config.scm.enabled
        ) {
          return
        }
        changedUris = new Set()
        render()
      },
    )
  }

  function enable() {
    if (sourceControl) {
      return
    }
    sourceControl = scm.createSourceControl(
      SOURCE_CONTROL_ID,
      SOURCE_CONTROL_LABEL,
    )
    group = sourceControl.createResourceGroup(
      RESOURCE_GROUP_ID,
      RESOURCE_GROUP_LABEL,
    )
    const request = generation
    void git.subscribeToChangedUris(refreshChangedUris).then(
      subscription => {
        if (request !== generation || !config.scm.enabled) {
          subscription.dispose()
        } else {
          gitSubscription = subscription
        }
      },
      () => {},
    )
    refreshChangedUris()
  }

  function synchronize() {
    if (config.scm.enabled) {
      enable()
    } else {
      disable()
    }
  }

  useDisposable({ dispose: annotationStore.subscribe(render) })
  useDisposable(
    workspace.onDidChangeConfiguration(event => {
      if (event.affectsConfiguration('code-beacon.scm.enabled')) {
        synchronize()
      }
    }),
  )
  useDisposable({ dispose: disable })
  synchronize()
  return { dispose: disable }
}
