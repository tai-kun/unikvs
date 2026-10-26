import {
  type IStorage,
  type IReadableStream,
  type IWritableStream,
  KeyNotFoundError,
} from "@unikvs/core";
import { getAbortReason, throwIfAborted } from "abort-signal-utils";

import {
  RetryExhaustedError,
  RetryInvalidOptionError,
  RetryUnsupportedOperationError,
} from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-operation)
 */
export type RetryOperation =
  | "write"
  | "read"
  | "exists"
  | "delete"
  | "clear"
  | "getWritable"
  | "getReadable";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retryable-predicate)
 */
export type RetryablePredicate = (error: unknown) => boolean;

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-attempt-info)
 */
export type RetryAttemptInfo = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-attempt-info-operation)
   */
  readonly operation: RetryOperation;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-attempt-info-attempt)
   */
  readonly attempt: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-attempt-info-error)
   */
  readonly error: unknown;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-attempt-info-next-delay-ms)
   */
  readonly nextDelayMs: number;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-options)
 */
export type RetryOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-options-max-retries)
   */
  readonly maxRetries?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-options-initial-delay-ms)
   */
  readonly initialDelayMs?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-options-max-delay-ms)
   */
  readonly maxDelayMs?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-options-factor)
   */
  readonly factor?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-options-jitter)
   */
  readonly jitter?: boolean | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-options-retryable)
   */
  readonly retryable?: RetryablePredicate | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-options-on-retry)
   */
  readonly onRetry?: ((info: RetryAttemptInfo) => void) | undefined;
};

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#is-retryable-error)
 */
export function isRetryableError(error: unknown): boolean {
  if (error instanceof KeyNotFoundError) {
    return false;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    (error as { readonly name?: unknown }).name === "AbortError"
  ) {
    return false;
  }

  return true;
}

/**
 * 中断に対応した待機です。
 */
async function sleep(ms: number, signal: AbortSignal): Promise<void> {
  if (!(ms > 0)) {
    throwIfAborted(signal);

    return;
  }

  await new Promise<void>((resolve, reject) => {
    if (signal.aborted) {
      reject(getAbortReason(signal));

      return;
    }

    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    const onAbort = (): void => {
      clearTimeout(timer);
      reject(getAbortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry)
 */
export default class Retry<
  TWriteData = any,
  TReadData = TWriteData,
  TWriteChunk = any,
  TReadChunk = TWriteChunk,
> implements IStorage<TWriteData, TReadData, TWriteChunk, TReadChunk> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry)
   */
  public readonly name: string = "Retry";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry-inner)
   */
  public readonly inner: IStorage<TWriteData, TReadData, TWriteChunk, TReadChunk>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry)
   */
  public readonly maxRetries: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry)
   */
  public readonly initialDelayMs: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry)
   */
  public readonly maxDelayMs: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry)
   */
  public readonly factor: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry)
   */
  public readonly jitter: boolean;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry)
   */
  public readonly retryable: RetryablePredicate;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry)
   */
  public readonly onRetry: ((info: RetryAttemptInfo) => void) | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#retry)
   */
  public constructor(
    inner: IStorage<TWriteData, TReadData, TWriteChunk, TReadChunk>,
    options: RetryOptions = {},
  ) {
    const {
      factor = 2,
      jitter = true,
      onRetry,
      retryable = isRetryableError,
      maxDelayMs = 5000,
      maxRetries = 3,
      initialDelayMs = 100,
    } = options;

    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new RetryInvalidOptionError({
        name: "maxRetries",
        actual: maxRetries,
      });
    }

    if (!Number.isFinite(initialDelayMs) || initialDelayMs < 0) {
      throw new RetryInvalidOptionError({
        name: "initialDelayMs",
        actual: initialDelayMs,
      });
    }

    if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
      throw new RetryInvalidOptionError({
        name: "maxDelayMs",
        actual: maxDelayMs,
      });
    }

    if (!Number.isFinite(factor) || factor < 1) {
      throw new RetryInvalidOptionError({
        name: "factor",
        actual: factor,
      });
    }

    this.inner = inner;
    this.maxRetries = maxRetries;
    this.initialDelayMs = initialDelayMs;
    this.maxDelayMs = maxDelayMs;
    this.factor = factor;
    this.jitter = jitter;
    this.retryable = retryable;
    this.onRetry = onRetry;
  }

  public get isOpen(): boolean {
    return this.inner.isOpen;
  }

  public async open(c: IStorage.OpenContext): Promise<void> {
    await this.inner.open?.(c);
  }

  public async close(c: IStorage.CloseContext): Promise<void> {
    await this.inner.close?.(c);
  }

  public write(c: IStorage.WriteContext, data: TWriteData): Promise<void> {
    return this.#run(c, "write", () => this.inner.write(c, data));
  }

  public read(c: IStorage.ReadContext): Promise<TReadData> {
    return this.#run(c, "read", () => this.inner.read(c));
  }

  public exists(c: IStorage.ExistsContext): Promise<boolean> {
    return this.#run(c, "exists", () => this.inner.exists(c));
  }

  public delete(c: IStorage.DeleteContext): Promise<void> {
    return this.#run(c, "delete", () => this.inner.delete(c));
  }

  public clear(c: IStorage.ClearContext): Promise<void> {
    return this.#run(c, "clear", () => this.inner.clear(c));
  }

  public getWritable(c: IStorage.GetWritableContext): Promise<IWritableStream<TWriteChunk>> {
    const getWritable = this.inner.getWritable;

    if (typeof getWritable !== "function") {
      return Promise.reject(
        new RetryUnsupportedOperationError({
          storage: this.inner.name,
          operation: "getWritable",
        }),
      );
    }

    return this.#run(c, "getWritable", () => getWritable.call(this.inner, c));
  }

  public getReadable(c: IStorage.GetReadableContext): Promise<IReadableStream<TReadChunk>> {
    const getReadable = this.inner.getReadable;

    if (typeof getReadable !== "function") {
      return Promise.reject(
        new RetryUnsupportedOperationError({
          storage: this.inner.name,
          operation: "getReadable",
        }),
      );
    }

    return this.#run(c, "getReadable", () => getReadable.call(this.inner, c));
  }

  public async onOtherWriteError(
    c: IStorage.OtherWriteErrorHandlerContext,
    errors: readonly IStorage.IOtherWriteError[],
  ): Promise<void> {
    await this.inner.onOtherWriteError?.(c, errors);
  }

  /**
   * 次の試行までの待機時間 (ミリ秒) を求めます。
   */
  #delayMs(failedAttempt: number): number {
    const grown = this.initialDelayMs * this.factor ** (failedAttempt - 1);
    const capped = Math.min(grown, this.maxDelayMs);

    if (this.jitter && capped > 0) {
      return capped / 2 + Math.random() * (capped / 2);
    }

    return capped;
  }

  /**
   * 失敗時に再試行しながら操作を実行します。
   */
  async #run<T>(
    c: { readonly signal: AbortSignal },
    operation: RetryOperation,
    fn: () => T | Promise<T>,
  ): Promise<T> {
    const maxAttempts = this.maxRetries + 1;
    let attempt = 0;

    for (;;) {
      attempt += 1;
      throwIfAborted(c.signal);

      try {
        return await fn();
      } catch (error) {
        if (c.signal.aborted || !this.retryable(error)) {
          throw error;
        }

        if (attempt >= maxAttempts) {
          throw new RetryExhaustedError({
            cause: error,
            attempts: attempt,
            operation,
          });
        }

        const nextDelayMs = this.#delayMs(attempt);
        this.onRetry?.({
          error,
          attempt,
          operation,
          nextDelayMs,
        });
        await sleep(nextDelayMs, c.signal);
      }
    }
  }
}
