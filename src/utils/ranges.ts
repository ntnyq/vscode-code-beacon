import { Range as VscodeRange } from 'vscode'
import type { Range } from 'vscode'
import type { BeaconAnnotation, SerializedRange } from '../types/annotation'

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
 * Formats a one-based link-like location for a beacon annotation.
 */
export function formatBeaconLink(annotation: BeaconAnnotation): string {
  return `${annotation.uri}:${annotation.line + 1}:${annotation.column + 1}`
}
