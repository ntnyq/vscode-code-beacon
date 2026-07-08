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
import { formatBeaconLink } from '../../utils/ranges'

export type BeaconExplorerGroupBy =
  | 'file'
  | 'rule'
  | 'category'
  | 'severity'
  | 'owner'
  | 'flat'

export interface BeaconGroupTreeElement {
  readonly type: 'group'
  readonly id: string
  readonly label: string
  readonly annotations: readonly BeaconAnnotation[]
}

export interface BeaconLeafTreeElement {
  readonly type: 'beacon'
  readonly annotation: BeaconAnnotation
}

export type BeaconTreeElement = BeaconGroupTreeElement | BeaconLeafTreeElement

export type GetBeaconAnnotations = () => readonly BeaconAnnotation[]

function groupLabel(
  annotation: BeaconAnnotation,
  groupBy: BeaconExplorerGroupBy,
): string {
  const labels = {
    category: annotation.category,
    file: annotation.uri,
    flat: 'All Beacons',
    owner: annotation.source,
    rule: annotation.ruleId,
    severity: annotation.severity,
  }

  return labels[groupBy]
}

function beaconIcon(annotation: BeaconAnnotation): ThemeIcon {
  const iconIds = {
    error: 'error',
    hint: 'lightbulb',
    information: 'info',
    warning: 'warning',
  }

  return new ThemeIcon(iconIds[annotation.severity])
}

export class BeaconTreeDataProvider implements TreeDataProvider<BeaconTreeElement> {
  // oxlint-disable-next-line unicorn/prefer-event-target -- VS Code TreeDataProvider requires vscode.EventEmitter.
  private readonly changeEmitter = new EventEmitter<
    BeaconTreeElement | undefined
  >()

  private readonly getAnnotations: GetBeaconAnnotations

  private readonly getGroupBy: () => BeaconExplorerGroupBy

  public readonly onDidChangeTreeData: Event<BeaconTreeElement | undefined> =
    this.changeEmitter.event

  public readonly getTreeItem = BeaconTreeDataProvider.createTreeItem

  public constructor(
    getAnnotations: GetBeaconAnnotations,
    getGroupBy: () => BeaconExplorerGroupBy = () => 'file',
  ) {
    this.getAnnotations = getAnnotations
    this.getGroupBy = getGroupBy
  }

  public refresh() {
    // oxlint-disable-next-line unicorn/no-useless-undefined -- vscode.EventEmitter.fire expects the typed payload argument.
    this.changeEmitter.fire(undefined)
  }

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

    for (const annotation of this.getAnnotations()) {
      const label = groupLabel(annotation, groupBy)
      groups.set(label, [...(groups.get(label) ?? []), annotation])
    }

    return [...groups.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([label, annotations]) => ({
        annotations,
        id: `${groupBy}:${label}`,
        label,
        type: 'group',
      }))
  }

  private static createTreeItem(element: BeaconTreeElement): TreeItem {
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
    item.contextValue = 'beacon'
    item.description = `${annotation.line + 1}:${annotation.column + 1}`
    item.iconPath = beaconIcon(annotation)
    item.resourceUri = Uri.parse(annotation.uri)
    item.tooltip = formatBeaconLink(annotation)

    return item
  }
}
