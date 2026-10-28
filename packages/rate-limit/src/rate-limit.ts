import type { IMiddleware } from "@unikvs/core";
import { PassThrough } from "@unikvs/passthrough";
import { getAbortReason, throwIfAborted } from "abort-signal-utils";

import { RateLimitExceededError, RateLimitInvalidOptionError } from "./errors.js";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-strategy)
 */
export type RateLimitStrategy = "wait" | "throw";

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#irate-limit-sleep)
 */
export interface IRateLimitSleep {
  (ms: number, signal: AbortSignal): Promise<void>;
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options)
 */
export type RateLimitOptions = {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-tokens-per-interval)
   */
  readonly tokensPerInterval?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-interval-ms)
   */
  readonly intervalMs?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-max-tokens)
   */
  readonly maxTokens?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-burst)
   */
  readonly burst?: number | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-strategy)
   */
  readonly strategy?: RateLimitStrategy | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-now)
   */
  readonly now?: (() => number) | undefined;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-sleep)
   */
  readonly sleep?: IRateLimitSleep | undefined;
};

function defaultSleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
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

function assertOption(name: string, actual: unknown, isValid: boolean): void {
  if (!isValid) {
    throw new RateLimitInvalidOptionError({
      name,
      actual,
    });
  }
}

function assertPositiveNumber(name: string, value: number): void {
  assertOption(name, value, typeof value === "number" && Number.isFinite(value) && value > 0);
}

/**
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
 */
export default class RateLimit extends PassThrough implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   */
  public override readonly name: string = "RateLimit";

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   */
  public readonly tokensPerInterval: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   */
  public readonly intervalMs: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   *
   * 1 回の操作で 1 トークン消費するため、`tokensPerInterval` から導出する既定値は最低 1 になります。`maxTokens` または `burst` に 1 未満を明示すると構築に失敗します。
   */
  public readonly maxTokens: number;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   */
  public readonly strategy: RateLimitStrategy;

  readonly #now: () => number;

  readonly #sleep: IRateLimitSleep;

  #tokens: number;

  #lastRefill: number;

  #tail: Promise<void>;

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   */
  public constructor(options: RateLimitOptions = {}) {
    super();

    const {
      now = Date.now,
      burst,
      sleep = defaultSleep,
      strategy = "wait",
      maxTokens,
      intervalMs = 1000,
      tokensPerInterval = 1,
    } = options;
    assertPositiveNumber("tokensPerInterval", tokensPerInterval);
    assertPositiveNumber("intervalMs", intervalMs);

    // 1 回の操作で 1 トークン消費するため、容量が 1 未満だとトークンが足りずに待機が解けません。
    // 補充量の小数指定は許可し、容量の明示値だけを 1 以上に制限します。
    if (maxTokens !== undefined) {
      assertPositiveNumber("maxTokens", maxTokens);
      assertOption("maxTokens", maxTokens, maxTokens >= 1);
    }

    if (burst !== undefined) {
      assertPositiveNumber("burst", burst);
      assertOption("burst", burst, burst >= 1);
    }

    const capacity = maxTokens ?? burst ?? tokensPerInterval;

    assertOption("strategy", strategy, strategy === "wait" || strategy === "throw");
    assertOption("now", now, typeof now === "function");
    assertOption("sleep", sleep, typeof sleep === "function");

    this.tokensPerInterval = tokensPerInterval;
    this.intervalMs = intervalMs;
    this.maxTokens = Math.max(1, capacity);
    this.strategy = strategy;
    this.#now = now;
    this.#sleep = sleep;
    this.#tokens = this.maxTokens;
    this.#lastRefill = now();
    this.#tail = Promise.resolve();
  }

  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   */
  public get availableTokens(): number {
    this.#refill();

    return this.#tokens;
  }

  public async use(c: IMiddleware.UseContext, next: IMiddleware.INext): Promise<void> {
    await this.#acquire(c.signal);

    await next();
  }

  async #acquire(signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);

    await this.#enqueue(async (): Promise<void> => {
      for (;;) {
        throwIfAborted(signal);
        this.#refill();

        if (this.#tokens >= 1) {
          this.#tokens -= 1;

          return;
        }

        if (this.strategy === "throw") {
          throw new RateLimitExceededError({ retryAfterMs: this.#retryAfterMs() });
        }

        await this.#sleep(this.#retryAfterMs(), signal);
      }
    }, signal);
  }

  /**
   * 処理を先着順の待ち行列へつなぎ、完了時に次の処理を解放します。
   *
   * @param fn 待ち行列の中で実行する処理です。
   * @param signal 待機を打ち切る中断シグナルです。
   *
   * @returns 処理の結果を返します。
   */
  async #enqueue<T>(fn: () => Promise<T>, signal: AbortSignal): Promise<T> {
    let release: (() => void) | undefined;
    const previous = this.#tail;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });

    try {
      await this.#waitForTurn(previous, signal);
    } catch (ex) {
      // 中断した要求は実行しません。ただし、後続が先着順を飛び越えないよう、自分の末尾は先行する処理が完了してから解放します。
      const releaseAfterPrevious = async (): Promise<void> => {
        await previous;
        release?.();
      };
      void releaseAfterPrevious();

      throw ex;
    }

    try {
      return await fn();
    } finally {
      release?.();
    }
  }

  /**
   * 待ち行列の順番が来るまで、中断に対応して待ちます。
   *
   * @param previous 先行する処理の完了を表す Promise です。
   * @param signal 待機を打ち切る中断シグナルです。
   *
   * @returns 順番が来たとき解決します。
   */
  async #waitForTurn(previous: Promise<void>, signal: AbortSignal): Promise<void> {
    throwIfAborted(signal);

    let rejectAborted: ((reason?: unknown) => void) | undefined;
    const aborted = new Promise<never>((_resolve, reject) => {
      rejectAborted = reject;
    });
    const onAbort = (): void => {
      rejectAborted?.(getAbortReason(signal));
    };
    signal.addEventListener("abort", onAbort, { once: true });

    // 待機の準備中に中断された場合、abort イベントは発火しないため明示的に確認します。
    if (signal.aborted) {
      onAbort();
    }

    try {
      await Promise.race([previous, aborted]);
    } finally {
      signal.removeEventListener("abort", onAbort);
    }
  }

  #refill(): void {
    const now = this.#now();
    const elapsed = now - this.#lastRefill;

    if (elapsed <= 0) {
      return;
    }

    this.#tokens = Math.min(
      this.maxTokens,
      this.#tokens + (elapsed * this.tokensPerInterval) / this.intervalMs,
    );
    this.#lastRefill = now;
  }

  #retryAfterMs(): number {
    const deficit = 1 - this.#tokens;

    return Math.max(0, Math.ceil((deficit * this.intervalMs) / this.tokensPerInterval));
  }
}
