import { describe, expect, it } from 'vitest'
import type { AnnoPulseGitMetadata } from '../src/core/git/blame'
import { formatAnnoPulseHoverMarkdown } from '../src/core/hover/format'
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

describe('hover formatter', () => {
  it('summarizes the annotation with source, severity, and location', () => {
    expect(formatAnnoPulseHoverMarkdown(createAnnotation())).toContain(
      '**TODO:** ship it',
    )
    expect(formatAnnoPulseHoverMarkdown(createAnnotation())).toContain(
      '- Category: `todo`',
    )
    expect(formatAnnoPulseHoverMarkdown(createAnnotation())).toContain(
      '- Severity: `information`',
    )
    expect(formatAnnoPulseHoverMarkdown(createAnnotation())).toContain(
      '- Location: `file:///workspace/src/a\\.ts:2:4`',
    )
  })

  it('appends Git blame metadata without changing the base annotation details', () => {
    const now = new Date('2026-07-12T12:00:00.000Z')
    const metadata: AnnoPulseGitMetadata = {
      authorName: 'Ada Lovelace',
      authorEmail: 'ada@example.test',
      commitDate: '2026-07-11T12:00:00.000Z',
      hash: 'a1b2c3d4e5f6',
      summary: 'Add annopulse metadata',
    }

    const markdown = formatAnnoPulseHoverMarkdown(
      createAnnotation({ ignored: true, owner: 'Ada', resolved: true }),
      metadata,
      now,
    )

    expect(markdown).toContain('**TODO:** ship it')
    expect(markdown).toContain('- Location: `file:///workspace/src/a\\.ts:2:4`')
    expect(markdown).toContain('- Owner: @Ada')
    expect(markdown).toContain('- State: resolved, ignored')
    expect(markdown).toContain('**Git**')
    expect(markdown).toContain('- Author: Ada Lovelace')
    expect(markdown).toContain(String.raw`- Email: ada@example\.test`)
    expect(markdown).toContain('- Date: `2026\\-07\\-11T12:00:00\\.000Z`')
    expect(markdown).toContain('- Age: `1 day ago`')
    expect(markdown).toContain('- Commit: `a1b2c3d`')
    expect(markdown).toContain('- Summary: Add annopulse metadata')
  })

  it('escapes dynamic Markdown fields', () => {
    const unsafe = '# heading [link](https://example.test) `code` **bold**'
    const metadata: AnnoPulseGitMetadata = {
      authorName: unsafe,
      authorEmail: unsafe,
      commitDate: unsafe,
      hash: unsafe,
      summary: unsafe,
    }

    const markdown = formatAnnoPulseHoverMarkdown(
      createAnnotation({ message: unsafe, owner: unsafe }),
      metadata,
      new Date('2026-07-12T12:00:00.000Z'),
    )

    expect(markdown).toContain(String.raw`\# heading`)
    expect(markdown).toContain(String.raw`\[link\]\(https://example\.test\)`)
    expect(markdown).toContain('\\`code\\`')
    expect(markdown).toContain(String.raw`\*\*bold\*\*`)
    expect(markdown).not.toMatch(/(?<prefix>^|[^\\])# heading/u)
    expect(markdown).not.toContain('[link](https://example.test)')
  })
})
