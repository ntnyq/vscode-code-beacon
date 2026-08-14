import { Range as VscodeRange } from 'vscode'
import type { Range } from 'vscode'
import type { AnnoPulseAnnotation, SerializedRange } from '../types/annotation'

/**
 * Converts a serialized range into the VS Code Range class.
 */
export function toVscodeRange(range: SerializedRange): Range {
  return new VscodeRange(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  )
}

/**
 * Formats a one-based link-like location for an AnnoPulse annotation.
 */
export function formatAnnoPulseLink(annotation: AnnoPulseAnnotation): string {
  return `${annotation.uri}:${annotation.line + 1}:${annotation.column + 1}`
}
