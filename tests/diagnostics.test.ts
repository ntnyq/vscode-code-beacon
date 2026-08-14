import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import {
  createAnnoPulseDiagnostic,
  diagnosticsByUriForAnnotations,
  diagnosticSeverityForAnnoPulse,
} from '../src/core/diagnostics/annopulse-diagnostics'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

vi.mock(
  import('vscode'),
  () =>
    ({
      Diagnostic: class Diagnostic {
        public source?: string
        public readonly range: unknown
        public readonly message: string
        public readonly severity: number

        public constructor(range: unknown, message: string, severity: number) {
          this.range = range
          this.message = message
          this.severity = severity
        }
      },
      DiagnosticSeverity: {
        Error: 0,
        Hint: 3,
        Information: 2,
        Warning: 1,
      },
      Range: class Range {
        public readonly startLine: number
        public readonly startCharacter: number
        public readonly endLine: number
        public readonly endCharacter: number

        public constructor(
          startLine: number,
          startCharacter: number,
          endLine: number,
          endCharacter: number,
        ) {
          this.startLine = startLine
          this.startCharacter = startCharacter
          this.endLine = endLine
          this.endCharacter = endCharacter
        }
      },
    }) as unknown as Partial<typeof Vscode>,
)

function createAnnotation(
  overrides: Partial<AnnoPulseAnnotation> = {},
): AnnoPulseAnnotation {
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

describe('annopulse diagnostics', () => {
  it('maps annopulse severity to VS Code diagnostic severity', () => {
    expect(diagnosticSeverityForAnnoPulse('error')).toBe(0)
    expect(diagnosticSeverityForAnnoPulse('warning')).toBe(1)
    expect(diagnosticSeverityForAnnoPulse('information')).toBe(2)
    expect(diagnosticSeverityForAnnoPulse('hint')).toBe(3)
  })

  it('creates source-tagged diagnostics from annotations', () => {
    const diagnostic = createAnnoPulseDiagnostic(createAnnotation())

    expect(diagnostic.message).toBe('TODO: ship it')
    expect(diagnostic.severity).toBe(2)
    expect(diagnostic.source).toBe('AnnoPulse')
  })

  it('filters diagnostics by mode and open document URIs', () => {
    const diagnostics = diagnosticsByUriForAnnotations(
      [
        createAnnotation(),
        createAnnotation({
          id: 'workspace',
          source: 'workspace',
          uri: 'file:///workspace/src/closed.ts',
        }),
      ],
      'openFiles',
      new Set(['file:///workspace/src/a.ts']),
    )

    expect([...diagnostics.keys()]).toStrictEqual([
      'file:///workspace/src/a.ts',
    ])
  })

  it('honors per-rule diagnostic settings', () => {
    const diagnostics = diagnosticsByUriForAnnotations(
      [
        createAnnotation({
          diagnostics: {
            enabled: false,
          },
        }),
        createAnnotation({
          diagnostics: {
            severity: 'error',
          },
          id: 'error',
          uri: 'file:///workspace/src/b.ts',
        }),
      ],
      'workspace',
    )

    expect(diagnostics.get('file:///workspace/src/a.ts')).toBeUndefined()
    expect(diagnostics.get('file:///workspace/src/b.ts')?.[0]?.severity).toBe(0)
  })

  it('does not publish resolved or ignored annotations', () => {
    const diagnostics = diagnosticsByUriForAnnotations(
      [
        createAnnotation({
          id: 'resolved',
          resolved: true,
        }),
        createAnnotation({
          id: 'ignored',
          ignored: true,
        }),
      ],
      'workspace',
    )

    expect(diagnostics.size).toBe(0)
  })
})
