import { describe, expect, it } from 'vitest'
import { formatBeaconHoverMarkdown } from '../src/core/hover/format'
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

describe('hover formatter', () => {
  it('summarizes the annotation with source, severity, and location', () => {
    expect(formatBeaconHoverMarkdown(createAnnotation())).toContain(
      '**TODO:** ship it',
    )
    expect(formatBeaconHoverMarkdown(createAnnotation())).toContain(
      '- Category: `todo`',
    )
    expect(formatBeaconHoverMarkdown(createAnnotation())).toContain(
      '- Severity: `information`',
    )
    expect(formatBeaconHoverMarkdown(createAnnotation())).toContain(
      '- Location: `file:///workspace/src/a.ts:2:4`',
    )
  })
})
