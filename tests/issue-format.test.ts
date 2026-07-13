import { describe, expect, it } from 'vitest'
import type { BeaconGitMetadata } from '../src/core/git/blame'
import { formatBeaconIssue } from '../src/core/issues/format'
import type { BeaconAnnotation } from '../src/types/annotation'

function createAnnotation(
  overrides: Partial<BeaconAnnotation> = {},
): BeaconAnnotation {
  return {
    category: 'todo',
    column: 2,
    id: 'annotation-1',
    keyword: 'TODO:',
    keywordRange: {
      end: { character: 5, line: 11 },
      start: { character: 0, line: 11 },
    },
    languageId: 'typescript',
    line: 11,
    message: 'Replace deprecated parser',
    range: {
      end: { character: 30, line: 11 },
      start: { character: 0, line: 11 },
    },
    ruleId: 'todo',
    severity: 'information',
    source: 'visibleEditor',
    uri: 'file:///workspace/src/parser.ts',
    ...overrides,
  }
}

describe('issue formatter', () => {
  it('formats a complete annotation as a portable issue body', () => {
    const content = formatBeaconIssue(createAnnotation({ owner: 'alice' }))

    expect(content.title).toBe('TODO: Replace deprecated parser')
    expect(content.body).toContain('## Code Beacon')
    expect(content.body).toContain('- **Category:** `todo`')
    expect(content.body).toContain('- **Severity:** `information`')
    expect(content.body).toContain('- **Rule:** `todo`')
    expect(content.body).toContain(
      '- **Location:** `file:///workspace/src/parser.ts:12:3`',
    )
    expect(content.body).toContain('- **Owner:** `alice`')
    expect(content.body).toContain('## Annotation\n\nReplace deprecated parser')
  })

  it.each([undefined, '', '   \t'])('omits an empty owner %j', owner => {
    const content = formatBeaconIssue(createAnnotation({ owner }))

    expect(content.body).not.toContain('**Owner:**')
  })

  it('uses the first nonempty message line for the title', () => {
    const content = formatBeaconIssue(
      createAnnotation({
        message:
          '\r\n  Replace deprecated parser  \r\nKeep the current fallback.',
      }),
    )

    expect(content.title).toBe('TODO: Replace deprecated parser')
    expect(content.body).toContain(
      'Replace deprecated parser Keep the current fallback\\.',
    )
  })

  it('formats inline values safely and renders a multiline message as literal body text', () => {
    const content = formatBeaconIssue(
      createAnnotation({
        message: 'Replace `deprecated` parser\r\n## Injected section',
        owner: 'Ada`Lovelace\r\nTeam',
        ruleId: 'todo`rule\r\nnext',
        uri: 'file:///workspace/src/parser`old.ts\r\n#ignored',
      }),
    )

    expect(content.body).toContain('- **Rule:** ``todo`rule next``')
    expect(content.body).toContain(
      '- **Location:** ``file:///workspace/src/parser`old.ts #ignored:12:3``',
    )
    expect(content.body).toContain('- **Owner:** ``Ada`Lovelace Team``')
    expect(content.body).toContain(
      'Replace \\`deprecated\\` parser \\#\\# Injected section',
    )
    expect(content.body).not.toContain('\n## Injected section')
  })

  it.each([
    [
      '## Injected heading',
      'TODO: ## Injected heading',
      '\\#\\# Injected heading',
    ],
    ['> Injected quote', 'TODO: > Injected quote', '\\> Injected quote'],
    ['```typescript', 'TODO: ```typescript', '\\`\\`\\`typescript'],
    ['~~~typescript', 'TODO: ~~~typescript', '\\~\\~\\~typescript'],
    [
      '<script>alert(1)</script>',
      'TODO: <script>alert(1)</script>',
      '\\<script\\>alert\\(1\\)\\</script\\>',
    ],
  ])(
    'keeps a %s first line as literal annotation text',
    (message, title, paragraph) => {
      const content = formatBeaconIssue(createAnnotation({ message }))

      expect(content.title).toBe(title)
      expect(content.body).toContain(`## Annotation\n\n${paragraph}`)
      expect(content.body).not.toContain(`\n${message}`)
    },
  )

  it('uses a code span delimiter longer than the longest backtick run', () => {
    const content = formatBeaconIssue(
      createAnnotation({ ruleId: 'match ```literal``` text' }),
    )

    expect(content.body).toContain(
      '- **Rule:** ````match ```literal``` text````',
    )
    expect(content.body).not.toContain('````match \\`')
  })

  it('pads a code span when the value starts or ends with a backtick', () => {
    const content = formatBeaconIssue(
      createAnnotation({ ruleId: '``literal``' }),
    )

    expect(content.body).toContain('- **Rule:** ``` ``literal`` ```')
  })

  it('omits Git details without metadata', () => {
    expect(formatBeaconIssue(createAnnotation()).body).not.toContain('## Git')
  })

  it('includes normalized Git details when metadata is provided', () => {
    const metadata: BeaconGitMetadata = {
      authorName: 'Ada Lovelace',
      commitDate: '2026-07-12T04:00:00.000Z',
      hash: 'a1b2c3d4e5f6',
      summary: 'Replace parser',
    }

    const content = formatBeaconIssue(createAnnotation(), metadata)

    expect(content.body).toContain('## Git')
    expect(content.body).toContain('- **Author:** Ada Lovelace')
    expect(content.body).toContain('- **Date:** `2026-07-12T04:00:00.000Z`')
    expect(content.body).toContain('- **Commit:** `a1b2c3d`')
    expect(content.body).toContain('- **Summary:** Replace parser')
  })

  it('renders hostile Git author and summary text as literal body text', () => {
    const metadata: BeaconGitMetadata = {
      authorName: 'Ada\n```markdown\n## Forged author',
      commitDate: '2026-07-12T04:00:00.000Z',
      hash: 'a1b2c3d4e5f6',
      summary: 'Replace parser\r\n## Forged summary\r\n~~~markdown',
    }

    const content = formatBeaconIssue(createAnnotation(), metadata)

    expect(content.body).toContain(
      '- **Author:** Ada \\`\\`\\`markdown \\#\\# Forged author',
    )
    expect(content.body).toContain(
      '- **Summary:** Replace parser \\#\\# Forged summary \\~\\~\\~markdown',
    )
    expect(content.body).not.toContain('\n```markdown')
    expect(content.body).not.toContain('\n## Forged author')
    expect(content.body).not.toContain('\n## Forged summary')
    expect(content.body).not.toContain('\n~~~markdown')
  })
})
