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

    const capacity = maxTokens ?? burst ?? tokensPerInterval;
    assertPositiveNumber("maxTokens", capacity);

    assertOption("strategy", strategy, strategy === "wait" || strategy === "throw");
    assertOption("now", now, typeof now === "function");
    assertOption("sleep", sleep, typeof sleep === "function");

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
    });
  }

  /**
   * 処理を先着順の待ち行列へつなぎ、完了時に次の処理を解放します。
   *
   * @param fn 待ち行列の中で実行する処理です。
   *
   * @returns 処理の結果を返します。
   */
  async #enqueue<T>(fn: () => Promise<T>): Promise<T> {
    let release: (() => void) | undefined;
    const previous = this.#tail;
    this.#tail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;

    try {
      return await fn();
    } finally {
      release?.();
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
