export interface ChangedUriIndexDisposable {
  dispose: () => void
}

export interface ChangedUriIndexSource {
  getChangedUris: () => Promise<ReadonlySet<string>>
  subscribeToChangedUris: (
    listener: () => void,
  ) => Promise<ChangedUriIndexDisposable>
}

export interface ChangedUriIndex {
  dispose: () => void
  getAll: () => ReadonlySet<string>
  subscribe: (listener: () => void) => ChangedUriIndexDisposable
}

export function createChangedUriIndex(
  source: ChangedUriIndexSource,
): ChangedUriIndex {
  let activationRequest = 0
  let changedUris: ReadonlySet<string> = new Set()
  let isDisposed = false
  let refreshRequest = 0
  let sourceSubscription: ChangedUriIndexDisposable | undefined
  const listeners = new Set<() => void>()

  const notify = () => {
    for (const listener of listeners) {
      listener()
    }
  }

  const refresh = async (expectedActivation: number) => {
    if (
      isDisposed ||
      listeners.size === 0 ||
      expectedActivation !== activationRequest
    ) {
      return
    }

    const request = ++refreshRequest
    let nextChangedUris: ReadonlySet<string>

    try {
      nextChangedUris = await source.getChangedUris()
    } catch {
      nextChangedUris = new Set()
    }

    if (
      request !== refreshRequest ||
      expectedActivation !== activationRequest
    ) {
      return
    }

    changedUris = new Set(nextChangedUris)
    notify()
  }

  const activate = async () => {
    const request = ++activationRequest
    let subscriptionPromise: Promise<ChangedUriIndexDisposable> | undefined

    try {
      subscriptionPromise = source.subscribeToChangedUris(() => {
        // oxlint-disable-next-line no-void -- Git listeners cannot await refresh.
        void refresh(request)
      })
    } catch {
      // Git integration is best-effort in unsupported workspace environments.
    }

    const initialRefresh = refresh(request)

    if (subscriptionPromise) {
      try {
        const subscription = await subscriptionPromise
        if (request !== activationRequest || listeners.size === 0) {
          subscription.dispose()
        } else {
          sourceSubscription = subscription
        }
      } catch {
        // Git integration is best-effort in unsupported workspace environments.
      }
    }

    await initialRefresh
  }

  const deactivate = () => {
    activationRequest += 1
    refreshRequest += 1
    changedUris = new Set()
    sourceSubscription?.dispose()
    sourceSubscription = undefined
  }

  return {
    dispose() {
      if (isDisposed) {
        return
      }
      isDisposed = true
      listeners.clear()
      deactivate()
    },
    getAll: () => new Set(changedUris),
    subscribe(listener) {
      if (isDisposed) {
        return { dispose: () => false }
      }

      listeners.add(listener)
      if (listeners.size === 1) {
        // oxlint-disable-next-line no-void -- Subscription setup is asynchronous.
        void activate()
      }

      return {
        dispose: () => {
          listeners.delete(listener)
          if (listeners.size === 0) {
            deactivate()
          }
        },
      }
    },
  }
}
