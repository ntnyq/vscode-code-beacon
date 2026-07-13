import {
  EventEmitter,
  ThemeIcon,
  TreeItem,
  TreeItemCollapsibleState,
  Uri,
  type Event,
  type TreeDataProvider,
} from 'vscode'
import { commands } from '../../meta'
import type { BeaconAnnotation } from '../../types/annotation'
import type { BeaconGitMetadata } from '../git/blame'
import {
  beaconDisplayOwner,
  formatBeaconExplorerDescription,
  formatBeaconExplorerTooltip,
} from '../git/presentation'
import { compareBeaconAnnotations } from './filter'

/**
 * Supported TreeView grouping modes for beacon annotations.
 */
export type BeaconExplorerGroupBy =
  | 'file'
  | 'rule'
  | 'category'
  | 'severity'
  | 'owner'
  | 'flat'

/**
 * Tree element representing a group of annotations.
 */
export interface BeaconGroupTreeElement {
  readonly type: 'group'
  readonly id: string
  readonly label: string
  readonly annotations: readonly BeaconAnnotation[]
}

/**
 * Tree element representing a single annotation leaf.
 */
export interface BeaconLeafTreeElement {
  readonly type: 'beacon'
  readonly annotation: BeaconAnnotation
}

/**
 * Union of all Code Beacon TreeView element variants.
 */
export type BeaconTreeElement = BeaconGroupTreeElement | BeaconLeafTreeElement

/**
 * Reader used by the TreeView provider to access current annotations.
 */
export type GetBeaconAnnotations = () => readonly BeaconAnnotation[]

/**
 * Reader used by the TreeView provider to access Git metadata by annotation.
 */
export type GetBeaconGitMetadata = () => ReadonlyMap<string, BeaconGitMetadata>

/**
 * Reader used by the TreeView provider to access the current time.
 */
export type GetBeaconNow = () => Date

/**
 * Selects the display label for an annotation and grouping mode.
 */
function groupLabel(
  annotation: BeaconAnnotation,
  groupBy: BeaconExplorerGroupBy,
): string {
  const labels = {
    category: annotation.category,
    file: annotation.uri,
    flat: 'All Beacons',
    owner: annotation.owner ?? 'Unassigned',
    rule: annotation.ruleId,
    severity: annotation.severity,
  }

  return labels[groupBy]
}

/**
 * Selects a VS Code theme icon for an annotation severity.
 */
function beaconIcon(annotation: BeaconAnnotation): ThemeIcon {
  const iconIds = {
    error: 'error',
    hint: 'lightbulb',
    information: 'info',
    warning: 'warning',
  }

  return new ThemeIcon(iconIds[annotation.severity])
}

/**
 * Sorts group labels with unassigned owner groups first.
 */
function compareGroupLabels(left: string, right: string): number {
  if (left === 'Unassigned' && right !== 'Unassigned') {
    return -1
  }

  if (right === 'Unassigned' && left !== 'Unassigned') {
    return 1
  }

  return left.localeCompare(right)
}

/**
 * Builds a TreeView context value that encodes annotation state.
 */
function beaconContextValue(annotation: BeaconAnnotation): string {
  if (annotation.resolved && annotation.ignored) {
    return 'beaconResolvedIgnored'
  }

  if (annotation.resolved) {
    return 'beaconResolved'
  }

  if (annotation.ignored) {
    return 'beaconIgnored'
  }

  return 'beacon'
}

/**
 * VS Code TreeDataProvider backed by the annotation store.
 */
export class BeaconTreeDataProvider implements TreeDataProvider<BeaconTreeElement> {
  /**
   * VS Code emitter used to notify TreeView refreshes.
   */
  // oxlint-disable-next-line unicorn/prefer-event-target -- VS Code TreeDataProvider requires vscode.EventEmitter.
  private readonly changeEmitter = new EventEmitter<
    BeaconTreeElement | undefined
  >()

  /**
   * Reader for the current annotation list.
   */
  private readonly getAnnotations: GetBeaconAnnotations

  /**
   * Reader for the current grouping mode.
   */
  private readonly getGroupBy: () => BeaconExplorerGroupBy

  /**
   * Reader for optional Git metadata keyed by annotation ID.
   */
  private readonly getMetadataByAnnotationId: GetBeaconGitMetadata

  /**
   * Reader for the current time used in Git metadata presentation.
   */
  private readonly getNow: GetBeaconNow

  /**
   * VS Code event fired when TreeView data should refresh.
   */
  public readonly onDidChangeTreeData: Event<BeaconTreeElement | undefined> =
    this.changeEmitter.event

  /**
   * VS Code callback that converts a tree element into a TreeItem.
   */
  public readonly getTreeItem = (element: BeaconTreeElement) =>
    this.createTreeItem(element)

  /**
   * Creates a provider from annotation and grouping readers.
   */
  public constructor(
    getAnnotations: GetBeaconAnnotations,
    getGroupBy: () => BeaconExplorerGroupBy = () => 'file',
    getMetadataByAnnotationId: GetBeaconGitMetadata = () => new Map(),
    getNow: GetBeaconNow = () => new Date(),
  ) {
    this.getAnnotations = getAnnotations
    this.getGroupBy = getGroupBy
    this.getMetadataByAnnotationId = getMetadataByAnnotationId
    this.getNow = getNow
  }

  /**
   * Notifies VS Code that all TreeView data should be refreshed.
   */
  public refresh() {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- vscode.EventEmitter.fire expects the typed payload argument.
    this.changeEmitter.fire(undefined)
  }

  /**
   * Returns root groups or annotation leaves for a group element.
   */
  public getChildren(
    element?: BeaconTreeElement,
  ): BeaconTreeElement[] | Promise<BeaconTreeElement[]> {
    if (element?.type === 'group') {
      return element.annotations.map(annotation => ({
        annotation,
        type: 'beacon',
      }))
    }

    if (element?.type === 'beacon') {
      return []
    }

    const groupBy = this.getGroupBy()
    const groups = new Map<string, BeaconAnnotation[]>()

    for (const annotation of this.getAnnotations().toSorted(
      compareBeaconAnnotations,
    )) {
      const label = groupLabel(annotation, groupBy)
      groups.set(label, [...(groups.get(label) ?? []), annotation])
    }

    return [...groups.entries()]
      .sort(([left], [right]) => compareGroupLabels(left, right))
      .map(([label, annotations]) => ({
        annotations,
        id: `${groupBy}:${label}`,
        label,
        type: 'group',
      }))
  }

  /**
   * Converts a group or annotation leaf into a VS Code TreeItem.
   */
  private createTreeItem(element: BeaconTreeElement): TreeItem {
    if (element.type === 'group') {
      const item = new TreeItem(
        element.label,
        TreeItemCollapsibleState.Collapsed,
      )
      item.description = `${element.annotations.length}`
      item.contextValue = 'group'

      return item
    }

    const { annotation } = element
    const metadata = this.getMetadataByAnnotationId().get(annotation.id)
    const owner = beaconDisplayOwner(annotation)
    const item = new TreeItem(
      annotation.message
        ? `${annotation.keyword} ${annotation.message}`
        : annotation.keyword,
      TreeItemCollapsibleState.None,
    )

    item.command = {
      arguments: [annotation],
      command: commands.reveal,
      title: 'Reveal Beacon',
    }
    item.contextValue = beaconContextValue(annotation)
    item.description = metadata
      ? formatBeaconExplorerDescription(annotation, metadata, this.getNow())
      : [
          `${annotation.line + 1}:${annotation.column + 1}`,
          owner ? `@${owner}` : '',
          annotation.resolved ? 'resolved' : '',
          annotation.ignored ? 'ignored' : '',
        ]
          .filter(Boolean)
          .join(' ')
    item.iconPath = beaconIcon(annotation)
    item.resourceUri = Uri.parse(annotation.uri)
    item.tooltip = formatBeaconExplorerTooltip(
      annotation,
      metadata,
      this.getNow(),
    )

    return item
  }
}
