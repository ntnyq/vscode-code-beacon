import { Range as VscodeRange } from 'vscode'
import type { Range } from 'vscode'
import type { BeaconAnnotation, SerializedRange } from '../types/annotation'

export function toVscodeRange(range: SerializedRange): Range {
  return new VscodeRange(
    range.start.line,
    range.start.character,
    range.end.line,
    range.end.character,
  )
}

export function formatBeaconLink(annotation: BeaconAnnotation): string {
  return `${annotation.uri}:${annotation.line + 1}:${annotation.column + 1}`
}
