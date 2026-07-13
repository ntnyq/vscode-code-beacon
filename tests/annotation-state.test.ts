import { describe, expect, it } from 'vitest'
import { createMementoAnnotationStateStorage } from '../src/core/store/annotation-state'

describe('memento annotation state storage', () => {
  it('round-trips a valid annotation state payload', async () => {
    let value: unknown
    const storage = createMementoAnnotationStateStorage({
      get: <T>() => value as T | undefined,
      update: async (_key, nextValue) => {
        value = nextValue
      },
    })

    const state = {
      ignoredIds: ['b'],
      resolvedIds: ['a'],
    }
    await storage.save(state)

    expect(storage.load()).toStrictEqual(state)
  })

  it('returns empty state for an invalid stored payload', () => {
    const storage = createMementoAnnotationStateStorage({
      get: <T>() => ({ ignoredIds: 'b', resolvedIds: ['a'] }) as T | undefined,
      update: async () => {},
    })

    expect(storage.load()).toStrictEqual({
      ignoredIds: [],
      resolvedIds: [],
    })
  })

  it('normalizes stored annotation ID arrays', () => {
    const storage = createMementoAnnotationStateStorage({
      get: <T>() =>
        ({
          ignoredIds: ['b', 1, 'b', 'a'],
          resolvedIds: ['a', null, 'a'],
        }) as T | undefined,
      update: async () => {},
    })

    expect(storage.load()).toStrictEqual({
      ignoredIds: ['b', 'a'],
      resolvedIds: ['a'],
    })
  })
})
