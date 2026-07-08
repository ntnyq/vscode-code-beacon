import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as {
  activationEvents: string[]
  categories: string[]
  keywords: string[]
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
      'code-beacon.debug',
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
      'code-beacon.codelens.enabled',
      'code-beacon.hover.enabled',
      'code-beacon.export.defaultFormat',
    ])
  })

  it('declares the Code Beacon TreeView contribution', () => {
    expect(pkg.activationEvents).toContain('onView:codeBeacon.annotations')
    expect(pkg.contributes.viewsContainers?.activitybar).toStrictEqual([
      {
        id: 'codeBeacon',
        title: 'Code Beacon',
        icon: './res/icon.png',
      },
    ])
    expect(pkg.contributes.views?.codeBeacon).toStrictEqual([
      {
        id: 'codeBeacon.annotations',
        name: 'Beacons',
        when: 'config.code-beacon.explorer.enabled',
      },
    ])
  })
})
