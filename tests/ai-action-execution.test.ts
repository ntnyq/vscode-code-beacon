import { describe, expect, it, vi } from 'vitest'
import { createAiActionExecutor } from '../src/core/ai/action-execution'

interface TestModel {
  readonly id: string
}

interface TestToken {
  readonly isCancellationRequested: boolean
}

type RunWithProgress = (
  title: string,
  task: (progressToken: TestToken) => Promise<void>,
) => Promise<void>

function deferred<Value>() {
  let resolve!: (value: Value) => void
  // oxlint-disable-next-line promise/avoid-new -- Tests control preparation completion explicitly.
  const promise = new Promise<Value>(_resolve => {
    resolve = _resolve
  })
  return { promise, resolve }
}

async function* mixedTextStream() {
  yield 'first'
  yield { ignored: true }
  yield ' second'
}

function noTextFromPart(): undefined {}

function executor(options?: {
  readonly cancelled?: boolean
  readonly model?: TestModel
  readonly modelUnavailable?: boolean
}) {
  const token = { isCancellationRequested: options?.cancelled ?? false }
  const selectModel = vi.fn<() => Promise<TestModel | undefined>>(() =>
    Promise.resolve(
      options?.modelUnavailable
        ? undefined
        : (options?.model ?? { id: 'copilot' }),
    ),
  )
  const runWithProgress = vi.fn<RunWithProgress>(
    async (
      _title: string,
      task: (progressToken: typeof token) => Promise<void>,
    ) => {
      await task(token)
    },
  )

  return {
    actionExecutor: createAiActionExecutor({
      runWithProgress,
      selectModel,
      textFromPart: part => (typeof part === 'string' ? part : undefined),
    }),
    runWithProgress,
    selectModel,
    token,
  }
}

describe('ai action executor', () => {
  it('prepares, selects a model, and returns a standard completed outcome', async () => {
    const fixture = executor()
    const prepare = vi.fn<() => Promise<string>>(() =>
      Promise.resolve('prepared'),
    )
    const run = vi.fn<
      (context: {
        model: TestModel
        prepared: string
        shouldStop: () => boolean
      }) => Promise<string>
    >(
      (context: {
        model: TestModel
        prepared: string
        shouldStop: () => boolean
      }) => Promise.resolve(`${context.prepared}:${context.model.id}`),
    )

    const outcome = await fixture.actionExecutor.execute({
      prepare,
      progressTitle: 'Running action',
      run,
    })

    expect(outcome).toStrictEqual({
      status: 'completed',
      value: 'prepared:copilot',
    })
    expect(prepare).toHaveBeenCalledExactlyOnceWith()
    expect(fixture.selectModel).toHaveBeenCalledExactlyOnceWith()
    expect(fixture.runWithProgress).toHaveBeenCalledWith(
      'Running action',
      expect.any(Function),
    )
    expect(run).toHaveBeenCalledWith(
      expect.objectContaining({
        model: { id: 'copilot' },
        prepared: 'prepared',
      }),
    )
  })

  it('returns model-unavailable without opening progress', async () => {
    const fixture = executor({ modelUnavailable: true })

    const outcome = await fixture.actionExecutor.execute({
      prepare: () => Promise.resolve('prepared'),
      progressTitle: 'Running action',
      run: () => Promise.resolve('unused'),
    })

    expect(outcome).toStrictEqual({ status: 'model-unavailable' })
    expect(fixture.runWithProgress).not.toHaveBeenCalled()
  })

  it('accepts a falsey model value allowed by the generic contract', async () => {
    const runWithProgress = vi.fn<RunWithProgress>(
      async (
        _title: string,
        task: (progressToken: TestToken) => Promise<void>,
      ) => {
        await task({ isCancellationRequested: false })
      },
    )
    const actionExecutor = createAiActionExecutor({
      runWithProgress,
      selectModel: () => Promise.resolve(0),
      textFromPart: noTextFromPart,
    })

    await expect(
      actionExecutor.execute({
        prepare: () => Promise.resolve(),
        progressTitle: 'Running action',
        run: ({ model }) => Promise.resolve(model),
      }),
    ).resolves.toStrictEqual({ status: 'completed', value: 0 })
  })

  it('classifies preparation, model selection, and action failures', async () => {
    const prepareError = new Error('prepare failed')
    const selectionError = new Error('selection failed')
    const actionError = new Error('action failed')
    const prepareFixture = executor()
    const selectionFixture = executor()
    const actionFixture = executor()
    selectionFixture.selectModel.mockRejectedValueOnce(selectionError)

    await expect(
      prepareFixture.actionExecutor.execute({
        prepare: () => Promise.reject(prepareError),
        progressTitle: 'Preparing',
        run: () => Promise.resolve(),
      }),
    ).resolves.toStrictEqual({
      error: prepareError,
      status: 'preparation-failed',
    })
    await expect(
      selectionFixture.actionExecutor.execute({
        prepare: () => Promise.resolve(),
        progressTitle: 'Selecting',
        run: () => Promise.resolve(),
      }),
    ).resolves.toStrictEqual({
      error: selectionError,
      status: 'model-selection-failed',
    })
    await expect(
      actionFixture.actionExecutor.execute({
        prepare: () => Promise.resolve(),
        progressTitle: 'Running',
        run: () => Promise.reject(actionError),
      }),
    ).resolves.toStrictEqual({
      error: actionError,
      status: 'failed',
    })
  })

  it('does not run an action when progress is already cancelled', async () => {
    const fixture = executor({ cancelled: true })
    const run = vi.fn<() => Promise<string>>(() => Promise.resolve('unused'))

    const outcome = await fixture.actionExecutor.execute({
      prepare: () => Promise.resolve(),
      progressTitle: 'Running action',
      run,
    })

    expect(outcome).toStrictEqual({ status: 'cancelled' })
    expect(run).not.toHaveBeenCalled()
  })

  it('consumes text parts through the shared stream lifecycle', async () => {
    const fixture = executor()

    const outcome = await fixture.actionExecutor.execute({
      prepare: () => Promise.resolve(),
      progressTitle: 'Streaming action',
      run: ({ consumeText }) => consumeText(mixedTextStream()),
    })

    expect(outcome).toStrictEqual({
      status: 'completed',
      value: 'first second',
    })
  })

  it('supersedes an older action while it is preparing', async () => {
    const fixture = executor()
    const firstPreparation = deferred<string>()
    const run = vi.fn<
      ({ prepared }: { readonly prepared: string }) => Promise<string>
    >(({ prepared }) => Promise.resolve(prepared))
    const first = fixture.actionExecutor.execute({
      prepare: () => firstPreparation.promise,
      progressTitle: 'First action',
      run,
    })
    const second = fixture.actionExecutor.execute({
      prepare: () => Promise.resolve('second'),
      progressTitle: 'Second action',
      run,
    })

    await expect(second).resolves.toStrictEqual({
      status: 'completed',
      value: 'second',
    })
    firstPreparation.resolve('first')
    await expect(first).resolves.toStrictEqual({ status: 'superseded' })
    expect(fixture.selectModel).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('supersedes active work when disposed', async () => {
    const fixture = executor()
    const actionCompletion = deferred<string>()
    const running = fixture.actionExecutor.execute({
      prepare: () => Promise.resolve(),
      progressTitle: 'Running action',
      run: () => actionCompletion.promise,
    })
    await vi.waitFor(() => {
      expect(fixture.runWithProgress).toHaveBeenCalledTimes(1)
    })

    fixture.actionExecutor.dispose()
    actionCompletion.resolve('late')

    await expect(running).resolves.toStrictEqual({ status: 'superseded' })
  })

  it('does not prepare or select a model after disposal', async () => {
    const fixture = executor()
    const prepare = vi.fn<() => Promise<void>>(() => Promise.resolve())
    const run = vi.fn<() => Promise<void>>(() => Promise.resolve())

    fixture.actionExecutor.dispose()

    await expect(
      fixture.actionExecutor.execute({
        prepare,
        progressTitle: 'Disposed action',
        run,
      }),
    ).resolves.toStrictEqual({ status: 'superseded' })
    expect(prepare).not.toHaveBeenCalled()
    expect(fixture.selectModel).not.toHaveBeenCalled()
    expect(fixture.runWithProgress).not.toHaveBeenCalled()
    expect(run).not.toHaveBeenCalled()
  })

  it('supersedes active work without disposing future actions', async () => {
    const fixture = executor()
    const actionCompletion = deferred<string>()
    const running = fixture.actionExecutor.execute({
      prepare: () => Promise.resolve(),
      progressTitle: 'Running action',
      run: () => actionCompletion.promise,
    })
    await vi.waitFor(() => {
      expect(fixture.runWithProgress).toHaveBeenCalledTimes(1)
    })

    fixture.actionExecutor.supersede()
    actionCompletion.resolve('late')

    await expect(running).resolves.toStrictEqual({ status: 'superseded' })
    await expect(
      fixture.actionExecutor.execute({
        prepare: () => Promise.resolve(),
        progressTitle: 'Future action',
        run: () => Promise.resolve('future'),
      }),
    ).resolves.toStrictEqual({ status: 'completed', value: 'future' })
  })
})
