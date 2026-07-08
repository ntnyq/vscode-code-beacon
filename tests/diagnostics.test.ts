import { describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import {
  createBeaconDiagnostic,
  diagnosticSeverityForBeacon,
} from '../src/core/diagnostics/beacon-diagnostics'
import type { BeaconAnnotation } from '../src/types/annotation'

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
  overrides: Partial<BeaconAnnotation> = {},
): BeaconAnnotation {
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

describe('beacon diagnostics', () => {
  it('maps beacon severity to VS Code diagnostic severity', () => {
    expect(diagnosticSeverityForBeacon('error')).toBe(0)
    expect(diagnosticSeverityForBeacon('warning')).toBe(1)
    expect(diagnosticSeverityForBeacon('information')).toBe(2)
    expect(diagnosticSeverityForBeacon('hint')).toBe(3)
  })

  it('creates source-tagged diagnostics from annotations', () => {
    const diagnostic = createBeaconDiagnostic(createAnnotation())

    expect(diagnostic.message).toBe('TODO: ship it')
    expect(diagnostic.severity).toBe(2)
    expect(diagnostic.source).toBe('Code Beacon')
  })
})
