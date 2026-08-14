import type { TextEditor } from 'vscode'
import { DEFAULT_STYLE } from '../../constants/defaults'
import type { AnnoPulseAnnotation } from '../../types/annotation'
import { toVscodeRange } from '../../utils/ranges'
import { decorationStyleKey } from './decoration-type-cache'
import type { DecorationTypeCache } from './decoration-type-cache'

/**
 * Applies grouped annopulse decorations to a visible text editor.
 */
export function applyAnnoPulseDecorations(
  editor: TextEditor,
  annotations: readonly AnnoPulseAnnotation[],
  cache: DecorationTypeCache,
) {
  const annotationsByStyle = new Map<string, AnnoPulseAnnotation[]>()

  for (const annotation of annotations) {
    const style = annotation.style ?? DEFAULT_STYLE
    const key = decorationStyleKey(style)
    annotationsByStyle.set(key, [
      ...(annotationsByStyle.get(key) ?? []),
      annotation,
    ])
  }

  for (const groupedAnnotations of annotationsByStyle.values()) {
    const style = groupedAnnotations[0]?.style ?? DEFAULT_STYLE
    editor.setDecorations(
      cache.get(style),
      groupedAnnotations.map(annotation => toVscodeRange(annotation.range)),
    )
  }

  cache.disposeStale([...annotationsByStyle.keys()], editor)
}
