import {
  DecorationRangeBehavior,
  OverviewRulerLane,
  window,
  type DecorationRenderOptions,
  type TextEditor,
  type TextEditorDecorationType,
} from 'vscode'
import type { AnnoPulseStyleConfig } from '../../types/annotation'

/**
 * Fully resolved decoration style used as the decoration cache input.
 */
type DecorationStyle = Required<AnnoPulseStyleConfig>

/**
 * Builds a stable cache key for a resolved decoration style.
 */
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

/**
 * Converts an AnnoPulse style into VS Code decoration render options.
 */
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

/**
 * Caches VS Code decoration types and disposes styles that are no longer used.
 */
export class DecorationTypeCache {
  /**
   * Decoration types keyed by stable serialized style.
   */
  private readonly decorationTypes = new Map<string, TextEditorDecorationType>()

  /**
   * Returns an existing decoration type or creates one for the given style.
   */
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

  /**
   * Disposes cached decoration types whose keys are absent from the active set.
   */
  public disposeStale(activeKeys: readonly string[], editor?: TextEditor) {
    const activeKeySet = new Set(activeKeys)

    for (const [key, decorationType] of this.decorationTypes) {
      if (!activeKeySet.has(key)) {
        editor?.setDecorations(decorationType, [])
        decorationType.dispose()
        this.decorationTypes.delete(key)
      }
    }
  }

  /**
   * Clears every cached decoration from one editor and disposes all types.
   */
  public clearForEditor(editor: TextEditor) {
    for (const decorationType of this.decorationTypes.values()) {
      editor.setDecorations(decorationType, [])
    }

    this.disposeAll()
  }

  /**
   * Disposes every cached decoration type.
   */
  public disposeAll() {
    for (const decorationType of this.decorationTypes.values()) {
      decorationType.dispose()
    }

    this.decorationTypes.clear()
  }
}
