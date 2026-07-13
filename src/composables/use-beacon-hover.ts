import { useDisposable } from 'reactive-vscode'
import { Hover, MarkdownString, languages } from 'vscode'
import type { Position, TextDocument } from 'vscode'
import { config } from '../config'
import type { BeaconGitMetadata } from '../core/git/blame'
import { formatBeaconHoverMarkdown } from '../core/hover/format'
import { annotationStore } from '../core/store/annotation-store'
import { beaconDocumentSelector } from '../core/workspace/documents'
import type { BeaconAnnotation, SerializedRange } from '../types/annotation'

/**
 * Resolves optional Git metadata for one hovered annotation.
 */
export type BeaconGitMetadataLookup = (
  document: TextDocument,
  annotation: BeaconAnnotation,
) => Promise<BeaconGitMetadata | undefined>

/**
 * Checks whether a VS Code position falls inside a serialized range.
 */
function containsPosition(range: SerializedRange, position: Position): boolean {
  const isAfterStart =
    position.line > range.start.line ||
    (position.line === range.start.line &&
      position.character >= range.start.character)
  const isBeforeEnd =
    position.line < range.end.line ||
    (position.line === range.end.line &&
      position.character <= range.end.character)

  return isAfterStart && isBeforeEnd
}

/**
 * Finds the first annotation that contains a hover position.
 */
function annotationAtPosition(
  annotations: readonly BeaconAnnotation[],
  position: Position,
): BeaconAnnotation | undefined {
  return annotations.find(annotation =>
    containsPosition(annotation.range, position),
  )
}

/**
 * Registers hover content for beacon annotations.
 */
export function useBeaconHover(getMetadata?: BeaconGitMetadataLookup) {
  useDisposable(
    languages.registerHoverProvider(beaconDocumentSelector, {
      async provideHover(document, position) {
        if (!config.enable || !config.hover.enabled) {
          return null
        }

        const annotation = annotationAtPosition(
          annotationStore.getForUri(document.uri.toString()),
          position,
        )

        if (!annotation) {
          return null
        }

        let metadata: BeaconGitMetadata | undefined
        try {
          metadata = await getMetadata?.(document, annotation)
        } catch {
          metadata = undefined
        }

        return new Hover(
          new MarkdownString(formatBeaconHoverMarkdown(annotation, metadata)),
        )
      },
    }),
  )
}
