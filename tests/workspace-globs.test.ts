import { describe, expect, it } from 'vitest'
import {
  enabledExcludePatterns,
  toGlobUnion,
} from '../src/core/workspace/globs'

describe('workspace globs', () => {
  it('returns a single glob unchanged', () => {
    expect(toGlobUnion(['**/*.ts'])).toBe('**/*.ts')
  })

  it('joins multiple globs with brace expansion', () => {
    expect(toGlobUnion(['**/*.ts', '**/*.tsx'])).toBe('{**/*.ts,**/*.tsx}')
  })

  it('falls back when all globs are empty', () => {
    expect(toGlobUnion(['', '  '], '**/*')).toBe('**/*')
  })

  it('keeps enabled VS Code exclude patterns only', () => {
    expect(
      enabledExcludePatterns({
        '**/*.map': true,
        '**/*.md': false,
        '**/*.tmp': { when: '$(basename).ts' },
      }),
    ).toStrictEqual(['**/*.map', '**/*.tmp'])
  })
})
