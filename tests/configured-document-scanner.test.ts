import { describe, expect, it, vi } from 'vitest'
import { createConfiguredDocumentScanner } from '../src/core/scanner/configured-document-scanner'

describe('configured document scanner', () => {
  it('normalizes one configuration and reports rejected rules once', () => {
    const warn = vi.fn<(message: string) => void>()
    const scanner = createConfiguredDocumentScanner({
      allowCustomRegex: false,
      commentOnly: false,
      maxFileSize: 100_000,
      rules: [
        {
          category: 'custom',
          id: 'unsafe-regex',
          label: 'unsafe regex',
          matcher: { pattern: 'REVIEWME', type: 'regex' },
          severity: 'warning',
        },
      ],
      warn,
    })

    const result = scanner.scan({
      languageId: 'typescript',
      source: 'workspace',
      text: ['// TODO: ship it', '// REVIEWME: inspect it'].join('\n'),
      uri: 'file:///workspace/src/example.ts',
    })
    scanner.scan({
      languageId: 'typescript',
      source: 'workspace',
      text: '// TODO: scan again',
      uri: 'file:///workspace/src/second.ts',
    })

    expect(warn).toHaveBeenCalledExactlyOnceWith(
      'Rule unsafe-regex: Regex matcher for rule "unsafe-regex" is disabled in untrusted workspaces',
    )
    expect(result.annotations.map(annotation => annotation.ruleId)).toContain(
      'todo',
    )
    expect(
      result.annotations.map(annotation => annotation.ruleId),
    ).not.toContain('unsafe-regex')
  })

  it('applies the captured scan settings to every document', () => {
    const scanner = createConfiguredDocumentScanner({
      allowCustomRegex: true,
      commentOnly: false,
      maxFileSize: 4,
      rules: [],
      warn: vi.fn<(message: string) => void>(),
    })

    const result = scanner.scan({
      languageId: 'typescript',
      source: 'openEditor',
      text: 'TODO: too large',
      uri: 'file:///workspace/src/large.ts',
    })

    expect(result.annotations).toStrictEqual([])
    expect(result.skipped?.reason).toBe('maxFileSize')
  })
})
