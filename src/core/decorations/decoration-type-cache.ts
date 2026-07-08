import {
  DecorationRangeBehavior,
  OverviewRulerLane,
  window,
  type DecorationRenderOptions,
  type TextEditorDecorationType,
} from 'vscode'
import type { BeaconStyleConfig } from '../../types/annotation'

type DecorationStyle = Required<BeaconStyleConfig>

export function decorationStyleKey(style: DecorationStyle): string {
  return JSON.stringify({
    backgroundColor: style.backgroundColor,
    border: style.border,
    borderRadius: style.borderRadius,
    color: style.color,
    marker: style.marker,
    overviewRulerColor: style.overviewRulerColor,
  })
}

export function createDecorationRenderOptions(
  style: DecorationStyle,
): DecorationRenderOptions {
  return {
    backgroundColor: style.backgroundColor,
    border: style.border,
    borderRadius: style.borderRadius,
    color: style.color,
    overviewRulerColor: style.overviewRulerColor,
    overviewRulerLane: OverviewRulerLane.Right,
    rangeBehavior: DecorationRangeBehavior.ClosedClosed,
  }
}

export class DecorationTypeCache {
  private readonly decorationTypes = new Map<string, TextEditorDecorationType>()

  public get(style: DecorationStyle): TextEditorDecorationType {
    const key = decorationStyleKey(style)
    const existing = this.decorationTypes.get(key)

    if (existing) {
      return existing
    }

    const decorationType = window.createTextEditorDecorationType(
      createDecorationRenderOptions(style),
    )
    this.decorationTypes.set(key, decorationType)

    return decorationType
  }

  public disposeStale(activeKeys: readonly string[]) {
    const activeKeySet = new Set(activeKeys)

    for (const [key, decorationType] of this.decorationTypes) {
      if (!activeKeySet.has(key)) {
        decorationType.dispose()
        this.decorationTypes.delete(key)
      }
    }
  }

  public disposeAll() {
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose()
    }

    this.decorationTypes.clear()
  }
}
