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
import type { AnnoPulseAnnotation } from '../../types/annotation'
import type { AnnoPulseGitMetadata } from '../git/blame'
import {
  annopulseDisplayOwner,
  formatAnnoPulseExplorerDescription,
  formatAnnoPulseExplorerTooltip,
} from '../git/presentation'
import { compareAnnoPulseAnnotations } from './filter'

/**
 * Supported TreeView grouping modes for AnnoPulse annotations.
 */
export type AnnoPulseExplorerGroupBy =
  | 'file'
  | 'rule'
  | 'category'
  | 'severity'
  | 'owner'
  | 'flat'

/**
 * Tree element representing a group of annotations.
 */
export interface AnnoPulseGroupTreeElement {
  readonly type: 'group'
  readonly id: string
  readonly label: string
  readonly annotations: readonly AnnoPulseAnnotation[]
}

/**
 * Tree element representing a single annotation leaf.
 */
export interface AnnoPulseLeafTreeElement {
  readonly type: 'annopulse'
  readonly annotation: AnnoPulseAnnotation
}

/**
 * Union of all AnnoPulse TreeView element variants.
 */
export type AnnoPulseTreeElement =
  | AnnoPulseGroupTreeElement
  | AnnoPulseLeafTreeElement

/**
 * Reader used by the TreeView provider to access current annotations.
 */
export type GetAnnoPulseAnnotations = () => readonly AnnoPulseAnnotation[]

/**
 * Reader used by the TreeView provider to access Git metadata by annotation.
 */
export type GetAnnoPulseGitMetadata = () => ReadonlyMap<
  string,
  AnnoPulseGitMetadata
>

/**
 * Reader used by the TreeView provider to access the current time.
 */
export type GetAnnoPulseNow = () => Date

/**
 * Selects the display label for an annotation and grouping mode.
 */
function groupLabel(
  annotation: AnnoPulseAnnotation,
  groupBy: AnnoPulseExplorerGroupBy,
): string {
  const labels = {
    category: annotation.category,
    file: annotation.uri,
    flat: 'All Annotations',
    owner: annotation.owner ?? 'Unassigned',
    rule: annotation.ruleId,
    severity: annotation.severity,
  }

  return labels[groupBy]
}

/**
 * Selects a VS Code theme icon for an annotation severity.
 */
function annopulseIcon(annotation: AnnoPulseAnnotation): ThemeIcon {
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
function annopulseContextValue(annotation: AnnoPulseAnnotation): string {
  if (annotation.resolved && annotation.ignored) {
    return 'annopulseResolvedIgnored'
  }

  if (annotation.resolved) {
    return 'annopulseResolved'
  }

  if (annotation.ignored) {
    return 'annopulseIgnored'
  }

  return 'annopulse'
}

/**
 * VS Code TreeDataProvider backed by the annotation store.
 */
export class AnnoPulseTreeDataProvider implements TreeDataProvider<AnnoPulseTreeElement> {
  /**
   * VS Code emitter used to notify TreeView refreshes.
   */
  // oxlint-disable-next-line unicorn/prefer-event-target -- VS Code TreeDataProvider requires vscode.EventEmitter.
  private readonly changeEmitter = new EventEmitter<
    AnnoPulseTreeElement | undefined
  >()

  /**
   * Reader for the current annotation list.
   */
  private readonly getAnnotations: GetAnnoPulseAnnotations

  /**
   * Reader for the current grouping mode.
   */
  private readonly getGroupBy: () => AnnoPulseExplorerGroupBy

  /**
   * Reader for optional Git metadata keyed by annotation ID.
   */
  private readonly getMetadataByAnnotationId: GetAnnoPulseGitMetadata

  /**
   * Reader for the current time used in Git metadata presentation.
   */
  private readonly getNow: GetAnnoPulseNow

  /**
   * VS Code event fired when TreeView data should refresh.
   */
  public readonly onDidChangeTreeData: Event<AnnoPulseTreeElement | undefined> =
    this.changeEmitter.event

  /**
   * VS Code callback that converts a tree element into a TreeItem.
   */
  public readonly getTreeItem = (element: AnnoPulseTreeElement) =>
    this.createTreeItem(element)

  /**
   * Creates a provider from annotation and grouping readers.
   */
  public constructor(
    getAnnotations: GetAnnoPulseAnnotations,
    getGroupBy: () => AnnoPulseExplorerGroupBy = () => 'file',
    getMetadataByAnnotationId: GetAnnoPulseGitMetadata = () => new Map(),
    getNow: GetAnnoPulseNow = () => new Date(),
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
    element?: AnnoPulseTreeElement,
  ): AnnoPulseTreeElement[] | Promise<AnnoPulseTreeElement[]> {
    if (element?.type === 'group') {
      return element.annotations.map(annotation => ({
        annotation,
        type: 'annopulse',
      }))
    }

    if (element?.type === 'annopulse') {
      return []
    }

    const groupBy = this.getGroupBy()
    const groups = new Map<string, AnnoPulseAnnotation[]>()

    for (const annotation of this.getAnnotations().toSorted(
      compareAnnoPulseAnnotations,
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
  private createTreeItem(element: AnnoPulseTreeElement): TreeItem {
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
    const owner = annopulseDisplayOwner(annotation)
    const item = new TreeItem(
      annotation.message
        ? `${annotation.keyword} ${annotation.message}`
        : annotation.keyword,
      TreeItemCollapsibleState.None,
    )

    item.command = {
      arguments: [annotation],
      command: commands.reveal,
      title: 'Reveal Annotation',
    }
    item.contextValue = annopulseContextValue(annotation)
    item.description = metadata
      ? formatAnnoPulseExplorerDescription(annotation, metadata, this.getNow())
      : [
          `${annotation.line + 1}:${annotation.column + 1}`,
          owner ? `@${owner}` : '',
          annotation.resolved ? 'resolved' : '',
          annotation.ignored ? 'ignored' : '',
        ]
          .filter(Boolean)
          .join(' ')
    item.iconPath = annopulseIcon(annotation)
    item.resourceUri = Uri.parse(annotation.uri)
    item.tooltip = formatAnnoPulseExplorerTooltip(
      annotation,
      metadata,
      this.getNow(),
    )

    return item
  }
}
