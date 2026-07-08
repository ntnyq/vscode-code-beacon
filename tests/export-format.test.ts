import { describe, expect, it } from 'vitest'
import {
  formatAnnotationsAsCsv,
  formatAnnotationsAsJson,
  formatAnnotationsAsMarkdown,
} from '../src/core/export/format'
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

describe('export formatters', () => {
  it('formats annotations as markdown', () => {
    expect(formatAnnotationsAsMarkdown([createAnnotation()])).toContain(
      '- `TODO:` file:///workspace/src/a.ts:2:4 - ship it',
    )
  })

  it('formats annotations as json', () => {
    const json = formatAnnotationsAsJson([createAnnotation()])
    const annotations = JSON.parse(json)

    expect(annotations).toMatchObject([
      {
        keyword: 'TODO:',
        line: 2,
        uri: 'file:///workspace/src/a.ts',
      },
    ])
  })

  it('formats annotations as csv with escaped values', () => {
    expect(
      formatAnnotationsAsCsv([
        createAnnotation({
          message: 'ship, "it"',
        }),
      ]),
    ).toContain('"ship, ""it"""')
  })
})
