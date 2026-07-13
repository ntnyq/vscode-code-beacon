import { describe, expect, it } from 'vitest'
import {
  filterBeaconAnnotations,
  type BeaconExplorerFilter,
} from '../src/core/explorer/filter'
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
  includeIgnored: false,
  includeResolved: false,
  openUris: [],
  owners: [],
  query: '',
  scope: 'workspace',
  severities: [],
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

  it.each([
    ['keyword', 'todo', ['active-todo']],
    ['message', 'CRASH', ['active-bug']],
    ['owner', 'alice', ['active-todo', 'open-fixme']],
    ['rule ID', 'FIXME-PARSER', ['open-fixme']],
  ])('matches a query against %s case-insensitively', (_field, query, ids) => {
    expect(filteredIds({ query })).toStrictEqual(ids)
  })
})
