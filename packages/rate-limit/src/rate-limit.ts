import type { IMiddleware } from "@unikvs/core";
import { PassThrough } from "@unikvs/passthrough";
import { getAbortReason, throwIfAborted } from "abort-signal-utils";

import { RateLimitExceededError, RateLimitInvalidOptionError } from "./errors.js";

/**
 * レート制限を超えたときの挙動です。
 *
 * - `"wait"` はトークンが補充されるまで待機します。
 * - `"throw"` は直ちにエラーを投げます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-strategy)
 */
export type RateLimitStrategy = "wait" | "throw";

/**
 * 待機処理の実装です。テストで時刻を制御するときに差し替えます。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#irate-limit-sleep)
 */
export interface IRateLimitSleep {
  (ms: number, signal: AbortSignal): Promise<void>;
}

/**
 * RateLimit ミドルウェアのオプションです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options)
 */
export type RateLimitOptions = {
  /**
   * 1 インターバルあたりに補充されるトークン数です。既定値は `1` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-tokens-per-interval)
   */
  readonly tokensPerInterval?: number | undefined;

  /**
   * トークンを補充する間隔 (ミリ秒) です。既定値は `1000` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-interval-ms)
   */
  readonly intervalMs?: number | undefined;

  /**
   * 保持できるトークンの上限です。既定値は `tokensPerInterval` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-max-tokens)
   */
  readonly maxTokens?: number | undefined;

  /**
   * `maxTokens` の別名です。両方を指定した場合は `maxTokens` が優先されます。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-burst)
   */
  readonly burst?: number | undefined;

  /**
   * レート制限を超えたときの挙動です。既定値は `"wait"` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-strategy)
   */
  readonly strategy?: RateLimitStrategy | undefined;

  /**
   * 現在時刻 (epoch ミリ秒) を返す関数です。既定値は `Date.now` です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit-options-now)
   */
  readonly now?: (() => number) | undefined;

  /**
   * 待機処理です。既定では `setTimeout` を使用します。
   *
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

function assertPositiveNumber(name: string, value: number): void {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    throw new RateLimitInvalidOptionError({
      name,
      actual: value,
    });
  }
}

/**
 * トークンバケットで操作頻度を制限するミドルウェアです。
 *
 * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
 */
export default class RateLimit extends PassThrough implements IMiddleware {
  /**
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   */
  public override readonly name: string = "RateLimit";

  /**
   * 1 インターバルあたりに補充されるトークン数です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   */
  public readonly tokensPerInterval: number;

  /**
   * トークンを補充する間隔 (ミリ秒) です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   */
  public readonly intervalMs: number;

  /**
   * 保持できるトークンの上限です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   */
  public readonly maxTokens: number;

  /**
   * レート制限を超えたときの挙動です。
   *
   * [API Reference](https://tai-kun.github.io/unikvs/packages/rate-limit#rate-limit)
   */
  public readonly strategy: RateLimitStrategy;

  readonly #now: () => number;

  readonly #sleep: IRateLimitSleep;

  #tokens: number;

  #lastRefill: number;

  #tail: Promise<void>;

  /**
   * RateLimit ミドルウェアを作成します。
   *
   * @param options トークン数と補充間隔などの設定です。
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

    const capacity = maxTokens ?? burst ?? tokensPerInterval;
    assertPositiveNumber("maxTokens", capacity);

    if (strategy !== "wait" && strategy !== "throw") {
      throw new RateLimitInvalidOptionError({
        name: "strategy",
        actual: strategy,
      });
    }

    if (typeof now !== "function") {
      throw new RateLimitInvalidOptionError({
        name: "now",
        actual: now,
      });
    }

    if (typeof sleep !== "function") {
      throw new RateLimitInvalidOptionError({
        name: "sleep",
        actual: sleep,
      });
    }

    this.tokensPerInterval = tokensPerInterval;
    this.intervalMs = intervalMs;
    this.maxTokens = capacity;
    this.strategy = strategy;
    this.#now = now;
    this.#sleep = sleep;
    this.#tokens = capacity;
    this.#lastRefill = now();
    this.#tail = Promise.resolve();
  }

  /**
   * 現在保持しているトークン数です。
   *
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

    let release!: () => void;
    const previous = this.#tail;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
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
    } finally {
      release();
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
