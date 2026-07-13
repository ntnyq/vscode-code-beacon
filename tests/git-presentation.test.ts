import { describe, expect, it } from 'vitest'
import type { BeaconGitMetadata } from '../src/core/git/blame'
import {
  beaconDisplayOwner,
  beaconDisplayState,
  formatBeaconExplorerDescription,
  formatBeaconExplorerTooltip,
  formatBeaconGitAge,
} from '../src/core/git/presentation'
import type { BeaconAnnotation } from '../src/types/annotation'

function annotation(
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

const metadata: BeaconGitMetadata = {
  authorName: 'Grace Hopper',
  commitDate: '2026-07-11T12:00:00.000Z',
  hash: 'a1b2c3d4e5f6',
  summary: 'Add beacon metadata',
}

describe('git presentation', () => {
  const now = new Date('2026-07-12T12:00:00.000Z')

  it('formats display owner and state', () => {
    expect(beaconDisplayOwner(annotation({ owner: '  Ada  ' }))).toBe('Ada')
    expect(beaconDisplayOwner(annotation({ owner: '   ' }))).toBeUndefined()
    expect(beaconDisplayState(annotation())).toBe('active')
    expect(beaconDisplayState(annotation({ resolved: true }))).toBe('resolved')
    expect(beaconDisplayState(annotation({ ignored: true }))).toBe('ignored')
    expect(
      beaconDisplayState(annotation({ ignored: true, resolved: true })),
    ).toBe('resolved, ignored')
  })

  it('formats deterministic git ages', () => {
    expect(
      formatBeaconGitAge(
        { ...metadata, commitDate: '2026-07-11T12:00:00.000Z' },
        now,
      ),
    ).toBe('1 day ago')
    expect(
      formatBeaconGitAge(
        { ...metadata, commitDate: '2026-07-09T12:00:00.000Z' },
        now,
      ),
    ).toBe('3 days ago')
    expect(
      formatBeaconGitAge({ ...metadata, commitDate: 'not-a-date' }, now),
    ).toBeUndefined()
    expect(
      formatBeaconGitAge(
        { ...metadata, commitDate: '2026-07-13T12:00:00.000Z' },
        now,
      ),
    ).toBe('today')
  })

  it('formats explorer description and tooltip', () => {
    const resolvedAnnotation = annotation({ owner: 'Ada', resolved: true })

    expect(
      formatBeaconExplorerDescription(resolvedAnnotation, metadata, now),
    ).toBe('2:4 • @Ada • Grace Hopper • 1 day ago • resolved')
    expect(
      formatBeaconExplorerTooltip(resolvedAnnotation, metadata, now),
    ).toContain('Owner: @Ada')
    expect(
      formatBeaconExplorerTooltip(resolvedAnnotation, metadata, now),
    ).toContain('State: resolved')
    expect(
      formatBeaconExplorerTooltip(resolvedAnnotation, metadata, now),
    ).toContain('Commit: a1b2c3d')
  })

  it('formats an ownerless active tooltip without git content', () => {
    const tooltip = formatBeaconExplorerTooltip(annotation(), undefined, now)

    expect(tooltip).toContain('Owner: Unassigned')
    expect(tooltip).toContain('State: active')
    expect(tooltip).not.toContain('Git:')
  })
})
