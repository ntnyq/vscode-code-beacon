import { describe, expect, it } from 'vitest'
import type { AnnoPulseGitMetadata } from '../src/core/git/blame'
import {
  annopulseDisplayOwner,
  annopulseDisplayState,
  formatAnnoPulseExplorerDescription,
  formatAnnoPulseExplorerTooltip,
  formatAnnoPulseGitAge,
} from '../src/core/git/presentation'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

function annotation(
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

const metadata: AnnoPulseGitMetadata = {
  authorName: 'Grace Hopper',
  commitDate: '2026-07-11T12:00:00.000Z',
  hash: 'a1b2c3d4e5f6',
  summary: 'Add annopulse metadata',
}

describe('git presentation', () => {
  const now = new Date('2026-07-12T12:00:00.000Z')

  it('formats display owner and state', () => {
    expect(annopulseDisplayOwner(annotation({ owner: '  Ada  ' }))).toBe('Ada')
    expect(annopulseDisplayOwner(annotation({ owner: '   ' }))).toBeUndefined()
    expect(annopulseDisplayState(annotation())).toBe('active')
    expect(annopulseDisplayState(annotation({ resolved: true }))).toBe(
      'resolved',
    )
    expect(annopulseDisplayState(annotation({ ignored: true }))).toBe('ignored')
    expect(
      annopulseDisplayState(annotation({ ignored: true, resolved: true })),
    ).toBe('resolved, ignored')
  })

  it('formats deterministic git ages', () => {
    expect(
      formatAnnoPulseGitAge(
        { ...metadata, commitDate: '2026-07-11T12:00:00.000Z' },
        now,
      ),
    ).toBe('1 day ago')
    expect(
      formatAnnoPulseGitAge(
        { ...metadata, commitDate: '2026-07-09T12:00:00.000Z' },
        now,
      ),
    ).toBe('3 days ago')
    expect(
      formatAnnoPulseGitAge({ ...metadata, commitDate: 'not-a-date' }, now),
    ).toBeUndefined()
    expect(
      formatAnnoPulseGitAge(
        { ...metadata, commitDate: '2026-07-13T12:00:00.000Z' },
        now,
      ),
    ).toBe('today')
  })

  it('formats explorer description and tooltip', () => {
    const resolvedAnnotation = annotation({ owner: 'Ada', resolved: true })

    expect(
      formatAnnoPulseExplorerDescription(resolvedAnnotation, metadata, now),
    ).toBe('2:4 • @Ada • Grace Hopper • 1 day ago • resolved')
    expect(
      formatAnnoPulseExplorerTooltip(resolvedAnnotation, metadata, now),
    ).toContain('Owner: @Ada')
    expect(
      formatAnnoPulseExplorerTooltip(resolvedAnnotation, metadata, now),
    ).toContain('State: resolved')
    expect(
      formatAnnoPulseExplorerTooltip(resolvedAnnotation, metadata, now),
    ).toContain('Commit: a1b2c3d')
  })

  it('formats an ownerless active tooltip without git content', () => {
    const tooltip = formatAnnoPulseExplorerTooltip(annotation(), undefined, now)

    expect(tooltip).toContain('Owner: Unassigned')
    expect(tooltip).toContain('State: active')
    expect(tooltip).not.toContain('Git:')
  })
})
