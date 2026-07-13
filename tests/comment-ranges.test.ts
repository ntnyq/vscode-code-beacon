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

  it('ignores comment delimiters inside quoted strings', () => {
    const text = [
      String.raw`const line = "// TODO: not a comment"`,
      String.raw`const block = '/* FIXME: not a comment */'`,
      '// TODO: actual comment',
    ].join('\n')

    const ranges = getCommentRanges(text, 'typescript')

    expect(
      ranges.map(range => text.slice(range.start, range.end)),
    ).toStrictEqual(['// TODO: actual comment'])
  })

  it('returns non-overlapping ranges when line comments contain block tokens', () => {
    const text = '// TODO: explain /* this token */ without duplicating it'

    const ranges = getCommentRanges(text, 'typescript')

    expect(ranges).toStrictEqual([{ end: text.length, start: 0 }])
  })

  it('does not treat Rust lifetime syntax as a quoted string', () => {
    const text =
      "fn borrow<'a>(value: &'a str) -> &'a str { value } // TODO: document lifetime"

    const ranges = getCommentRanges(text, 'rust')

    expect(
      ranges.map(range => text.slice(range.start, range.end)),
    ).toStrictEqual(['// TODO: document lifetime'])
  })

  it.each([
    {
      comment: '<!-- TODO: html comment -->',
      languageId: 'html',
      text: "<p>It's fine</p><!-- TODO: html comment -->",
    },
    {
      comment: '# TODO: yaml comment',
      languageId: 'yaml',
      text: "message: don't # TODO: yaml comment",
    },
    {
      comment: '# TODO: shell comment',
      languageId: 'shellscript',
      text: String.raw`echo don\'t # TODO: shell comment`,
    },
  ])('finds $languageId comments after non-string apostrophes', entry => {
    const ranges = getCommentRanges(entry.text, entry.languageId)

    expect(
      ranges.map(range => entry.text.slice(range.start, range.end)),
    ).toStrictEqual([entry.comment])
  })

  it.each([
    {
      languageId: 'go',
      text: 'const value = `// TODO: raw string`\n// TODO: go comment',
    },
    {
      languageId: 'yaml',
      text: "message: 'don''t # TODO: quoted'\n# TODO: yaml comment",
    },
  ])('honors $languageId quote escaping semantics', entry => {
    const ranges = getCommentRanges(entry.text, entry.languageId)

    expect(
      ranges.map(range => entry.text.slice(range.start, range.end)),
    ).toStrictEqual([expect.stringContaining('comment')])
  })

  it.each([
    {
      languageId: 'python',
      text: 'value = f"# TODO: formatted string"\n# TODO: python comment',
    },
    {
      languageId: 'python',
      text: 'value = r"# TODO: raw string"\n# TODO: python comment',
    },
    {
      languageId: 'shellscript',
      text: 'echo prefix"# TODO: concatenated string"\n# TODO: shell comment',
    },
  ])('ignores comment tokens in $languageId prefixed strings', entry => {
    const ranges = getCommentRanges(entry.text, entry.languageId)

    expect(
      ranges.map(range => entry.text.slice(range.start, range.end)),
    ).toStrictEqual([expect.stringContaining('comment')])
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
