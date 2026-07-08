import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import {
  BeaconTreeDataProvider,
  type BeaconTreeElement,
} from '../src/core/explorer/tree-data-provider'
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

  it('returns beacon leaves for a group', async () => {
    const annotation = createAnnotation('a')
    const provider = new BeaconTreeDataProvider(() => [annotation])
    const [group] = (await provider.getChildren()) as BeaconTreeElement[]

    expect(await provider.getChildren(group)).toStrictEqual([
      {
        annotation,
        type: 'beacon',
      },
    ])
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
})
