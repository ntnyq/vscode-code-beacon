/**
 * Minimal cancellation state required by an AI action.
 */
export interface AiActionCancellation {
  readonly isCancellationRequested: boolean
}

/**
 * Standard result shared by every AI action workflow.
 */
export type AiActionOutcome<Result> =
  | { readonly status: 'completed'; readonly value: Result }
  | { readonly status: 'cancelled' }
  | { readonly status: 'superseded' }
  | { readonly status: 'model-unavailable' }
  | { readonly error: unknown; readonly status: 'preparation-failed' }
  | { readonly error: unknown; readonly status: 'model-selection-failed' }
  | { readonly error: unknown; readonly status: 'failed' }

/**
 * External model and progress capabilities used by the executor.
 */
export interface AiActionExecutionDependencies<
  Model,
  Cancellation extends AiActionCancellation = AiActionCancellation,
> {
  readonly selectModel: () => PromiseLike<Model | undefined>
  readonly textFromPart: (part: unknown) => string | undefined
  readonly runWithProgress: (
    title: string,
    task: (token: Cancellation) => Promise<void>,
  ) => PromiseLike<void>
}

/**
 * Inputs supplied to one action after preparation and model selection.
 */
export interface AiActionRunContext<
  Model,
  Prepared,
  Cancellation extends AiActionCancellation = AiActionCancellation,
> {
  readonly consumeText: (
    stream: AsyncIterable<unknown>,
    onText?: (text: string) => void,
  ) => Promise<string>
  readonly model: Model
  readonly prepared: Prepared
  readonly shouldStop: () => boolean
  readonly token: Cancellation
}

/**
 * One AI workflow with action-specific preparation and execution.
 */
export interface AiActionExecutionOptions<
  Model,
  Prepared,
  Result,
  Cancellation extends AiActionCancellation = AiActionCancellation,
> {
  readonly prepare: () => Prepared | PromiseLike<Prepared>
  readonly progressTitle: string
  readonly run: (
    context: AiActionRunContext<Model, Prepared, Cancellation>,
  ) => Result | PromiseLike<Result>
}

/**
 * Latest-request-wins executor for one kind of AI action.
 */
export interface AiActionExecutor<
  Model,
  Cancellation extends AiActionCancellation = AiActionCancellation,
> {
  readonly dispose: () => void
  readonly supersede: () => void
  readonly execute: <Prepared, Result>(
    options: AiActionExecutionOptions<Model, Prepared, Result, Cancellation>,
  ) => Promise<AiActionOutcome<Result>>
}

/**
 * Coordinates preparation, model selection, progress cancellation, and errors.
 */
export function createAiActionExecutor<
  Model,
  Cancellation extends AiActionCancellation = AiActionCancellation,
>(
  dependencies: AiActionExecutionDependencies<Model, Cancellation>,
): AiActionExecutor<Model, Cancellation> {
  let generation = 0
  let isDisposed = false

  return {
    dispose() {
      isDisposed = true
      generation += 1
    },
    supersede() {
      if (!isDisposed) {
        generation += 1
      }
    },
    async execute<Prepared, Result>(
      options: AiActionExecutionOptions<Model, Prepared, Result, Cancellation>,
    ): Promise<AiActionOutcome<Result>> {
      if (isDisposed) {
        return { status: 'superseded' }
      }

      const requestGeneration = ++generation
      const isSuperseded = () => isDisposed || requestGeneration !== generation
      let prepared

      try {
        prepared = await options.prepare()
      } catch (error) {
        return isSuperseded()
          ? { status: 'superseded' }
          : { error, status: 'preparation-failed' }
      }

      if (isSuperseded()) {
        return { status: 'superseded' }
      }

      let model: Model | undefined
      try {
        model = await dependencies.selectModel()
      } catch (error) {
        return isSuperseded()
          ? { status: 'superseded' }
          : { error, status: 'model-selection-failed' }
      }

      if (isSuperseded()) {
        return { status: 'superseded' }
      }

      if (model === undefined) {
        return { status: 'model-unavailable' }
      }

      let completed = false
      let progressToken: Cancellation | undefined
      let value: Result | undefined

      try {
        await dependencies.runWithProgress(
          options.progressTitle,
          async token => {
            progressToken = token
            const shouldStop = () =>
              isSuperseded() || token.isCancellationRequested

            if (shouldStop()) {
              return
            }

            const consumeText = async (
              stream: AsyncIterable<unknown>,
              onText?: (text: string) => void,
            ) => {
              let text = ''

              for await (const part of stream) {
                if (shouldStop()) {
                  break
                }

                const partText = dependencies.textFromPart(part)
                if (partText === undefined) {
                  continue
                }

                text += partText
                onText?.(partText)
              }

              return text
            }

            value = await options.run({
              consumeText,
              model,
              prepared,
              shouldStop,
              token,
            })
            completed = true
          },
        )
      } catch (error) {
        if (isSuperseded()) {
          return { status: 'superseded' }
        }

        if (progressToken?.isCancellationRequested) {
          return { status: 'cancelled' }
        }

        return { error, status: 'failed' }
      }

      if (isSuperseded()) {
        return { status: 'superseded' }
      }

      if (progressToken?.isCancellationRequested) {
        return { status: 'cancelled' }
      }

      if (!completed) {
        return {
          error: new Error('AI action progress completed without running'),
          status: 'failed',
        }
      }

      return { status: 'completed', value: value as Result }
    },
  }
}
