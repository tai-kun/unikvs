import {
  KeyNotFoundError,
  type IReadableStream,
  type IStorage,
  type IWritableStream,
} from "@unikvs/core";
import { getAbortReason, throwIfAborted } from "abort-signal-utils";

import {
  RetryExhaustedError,
  RetryInvalidOptionError,
  RetryUnsupportedOperationError,
} from "./errors.js";

/**
 * リトライ対象の操作名です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
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
 * エラーがリトライ可能かどうかを判定する述語です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
 */
export type RetryablePredicate = (error: unknown) => boolean;

/**
 * リトライが発生したときに通知される試行情報です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
 */
export type RetryAttemptInfo = {
  /**
   * 失敗した操作名です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  readonly operation: RetryOperation;

  /**
   * 失敗した試行回数 (1 始まり) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  readonly attempt: number;

  /**
   * 発生したエラーです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  readonly error: unknown;

  /**
   * 次の試行までの待機時間 (ミリ秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  readonly nextDelayMs: number;
};

/**
 * リトライの動作を調整する設定です。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
 */
export type RetryOptions = {
  /**
   * 初回試行の後の再試行回数です。既定値は 3 です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  readonly maxRetries?: number | undefined;

  /**
   * 初回の待機時間 (ミリ秒) です。既定値は 100 です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  readonly initialDelayMs?: number | undefined;

  /**
   * 待機時間の上限 (ミリ秒) です。既定値は 5000 です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  readonly maxDelayMs?: number | undefined;

  /**
   * 待機時間の増加係数です。既定値は 2 です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  readonly factor?: number | undefined;

  /**
   * 待機時間にジッターを加えるかどうかです。既定値は true です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  readonly jitter?: boolean | undefined;

  /**
   * エラーがリトライ可能かどうかを判定する述語です。
   * 既定では `isRetryableError` を使用します。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  readonly retryable?: RetryablePredicate | undefined;

  /**
   * 再試行の直前に呼び出される通知です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  readonly onRetry?: ((info: RetryAttemptInfo) => void) | undefined;
};

/**
 * 既定のリトライ可否判定です。
 *
 * 存在しないキーなどの恒久的な失敗と、中断による失敗はリトライしません。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
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
 * 一時的な失敗を指数バックオフで再試行するストレージラッパーです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
 */
export default class Retry<
  TWriteData = any,
  TReadData = TWriteData,
  TWriteChunk = any,
  TReadChunk = TWriteChunk,
> implements IStorage<TWriteData, TReadData, TWriteChunk, TReadChunk> {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  public readonly name: string = "Retry";

  /**
   * 委譲先のストレージです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  public readonly inner: IStorage<TWriteData, TReadData, TWriteChunk, TReadChunk>;

  /**
   * 初回試行の後の再試行回数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  public readonly maxRetries: number;

  /**
   * 初回の待機時間 (ミリ秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  public readonly initialDelayMs: number;

  /**
   * 待機時間の上限 (ミリ秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  public readonly maxDelayMs: number;

  /**
   * 待機時間の増加係数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  public readonly factor: number;

  /**
   * 待機時間にジッターを加えるかどうかです。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  public readonly jitter: boolean;

  /**
   * エラーがリトライ可能かどうかを判定する述語です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  public readonly retryable: RetryablePredicate;

  /**
   * 再試行の直前に呼び出される通知です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  public readonly onRetry: ((info: RetryAttemptInfo) => void) | undefined;

  /**
   * ラッパーを作成します。
   *
   * @param inner 委譲先のストレージです。
   * @param options 再試行回数と待機時間の設定です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/retry#usage)
   */
  public constructor(
    inner: IStorage<TWriteData, TReadData, TWriteChunk, TReadChunk>,
    options: RetryOptions = {},
  ) {
    const {
      maxRetries = 3,
      initialDelayMs = 100,
      maxDelayMs = 5000,
      factor = 2,
      jitter = true,
      retryable = isRetryableError,
      onRetry,
    } = options;

    if (!Number.isInteger(maxRetries) || maxRetries < 0) {
      throw new RetryInvalidOptionError({ name: "maxRetries", actual: maxRetries });
    }

    if (!Number.isFinite(initialDelayMs) || initialDelayMs < 0) {
      throw new RetryInvalidOptionError({ name: "initialDelayMs", actual: initialDelayMs });
    }

    if (!Number.isFinite(maxDelayMs) || maxDelayMs < 0) {
      throw new RetryInvalidOptionError({ name: "maxDelayMs", actual: maxDelayMs });
    }

    if (!Number.isFinite(factor) || factor < 1) {
      throw new RetryInvalidOptionError({ name: "factor", actual: factor });
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
          operation: "getWritable",
          storage: this.inner.name,
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
          operation: "getReadable",
          storage: this.inner.name,
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
          throw new RetryExhaustedError({ operation, attempts: attempt, cause: error });
        }

        const nextDelayMs = this.#delayMs(attempt);
        this.onRetry?.({ operation, attempt, error, nextDelayMs });
        await sleep(nextDelayMs, c.signal);
      }
    }
  }
}
