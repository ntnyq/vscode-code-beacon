import { describe, expect, it } from 'vitest'
import { createAnnoPulseCodeLensCommands } from '../src/core/codelens/commands'
import { commands } from '../src/meta'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

function createAnnotation(): AnnoPulseAnnotation {
  return {
    category: 'todo',
    column: 3,
    id: 'annotation-1',
    keyword: 'TODO:',
    keywordRange: {
      end: { character: 8, line: 1 },
      start: { character: 3, line: 1 },
    },
    languageId: 'typescript',
    line: 1,
    message: 'Ship it',
    range: {
      end: { character: 8, line: 1 },
      start: { character: 3, line: 1 },
    },
    ruleId: 'todo',
    severity: 'information',
    source: 'visibleEditor',
    uri: 'file:///workspace/src/a.ts',
  }
}

describe('codeLens issue command', () => {
  it('offers Create Issue with the AnnoPulse annotation argument', () => {
    const annotation = createAnnotation()

    expect(createAnnoPulseCodeLensCommands(annotation)).toContainEqual({
      arguments: [annotation],
      command: commands.createIssue,
      title: 'Create Issue',
    })
  })
})
