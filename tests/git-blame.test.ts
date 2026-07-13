import { describe, expect, it } from 'vitest'
import {
  BeaconGitMetadataCache,
  parseBlameCommitHash,
} from '../src/core/git/blame'
import type { BeaconGitMetadata } from '../src/core/git/blame'

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

describe(BeaconGitMetadataCache, () => {
  const metadata: BeaconGitMetadata = {
    authorEmail: 'ada@example.com',
    authorName: 'Ada Lovelace',
    commitDate: '2026-07-12T04:00:00.000Z',
    hash: 'a1b2c3d4',
    summary: 'Add the answer',
  }

  it('returns cached metadata for an identical URI, version, and line', () => {
    const cache = new BeaconGitMetadataCache()

    cache.set('file:///workspace/answer.ts', 3, 1, metadata)

    expect(cache.get('file:///workspace/answer.ts', 3, 1)).toBe(metadata)
  })

  it('misses when the URI changes', () => {
    const cache = new BeaconGitMetadataCache()

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
    const cache = new BeaconGitMetadataCache()

    cache.set('file:///workspace/answer.ts', 3, 1, metadata)

    expect(
      cache.get('file:///workspace/answer.ts', version, line),
    ).toBeUndefined()
  })
})
