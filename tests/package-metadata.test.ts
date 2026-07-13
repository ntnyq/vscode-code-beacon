import { readFile } from 'node:fs/promises'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
  activationEvents: string[]
  categories: string[]
  keywords: string[]
  scripts: Record<string, string>
  extensionKind?: string[]
  capabilities: {
    virtualWorkspaces: { supported: boolean }
    untrustedWorkspaces: {
      supported: boolean | 'limited'
      restrictedConfigurations: string[]
    }
  }
  contributes: {
    commands: { command: string; title: string }[]
    configuration: { properties: Record<string, unknown> }
    viewsContainers?: { activitybar: { id: string; title: string }[] }
    views?: { codeBeacon: { id: string; name: string; when?: string }[] }
    menus?: {
      'view/item/context': {
        command: string
        group?: string
        when: string
      }[]
    }
  }
}

describe('package metadata', () => {
  it('declares marketplace metadata for Code Beacon', () => {
    expect(pkg.categories).toStrictEqual(['Linters', 'Other', 'Visualization'])
    expect(pkg.keywords).toContain('todo')
    expect(pkg.keywords).toContain('annotation')
    expect(pkg.keywords).toContain('problems')
    expect(pkg.extensionKind).toStrictEqual(['ui', 'workspace'])
    expect(pkg.capabilities.virtualWorkspaces.supported).toBe(true)
    expect(pkg.capabilities.untrustedWorkspaces.supported).toBe('limited')
    expect(
      pkg.capabilities.untrustedWorkspaces.restrictedConfigurations,
    ).toStrictEqual(['code-beacon.rules'])
  })

  it('declares the publishable command surface', () => {
    const commandIds = pkg.contributes.commands.map(command => command.command)

    expect(commandIds).toStrictEqual([
      'code-beacon.enable',
      'code-beacon.disable',
      'code-beacon.toggle',
      'code-beacon.refresh',
      'code-beacon.scanWorkspace',
      'code-beacon.scanActiveFile',
      'code-beacon.scanOpenEditors',
      'code-beacon.focusExplorer',
      'code-beacon.reveal',
      'code-beacon.copyLink',
      'code-beacon.copyMarkdown',
      'code-beacon.createIssue',
      'code-beacon.resolve',
      'code-beacon.unresolve',
      'code-beacon.ignore',
      'code-beacon.unignore',
      'code-beacon.exportMarkdown',
      'code-beacon.exportJson',
      'code-beacon.exportCsv',
      'code-beacon.openSettings',
      'code-beacon.clearCache',
    ])
  })

  it('declares configuration keys used by the MVP runtime', () => {
    const keys = Object.keys(pkg.contributes.configuration.properties)

    expect(keys).toStrictEqual([
      'code-beacon.enable',
      'code-beacon.languages',
      'code-beacon.rules',
      'code-beacon.include',
      'code-beacon.exclude',
      'code-beacon.respectFilesExclude',
      'code-beacon.respectSearchExclude',
      'code-beacon.maxFileSize',
      'code-beacon.maxFilesForSearch',
      'code-beacon.scanMode',
      'code-beacon.commentOnly',
      'code-beacon.decorations.enabled',
      'code-beacon.diagnostics.mode',
      'code-beacon.explorer.enabled',
      'code-beacon.explorer.groupBy',
      'code-beacon.explorer.scope',
      'code-beacon.explorer.categories',
      'code-beacon.explorer.severities',
      'code-beacon.explorer.owners',
      'code-beacon.explorer.query',
      'code-beacon.explorer.includeResolved',
      'code-beacon.explorer.includeIgnored',
      'code-beacon.explorer.onlyStale',
      'code-beacon.explorer.onlyOwnerless',
      'code-beacon.git.staleDays',
      'code-beacon.codelens.enabled',
      'code-beacon.hover.enabled',
    ])
  })

  it('requires a positive integer stale-days setting', () => {
    const staleDays = pkg.contributes.configuration.properties[
      'code-beacon.git.staleDays'
    ] as {
      default?: unknown
      minimum?: unknown
      type?: unknown
    }

    expect(staleDays).toMatchObject({
      default: 90,
      minimum: 1,
      type: 'integer',
    })
    expect(staleDays.type).not.toBe('number')
  })

  it('normalizes generated metadata outputs', () => {
    expect(pkg.scripts['generate:meta']).toBe(
      'vscode-ext-gen --output src/meta.ts --scope=code-beacon && node scripts/normalize-generated-meta.mjs && oxfmt README.md',
    )
  })

  it('declares the Code Beacon TreeView contribution', () => {
    expect(pkg.activationEvents).toStrictEqual(['onStartupFinished'])
    expect(pkg.contributes.viewsContainers?.activitybar).toStrictEqual([
      {
        id: 'codeBeacon',
        title: 'Code Beacon',
        icon: './res/icon.png',
      },
    ])
    expect(pkg.contributes.views?.codeBeacon).toStrictEqual([
      {
        icon: './res/icon.png',
        id: 'codeBeacon.annotations',
        name: 'Beacons',
        when: 'config.code-beacon.explorer.enabled',
      },
    ])
  })

  it('declares Create Issue Body for beacon items in the Explorer', () => {
    expect(pkg.contributes.menus?.['view/item/context']).toContainEqual({
      command: 'code-beacon.createIssue',
      when: 'view == codeBeacon.annotations && viewItem =~ /^beacon/',
    })
  })
})
