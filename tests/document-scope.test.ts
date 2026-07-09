import { describe, expect, it } from 'vitest'
import { isScannableTextDocument } from '../src/core/workspace/documents'

describe('document scope', () => {
  it('allows readable virtual workspace documents', () => {
    expect(
      isScannableTextDocument(
        {
          languageId: 'typescript',
          uri: {
            scheme: 'vscode-vfs',
          },
        },
        ['*'],
      ),
    ).toBe(true)
  })

  it('honors language exclusions for non-file documents', () => {
    expect(
      isScannableTextDocument(
        {
          languageId: 'markdown',
          uri: {
            scheme: 'vscode-vfs',
          },
        },
        ['*', '!markdown'],
      ),
    ).toBe(false)
  })

  it('skips non-source output documents', () => {
    expect(
      isScannableTextDocument(
        {
          languageId: 'log',
          uri: {
            scheme: 'output',
          },
        },
        ['*'],
      ),
    ).toBe(false)
  })
})
