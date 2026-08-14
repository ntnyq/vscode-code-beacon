import { readFile } from 'node:fs/promises'
import { beforeAll, describe, expect, expectTypeOf, it } from 'vitest'
import type { ConfigKeyTypeMap } from '../src/meta'

let pkg: {
  activationEvents: string[]
  categories: string[]
  displayName: string
  homepage: string
  keywords: string[]
  name: string
  publisher: string
  repository: { type: string; url: string }
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
    views?: { annopulse: { id: string; name: string; when?: string }[] }
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
  beforeAll(async () => {
    pkg = JSON.parse(await readFile('package.json', 'utf8')) as typeof pkg
  })

  it('declares marketplace metadata for AnnoPulse', () => {
    expect(`${pkg.publisher}.${pkg.name}`).toBe('ntnyq.annopulse')
    expect(pkg.displayName).toBe('AnnoPulse')
    expect(pkg.homepage).toBe('https://github.com/ntnyq/vscode-annopulse')
    expect(pkg.repository).toStrictEqual({
      type: 'git',
      url: 'git+https://github.com/ntnyq/vscode-annopulse.git',
    })
    expect(pkg.categories).toStrictEqual(['Linters', 'Other', 'Visualization'])
    expect(pkg.keywords).toContain('todo')
    expect(pkg.keywords).toContain('annotation')
    expect(pkg.keywords).toContain('problems')
    expect(pkg.extensionKind).toStrictEqual(['ui', 'workspace'])
    expect(pkg.capabilities.virtualWorkspaces.supported).toBe(true)
    expect(pkg.capabilities.untrustedWorkspaces.supported).toBe('limited')
    expect(
      pkg.capabilities.untrustedWorkspaces.restrictedConfigurations,
    ).toStrictEqual(['annopulse.rules'])
  })

  it('declares the publishable command surface', () => {
    const commandIds = pkg.contributes.commands.map(command => command.command)

    expect(commandIds).toStrictEqual([
      'annopulse.enable',
      'annopulse.disable',
      'annopulse.toggle',
      'annopulse.refresh',
      'annopulse.scanWorkspace',
      'annopulse.scanActiveFile',
      'annopulse.scanOpenEditors',
      'annopulse.focusExplorer',
      'annopulse.reveal',
      'annopulse.copyLink',
      'annopulse.copyMarkdown',
      'annopulse.createIssue',
      'annopulse.explain',
      'annopulse.generateFix',
      'annopulse.summarizeWorkspace',
      'annopulse.resolve',
      'annopulse.unresolve',
      'annopulse.ignore',
      'annopulse.unignore',
      'annopulse.exportMarkdown',
      'annopulse.exportJson',
      'annopulse.exportCsv',
      'annopulse.openSettings',
      'annopulse.clearCache',
    ])
    expect(pkg.contributes.commands).toContainEqual({
      category: 'AnnoPulse',
      command: 'annopulse.explain',
      title: 'Explain Annotation',
    })
    expect(pkg.contributes.commands).toContainEqual({
      category: 'AnnoPulse',
      command: 'annopulse.generateFix',
      title: 'Generate Annotation Fix',
    })
    expect(pkg.contributes.commands).toContainEqual({
      category: 'AnnoPulse',
      command: 'annopulse.summarizeWorkspace',
      title: 'Summarize Workspace Annotations',
    })
  })

  it('declares configuration keys used by the MVP runtime', () => {
    const keys = Object.keys(pkg.contributes.configuration.properties)

    expect(keys).toStrictEqual([
      'annopulse.enable',
      'annopulse.languages',
      'annopulse.rules',
      'annopulse.include',
      'annopulse.exclude',
      'annopulse.respectFilesExclude',
      'annopulse.respectSearchExclude',
      'annopulse.maxFileSize',
      'annopulse.maxFilesForSearch',
      'annopulse.scanMode',
      'annopulse.commentOnly',
      'annopulse.decorations.enabled',
      'annopulse.diagnostics.mode',
      'annopulse.explorer.enabled',
      'annopulse.explorer.groupBy',
      'annopulse.explorer.scope',
      'annopulse.explorer.categories',
      'annopulse.explorer.severities',
      'annopulse.explorer.owners',
      'annopulse.explorer.query',
      'annopulse.explorer.includeResolved',
      'annopulse.explorer.includeIgnored',
      'annopulse.explorer.onlyStale',
      'annopulse.explorer.onlyOwnerless',
      'annopulse.git.staleDays',
      'annopulse.git.showMetadata',
      'annopulse.ai.enabled',
      'annopulse.scm.enabled',
      'annopulse.codelens.enabled',
      'annopulse.hover.enabled',
    ])
  })

  it('requires a positive integer stale-days setting', () => {
    const staleDays = pkg.contributes.configuration.properties[
      'annopulse.git.staleDays'
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
      'annopulse.git.showMetadata'
    ] as { default?: unknown; type?: unknown }

    expect(showMetadata).toStrictEqual({
      default: false,
      description:
        "Show Git author, age, and commit details in AnnoPulse Explorer items. This uses VS Code's built-in Git extension only in trusted local desktop workspaces; unavailable Git data and virtual filesystems show no Git metadata.",
      type: 'boolean',
    })
    expectTypeOf<false>().toMatchTypeOf<
      ConfigKeyTypeMap['annopulse.git.showMetadata']
    >()
  })

  it('declares an opt-in read-only Language Model Tools setting', () => {
    const aiEnabled = pkg.contributes.configuration.properties[
      'annopulse.ai.enabled'
    ] as { default?: unknown; description?: unknown; type?: unknown }

    expect(aiEnabled).toStrictEqual({
      default: false,
      description:
        'Enable AnnoPulse AI features. Read-only Language Model Tools share only already-indexed annotations after confirmation; user-triggered AI commands send only bounded context for a selected annotation or a bounded summary of already-indexed workspace annotations.',
      type: 'boolean',
    })
    expectTypeOf<false>().toMatchTypeOf<
      ConfigKeyTypeMap['annopulse.ai.enabled']
    >()
  })

  it('declares an opt-in read-only Source Control setting', () => {
    const sourceControl = pkg.contributes.configuration.properties[
      'annopulse.scm.enabled'
    ] as { default?: unknown; description?: unknown; type?: unknown }

    expect(sourceControl).toMatchObject({ default: false, type: 'boolean' })
    expect(sourceControl.description).toContain('read-only')
    expectTypeOf<false>().toMatchTypeOf<
      ConfigKeyTypeMap['annopulse.scm.enabled']
    >()
  })

  it('supports the changed-files Explorer scope in schema and generated config', () => {
    const explorerScope = pkg.contributes.configuration.properties[
      'annopulse.explorer.scope'
    ] as { enum?: unknown[] }

    expect(explorerScope.enum).toContain('changedFiles')
    expectTypeOf<'changedFiles'>().toMatchTypeOf<
      ConfigKeyTypeMap['annopulse.explorer.scope']
    >()
  })

  it('normalizes generated metadata outputs', () => {
    expect(pkg.scripts['generate:meta']).toBe(
      'vscode-ext-gen --output src/meta.ts --scope=annopulse && node scripts/normalize-generated-meta.mjs && oxfmt README.md',
    )
  })

  it('declares the read-only annotation Language Model Tool', () => {
    expect(pkg.activationEvents).toStrictEqual([
      'onLanguageModelTool:annopulse_list_annotations',
      'onLanguageModelTool:annopulse_quality_check',
      'onStartupFinished',
    ])
    expect(pkg.contributes.languageModelTools).toStrictEqual([
      {
        canBeReferencedInPrompt: true,
        displayName: 'List AnnoPulse Annotations',
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
        name: 'annopulse_list_annotations',
        tags: ['annopulse', 'annotations', 'read-only'],
        toolReferenceName: 'annopulseAnnotations',
        userDescription: expect.stringContaining('already discovered'),
        when: 'config.annopulse.ai.enabled',
      },
      {
        canBeReferencedInPrompt: true,
        displayName: 'Check AnnoPulse Annotation Quality',
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
        name: 'annopulse_quality_check',
        tags: ['annopulse', 'annotations', 'read-only'],
        toolReferenceName: 'annopulseAnnotationQuality',
        userDescription: expect.stringContaining('quality'),
        when: 'config.annopulse.ai.enabled',
      },
    ])
  })

  it('declares the AnnoPulse TreeView contribution', () => {
    expect(pkg.contributes.viewsContainers?.activitybar).toStrictEqual([
      {
        id: 'annopulse',
        title: 'AnnoPulse',
        icon: './res/icon.png',
      },
    ])
    expect(pkg.contributes.views?.annopulse).toStrictEqual([
      {
        icon: './res/icon.png',
        id: 'annopulse.annotations',
        name: 'Annotations',
        when: 'config.annopulse.explorer.enabled',
      },
    ])
  })

  it('declares Create Issue Body for annopulse items in the Explorer', () => {
    expect(pkg.contributes.menus?.['view/item/context']).toContainEqual({
      command: 'annopulse.createIssue',
      when: 'view == annopulse.annotations && viewItem =~ /^annopulse/',
    })
  })

  it('declares Explain Annotation for annopulse items in the Explorer', () => {
    expect(pkg.contributes.menus?.['view/item/context']).toContainEqual({
      command: 'annopulse.explain',
      when: 'view == annopulse.annotations && viewItem =~ /^annopulse/',
    })
  })

  it('declares Generate Annotation Fix for annopulse items in the Explorer', () => {
    expect(pkg.contributes.menus?.['view/item/context']).toContainEqual({
      command: 'annopulse.generateFix',
      when: 'view == annopulse.annotations && viewItem =~ /^annopulse/',
    })
  })

  it('keeps the workspace-wide summary out of the Explorer item menu', () => {
    expect(pkg.contributes.menus?.['view/item/context']).not.toContainEqual(
      expect.objectContaining({
        command: 'annopulse.summarizeWorkspace',
      }),
    )
  })
})
