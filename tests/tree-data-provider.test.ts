import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import {
  BeaconTreeDataProvider,
  type BeaconTreeElement,
} from '../src/core/explorer/tree-data-provider'
import type { BeaconGitMetadata } from '../src/core/git/blame'
import { commands } from '../src/meta'
import type { BeaconAnnotation } from '../src/types/annotation'

vi.mock(
  import('vscode'),
  () =>
    ({
      EventEmitter: class EventEmitter {
        public readonly event = vi.fn<() => void>()
        public readonly fire = vi.fn<() => void>()
      },
      ThemeIcon: class ThemeIcon {
        public readonly id: string

        public constructor(id: string) {
          this.id = id
        }
      },
      TreeItem: class TreeItem {
        public readonly label: string
        public readonly collapsibleState: number

        public constructor(label: string, collapsibleState: number) {
          this.label = label
          this.collapsibleState = collapsibleState
        }
      },
      TreeItemCollapsibleState: {
        Collapsed: 1,
        None: 0,
      },
      Uri: {
        parse: (value: string) => ({ value }),
      },
    }) as unknown as Partial<typeof Vscode>,
)

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
    uri: 'file:///workspace/src/a.ts',
    ...overrides,
  }
}

describe(BeaconTreeDataProvider, () => {
  it('groups annotations by file', async () => {
    const provider = new BeaconTreeDataProvider(() => [
      createAnnotation('a'),
      createAnnotation('b', {
        id: 'b',
        uri: 'file:///workspace/src/b.ts',
      }),
    ])

    const roots = (await provider.getChildren()) as BeaconTreeElement[]

    expect(roots).toHaveLength(2)
    expect(
      roots.map(item => (item.type === 'group' ? item.label : '')),
    ).toStrictEqual([
      'file:///workspace/src/a.ts',
      'file:///workspace/src/b.ts',
    ])
  })

  it('groups annotations by captured owner when available', async () => {
    const provider = new BeaconTreeDataProvider(
      () => [
        createAnnotation('a', {
          owner: 'alice',
        }),
        createAnnotation('b', {
          owner: 'bob',
        }),
        createAnnotation('c'),
      ],
      () => 'owner',
    )

    const roots = (await provider.getChildren()) as BeaconTreeElement[]

    expect(
      roots.map(item => (item.type === 'group' ? item.label : '')),
    ).toStrictEqual(['Unassigned', 'alice', 'bob'])
  })

  it('returns beacon leaves for a group', async () => {
    const annotation = createAnnotation('a')
    const provider = new BeaconTreeDataProvider(() => [annotation])
    const [group] = (await provider.getChildren()) as BeaconTreeElement[]

    await expect(
      Promise.resolve(provider.getChildren(group)),
    ).resolves.toStrictEqual([
      {
        annotation,
        type: 'beacon',
      },
    ])
  })

  it('returns leaves in source-location order', async () => {
    const provider = new BeaconTreeDataProvider(() => [
      createAnnotation('later-column', { column: 8, line: 1 }),
      createAnnotation('second-file', {
        column: 0,
        line: 0,
        uri: 'file:///workspace/src/b.ts',
      }),
      createAnnotation('earlier-line', { column: 9, line: 0 }),
      createAnnotation('earlier-column', { column: 2, line: 1 }),
    ])

    const roots = (await provider.getChildren()) as BeaconTreeElement[]
    const leaves = (await provider.getChildren(roots[0])) as BeaconTreeElement[]

    expect(
      leaves.map(item => (item.type === 'beacon' ? item.annotation.id : '')),
    ).toStrictEqual(['earlier-line', 'earlier-column', 'later-column'])
  })

  it('creates revealable beacon tree items', () => {
    const annotation = createAnnotation('a')
    const provider = new BeaconTreeDataProvider(() => [annotation])
    const item = provider.getTreeItem({ annotation, type: 'beacon' })

    expect(item.contextValue).toBe('beacon')
    expect(item.command).toMatchObject({
      arguments: [annotation],
      command: commands.reveal,
    })
    expect(item.description).toBe('2:4')
  })

  it('presents optional Git metadata in beacon tree items', () => {
    const annotation = createAnnotation('a', {
      ignored: true,
      owner: 'Ada',
      resolved: true,
    })
    const metadataByAnnotationId = new Map<string, BeaconGitMetadata>([
      [
        annotation.id,
        {
          authorName: 'Grace Hopper',
          commitDate: '2026-07-11T12:00:00.000Z',
          hash: '1234567890abcdef',
          summary: 'Document metadata presentation',
        },
      ],
    ])
    const provider = new BeaconTreeDataProvider(
      () => [annotation],
      () => 'file',
      () => metadataByAnnotationId,
      () => new Date('2026-07-12T12:00:00.000Z'),
    )
    const item = provider.getTreeItem({ annotation, type: 'beacon' })

    expect(item.description).toBe(
      '2:4 • @Ada • Grace Hopper • 1 day ago • resolved • ignored',
    )
    expect(item.tooltip).toContain('Owner: @Ada')
    expect(item.tooltip).toContain('State: resolved, ignored')
    expect(item.tooltip).toContain('Git:')
    expect(item.tooltip).toContain('Author: Grace Hopper')
  })

  it('retains compact descriptions and provides base tooltips without Git metadata', () => {
    const annotation = createAnnotation('a')
    const provider = new BeaconTreeDataProvider(() => [annotation])
    const item = provider.getTreeItem({ annotation, type: 'beacon' })

    expect(item.description).toBe('2:4')
    expect(item.tooltip).toContain('Owner: Unassigned')
    expect(item.tooltip).toContain('State: active')
    expect(item.tooltip).not.toContain('Git:')
  })

  it('omits whitespace-only owners from compact descriptions without Git metadata', () => {
    const annotation = createAnnotation('a', { owner: '   ' })
    const provider = new BeaconTreeDataProvider(() => [annotation])
    const item = provider.getTreeItem({ annotation, type: 'beacon' })

    expect(item.description).toBe('2:4')
    expect(item.tooltip).toContain('Owner: Unassigned')
  })

  it('includes resolved and ignored state in beacon tree item context', () => {
    const annotation = createAnnotation('a', {
      ignored: true,
      resolved: true,
    })
    const provider = new BeaconTreeDataProvider(() => [annotation])
    const item = provider.getTreeItem({ annotation, type: 'beacon' })

    expect(item.contextValue).toBe('beaconResolvedIgnored')
    expect(item.description).toBe('2:4 resolved ignored')
  })
})
