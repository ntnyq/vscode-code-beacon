import { readFile } from 'node:fs/promises'
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ConfigKeyTypeMap } from '../src/meta'

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
    languageModelTools?: unknown[]
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
      'code-beacon.explain',
      'code-beacon.generateFix',
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
    expect(pkg.contributes.commands).toContainEqual({
      category: 'Code Beacon',
      command: 'code-beacon.explain',
      title: 'Explain Beacon',
    })
    expect(pkg.contributes.commands).toContainEqual({
      category: 'Code Beacon',
      command: 'code-beacon.generateFix',
      title: 'Generate Beacon Fix',
    })
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
      'code-beacon.git.showMetadata',
      'code-beacon.ai.enabled',
      'code-beacon.scm.enabled',
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

  it('declares optional Explorer Git metadata', () => {
    const showMetadata = pkg.contributes.configuration.properties[
      'code-beacon.git.showMetadata'
    ] as { default?: unknown; type?: unknown }

    expect(showMetadata).toStrictEqual({
      default: false,
      description:
        "Show Git author, age, and commit details in Code Beacon Explorer items. This uses VS Code's built-in Git extension only in trusted local desktop workspaces; unavailable Git data and virtual filesystems show no Git metadata.",
      type: 'boolean',
    })
    expectTypeOf<false>().toMatchTypeOf<
      ConfigKeyTypeMap['code-beacon.git.showMetadata']
    >()
  })

  it('declares an opt-in read-only Language Model Tools setting', () => {
    const aiEnabled = pkg.contributes.configuration.properties[
      'code-beacon.ai.enabled'
    ] as { default?: unknown; description?: unknown; type?: unknown }

    expect(aiEnabled).toStrictEqual({
      default: false,
      description:
        'Enable Code Beacon AI features. Read-only Language Model Tools share only already-indexed annotations after confirmation; user-triggered AI commands send only bounded context for the selected annotation.',
      type: 'boolean',
    })
    expectTypeOf<false>().toMatchTypeOf<
      ConfigKeyTypeMap['code-beacon.ai.enabled']
    >()
  })

  it('declares an opt-in read-only Source Control setting', () => {
    const sourceControl = pkg.contributes.configuration.properties[
      'code-beacon.scm.enabled'
    ] as { default?: unknown; description?: unknown; type?: unknown }

    expect(sourceControl).toMatchObject({ default: false, type: 'boolean' })
    expect(sourceControl.description).toContain('read-only')
    expectTypeOf<false>().toMatchTypeOf<
      ConfigKeyTypeMap['code-beacon.scm.enabled']
    >()
  })

  it('supports the changed-files Explorer scope in schema and generated config', () => {
    const explorerScope = pkg.contributes.configuration.properties[
      'code-beacon.explorer.scope'
    ] as { enum?: unknown[] }

    expect(explorerScope.enum).toContain('changedFiles')
    expectTypeOf<'changedFiles'>().toMatchTypeOf<
      ConfigKeyTypeMap['code-beacon.explorer.scope']
    >()
  })

  it('normalizes generated metadata outputs', () => {
    expect(pkg.scripts['generate:meta']).toBe(
      'vscode-ext-gen --output src/meta.ts --scope=code-beacon && node scripts/normalize-generated-meta.mjs && oxfmt README.md',
    )
  })

  it('declares the read-only annotation Language Model Tool', () => {
    expect(pkg.activationEvents).toStrictEqual([
      'onLanguageModelTool:code_beacon_list_annotations',
      'onLanguageModelTool:code_beacon_quality_check',
      'onStartupFinished',
    ])
    expect(pkg.contributes.languageModelTools).toStrictEqual([
      {
        canBeReferencedInPrompt: true,
        displayName: 'List Code Beacon Annotations',
        icon: '$(list-unordered)',
        inputSchema: {
          type: 'object',
          properties: {
            includeIgnored: { default: false, type: 'boolean' },
            includeResolved: { default: false, type: 'boolean' },
            limit: { default: 50, maximum: 100, minimum: 1, type: 'integer' },
            scope: {
              default: 'all',
              enum: ['all', 'activeFile', 'openEditors'],
              type: 'string',
            },
          },
        },
        modelDescription: expect.stringContaining('already-indexed'),
        name: 'code_beacon_list_annotations',
        tags: ['code-beacon', 'annotations', 'read-only'],
        toolReferenceName: 'codeBeaconAnnotations',
        userDescription: expect.stringContaining('already discovered'),
        when: 'config.code-beacon.ai.enabled',
      },
      {
        canBeReferencedInPrompt: true,
        displayName: 'Check Code Beacon Annotation Quality',
        icon: '$(checklist)',
        inputSchema: {
          type: 'object',
          properties: {
            includeIgnored: { default: false, type: 'boolean' },
            includeResolved: { default: false, type: 'boolean' },
            limit: { default: 50, maximum: 100, minimum: 1, type: 'integer' },
            scope: {
              default: 'all',
              enum: ['all', 'activeFile', 'openEditors'],
              type: 'string',
            },
          },
        },
        modelDescription: expect.stringContaining('deterministic'),
        name: 'code_beacon_quality_check',
        tags: ['code-beacon', 'annotations', 'read-only'],
        toolReferenceName: 'codeBeaconAnnotationQuality',
        userDescription: expect.stringContaining('quality'),
        when: 'config.code-beacon.ai.enabled',
      },
    ])
  })

  it('declares the Code Beacon TreeView contribution', () => {
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

  it('declares Explain Beacon for beacon items in the Explorer', () => {
    expect(pkg.contributes.menus?.['view/item/context']).toContainEqual({
      command: 'code-beacon.explain',
      when: 'view == codeBeacon.annotations && viewItem =~ /^beacon/',
    })
  })

  it('declares Generate Beacon Fix for beacon items in the Explorer', () => {
    expect(pkg.contributes.menus?.['view/item/context']).toContainEqual({
      command: 'code-beacon.generateFix',
      when: 'view == codeBeacon.annotations && viewItem =~ /^beacon/',
    })
  })
})
