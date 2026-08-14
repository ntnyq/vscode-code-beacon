import { describe, expect, it, vi } from 'vitest'
import {
  AnnoPulseExplorerGitMetadataIndex,
  type AnnoPulseExplorerMetadataResolver,
} from '../src/core/explorer/git-metadata-index'
import type { AnnoPulseGitMetadata } from '../src/core/git/blame'
import type { AnnoPulseAnnotation } from '../src/types/annotation'

interface Deferred<T> {
  readonly promise: Promise<T>
  readonly reject: (reason?: unknown) => void
  readonly resolve: (value: T) => void
}

function deferred<T>(): Deferred<T> {
  let reject!: (reason?: unknown) => void
  let resolve!: (value: T) => void
  // oxlint-disable-next-line promise/avoid-new -- Tests control resolver completion explicitly.
  const promise = new Promise<T>((_resolve, _reject) => {
    resolve = _resolve
    reject = _reject
  })

  return { promise, reject, resolve }
}

function annotation(id: string): AnnoPulseAnnotation {
  return { id } as AnnoPulseAnnotation
}

function metadata(hash: string): AnnoPulseGitMetadata {
  return {
    authorName: 'Ada Lovelace',
    commitDate: '2020-01-01T00:00:00.000Z',
    hash,
    summary: 'Add metadata',
  }
}

describe(AnnoPulseExplorerGitMetadataIndex, () => {
  it('publishes metadata after each sequential target resolves', async () => {
    const first = deferred<ReadonlyMap<string, AnnoPulseGitMetadata>>()
    const second = deferred<ReadonlyMap<string, AnnoPulseGitMetadata>>()
    const onUpdate = vi.fn<() => void>()
    const resolve = vi.fn<AnnoPulseExplorerMetadataResolver<string>>(
      document => (document === 'first' ? first.promise : second.promise),
    )
    const index = new AnnoPulseExplorerGitMetadataIndex<string>()

    const hydration = index.hydrate(
      [
        { annotations: [annotation('first')], document: 'first' },
        { annotations: [annotation('second')], document: 'second' },
      ],
      resolve,
      onUpdate,
    )

    expect(resolve).toHaveBeenCalledExactlyOnceWith('first', [
      annotation('first'),
    ])

    first.resolve(new Map([['first', metadata('first')]]))
    await vi.waitFor(() => {
      expect(index.metadataByAnnotationId.get('first')).toStrictEqual(
        metadata('first'),
      )
      expect(onUpdate).toHaveBeenCalledExactlyOnceWith()
      expect(resolve).toHaveBeenLastCalledWith('second', [annotation('second')])
    })

    second.resolve(new Map([['second', metadata('second')]]))
    await hydration

    expect(index.metadataByAnnotationId).toStrictEqual(
      new Map([
        ['first', metadata('first')],
        ['second', metadata('second')],
      ]),
    )
    expect(onUpdate).toHaveBeenCalledTimes(2)
  })

  it('clears published metadata', async () => {
    const index = new AnnoPulseExplorerGitMetadataIndex<string>()

    await index.hydrate(
      [{ annotations: [annotation('a')], document: 'document' }],
      () => Promise.resolve(new Map([['a', metadata('a')]])),
      () => {},
    )
    index.clear()

    expect(index.metadataByAnnotationId).toStrictEqual(new Map())
  })

  it('discards results that complete from an older hydration generation', async () => {
    const oldResult = deferred<ReadonlyMap<string, AnnoPulseGitMetadata>>()
    const newResult = deferred<ReadonlyMap<string, AnnoPulseGitMetadata>>()
    const onUpdate = vi.fn<() => void>()
    const index = new AnnoPulseExplorerGitMetadataIndex<string>()

    const oldHydration = index.hydrate(
      [{ annotations: [annotation('old')], document: 'old' }],
      () => oldResult.promise,
      onUpdate,
    )
    const newHydration = index.hydrate(
      [{ annotations: [annotation('new')], document: 'new' }],
      () => newResult.promise,
      onUpdate,
    )

    newResult.resolve(new Map([['new', metadata('new')]]))
    await newHydration
    oldResult.resolve(new Map([['old', metadata('old')]]))
    await oldHydration

    expect(index.metadataByAnnotationId).toStrictEqual(
      new Map([['new', metadata('new')]]),
    )
    expect(onUpdate).toHaveBeenCalledExactlyOnceWith()
  })

  it('does not resolve later targets after a rejected superseded generation', async () => {
    const oldResult = deferred<ReadonlyMap<string, AnnoPulseGitMetadata>>()
    const resolve = vi.fn<AnnoPulseExplorerMetadataResolver<string>>(
      document =>
        document === 'old-first'
          ? oldResult.promise
          : Promise.resolve(new Map([['old-second', metadata('old-second')]])),
    )
    const index = new AnnoPulseExplorerGitMetadataIndex<string>()

    const oldHydration = index.hydrate(
      [
        { annotations: [annotation('old-first')], document: 'old-first' },
        { annotations: [annotation('old-second')], document: 'old-second' },
      ],
      resolve,
      () => {},
    )
    await index.hydrate([], resolve, () => {})
    oldResult.reject(new Error('metadata unavailable'))
    await oldHydration

    expect(resolve).toHaveBeenCalledExactlyOnceWith('old-first', [
      annotation('old-first'),
    ])
  })
})
