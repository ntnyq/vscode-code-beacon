import { describe, expect, it } from 'vitest'
import { createBeaconCodeLensCommands } from '../src/core/codelens/commands'
import type { BeaconAnnotation } from '../src/types/annotation'

function createAnnotation(
  overrides: Partial<BeaconAnnotation> = {},
): BeaconAnnotation {
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
  it('offers resolve, ignore, copy, and reveal actions for active annotations', () => {
    expect(createBeaconCodeLensCommands(createAnnotation())).toMatchObject([
      { command: 'code-beacon.resolve', title: 'Resolve' },
      { command: 'code-beacon.ignore', title: 'Ignore' },
      { command: 'code-beacon.copyLink', title: 'Copy Link' },
      { command: 'code-beacon.reveal', title: 'Reveal' },
    ])
  })

  it('offers restore actions for resolved and ignored annotations', () => {
    expect(
      createBeaconCodeLensCommands(
        createAnnotation({
          ignored: true,
          resolved: true,
        }),
      ),
    ).toMatchObject([
      { command: 'code-beacon.unresolve', title: 'Reopen' },
      { command: 'code-beacon.unignore', title: 'Unignore' },
      { command: 'code-beacon.copyLink', title: 'Copy Link' },
      { command: 'code-beacon.reveal', title: 'Reveal' },
    ])
  })
})
