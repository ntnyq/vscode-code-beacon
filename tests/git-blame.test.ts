import { describe, expect, it } from 'vitest'
import {
  AnnoPulseGitMetadataCache,
  MAX_ANNOPULSE_GIT_METADATA_CACHE_ENTRIES,
  parseBlameCommitHash,
} from '../src/core/git/blame'
import type { AnnoPulseGitMetadata } from '../src/core/git/blame'

describe('git blame commit hash parsing', () => {
  it.each([
    {
      expected: 'a1b2c3d4',
      line: 0,
      name: 'an ordinary blame row',
      output:
        'a1b2c3d4 (Ada Lovelace 2026-07-12 12:00:00 +0800 1) const answer = 42;',
    },
    {
      expected: 'deadbeef',
      line: 1,
      name: 'a boundary blame row',
      output: [
        'a1b2c3d4 (Ada Lovelace 2026-07-12 12:00:00 +0800 1) const answer = 42;',
        '^deadbeef (Not Committed Yet 2026-07-12 12:00:00 +0800 2) export {};',
      ].join('\n'),
    },
    {
      expected: undefined,
      line: 0,
      name: 'blank output',
      output: '',
    },
    {
      expected: undefined,
      line: 0,
      name: 'a malformed row',
      output:
        'not-a-hash (Ada Lovelace 2026-07-12 12:00:00 +0800 1) const answer = 42;',
    },
    {
      expected: undefined,
      line: 1,
      name: 'an out-of-range line',
      output:
        'a1b2c3d4 (Ada Lovelace 2026-07-12 12:00:00 +0800 1) const answer = 42;',
    },
  ])('returns $expected for $name', ({ output, line, expected }) => {
    expect(parseBlameCommitHash(output, line)).toBe(expected)
  })
})

describe(AnnoPulseGitMetadataCache, () => {
  const metadata: AnnoPulseGitMetadata = {
    authorEmail: 'ada@example.com',
    authorName: 'Ada Lovelace',
    commitDate: '2026-07-12T04:00:00.000Z',
    hash: 'a1b2c3d4',
    summary: 'Add the answer',
  }

  it('returns cached metadata for an identical URI, version, and line', () => {
    const cache = new AnnoPulseGitMetadataCache()

    cache.set('file:///workspace/answer.ts', 3, 1, metadata)

    expect(cache.get('file:///workspace/answer.ts', 3, 1)).toBe(metadata)
  })

  it('misses when the URI changes', () => {
    const cache = new AnnoPulseGitMetadataCache()

    cache.set('file:///workspace/answer.ts', 3, 1, metadata)

    expect(cache.get('file:///workspace/other.ts', 3, 1)).toBeUndefined()
  })

  it.each([
    {
      line: 1,
      name: 'the document version changes',
      version: 4,
    },
    {
      line: 2,
      name: 'the line changes',
      version: 3,
    },
  ])('misses when $name', ({ version, line }) => {
    const cache = new AnnoPulseGitMetadataCache()

    cache.set('file:///workspace/answer.ts', 3, 1, metadata)

    expect(
      cache.get('file:///workspace/answer.ts', version, line),
    ).toBeUndefined()
  })

  it('evicts the least recently used metadata when capacity is reached', () => {
    const cache = new AnnoPulseGitMetadataCache()

    for (
      let index = 0;
      index <= MAX_ANNOPULSE_GIT_METADATA_CACHE_ENTRIES;
      index++
    ) {
      cache.set(`file:///workspace/${index}.ts`, 1, 0, metadata)
    }

    expect(cache.get('file:///workspace/0.ts', 1, 0)).toBeUndefined()
    expect(
      cache.get(
        `file:///workspace/${MAX_ANNOPULSE_GIT_METADATA_CACHE_ENTRIES}.ts`,
        1,
        0,
      ),
    ).toBe(metadata)
  })
})
