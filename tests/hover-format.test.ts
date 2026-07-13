import { describe, expect, it } from 'vitest'
import type { BeaconGitMetadata } from '../src/core/git/blame'
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

  it('appends Git blame metadata without changing the base annotation details', () => {
    const metadata: BeaconGitMetadata = {
      authorName: 'Ada Lovelace',
      commitDate: '2026-07-12T04:00:00.000Z',
      hash: 'a1b2c3d4e5f6',
      summary: 'Add beacon metadata',
    }

    const markdown = formatBeaconHoverMarkdown(createAnnotation(), metadata)

    expect(markdown).toContain('**TODO:** ship it')
    expect(markdown).toContain('- Location: `file:///workspace/src/a.ts:2:4`')
    expect(markdown).toContain('**Git**')
    expect(markdown).toContain('- Author: Ada Lovelace')
    expect(markdown).toContain('- Date: `2026-07-12T04:00:00.000Z`')
    expect(markdown).toContain('- Commit: `a1b2c3d`')
    expect(markdown).toContain('- Summary: Add beacon metadata')
  })
})
