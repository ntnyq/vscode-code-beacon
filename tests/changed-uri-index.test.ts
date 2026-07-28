import { describe, expect, it, vi } from 'vitest'
import { createChangedUriIndex } from '../src/core/git/changed-uri-index'

function deferred<T>() {
  let resolve!: (value: T) => void
  // oxlint-disable-next-line promise/avoid-new -- Tests control refresh completion explicitly.
  const promise = new Promise<T>(_resolve => {
    resolve = _resolve
  })
  return { promise, resolve }
}

describe('changed URI index', () => {
  it('loads the first snapshot for active subscribers', async () => {
    const listener = vi.fn<() => void>()
    const source = {
      getChangedUris: vi.fn<() => Promise<ReadonlySet<string>>>(() =>
        Promise.resolve(new Set(['file:///workspace/src/changed.ts'])),
      ),
      subscribeToChangedUris: vi.fn<
        (listener: () => void) => Promise<{ dispose: () => void }>
      >(() => Promise.resolve({ dispose: vi.fn<() => void>() })),
    }
    const index = createChangedUriIndex(source)

    index.subscribe(listener)

    await vi.waitFor(() => {
      expect(index.getAll()).toStrictEqual(
        new Set(['file:///workspace/src/changed.ts']),
      )
    })
    expect(source.subscribeToChangedUris).toHaveBeenCalledExactlyOnceWith(
      expect.any(Function),
    )
    expect(source.subscribeToChangedUris).toHaveBeenCalledBefore(
      source.getChangedUris,
    )
    expect(listener).toHaveBeenCalledExactlyOnceWith()
  })

  it('loads the first snapshot while source subscription setup is pending', async () => {
    const pendingSubscription = deferred<{ dispose: () => void }>()
    const source = {
      getChangedUris: vi.fn<() => Promise<ReadonlySet<string>>>(() =>
        Promise.resolve(new Set(['file:///workspace/src/changed.ts'])),
      ),
      subscribeToChangedUris: vi.fn<
        (listener: () => void) => Promise<{ dispose: () => void }>
      >(() => pendingSubscription.promise),
    }
    const index = createChangedUriIndex(source)

    index.subscribe(vi.fn<() => void>())

    await vi.waitFor(() => {
      expect(index.getAll()).toStrictEqual(
        new Set(['file:///workspace/src/changed.ts']),
      )
    })
  })

  it('keeps the newest snapshot when refreshes settle out of order', async () => {
    const initialSnapshot = deferred<ReadonlySet<string>>()
    const latestSnapshot = deferred<ReadonlySet<string>>()
    let sourceListener: (() => void) | undefined
    const source = {
      getChangedUris: vi
        .fn<() => Promise<ReadonlySet<string>>>()
        .mockReturnValueOnce(initialSnapshot.promise)
        .mockReturnValueOnce(latestSnapshot.promise),
      subscribeToChangedUris: vi.fn<
        (listener: () => void) => Promise<{ dispose: () => void }>
      >(listener => {
        sourceListener = listener
        return Promise.resolve({ dispose: vi.fn<() => void>() })
      }),
    }
    const index = createChangedUriIndex(source)
    index.subscribe(vi.fn<() => void>())

    await vi.waitFor(() => {
      expect(sourceListener).toBeTypeOf('function')
    })
    sourceListener?.()
    latestSnapshot.resolve(new Set(['file:///workspace/src/latest.ts']))
    await vi.waitFor(() => {
      expect(index.getAll()).toStrictEqual(
        new Set(['file:///workspace/src/latest.ts']),
      )
    })

    initialSnapshot.resolve(new Set(['file:///workspace/src/stale.ts']))
    await Promise.resolve()

    expect(index.getAll()).toStrictEqual(
      new Set(['file:///workspace/src/latest.ts']),
    )
  })

  it('shares one source subscription until the last subscriber leaves', async () => {
    const sourceSubscription = { dispose: vi.fn<() => void>() }
    const source = {
      getChangedUris: vi.fn<() => Promise<ReadonlySet<string>>>(() =>
        Promise.resolve(new Set()),
      ),
      subscribeToChangedUris: vi.fn<
        (listener: () => void) => Promise<{ dispose: () => void }>
      >(() => Promise.resolve(sourceSubscription)),
    }
    const index = createChangedUriIndex(source)

    const firstSubscription = index.subscribe(vi.fn<() => void>())
    const secondSubscription = index.subscribe(vi.fn<() => void>())
    await vi.waitFor(() => {
      expect(source.subscribeToChangedUris).toHaveBeenCalledTimes(1)
    })

    firstSubscription.dispose()
    expect(sourceSubscription.dispose).not.toHaveBeenCalled()

    secondSubscription.dispose()
    expect(sourceSubscription.dispose).toHaveBeenCalledExactlyOnceWith()
  })

  it('disposes the active source subscription and clears its snapshot', async () => {
    const sourceSubscription = { dispose: vi.fn<() => void>() }
    const source = {
      getChangedUris: vi.fn<() => Promise<ReadonlySet<string>>>(() =>
        Promise.resolve(new Set(['file:///workspace/src/changed.ts'])),
      ),
      subscribeToChangedUris: vi.fn<
        (listener: () => void) => Promise<{ dispose: () => void }>
      >(() => Promise.resolve(sourceSubscription)),
    }
    const index = createChangedUriIndex(source)
    index.subscribe(vi.fn<() => void>())
    await vi.waitFor(() => {
      expect(index.getAll()).toStrictEqual(
        new Set(['file:///workspace/src/changed.ts']),
      )
    })

    index.dispose()

    expect(sourceSubscription.dispose).toHaveBeenCalledExactlyOnceWith()
    expect(index.getAll()).toStrictEqual(new Set())
  })

  it('ignores callbacks from a disposed source subscription', async () => {
    let sourceListener: (() => void) | undefined
    const source = {
      getChangedUris: vi
        .fn<() => Promise<ReadonlySet<string>>>()
        .mockResolvedValueOnce(new Set(['file:///workspace/src/initial.ts']))
        .mockResolvedValueOnce(new Set(['file:///workspace/src/late.ts'])),
      subscribeToChangedUris: vi.fn<
        (listener: () => void) => Promise<{ dispose: () => void }>
      >(listener => {
        sourceListener = listener
        return Promise.resolve({ dispose: vi.fn<() => void>() })
      }),
    }
    const index = createChangedUriIndex(source)
    const subscription = index.subscribe(vi.fn<() => void>())
    await vi.waitFor(() => {
      expect(index.getAll()).toStrictEqual(
        new Set(['file:///workspace/src/initial.ts']),
      )
    })

    subscription.dispose()
    sourceListener?.()
    await Promise.resolve()

    expect(index.getAll()).toStrictEqual(new Set())
    expect(source.getChangedUris).toHaveBeenCalledTimes(1)
  })
})
