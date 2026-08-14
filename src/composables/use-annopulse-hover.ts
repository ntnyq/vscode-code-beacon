import { useDisposable } from 'reactive-vscode'
import { Hover, MarkdownString, languages } from 'vscode'
import type { Position, TextDocument } from 'vscode'
import { config } from '../config'
import type { AnnoPulseGitMetadata } from '../core/git/blame'
import { formatAnnoPulseHoverMarkdown } from '../core/hover/format'
import { annotationStore } from '../core/store/annotation-store'
import { annopulseDocumentSelector } from '../core/workspace/documents'
import type { AnnoPulseAnnotation, SerializedRange } from '../types/annotation'

/**
 * Resolves optional Git metadata for one hovered annotation.
 */
export type AnnoPulseGitMetadataLookup = (
  document: TextDocument,
  annotation: AnnoPulseAnnotation,
) => Promise<AnnoPulseGitMetadata | undefined>

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
  annotations: readonly AnnoPulseAnnotation[],
  position: Position,
): AnnoPulseAnnotation | undefined {
  return annotations.find(annotation =>
    containsPosition(annotation.range, position),
  )
}

/**
 * Registers hover content for AnnoPulse annotations.
 */
export function useAnnoPulseHover(getMetadata?: AnnoPulseGitMetadataLookup) {
  useDisposable(
    languages.registerHoverProvider(annopulseDocumentSelector, {
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

        let metadata: AnnoPulseGitMetadata | undefined
        try {
          metadata = await getMetadata?.(document, annotation)
        } catch {
          metadata = undefined
        }

        return new Hover(
          new MarkdownString(
            formatAnnoPulseHoverMarkdown(annotation, metadata),
          ),
        )
      },
    }),
  )
}
