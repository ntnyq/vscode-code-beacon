import type { TextEditor } from 'vscode'
import { DecorationTypeCache } from './decoration-type-cache'

/**
 * Owns decoration caches per editor so stale styles are disposed per editor.
 */
export class EditorDecorationCaches {
  private readonly caches = new Map<TextEditor, DecorationTypeCache>()

  /**
   * Returns the decoration cache for one editor, creating it when needed.
   */
  public get(editor: TextEditor): DecorationTypeCache {
    const existing = this.caches.get(editor)

    if (existing) {
      return existing
    }

    const cache = new DecorationTypeCache()
    this.caches.set(editor, cache)

    return cache
  }

  /**
   * Clears and disposes the cache associated with one editor.
   */
  public clearForEditor(editor: TextEditor) {
    this.caches.get(editor)?.clearForEditor(editor)
    this.caches.delete(editor)
  }

  /**
   * Disposes caches for editors that are no longer visible.
   */
  public disposeForClosedEditors(visibleEditors: readonly TextEditor[]) {
    const visibleEditorSet = new Set(visibleEditors)

    for (const [editor] of this.caches) {
      if (!visibleEditorSet.has(editor)) {
        this.clearForEditor(editor)
      }
    }
  }

  /**
   * Disposes every editor-owned decoration cache.
   */
  public disposeAll() {
    for (const [editor] of this.caches) {
      this.clearForEditor(editor)
    }
  }
}
