import { describe, expect, it } from 'vitest'
import {
  filterBeaconAnnotations,
  isBeaconOwnerless,
  isBeaconStale,
  type BeaconExplorerFilter,
} from '../src/core/explorer/filter'
import type { BeaconGitMetadata } from '../src/core/git/blame'
import type { BeaconAnnotation } from '../src/types/annotation'

const annotations: readonly BeaconAnnotation[] = [
  createAnnotation('active-todo', {
    category: 'todo',
    message: 'Ship the release',
    owner: 'Alice',
    ruleId: 'todo-release',
    severity: 'information',
    uri: 'file:///workspace/src/active.ts',
  }),
  createAnnotation('active-bug', {
    category: 'bug',
    keyword: 'BUG:',
    message: 'Prevent crash',
    owner: 'Bob',
    ruleId: 'bug-crash',
    severity: 'error',
    uri: 'file:///workspace/src/active.ts',
  }),
  createAnnotation('open-fixme', {
    category: 'fixme',
    keyword: 'FIXME:',
    message: 'Refactor parser',
    owner: 'Alice',
    ruleId: 'fixme-parser',
    severity: 'warning',
    uri: 'file:///workspace/src/open.ts',
  }),
  createAnnotation('resolved-note', {
    category: 'note',
    message: 'Document decision',
    owner: 'Carol',
    resolved: true,
    ruleId: 'note-docs',
    severity: 'hint',
    uri: 'file:///workspace/src/open.ts',
  }),
  createAnnotation('ignored-review', {
    category: 'review',
    ignored: true,
    message: 'Review ownership',
    owner: 'Dave',
    ruleId: 'review-owner',
    severity: 'information',
    uri: 'file:///workspace/src/open.ts',
  }),
]

const defaultFilter: BeaconExplorerFilter = {
  activeUri: undefined,
  categories: [],
  changedUris: new Set(),
  includeIgnored: false,
  includeResolved: false,
  metadataByAnnotationId: new Map(),
  now: new Date('2026-07-12T00:00:00.000Z'),
  onlyOwnerless: false,
  onlyStale: false,
  openUris: [],
  owners: [],
  query: '',
  scope: 'workspace',
  severities: [],
  staleDays: 90,
}

function createAnnotation(
  id: string,
  overrides: Partial<BeaconAnnotation> = {},
): BeaconAnnotation {
  return {
    category: 'todo',
    column: 3,
    id,
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
    uri: 'file:///workspace/src/active.ts',
    ...overrides,
  }
}

function filteredIds(filter: Partial<BeaconExplorerFilter>): string[] {
  return filterBeaconAnnotations(annotations, {
    ...defaultFilter,
    ...filter,
  }).map(annotation => annotation.id)
}

describe(filterBeaconAnnotations, () => {
  const filterCases: readonly [
    string,
    Partial<BeaconExplorerFilter>,
    string[],
  ][] = [
    ['category', { categories: ['bug'] }, ['active-bug']],
    ['severity', { severities: ['warning'] }, ['open-fixme']],
    ['owner', { owners: ['Alice'] }, ['active-todo', 'open-fixme']],
    [
      'active file scope',
      { activeUri: 'file:///workspace/src/active.ts', scope: 'activeFile' },
      ['active-todo', 'active-bug'],
    ],
    [
      'open editor scope',
      { openUris: ['file:///workspace/src/open.ts'], scope: 'openEditors' },
      ['open-fixme'],
    ],
    [
      'changed file scope',
      {
        changedUris: new Set(['file:///workspace/src/open.ts']),
        scope: 'changedFiles',
      },
      ['open-fixme'],
    ],
    [
      'resolved state',
      { includeResolved: true },
      ['active-todo', 'active-bug', 'open-fixme', 'resolved-note'],
    ],
    [
      'ignored state',
      { includeIgnored: true },
      ['active-todo', 'active-bug', 'open-fixme', 'ignored-review'],
    ],
  ]

  it.each(filterCases)('filters by %s', (_dimension, filter, expectedIds) => {
    expect(filteredIds(filter)).toStrictEqual(expectedIds)
  })

  it('does not constrain results for empty selection arrays or query', () => {
    expect(
      filteredIds({ categories: [], owners: [], query: '', severities: [] }),
    ).toStrictEqual(['active-todo', 'active-bug', 'open-fixme'])
  })

  it('combines changed file scope with category filtering using AND', () => {
    expect(
      filteredIds({
        categories: ['bug'],
        changedUris: new Set(['file:///workspace/src/open.ts']),
        scope: 'changedFiles',
      }),
    ).toStrictEqual([])
  })

  it.each([
    ['keyword', 'todo', ['active-todo']],
    ['message', 'CRASH', ['active-bug']],
    ['owner', 'alice', ['active-todo', 'open-fixme']],
    ['rule ID', 'FIXME-PARSER', ['open-fixme']],
  ])('matches a query against %s case-insensitively', (_field, query, ids) => {
    expect(filteredIds({ query })).toStrictEqual(ids)
  })

  it('matches missing and whitespace-only owners only when ownerless results are requested', () => {
    const ownerlessAnnotations = [
      createAnnotation('missing-owner', { owner: undefined }),
      createAnnotation('whitespace-owner', { owner: '  \t ' }),
      createAnnotation('owned', { owner: 'Alice' }),
    ]

    expect(isBeaconOwnerless(ownerlessAnnotations[0])).toBe(true)
    expect(isBeaconOwnerless(ownerlessAnnotations[1])).toBe(true)
    expect(isBeaconOwnerless(ownerlessAnnotations[2])).toBe(false)
    expect(
      filterBeaconAnnotations(ownerlessAnnotations, {
        ...defaultFilter,
        onlyOwnerless: true,
      }).map(annotation => annotation.id),
    ).toStrictEqual(['missing-owner', 'whitespace-owner'])
  })

  it('treats commits strictly before the exact stale cutoff as stale', () => {
    const cutoff = '2026-04-13T00:00:00.000Z'
    const oneMillisecondBefore = '2026-04-12T23:59:59.999Z'
    const oneMillisecondAfter = '2026-04-13T00:00:00.001Z'
    const metadata = (commitDate: string): BeaconGitMetadata => ({
      authorEmail: 'author@example.com',
      authorName: 'Author',
      commitDate,
      hash: 'abc123',
      summary: 'Test commit',
    })

    expect(
      isBeaconStale(metadata(oneMillisecondBefore), 90, defaultFilter.now),
    ).toBe(true)
    expect(isBeaconStale(metadata(cutoff), 90, defaultFilter.now)).toBe(false)
    expect(
      isBeaconStale(metadata(oneMillisecondAfter), 90, defaultFilter.now),
    ).toBe(false)
  })

  it('does not treat missing or invalid metadata as stale', () => {
    const invalidMetadata: BeaconGitMetadata = {
      authorEmail: 'author@example.com',
      authorName: 'Author',
      commitDate: 'not-a-date',
      hash: 'abc123',
      summary: 'Test commit',
    }

    expect(isBeaconStale(undefined, 90, defaultFilter.now)).toBe(false)
    expect(isBeaconStale(invalidMetadata, 90, defaultFilter.now)).toBe(false)
  })

  it('composes ownerless and stale filters with category filtering using AND', () => {
    const metadata = (commitDate: string): BeaconGitMetadata => ({
      authorEmail: 'author@example.com',
      authorName: 'Author',
      commitDate,
      hash: 'abc123',
      summary: 'Test commit',
    })
    const matchingAnnotation = createAnnotation('stale-ownerless-todo', {
      category: 'todo',
      owner: ' ',
    })
    const annotationsToFilter = [
      matchingAnnotation,
      createAnnotation('fresh-ownerless-todo', { category: 'todo' }),
      createAnnotation('stale-owned-todo', {
        category: 'todo',
        owner: 'Alice',
      }),
      createAnnotation('stale-ownerless-bug', { category: 'bug' }),
    ]
    const metadataByAnnotationId = new Map<string, BeaconGitMetadata>([
      ['stale-ownerless-todo', metadata('2026-04-12T23:59:59.999Z')],
      ['fresh-ownerless-todo', metadata('2026-04-13T00:00:00.000Z')],
      ['stale-owned-todo', metadata('2026-04-12T23:59:59.999Z')],
      ['stale-ownerless-bug', metadata('2026-04-12T23:59:59.999Z')],
    ])

    expect(
      filterBeaconAnnotations(annotationsToFilter, {
        ...defaultFilter,
        categories: ['todo'],
        metadataByAnnotationId,
        onlyOwnerless: true,
        onlyStale: true,
      }).map(annotation => annotation.id),
    ).toStrictEqual([matchingAnnotation.id])
  })
})
