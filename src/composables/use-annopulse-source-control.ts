import { useDisposable } from 'reactive-vscode'
import {
  ThemeIcon,
  Uri,
  scm,
  workspace,
  type SourceControl,
  type SourceControlResourceGroup,
  type SourceControlResourceState,
} from 'vscode'
import { config } from '../config'
import type {
  ChangedUriIndex,
  ChangedUriIndexDisposable,
} from '../core/git/changed-uri-index'
import { createAnnoPulseSourceControlResources } from '../core/source-control/resources'
import { annotationStore } from '../core/store/annotation-store'

const SOURCE_CONTROL_ID = 'annopulse'
const SOURCE_CONTROL_LABEL = 'AnnoPulse'
const RESOURCE_GROUP_ID = 'changedAnnotations'
const RESOURCE_GROUP_LABEL = 'Changed Annotations'

export function useAnnoPulseSourceControl(changedUriIndex: ChangedUriIndex) {
  let changedUriSubscription: ChangedUriIndexDisposable | undefined
  let group: SourceControlResourceGroup | undefined
  let sourceControl: SourceControl | undefined

  function render() {
    if (!sourceControl || !group) {
      return
    }
    const states: SourceControlResourceState[] =
      createAnnoPulseSourceControlResources(
        changedUriIndex.getAll(),
        annotationStore.getAll(),
      ).map(descriptor => {
        const resourceUri = Uri.parse(descriptor.uri)
        return {
          command: {
            arguments: [resourceUri],
            command: 'vscode.open',
            title: 'Open AnnoPulse File',
          },
          contextValue: 'annopulseChangedResource',
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
    if (!sourceControl && !group && !changedUriSubscription) {
      return
    }

    changedUriSubscription?.dispose()
    changedUriSubscription = undefined
    group?.dispose()
    group = undefined
    sourceControl?.dispose()
    sourceControl = undefined
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
    changedUriSubscription = changedUriIndex.subscribe(render)
    render()
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
      if (event.affectsConfiguration('annopulse.scm.enabled')) {
        synchronize()
      }
    }),
  )
  useDisposable({ dispose: disable })
  synchronize()
  return { dispose: disable }
}
