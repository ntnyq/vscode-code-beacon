import { describe, expect, it } from 'vitest'
import { getCommentRanges } from '../src/core/scanner/comment-ranges'

describe('comment ranges', () => {
  it('finds TypeScript line and block comments', () => {
    const text = [
      'const value = "TODO: not a comment"',
      '// TODO: line comment',
      'const next = 1',
      '/* FIXME: block comment */',
    ].join('\n')

    const ranges = getCommentRanges(text, 'typescript')
    const comments = ranges.map(range => text.slice(range.start, range.end))

    expect(comments).toStrictEqual([
      '// TODO: line comment',
      '/* FIXME: block comment */',
    ])
  })

  it('finds Python comments', () => {
    const text = 'value = "TODO: not a comment"\n# TODO: python comment'

    const ranges = getCommentRanges(text, 'python')

    expect(
      ranges.map(range => text.slice(range.start, range.end)),
    ).toStrictEqual(['# TODO: python comment'])
  })

  it('falls back to the whole document for unknown languages', () => {
    const text = 'TODO: fallback'

    expect(getCommentRanges(text, 'unknown-language')).toStrictEqual([
      {
        end: text.length,
        fallback: true,
        start: 0,
      },
    ])
  })
})
