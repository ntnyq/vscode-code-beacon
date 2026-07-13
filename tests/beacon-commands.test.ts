import type * as ReactiveVscode from 'reactive-vscode'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as Vscode from 'vscode'
import { useBeaconCommands } from '../src/composables/use-beacon-commands'
import { annotationStore } from '../src/core/store/annotation-store'
import { commands } from '../src/meta'

const { commandHandlers, useDisposable } = vi.hoisted(() => {
  const handlers = new Map<string, (...args: unknown[]) => unknown>()

  return {
    commandHandlers: handlers,
    useDisposable: vi.fn<(value: unknown) => unknown>(value => value),
  }
})

vi.mock(
  import('reactive-vscode'),
  () =>
    ({
      useDisposable,
    }) as unknown as Partial<typeof ReactiveVscode>,
)

vi.mock(
  import('../src/config'),
  () =>
    ({
      config: {
        enable: true,
        update: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      },
    }) as unknown as Record<string, unknown>,
)

vi.mock(
  import('vscode'),
  () =>
    ({
      ConfigurationTarget: { Global: true },
      commands: {
        executeCommand: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        registerCommand: (
          command: string,
          handler: (...args: unknown[]) => unknown,
        ) => {
          commandHandlers.set(command, handler)
          return { dispose: vi.fn<() => void>() }
        },
      },
      env: {
        clipboard: {
          writeText: vi.fn<() => Promise<void>>(() => Promise.resolve()),
        },
      },
      window: {
        showTextDocument: vi.fn<() => Promise<void>>(() => Promise.resolve()),
      },
      workspace: {
        openTextDocument: vi.fn<() => Promise<{ uri: unknown }>>(() =>
          Promise.resolve({ uri: undefined }),
        ),
      },
    }) as unknown as Partial<typeof Vscode>,
)

interface DeferredUpdate {
  readonly state: unknown
  reject: (reason?: unknown) => void
  resolve: () => void
}

function tick() {
  return Promise.resolve()
}

function flushPromises() {
  return new Promise<void>(resolve => setImmediate(resolve))
}

function registeredCommand(command: string): (...args: unknown[]) => unknown {
  const handler = commandHandlers.get(command)

  if (!handler) {
    throw new Error(`Expected ${command} to be registered`)
  }

  return handler
}

describe('beacon command persistence', () => {
  beforeEach(() => {
    annotationStore.clear()
    commandHandlers.clear()
    useDisposable.mockClear()
  })

  it('persists a clear-cache snapshot after the preceding save settles', async () => {
    const pendingUpdates: DeferredUpdate[] = []
    let persistedState: unknown
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: (_key: string, state: unknown) =>
        new Promise<void>((resolve, reject) => {
          pendingUpdates.push({ reject, resolve, state })
        }).then(() => {
          persistedState = state
        }),
    } as unknown as Vscode.Memento)

    annotationStore.markResolved('resolved', true)
    await tick()
    registeredCommand(commands.clearCache)()
    await tick()

    expect(pendingUpdates).toHaveLength(1)
    expect(pendingUpdates[0]?.state).toStrictEqual({
      ignoredIds: [],
      resolvedIds: ['resolved'],
    })

    pendingUpdates[0]?.resolve()
    await flushPromises()

    expect(pendingUpdates).toHaveLength(2)
    expect(pendingUpdates[1]?.state).toStrictEqual({
      ignoredIds: [],
      resolvedIds: [],
    })

    pendingUpdates[1]?.resolve()
    await flushPromises()

    expect(persistedState).toStrictEqual({
      ignoredIds: [],
      resolvedIds: [],
    })
  })

  it('continues persisting later snapshots after a failed save', async () => {
    const pendingUpdates: DeferredUpdate[] = []
    let persistedState: unknown
    useBeaconCommands({
      get: <T>() => undefined as T | undefined,
      update: (_key: string, state: unknown) =>
        new Promise<void>((resolve, reject) => {
          pendingUpdates.push({ reject, resolve, state })
        }).then(() => {
          persistedState = state
        }),
    } as unknown as Vscode.Memento)

    annotationStore.markResolved('first', true)
    await tick()
    registeredCommand(commands.clearCache)()
    await tick()

    pendingUpdates[0]?.reject(new Error('Memento write failed'))
    await flushPromises()

    expect(pendingUpdates).toHaveLength(2)

    pendingUpdates[1]?.resolve()
    await flushPromises()

    expect(persistedState).toStrictEqual({
      ignoredIds: [],
      resolvedIds: [],
    })
  })
})
