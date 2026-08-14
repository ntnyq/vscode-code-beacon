import { describe, expect, it } from 'vitest'
import { createAnnoPulseCodeLensCommands } from '../src/core/codelens/commands'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

function createAnnotation(
  overrides: Partial<AnnoPulseAnnotation> = {},
): AnnoPulseAnnotation {
  return {
    category: 'todo',
    column: 3,
    id: 'a',
    keyword: 'TODO:',
    keywordRange: {
      end: { character: 8, line: 1 },
      start: { character: 3, line: 1 },
    },
    languageId: 'typescript',
    line: 1,
    message: 'ship it',
    range: {
      end: { character: 8, line: 1 },
      start: { character: 3, line: 1 },
    },
    ruleId: 'todo',
    severity: 'information',
    source: 'visibleEditor',
    uri: 'file:///workspace/src/a.ts',
    ...overrides,
  }
}

describe('codelens commands', () => {
  it('offers resolve, ignore, copy, create issue, and reveal actions for active annotations', () => {
    const annotation = createAnnotation()

    expect(createAnnoPulseCodeLensCommands(annotation)).toMatchObject([
      { command: 'annopulse.resolve', title: 'Resolve' },
      { command: 'annopulse.ignore', title: 'Ignore' },
      { command: 'annopulse.copyLink', title: 'Copy Link' },
      {
        arguments: [annotation],
        command: 'annopulse.createIssue',
        title: 'Create Issue',
      },
      { command: 'annopulse.reveal', title: 'Reveal' },
    ])
  })

  it('offers restore and create issue actions for resolved and ignored annotations', () => {
    const annotation = createAnnotation({
      ignored: true,
      resolved: true,
    })

    expect(createAnnoPulseCodeLensCommands(annotation)).toMatchObject([
      { command: 'annopulse.unresolve', title: 'Reopen' },
      { command: 'annopulse.unignore', title: 'Unignore' },
      { command: 'annopulse.copyLink', title: 'Copy Link' },
      {
        arguments: [annotation],
        command: 'annopulse.createIssue',
        title: 'Create Issue',
      },
      { command: 'annopulse.reveal', title: 'Reveal' },
    ])
  })
})
